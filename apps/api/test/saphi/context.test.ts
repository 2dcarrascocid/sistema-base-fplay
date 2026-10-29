import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';
import { withActor } from '../../src/lib/db.js';
import { apiDb, authDb, createUser, ownerDb } from '../helpers.js';

let userId: string;
const companyId = randomUUID();

beforeAll(async () => {
  userId = (await createUser()).id;
  await sql`insert into saphi.companies(id,rut,legal_name) values(${companyId},'10000013-K','Context fixture')`.execute(ownerDb);
  await sql`insert into saphi.company_users(company_id,user_id) values(${companyId},${userId})`.execute(ownerDb);
});

async function contexts(db: typeof apiDb) {
  const { rows } = await sql<{ actor: string | null; company: string | null }>`select
    nullif(current_setting('app.user_id',true),'') as actor,
    nullif(current_setting('saphi.company_id',true),'') as company`.execute(db);
  return rows[0];
}

describe('transaction-local Saphi context', () => {
  it('clears actor and company after commit on the same physical connection', async () => {
    await apiDb.connection().execute(async (connection) => {
      await withActor(connection, userId, async (tx) => {
        await sql`select saphi.set_company_context(${companyId}::uuid)`.execute(tx);
        const { rows } = await sql<{ id: string }>`select saphi.current_company_id() as id`.execute(tx);
        expect(rows[0]?.id).toBe(companyId);
      });
      expect(await contexts(connection)).toEqual({ actor: null, company: null });
    });
  });

  it('also clears context after rollback, without opening a second transaction', async () => {
    await apiDb.connection().execute(async (connection) => {
      await expect(withActor(connection, userId, async (tx) => {
        await sql`select saphi.set_company_context(${companyId}::uuid)`.execute(tx);
        throw new Error('rollback fixture');
      })).rejects.toThrow('rollback fixture');
      expect(await contexts(connection)).toEqual({ actor: null, company: null });
    });
  });

  it('holds membership and company locks until transaction end', async () => {
    await withActor(apiDb, userId, async (tx) => {
      await sql`select saphi.set_company_context(${companyId}::uuid)`.execute(tx);
      await expect(sql`select 1 from saphi.companies where id=${companyId} for update nowait`
        .execute(ownerDb)).rejects.toMatchObject({ code: '55P03' });
      await expect(sql`select 1 from saphi.company_users where company_id=${companyId} and user_id=${userId} for update nowait`
        .execute(ownerDb)).rejects.toMatchObject({ code: '55P03' });
    });
    await expect(sql`select 1 from saphi.companies where id=${companyId} for update nowait`.execute(ownerDb)).resolves.toBeDefined();
  });

  it('does not mistake a validated context for a permission or expose memberships to auth role', async () => {
    await withActor(apiDb, userId, async (tx) => {
      await sql`select saphi.set_company_context(${companyId}::uuid)`.execute(tx);
      expect(await tx.selectFrom('saphi.farms').select('id').execute()).toEqual([]);
      await expect(tx.insertInto('saphi.farms').values({ company_id: companyId, code: 'P1', name: 'Denied', area_ha: null })
        .execute()).rejects.toMatchObject({ code: '42501' });
    });
    await expect(sql`select * from saphi.company_users`.execute(authDb)).rejects.toMatchObject({ code: '42501' });
  });
});
