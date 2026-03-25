import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { query, type SqlExecutor } from './db.js';
import type { AdminAuditAction, AdminAuditLog, AdminAuthMode } from '../types.js';

type AdminAuditLogRow = {
  id: string;
  action: AdminAuditAction;
  resource_type: string;
  resource_id: string;
  actor_label: string;
  auth_mode: AdminAuthMode;
  request_method: string;
  request_path: string;
  origin: string;
  user_agent: string;
  details_json: Record<string, unknown> | null;
  created_at: string;
};

export type CreateAdminAuditLogInput = {
  action: AdminAuditAction;
  resourceType: string;
  resourceId: string;
  actorLabel: string;
  authMode: AdminAuthMode;
  requestMethod: string;
  requestPath: string;
  origin?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
};

function sanitizeValue(value: string | undefined, maxLength: number): string {
  return (value ?? '').trim().slice(0, maxLength);
}

function mapAdminAuditLogRow(row: AdminAuditLogRow): AdminAuditLog {
  return {
    id: row.id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    actorLabel: row.actor_label,
    authMode: row.auth_mode,
    requestMethod: row.request_method,
    requestPath: row.request_path,
    origin: row.origin,
    userAgent: row.user_agent,
    details: row.details_json ?? {},
    createdAt: row.created_at,
  };
}

export async function createAdminAuditLog(
  input: CreateAdminAuditLogInput,
  execute: SqlExecutor = query,
): Promise<AdminAuditLog> {
  const result = await execute<AdminAuditLogRow>(
    `
      insert into {{admin_audit_logs}} (
        id,
        action,
        resource_type,
        resource_id,
        actor_label,
        auth_mode,
        request_method,
        request_path,
        origin,
        user_agent,
        details_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      returning
        id,
        action,
        resource_type,
        resource_id,
        actor_label,
        auth_mode,
        request_method,
        request_path,
        origin,
        user_agent,
        details_json,
        created_at
    `,
    [
      randomUUID(),
      input.action,
      sanitizeValue(input.resourceType, 64),
      sanitizeValue(input.resourceId, 120),
      sanitizeValue(input.actorLabel, 120),
      input.authMode,
      sanitizeValue(input.requestMethod, 16),
      sanitizeValue(input.requestPath, 240),
      sanitizeValue(input.origin, 240),
      sanitizeValue(input.userAgent, 255),
      input.details ?? {},
    ],
  );

  return mapAdminAuditLogRow(result.rows[0]);
}

export async function listAdminAuditLogs(
  limit = 50,
  execute: SqlExecutor = query,
): Promise<AdminAuditLog[]> {
  const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), config.adminAuditLogLimit);
  const result = await execute<AdminAuditLogRow>(
    `
      select
        id,
        action,
        resource_type,
        resource_id,
        actor_label,
        auth_mode,
        request_method,
        request_path,
        origin,
        user_agent,
        details_json,
        created_at
      from {{admin_audit_logs}}
      order by created_at desc
      limit $1
    `,
    [normalizedLimit],
  );

  return result.rows.map(mapAdminAuditLogRow);
}
