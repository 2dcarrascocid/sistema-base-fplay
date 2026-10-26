// Installs the first superuser of an environment (run once per stage by an operator).
//
//   DATABASE_URL=postgresql://<migration role>@host:5432/postgres?sslmode=require \
//   COGNITO_USER_POOL_ID=us-east-1_xxx WEB_URL=https://app.example.cl AWS_REGION=us-east-1 \
//   node scripts/create-superuser.ts --email ana@example.cl --first-name Ana --last-name Pérez
//
// Creates the native Cognito user (no password, no Cognito email), the superuser row with its
// local identity and a 72 h invitation, and prints the activation link. The link is a secret:
// deliver it to the person through a trusted channel.
import { AdminCreateUserCommand, AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { createHash, randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    'first-name': { type: 'string' },
    'last-name': { type: 'string' },
  },
});

function required(value: string | undefined, name: string): string {
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

const email = required(values.email, '--email').trim().toLowerCase();
const firstName = required(values['first-name'], '--first-name');
const lastName = required(values['last-name'], '--last-name');
const databaseUrl = required(process.env['DATABASE_URL'], 'DATABASE_URL');
const userPoolId = required(process.env['COGNITO_USER_POOL_ID'], 'COGNITO_USER_POOL_ID');
const webUrl = required(process.env['WEB_URL'], 'WEB_URL').replace(/\/$/, '');

const cognito = new CognitoIdentityProviderClient({});
const created = await cognito.send(
  new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: email,
    MessageAction: 'SUPPRESS',
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'false' },
    ],
  }),
);
const sub = created.User?.Attributes?.find((attribute) => attribute.Name === 'sub')?.Value;
if (!sub) throw new Error('Cognito did not return the user sub');

const token = randomBytes(32).toString('base64url');
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query('begin');
  const user = await client.query<{ id: string }>(
    `insert into app.users (email, first_name, last_name, role_id, status, must_change_password)
     values ($1, $2, $3, (select id from app.roles where code = 'superuser'), 'invited', false)
     on conflict (email) do update set role_id = excluded.role_id
     returning id`,
    [email, firstName, lastName],
  );
  const userId = user.rows[0]!.id;
  await client.query(
    `insert into app.user_identities (user_id, provider, cognito_sub, provider_subject) values ($1, 'local', $2, $2)`,
    [userId, sub],
  );
  await client.query(
    `insert into app.invitations (user_id, token_hash, expires_at) values ($1, $2, now() + interval '72 hours')`,
    [userId, createHash('sha256').update(token).digest()],
  );
  await client.query(
    `insert into app.audit_log (event_type, result, entity_type, entity_id, new_value)
     values ('install.superuser.created', 'success', 'user', $1, $2)`,
    [userId, JSON.stringify({ email })],
  );
  await client.query('commit');
} catch (error) {
  await client.query('rollback');
  await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: sub }));
  throw error;
} finally {
  await client.end();
}

console.log(`Superuser ${email} created. Activation link (valid 72 h, single use):`);
console.log(`${webUrl}/activate#token=${token}`);
