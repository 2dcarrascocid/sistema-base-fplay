/**
 * LOCAL DEVELOPMENT ONLY — `pnpm dev`. Serves the same routes as the Lambdas on http://localhost:3000/api,
 * against the local database container, with simulated Cognito/SES/S3 (see fakes.ts).
 * Never deployed: Lambda bundles only include src/<lambda>/index.ts.
 */
import type { APIGatewayProxyEvent, PostAuthenticationTriggerEvent, PreAuthenticationTriggerEvent } from 'aws-lambda';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { adminRoutes } from '../src/admin/routes.js';
import { authRoutes } from '../src/auth/routes.js';
import { configRoutes } from '../src/config/routes.js';
import type { Config } from '../src/lib/config.js';
import { createDb } from '../src/lib/db.js';
import type { Deps } from '../src/lib/deps.js';
import { pwnedPasswordsChecker } from '../src/lib/external.js';
import { createRouter, type Route } from '../src/lib/http.js';
import { meRoutes } from '../src/me/routes.js';
import { saphiRoutes } from '../src/saphi/routes.js';
import { postAuthentication, preAuthentication } from '../src/triggers/authentication.js';
import { consoleMailer, DEV_CODE, DEV_PASSWORD, devVerifier, DevCognito, MemoryStorage } from './fakes.js';
import { localGeeProvider } from './gee-provider.js';

if (process.env['NODE_ENV'] === 'production') {
  console.error('The development server must never run in production.');
  process.exit(1);
}

const PORT = Number(process.env['DEV_API_PORT'] ?? 3000);
const WEB_URL = process.env['DEV_WEB_URL'] ?? 'http://localhost:5173';
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const config: Config = {
  stage: 'local',
  region: 'local',
  cognito: { userPoolId: 'local', webClientId: 'dev-web', mobileClientId: 'dev-mobile', domain: `${WEB_URL}/api/dev/federated` },
  webUrl: WEB_URL,
  apiUrl: `${WEB_URL}/api`,
  db: { host: '127.0.0.1', port: 54322, database: 'postgres', ssl: false },
  emailFrom: 'no-reply@localhost',
  photoBucket: 'memory',
  turnstileHostname: undefined,
  federatedProviders: ['google', 'facebook', 'apple'],
};

const connection = { host: '127.0.0.1', port: 54322, database: 'postgres', ssl: false };
const authDb = createDb({ ...connection, user: 'app_auth', password: 'app_auth_local' });
const apiDb = createDb({ ...connection, user: 'app_api', password: 'app_api_local' });
const cognito = new DevCognito(authDb, config.cognito.webClientId);
const storage = new MemoryStorage(WEB_URL);

const shared = {
  config,
  cognito,
  verifier: devVerifier,
  mailer: consoleMailer,
  storage,
  captcha: { verify: async () => true },
  breached: pwnedPasswordsChecker(),
  encryptionKey: randomBytes(32),
};
const authDeps: Deps = { ...shared, db: authDb };
const apiDeps: Deps = { ...shared, db: apiDb, satelliteMaps:localGeeProvider };

// The simulated Cognito runs the real Pre/Post authentication triggers (lockout, audit).
cognito.triggers = {
  async preAuthentication(sub, clientId) {
    const event = { request: { userAttributes: { sub } }, callerContext: { clientId }, response: {} } as unknown as PreAuthenticationTriggerEvent;
    await preAuthentication(authDeps, event);
  },
  async postAuthentication(sub, clientId) {
    const event = { request: { userAttributes: { sub } }, callerContext: { clientId }, response: {} } as unknown as PostAuthenticationTriggerEvent;
    await postAuthentication(authDeps, event);
  },
};

const routers = [
  { routes: saphiRoutes(apiDeps), handler: createRouter(saphiRoutes(apiDeps)) },
  { routes: authRoutes(authDeps), handler: createRouter(authRoutes(authDeps)) },
  { routes: meRoutes(apiDeps), handler: createRouter(meRoutes(apiDeps)) },
  { routes: adminRoutes(apiDeps), handler: createRouter(adminRoutes(apiDeps)) },
  { routes: configRoutes(apiDeps), handler: createRouter(configRoutes(apiDeps)) },
];

interface Match {
  handler: ReturnType<typeof createRouter>;
  resource: string;
  pathParameters: Record<string, string>;
}

const table = routers.flatMap(({ routes, handler }) =>
  Object.keys(routes as Record<string, Route>).map((key) => {
    const [method, resource] = key.split(' ') as [string, string];
    const names: string[] = [];
    const pattern = new RegExp(
      `^${resource.replace(/\{(\w+)\}/g, (_, name: string) => {
        names.push(name);
        return '([^/]+)';
      })}$`,
    );
    return { method, resource, pattern, names, handler };
  }),
);
// Static segments win over parameters (/admin/users/export before /admin/users/{id}).
table.sort((a, b) => a.names.length - b.names.length);

function match(method: string, path: string): Match | undefined {
  for (const route of table) {
    if (route.method !== method) continue;
    const found = route.pattern.exec(path);
    if (found) {
      return {
        handler: route.handler,
        resource: route.resource,
        pathParameters: Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(found[i + 1]!)])),
      };
    }
  }
  return undefined;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function send(res: ServerResponse, status: number, body: string | Buffer, headers: Record<string, string> = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Stand-in for the Cognito hosted UI with an external provider: pick which local user "signs in". */
function federatedPage(url: URL, res: ServerResponse) {
  const provider = escape(url.searchParams.get('identity_provider') ?? '');
  const state = escape(url.searchParams.get('state') ?? '');
  const redirect = escape(url.searchParams.get('redirect_uri') ?? '');
  send(
    res,
    200,
    `<!doctype html><meta charset="utf-8"><title>Login simulado</title>
<body style="font-family:system-ui;max-width:420px;margin:60px auto">
<h2>Login simulado con ${provider}</h2><p>Entorno local: escribe el email de un usuario existente.</p>
<form action="/api/dev/federated/approve"><input type="hidden" name="state" value="${state}"><input type="hidden" name="redirect_uri" value="${redirect}">
<input name="email" type="email" required style="width:100%;padding:8px" placeholder="usuario@ejemplo.cl"><p><button>Continuar</button></p></form></body>`,
    { 'Content-Type': 'text/html; charset=utf-8' },
  );
}

async function devRoutes(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const path = url.pathname;
  if (path === '/api/dev/federated/oauth2/authorize') {
    federatedPage(url, res);
    return true;
  }
  if (path === '/api/dev/federated/approve') {
    const target = new URL(url.searchParams.get('redirect_uri') ?? WEB_URL);
    if (!target.href.startsWith(`${WEB_URL}/`)) return send(res, 400, 'invalid redirect'), true;
    target.searchParams.set('code', `dev-${url.searchParams.get('email') ?? ''}`);
    target.searchParams.set('state', url.searchParams.get('state') ?? '');
    send(res, 302, '', { Location: target.href });
    return true;
  }
  if (path === '/api/dev/uploads' && req.method === 'POST') {
    const form = await new Request('http://local/', { method: 'POST', headers: req.headers as HeadersInit, body: new Uint8Array(await readBody(req)) }).formData();
    const file = form.get('file');
    const key = String(form.get('key') ?? '');
    if (!(file instanceof Blob) || !key || file.size > PHOTO_MAX_BYTES) return send(res, 400, 'invalid upload'), true;
    storage.objects.set(key, { type: String(form.get('Content-Type') ?? file.type), data: Buffer.from(await file.arrayBuffer()) });
    send(res, 204, '');
    return true;
  }
  if (path.startsWith('/api/dev/files/')) {
    const object = storage.objects.get(decodeURIComponent(path.slice('/api/dev/files/'.length)));
    if (!object) return send(res, 404, 'not found'), true;
    send(res, 200, object.data, { 'Content-Type': object.type, 'Cache-Control': 'no-store' });
    return true;
  }
  return false;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    if (await devRoutes(req, res, url)) return;
    if (!url.pathname.startsWith('/api/')) return send(res, 404, 'not found');

    const found = match(req.method ?? 'GET', url.pathname.slice('/api'.length));
    if (!found) return send(res, 404, JSON.stringify({ error: { code: 'NOT_FOUND' } }), { 'Content-Type': 'application/json' });

    const body = await readBody(req);
    const headers = Object.fromEntries(Object.entries(req.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : (value ?? '')]));
    const event = {
      httpMethod: req.method,
      resource: found.resource,
      path: url.pathname,
      headers,
      body: body.length ? body.toString('utf8') : null,
      isBase64Encoded: false,
      pathParameters: found.pathParameters,
      queryStringParameters: url.searchParams.size ? Object.fromEntries(url.searchParams) : null,
      requestContext: { requestId: randomUUID(), identity: { sourceIp: req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? '127.0.0.1' } },
    } as unknown as APIGatewayProxyEvent;

    const result = await found.handler(event);
    const outHeaders: Record<string, string | string[]> = { ...(result.headers as Record<string, string>) };
    const cookies = result.multiValueHeaders?.['Set-Cookie'];
    if (cookies) outHeaders['Set-Cookie'] = cookies.map(String);
    res.writeHead(result.statusCode, outHeaders);
    res.end(result.body);
  } catch (error) {
    console.error(error);
    send(res, 500, JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }), { 'Content-Type': 'application/json' });
  }
});

server.listen(PORT, () => {
  console.log(`
API local en http://localhost:${PORT}/api  (web: ${WEB_URL})
  Superusuario: superadmin@local.test   Contraseña: ${DEV_PASSWORD}   Código MFA: ${DEV_CODE}
  Los emails (invitaciones, códigos) se muestran en esta consola.
`);
});
