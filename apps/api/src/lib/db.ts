import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { Database } from './db-types.js';

export type Db = Kysely<Database>;
export type Tx = Transaction<Database>;

export interface DbConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** false only for the local container. */
  ssl: boolean;
  /** PEM CA bundle for the database server certificate. */
  ca?: string | undefined;
}

export function createDb(connection: DbConnection): Db {
  const pool = new pg.Pool({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ssl: connection.ssl ? { rejectUnauthorized: true, ...(connection.ca ? { ca: connection.ca } : {}) } : false,
    // One Lambda container serves one request at a time.
    max: 2,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    application_name: `base-api-${connection.user}`,
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

/**
 * Runs fn in a transaction where RLS sees userId as the actor (app.current_user_id()).
 * set_config(..., true) is transaction-local, so it is safe with transaction poolers.
 */
export async function withActor<T>(db: Db, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`select set_config('app.user_id', ${userId ?? ''}, true)`.execute(tx);
    return fn(tx);
  });
}
