/** Start the local Saphi stack and load idempotent DEMO data. Never targets remote services. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'apps/api');
const geeBackend = join(root, 'examples/mi-proyecto-satelital/backend-serverless');
const children = [];
const windows = process.platform === 'win32';

if (process.argv.includes('--help')) {
  console.log('Uso: pnpm dev:saphi\nInicia PostgreSQL local, carga datos DEMO y levanta API, web y el visor GEE si está configurado.');
  process.exit(0);
}
if (process.env.NODE_ENV === 'production') throw new Error('El arranque Saphi es solo para desarrollo local.');

function run(label, command, args, cwd = root) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: windows && command !== process.execPath, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} terminó con código ${result.status ?? 'desconocido'}.`);
}
function start(label, command, args, cwd = root) {
  console.log(`\n▶ ${label}`);
  const child = spawn(command, args, { cwd, stdio: 'inherit', shell: windows && command !== process.execPath, windowsHide: true });
  children.push(child);
  return child;
}
function portOpen(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const socket = net.connect({ host, port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.setTimeout(1500, () => { socket.destroy(); resolve(false); });
  });
}
async function ready(port, label, child, host = '127.0.0.1') {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await portOpen(port, host)) return;
    if (child?.exitCode !== null || child?.signalCode !== null) throw new Error(`${label} terminó antes de abrir el puerto ${port}.`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`${label} no abrió el puerto ${port} dentro de 40 segundos.`);
}
function stop() {
  for (const child of children.reverse()) {
    if (!child.pid || child.exitCode !== null) continue;
    if (windows) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stop(); process.exit(0); });

try {
  run('Preparando contenedor PostgreSQL, migraciones y datos base', process.execPath, [join(root, 'scripts/db-ensure.mjs')]);
  run('Cargando empresas y tablas Saphi DEMO', 'pnpm', ['--filter', '@base/api', 'exec', 'tsx', 'dev/seed-saphi.ts', '--local-demo']);

  const geeKey = process.env.GEE_KEY_FILE || join(api, 'credenciales-gee.json');
  const geePython = join(geeBackend, '.venv', windows ? 'Scripts/python.exe' : 'bin/python');
  const geeServerless = join(geeBackend, 'node_modules/serverless/bin/serverless.js');
  if (await portOpen(3001, 'localhost')) console.log('Proveedor GEE existente detectado en localhost:3001.');
  else if ([geeKey, geePython, geeServerless].every(existsSync)) {
    const provider = start('Iniciando proveedor local Earth Engine', process.execPath, [join(api, 'scripts/start-gee.mjs')]);
    await ready(3001, 'Proveedor GEE', provider, 'localhost');
  } else console.log('Visor GEE opcional sin iniciar: faltan credencial o dependencias locales de Python/Serverless.');

  let apiChild;
  if (await portOpen(3000)) console.log('API existente detectada en localhost:3000.');
  else { apiChild = start('Iniciando API Saphi', 'pnpm', ['--filter', '@base/api', 'dev']); await ready(3000, 'API', apiChild); }
  let webChild;
  if (await portOpen(5173, 'localhost')) console.log('Web existente detectada en localhost:5173.');
  else { webChild = start('Iniciando web Saphi', 'pnpm', ['--filter', '@base/web', 'dev']); await ready(5173, 'Web', webChild, 'localhost'); }

  run('Preparando empresa del visor GEE mediante API local', process.execPath, [join(api, 'scripts/seed-gee-demo.mjs'), '--local-demo']);
  run('Cargando muestras y observaciones DEMO', process.execPath, [join(api, 'scripts/populate-saphi-visual-demo.mjs'), '--local-demo'], api);
  console.log('\n✔ Saphi local listo: http://localhost:5173/saphi/companies');
  console.log('  Ctrl+C detiene los procesos iniciados por este comando; los contenedores locales permanecen disponibles.');
  await new Promise((resolve, reject) => {
    for (const child of children) child.once('exit', code => reject(new Error(`Un servicio terminó con código ${code ?? 'desconocido'}.`)));
    if (!children.length) resolve();
  });
} catch (error) {
  stop();
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
