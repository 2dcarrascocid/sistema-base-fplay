import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { audit, NO_ORIGIN } from '../lib/audit.js';
import type { Deps } from '../lib/deps.js';
import type { Provider } from '../lib/db-types.js';
import { logger } from '../lib/logger.js';

export type TriggerDeps = Pick<Deps, 'db' | 'cognito' | 'mailer' | 'config'>;

/** Cognito federated username prefix (lowercased) → our provider and the Cognito IdP name. */
const FEDERATED: Record<string, { provider: Provider; idpName: string; requiresVerifiedFlag: boolean }> = {
  google: { provider: 'google', idpName: 'Google', requiresVerifiedFlag: true },
  facebook: { provider: 'facebook', idpName: 'Facebook', requiresVerifiedFlag: false },
  signinwithapple: { provider: 'apple', idpName: 'SignInWithApple', requiresVerifiedFlag: true },
};

/** Errors thrown here reach the client as the hosted UI error description. */
const reject = (code: string): never => {
  throw new Error(code);
};

export function parseFederatedUsername(userName: string) {
  const separator = userName.indexOf('_');
  if (separator <= 0) return null;
  const federated = FEDERATED[userName.slice(0, separator).toLowerCase()];
  return federated ? { ...federated, subject: userName.slice(separator + 1), cognitoUsername: userName } : null;
}

/**
 * Pre sign-up. Public sign-up is disabled; only our backend creates native users (AdminCreateUser).
 * First federated sign-in: link the provider to the native user that owns the same (verified)
 * email, so one email = one user. Unknown emails are rejected unless self registration is on.
 */
export async function preSignUp(deps: TriggerDeps, event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> {
  if (event.triggerSource === 'PreSignUp_AdminCreateUser') return event;
  if (event.triggerSource !== 'PreSignUp_ExternalProvider') return reject('SIGNUP_DISABLED');

  const federated = parseFederatedUsername(event.userName) ?? reject('LOGIN_FAILED');
  const attributes = event.request.userAttributes;
  const email = attributes['email']?.toLowerCase();
  if (!email || (federated.requiresVerifiedFlag && attributes['email_verified'] !== 'true')) return reject('EMAIL_NOT_VERIFIED');

  const user = await deps.db
    .selectFrom('app.users as u')
    .innerJoin('app.roles as r', 'r.id', 'u.role_id')
    .leftJoin('app.user_identities as i', (join) => join.onRef('i.user_id', '=', 'u.id').on('i.provider', '=', 'local'))
    .select(['u.id', 'u.status', 'r.mfa_required', 'i.cognito_sub'])
    .where('u.email', '=', email)
    .executeTakeFirst();

  if (user) {
    if (user.status === 'inactive') return reject('ACCOUNT_DISABLED');
    if (user.mfa_required) return reject('MFA_REQUIRED_USE_PASSWORD');
    if (!user.cognito_sub) {
      logger.error('user without native Cognito identity', { userId: user.id });
      return reject('ACCOUNT_DISABLED');
    }
    await deps.cognito.adminLinkProvider(user.cognito_sub, federated.idpName, federated.subject);
    await deps.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('app.user_identities')
        .values({
          user_id: user.id,
          provider: federated.provider,
          cognito_sub: federated.cognitoUsername,
          provider_subject: federated.subject,
        })
        .execute();
      if (user.status === 'invited') {
        // A verified email from the provider proves ownership, like accepting the invitation.
        await tx.updateTable('app.users').set({ status: 'active', must_change_password: false }).where('id', '=', user.id).execute();
        await tx
          .updateTable('app.invitations')
          .set({ accepted_at: new Date() })
          .where('user_id', '=', user.id)
          .where('accepted_at', 'is', null)
          .where('revoked_at', 'is', null)
          .execute();
      }
      await audit(tx, NO_ORIGIN, {
        eventType: 'auth.identity.linked',
        result: 'success',
        actorUserId: user.id,
        actorEmail: email,
        entityType: 'user',
        entityId: user.id,
        newValue: { provider: federated.provider },
      });
    });
    return event;
  }

  const settings = await deps.db.selectFrom('app.app_settings').select('self_registration_enabled').executeTakeFirstOrThrow();
  if (!settings.self_registration_enabled) return reject('NOT_REGISTERED');
  const clientRole = await deps.db.selectFrom('app.roles').select(['id', 'mfa_required']).where('code', '=', 'client').executeTakeFirstOrThrow();
  if (clientRole.mfa_required) return reject('MFA_REQUIRED_USE_PASSWORD');

  const nativeSub = await deps.cognito.adminCreateUser(email, true);
  try {
    await deps.cognito.adminLinkProvider(nativeSub, federated.idpName, federated.subject);
    await deps.db.transaction().execute(async (tx) => {
      const created = await tx
        .insertInto('app.users')
        .values({
          email,
          first_name: (attributes['given_name'] || email.split('@')[0]!).slice(0, 100),
          last_name: (attributes['family_name'] || '-').slice(0, 100),
          role_id: clientRole.id,
          status: 'active',
          must_change_password: false,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('app.user_identities')
        .values([
          { user_id: created.id, provider: 'local', cognito_sub: nativeSub, provider_subject: nativeSub },
          {
            user_id: created.id,
            provider: federated.provider,
            cognito_sub: federated.cognitoUsername,
            provider_subject: federated.subject,
          },
        ])
        .execute();
      await audit(tx, NO_ORIGIN, {
        eventType: 'auth.register',
        result: 'success',
        actorUserId: created.id,
        actorEmail: email,
        entityType: 'user',
        entityId: created.id,
        newValue: { provider: federated.provider },
      });
    });
  } catch (error) {
    await deps.cognito.adminDeleteUser(nativeSub).catch((cleanup: unknown) => logger.error('pre sign-up cleanup failed', { cleanup }));
    throw error;
  }
  return event;
}
