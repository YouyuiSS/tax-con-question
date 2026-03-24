import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema: string;
  tablePrefix: string;
  ssl: boolean;
};

type AppConfig = {
  port: number;
  database: DatabaseConfig;
};

type ParsedJdbcUrl = {
  host: string;
  port: number;
  database: string;
  schema?: string;
  ssl?: boolean;
};

dotenv.config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
});

dotenv.config({
  path: fileURLToPath(new URL('../.env.local', import.meta.url)),
  override: true,
});

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJdbcDatabaseUrl(value: string): ParsedJdbcUrl {
  const normalized = value.replace(/^jdbc:/, '');
  const url = new URL(normalized);
  const schema = url.searchParams.get('currentSchema') ?? undefined;
  const ssl = url.searchParams.get('sslmode') === 'require';

  return {
    host: url.hostname,
    port: Number(url.port || '5432'),
    database: url.pathname.replace(/^\//, ''),
    schema,
    ssl,
  };
}

function resolveDatabaseConfig(): DatabaseConfig {
  const jdbcUrl = process.env.JDBC_DATABASE_URL;
  const databaseUrl = process.env.DATABASE_URL;

  let host = process.env.DB_HOST ?? '';
  let port = toNumber(process.env.DB_PORT, 5432);
  let database = process.env.DB_NAME ?? '';
  let schema = process.env.DB_SCHEMA ?? 'public';
  let ssl = process.env.DB_SSL === 'true';

  if (jdbcUrl) {
    const parsed = parseJdbcDatabaseUrl(jdbcUrl);
    host = parsed.host;
    port = parsed.port;
    database = parsed.database;
    schema = process.env.DB_SCHEMA ?? parsed.schema ?? schema;
    ssl = parsed.ssl ?? ssl;
  } else if (databaseUrl) {
    const parsed = new URL(databaseUrl);
    host = parsed.hostname;
    port = Number(parsed.port || '5432');
    database = parsed.pathname.replace(/^\//, '');
    schema = process.env.DB_SCHEMA ?? parsed.searchParams.get('currentSchema') ?? schema;
    ssl = process.env.DB_SSL === 'true' || parsed.searchParams.get('sslmode') === 'require';
  }

  const user = process.env.DB_USER ?? '';
  const password = process.env.DB_PASSWORD ?? '';
  const tablePrefix = process.env.TABLE_PREFIX ?? 'tcq_';

  if (!host || !database || !user || !password) {
    throw new Error(
      'Database configuration is incomplete. Provide JDBC_DATABASE_URL or DATABASE_URL plus DB_USER and DB_PASSWORD.',
    );
  }

  return {
    host,
    port,
    database,
    user,
    password,
    schema,
    tablePrefix,
    ssl,
  };
}

export const config: AppConfig = {
  port: toNumber(process.env.PORT, 4000),
  database: resolveDatabaseConfig(),
};
