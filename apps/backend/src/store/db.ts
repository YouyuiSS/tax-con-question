import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config.js';

const QUESTIONS_TABLE_TOKEN = '{{questions}}';
const SETTINGS_TABLE_TOKEN = '{{settings}}';

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

function getQualifiedSettingsTable(): string {
  return `${escapeIdentifier(config.database.schema)}.${escapeIdentifier(
    `${config.database.tablePrefix}settings`,
  )}`;
}

function compileSql(sql: string): string {
  return sql
    .replaceAll(QUESTIONS_TABLE_TOKEN, getQualifiedQuestionsTable())
    .replaceAll(SETTINGS_TABLE_TOKEN, getQualifiedSettingsTable());
}

export async function initializeDatabase(): Promise<void> {
  const schema = escapeIdentifier(config.database.schema);
  const table = getQualifiedQuestionsTable();
  const settingsTable = getQualifiedSettingsTable();

  await pool.query(`create schema if not exists ${schema}`);
  await pool.query(`
    create table if not exists ${table} (
      id uuid primary key,
      text varchar(500) not null,
      tag varchar(120) not null default '',
      route varchar(32) not null check (route in ('public_discuss', 'meeting_only')),
      display_status varchar(32) not null default 'pending'
        check (display_status in ('pending', 'show_raw', 'count_only', 'redirect_official', 'archived')),
      answer_status varchar(32) not null default 'unanswered'
        check (answer_status in ('unanswered', 'answered_live', 'answered_post')),
      count integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    alter table ${table}
    add column if not exists display_status varchar(32) not null default 'pending'
      check (display_status in ('pending', 'show_raw', 'count_only', 'redirect_official', 'archived'))
  `);
  await pool.query(`
    alter table ${table}
    add column if not exists answer_status varchar(32) not null default 'unanswered'
      check (answer_status in ('unanswered', 'answered_live', 'answered_post'))
  `);
  await pool.query(`
    alter table ${table}
    add column if not exists updated_at timestamptz not null default now()
  `);
  await pool.query(`
    create index if not exists ${escapeIdentifier(
      `${config.database.tablePrefix}questions_created_at_idx`,
    )}
    on ${table} (created_at desc)
  `);
  await pool.query(`
    create index if not exists ${escapeIdentifier(
      `${config.database.tablePrefix}questions_display_status_idx`,
    )}
    on ${table} (display_status)
  `);
  await pool.query(`
    create table if not exists ${settingsTable} (
      key varchar(80) primary key,
      value_boolean boolean not null,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(
    `
      insert into ${settingsTable} (key, value_boolean)
      values ('auto_publish_enabled', false)
      on conflict (key) do nothing
    `,
  );
}

export async function query<Row extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<Row>> {
  return pool.query<Row>(compileSql(sql), params);
}
