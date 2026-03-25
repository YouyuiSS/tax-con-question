import { query, type SqlExecutor } from './db.js';
import type { AppSettings } from '../types.js';

type SettingRow = {
  key: string;
  value_boolean: boolean;
};

const AUTO_PUBLISH_KEY = 'auto_publish_enabled';

export async function getAppSettings(execute: SqlExecutor = query): Promise<AppSettings> {
  const result = await execute<SettingRow>(
    `
      select key, value_boolean
      from {{settings}}
      where key = $1
    `,
    [AUTO_PUBLISH_KEY],
  );

  return {
    autoPublishEnabled: result.rows[0]?.value_boolean ?? false,
  };
}

export async function updateAppSettings(
  updates: Partial<AppSettings>,
  execute: SqlExecutor = query,
): Promise<AppSettings> {
  if (updates.autoPublishEnabled !== undefined) {
    await execute(
      `
        insert into {{settings}} (key, value_boolean, updated_at)
        values ($1, $2, now())
        on conflict (key) do update
        set value_boolean = excluded.value_boolean,
            updated_at = now()
      `,
      [AUTO_PUBLISH_KEY, updates.autoPublishEnabled],
    );
  }

  return getAppSettings(execute);
}
