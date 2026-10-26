// Prepares the local environment before `pnpm dev`, so a fresh clone runs with one command:
// 1. installs dependencies when missing;
// 2. checks that Docker is running;
// 3. starts the PostgreSQL container (Supabase CLI; first start applies migrations and seeds);
// 4. applies pending migrations (new ones pulled from git);
// 5. loads the seeds when their data is missing.
// Every step is idempotent: running it again changes nothing.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync(join(root, 'supabase/config.toml'), 'utf8'))[1];
const container = `supabase_db_${projectId}`;

function run(command, { input, quiet = false } = {}) {
  const result = spawnSync(command, { cwd: root, shell: true, input, encoding: 'utf8', stdio: [input ? 'pipe' : 'inherit', quiet ? 'pipe' : 'inherit', 'pipe'] });
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function step(message) {
  console.log(`\n▶ ${message}`);
}

function fail(message, detail = '') {
  console.error(`\n✖ ${message}${detail ? `\n${detail.trim()}` : ''}`);
  process.exit(1);
}

if (!existsSync(join(root, 'node_modules/.bin/supabase')) && !existsSync(join(root, 'node_modules/.bin/supabase.cmd'))) {
  step('Instalando dependencias (pnpm install)…');
  if (!run('pnpm install --frozen-lockfile').ok) fail('No se pudieron instalar las dependencias.');
}

step('Verificando Docker…');
if (!run('docker info', { quiet: true }).ok) fail('Docker no está disponible. Inicia Docker Desktop y vuelve a ejecutar el comando.');

step('Iniciando el contenedor de PostgreSQL (la primera vez descarga la imagen)…');
const start = run('pnpm exec supabase db start', { quiet: true });
if (!start.ok) fail('No se pudo iniciar la base de datos.', start.stderr || start.stdout);

step('Aplicando migraciones pendientes…');
const migrate = run('pnpm exec supabase migration up --local', { quiet: true });
if (!migrate.ok) fail('No se pudieron aplicar las migraciones.', migrate.stderr || migrate.stdout);

/** Runs SQL inside the container as postgres; returns trimmed output. */
function psql(sql) {
  const result = run(`docker exec -i ${container} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At`, { input: sql, quiet: true });
  if (!result.ok) fail('Error al consultar la base de datos.', result.stderr);
  return result.stdout.trim();
}

step('Verificando datos base…');
const [roles, superusers] = psql(
  "select (select count(*) from app.roles), (select count(*) from app.users where email = 'superadmin@local.test');",
).split('|').map(Number);

if (roles === 0) {
  console.log('  Cargando supabase/seed.sql…');
  psql(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'));
}
if (superusers === 0) {
  console.log('  Cargando supabase/seed.local.sql…');
  psql(readFileSync(join(root, 'supabase/seed.local.sql'), 'utf8'));
}

console.log('\n✔ Base de datos lista (postgresql://postgres:postgres@127.0.0.1:54322/postgres).');
