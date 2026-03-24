import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config.js';

const QUESTIONS_TABLE_TOKEN = '{{questions}}';

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
});

function escapeIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function getQualifiedQuestionsTable(): string {
  return `${escapeIdentifier(config.database.schema)}.${escapeIdentifier(
    `${config.database.tablePrefix}questions`,
  )}`;
}

function compileSql(sql: string): string {
  return sql.replaceAll(QUESTIONS_TABLE_TOKEN, getQualifiedQuestionsTable());
}

export async function initializeDatabase(): Promise<void> {
  const schema = escapeIdentifier(config.database.schema);
  const table = getQualifiedQuestionsTable();

  await pool.query(`create schema if not exists ${schema}`);
  await pool.query(`
    create table if not exists ${table} (
      id uuid primary key,
      text varchar(500) not null,
      tag varchar(120) not null default '',
      route varchar(32) not null check (route in ('public_discuss', 'meeting_only')),
      count integer not null default 1,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create index if not exists ${escapeIdentifier(
      `${config.database.tablePrefix}questions_created_at_idx`,
    )}
    on ${table} (created_at desc)
  `);
}

export async function query<Row extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<Row>> {
  return pool.query<Row>(compileSql(sql), params);
}
