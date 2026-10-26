/**
 * Builds a dedicated test database (app_test) in the local container from the same migrations and
 * seeds, so API tests never write into the database the local web app uses.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

export const TEST_DATABASE = 'app_test';
const SUPABASE_DIR = join(import.meta.dirname, '../../../supabase');
const owner = { host: '127.0.0.1', port: 54322, user: 'postgres', password: 'postgres' };

async function run(database: string, sql: string): Promise<void> {
  const client = new pg.Client({ ...owner, database });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export default async function setup(): Promise<void> {
  await run('postgres', `drop database if exists ${TEST_DATABASE} with (force)`);
  await run('postgres', `create database ${TEST_DATABASE}`);

  const migrations = readdirSync(join(SUPABASE_DIR, 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of migrations) await run(TEST_DATABASE, readFileSync(join(SUPABASE_DIR, 'migrations', file), 'utf8'));
  for (const file of ['seed.sql', 'seed.local.sql']) await run(TEST_DATABASE, readFileSync(join(SUPABASE_DIR, file), 'utf8'));
}
