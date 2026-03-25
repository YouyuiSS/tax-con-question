# Backend

This app will host the minimal API and SSE layer for the project.

## Planned Responsibilities

- Accept question submissions from the H5 app
- Store the current big-screen question list
- Broadcast incremental updates through SSE
- Support simple delete/update operations for live events

## Endpoints

- `POST /api/questions`
- `GET /api/questions/public`
- `GET /api/questions/board`
- `GET /api/questions` with `Authorization: Bearer <ADMIN_TOKEN>`
- `GET /api/events/board`
- `GET /api/events` with `Authorization: Bearer <ADMIN_TOKEN>`
- `GET /api/admin/audit-logs` with `Authorization: Bearer <ADMIN_TOKEN>`
- `PATCH /api/questions/:id` with `Authorization: Bearer <ADMIN_TOKEN>`
- `DELETE /api/questions/:id` with `Authorization: Bearer <ADMIN_TOKEN>`
- `PATCH /api/settings` with `Authorization: Bearer <ADMIN_TOKEN>`

## Environment Variables

- `JDBC_DATABASE_URL` or `DATABASE_URL`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_SCHEMA` default: `public`
- `TABLE_PREFIX` default: `tcq_`
- `PORT` default: `4000`
- `ADMIN_TOKEN` required for management write APIs
- `ADMIN_AUDIT_LOG_LIMIT` default: `200`, max rows returned by `GET /api/admin/audit-logs`
- `CORS_ALLOWED_ORIGINS` comma-separated allowlist for cross-origin browser access

## CORS Behavior

- Same-origin browser requests are always allowed.
- In non-production local development, `http://localhost:3100`, `http://127.0.0.1:3100`, `http://localhost:3101`, and `http://127.0.0.1:3101` are allowed by default.
- In production, set `CORS_ALLOWED_ORIGINS` when the frontend is hosted on a different origin from the backend.

## Audit Logging

- Management write actions are written into the `admin_audit_logs` table in the project schema.
- Audit records store action type, resource id, request path, request method, operator label, and a compact before/after summary.
- Question audit records intentionally avoid duplicating question text to reduce extra retention of submitted content.
