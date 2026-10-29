import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, it } from 'vitest';

const supabaseDir = join(import.meta.dirname, '../../../../supabase');
const connection = { host: '127.0.0.1', port: 54322, user: 'postgres', password: 'postgres' };

describe('Saphi migration compatibility', () => {
  it('upgrades a seeded Base Fairplay database without losing existing data', async () => {
    // Generated, isolated test database only. Never clone, reset or migrate the development DB.
    const database = `saphi_upgrade_test_${randomBytes(6).toString('hex')}`;
    const control = new pg.Client({ ...connection, database: 'postgres' });
    let target: pg.Client | undefined;
    let created = false;
    await control.connect();
    try {
      await control.query(`create database ${database}`);
      created = true;
      target = new pg.Client({ ...connection, database });
      await target.connect();
      const files = readdirSync(join(supabaseDir, 'migrations')).filter((file) => file.endsWith('.sql')).sort();
      const firstSaphi = files.findIndex((file) => file.includes('_saphi_'));
      expect(firstSaphi).toBeGreaterThan(0);
      for (const file of files.slice(0, firstSaphi)) {
        await target.query(readFileSync(join(supabaseDir, 'migrations', file), 'utf8'));
      }
      for (const seed of ['seed.sql', 'seed.local.sql']) {
        await target.query(readFileSync(join(supabaseDir, seed), 'utf8'));
      }
      await target.query("update app.app_settings set system_name = 'Preserved installation'");
      const before = await target.query('select id, email from app.users order by id');
      for (const file of files.slice(firstSaphi)) {
        await target.query(readFileSync(join(supabaseDir, 'migrations', file), 'utf8'));
      }
      expect((await target.query('select id, email from app.users order by id')).rows).toEqual(before.rows);
      expect((await target.query('select system_name from app.app_settings')).rows[0].system_name).toBe('Preserved installation');
      expect((await target.query("select count(*)::int as n from app.menu_actions ma join app.menus m on m.id=ma.menu_id where m.code like 'saphi.%'")).rows[0].n).toBe(27);
      expect((await target.query('select count(*)::int as n from saphi.companies')).rows[0].n).toBe(0);
      expect((await target.query('select app.verify_audit_chain() as broken')).rows[0].broken).toBeNull();
    } finally {
      await target?.end();
      if (created) await control.query(`drop database ${database} with (force)`);
      await control.end();
    }
  }, 60_000);
});
