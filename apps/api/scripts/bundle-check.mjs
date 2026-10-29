// Bundles every Lambda entry point the way the deploy does, without AWS credentials.
// Fails on unresolved imports or syntax the Node.js 24 runtime would not accept.
import { build } from 'esbuild';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const entryPoints = ['src/auth/index.ts', 'src/me/index.ts', 'src/admin/index.ts', 'src/config/index.ts', 'src/triggers/index.ts', 'src/saphi/index.ts', 'src/saphi/iot-ingest/index.ts'];
const outdir = mkdtempSync(join(tmpdir(), 'base-api-bundle-'));

try {
  await build({
    entryPoints,
    outdir,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    minify: true,
    sourcemap: 'linked',
    logLevel: 'warning',
    // pg optionally requires pg-native, which we do not use.
    external: ['pg-native'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  });
  for (const entry of entryPoints) {
    const file = join(outdir, entry.replace('src/', '').replace('.ts', '.js'));
    console.log(`${entry} -> ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }
} finally {
  rmSync(outdir, { recursive: true, force: true });
}
