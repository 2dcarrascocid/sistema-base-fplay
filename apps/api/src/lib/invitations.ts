import { randomToken, sha256 } from './crypto.js';
import type { Tx } from './db.js';
import type { Deps } from './deps.js';
import { formatDateFor, sendTemplatedEmail, type Recipient } from './email.js';
import { loadSecurityPolicy } from './security.js';

/**
 * Creates an invitation and emails the activation link. The token travels in the URL fragment
 * (#token=...), which browsers never send to servers, and only its SHA-256 is stored.
 */
export async function createInvitation(
  deps: Pick<Deps, 'config' | 'mailer'>,
  tx: Tx,
  user: Recipient & { id: string },
): Promise<Date> {
  const policy = await loadSecurityPolicy(tx);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + policy.invitation_ttl_hours * 3_600_000);
  await tx.insertInto('app.invitations').values({ user_id: user.id, token_hash: sha256(token), expires_at: expiresAt }).execute();
  await sendTemplatedEmail(tx, deps.mailer, 'invitation', user, {
    link: `${deps.config.webUrl}/activate#token=${token}`,
    expires_at: await formatDateFor(tx, user, expiresAt),
  });
  return expiresAt;
}
