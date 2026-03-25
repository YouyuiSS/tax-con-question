import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config.js';

const QUESTIONS_TABLE_TOKEN = '{{questions}}';
const SETTINGS_TABLE_TOKEN = '{{settings}}';
const ADMIN_AUDIT_LOGS_TABLE_TOKEN = '{{admin_audit_logs}}';
const QUESTION_CARE_SESSIONS_TABLE_TOKEN = '{{question_care_sessions}}';

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

function getQualifiedAdminAuditLogsTable(): string {
  return `${escapeIdentifier(config.database.schema)}.${escapeIdentifier(
    `${config.database.tablePrefix}admin_audit_logs`,
  )}`;
}

function getQualifiedQuestionCareSessionsTable(): string {
  return `${escapeIdentifier(config.database.schema)}.${escapeIdentifier(
    `${config.database.tablePrefix}question_care_sessions`,
  )}`;
}

function compileSql(sql: string): string {
  return sql
    .replaceAll(QUESTIONS_TABLE_TOKEN, getQualifiedQuestionsTable())
    .replaceAll(SETTINGS_TABLE_TOKEN, getQualifiedSettingsTable())
    .replaceAll(ADMIN_AUDIT_LOGS_TABLE_TOKEN, getQualifiedAdminAuditLogsTable())
    .replaceAll(QUESTION_CARE_SESSIONS_TABLE_TOKEN, getQualifiedQuestionCareSessionsTable());
}

type Queryable = Pool | PoolClient;

export type SqlExecutor = <Row extends QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<QueryResult<Row>>;

async function executeQuery<Row extends QueryResultRow>(
  client: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<Row>> {
  return client.query<Row>(compileSql(sql), params);
}

export async function initializeDatabase(): Promise<void> {
  const schema = escapeIdentifier(config.database.schema);
  const table = getQualifiedQuestionsTable();
  const settingsTable = getQualifiedSettingsTable();
  const adminAuditLogsTable = getQualifiedAdminAuditLogsTable();
  const questionCareSessionsTable = getQualifiedQuestionCareSessionsTable();

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
    create index if not exists ${escapeIdentifier(
      `${config.database.tablePrefix}questions_display_status_created_at_idx`,
    )}
    on ${table} (display_status, created_at desc)
  `);
  await pool.query(`
    create index if not exists ${escapeIdentifier(
      `${config.database.tablePrefix}questions_display_status_route_created_at_idx`,
    )}
    on ${table} (display_status, route, created_at desc)
  `);
  await pool.query(`
    create table if not exists ${questionCareSessionsTable} (
      question_id uuid not null references ${table} (id) on delete cascade,
      session_hash varchar(64) not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      primary key (question_id, session_hash)
    )
  `);
  await pool.query(`
    create index if not exists ${escapeIdentifier(
      `${config.database.tablePrefix}question_care_sessions_expires_at_idx`,
    )}
    on ${questionCareSessionsTable} (expires_at)
  `);
  await pool.query(`
    create index if not exists ${escapeIdentifier(
      `${config.database.tablePrefix}question_care_sessions_session_hash_question_id_expires_at_idx`,
    )}
    on ${questionCareSessionsTable} (session_hash, question_id, expires_at)
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
  await pool.query(`
    create table if not exists ${adminAuditLogsTable} (
      id uuid primary key,
      action varchar(64) not null,
      resource_type varchar(64) not null,
      resource_id varchar(120) not null default '',
      actor_label varchar(120) not null,
      auth_mode varchar(32) not null,
      request_method varchar(16) not null,
      request_path varchar(240) not null,
      origin varchar(240) not null default '',
      user_agent varchar(255) not null default '',
      details_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create index if not exists ${escapeIdentifier(
      `${config.database.tablePrefix}admin_audit_logs_created_at_idx`,
    )}
    on ${adminAuditLogsTable} (created_at desc)
  `);
  await pool.query(`
    create index if not exists ${escapeIdentifier(
      `${config.database.tablePrefix}admin_audit_logs_resource_idx`,
    )}
    on ${adminAuditLogsTable} (resource_type, resource_id, created_at desc)
  `);
}

export const query: SqlExecutor = async <Row extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<Row>> => {
  return executeQuery<Row>(pool, sql, params);
};

export async function withTransaction<T>(callback: (execute: SqlExecutor) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('begin');
    const transactionalQuery: SqlExecutor = async <Row extends QueryResultRow>(
      sql: string,
      params: unknown[] = [],
    ): Promise<QueryResult<Row>> => executeQuery<Row>(client, sql, params);
    const result = await callback(transactionalQuery);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
