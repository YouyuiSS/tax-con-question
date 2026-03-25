# tax-con-question

Anonymous question collection and meeting display project.

## Apps

- `apps/web`: big-screen display experience
- `apps/backend`: lightweight API and SSE service
- `apps/h5`: employee-facing mobile submission app

## Docs

- `docs/product-prd.md`
- `docs/page-copy.md`
- `docs/data-model-and-api.md`
- `docs/frontend-wireframes.md`
- `docs/interaction-design.md`

## Current Status

- `apps/web` contains the current big-screen prototype.
- `apps/backend` contains the PostgreSQL-backed API and SSE event layer.
- `apps/h5` contains the minimal employee submission flow.

## Local Development

1. Install dependencies
   - `npm install`
2. Start backend
   - `npm run dev:backend`
3. Start big-screen app
   - `npm run dev:web`
4. Start H5 app
   - `npm run dev:h5`

Default local ports:

- backend: `4000`
- web: `3100`
- h5: `3101`

## Backend Environment

Use environment variables for the backend service. Supported options:

- `JDBC_DATABASE_URL` + `DB_USER` + `DB_PASSWORD`
- or `DATABASE_URL` + `DB_USER` + `DB_PASSWORD`

Optional variables:

- `DB_SCHEMA`
- `TABLE_PREFIX`
- `PORT`
- `ADMIN_TOKEN` for management write APIs
- `ADMIN_AUDIT_LOG_LIMIT` for the maximum number of audit log rows returned per request
- `CORS_ALLOWED_ORIGINS` as a comma-separated allowlist for cross-origin browser access

Notes:

- Same-origin requests are always allowed.
- In non-production local development, the backend also allows `http://localhost:3100`, `http://127.0.0.1:3100`, `http://localhost:3101`, and `http://127.0.0.1:3101` by default.
- In production, set `CORS_ALLOWED_ORIGINS` explicitly if `web` or `h5` are served from a different origin than the backend.

## Admin Audit Logs

- Management write APIs now create audit records in PostgreSQL.
- The backend exposes `GET /api/admin/audit-logs` with `Authorization: Bearer <ADMIN_TOKEN>`.
- Audit records currently use a fixed actor label of `admin` because the project does not maintain per-operator identities.

## One-Click ECS Deploy

You can now deploy the whole project to Aliyun ECS from your local machine with one command:

```bash
npm run deploy:ecs
```

### First-Time Setup

1. Copy `deploy/deploy.env.example` to `deploy/deploy.env` and fill in your ECS SSH info. `deploy/deploy.env` is ignored by Git, so your real deploy settings stay local.
2. For Alibaba Cloud Linux 3, run `deploy/bootstrap-ecs-alinux3.sh.example` on the server once to install Node.js, Nginx, systemd, and the deploy directories.
3. Put your backend env file on the server at `/srv/tax-con-question/shared/backend.env`, or change `BACKEND_ENV_PATH` in `deploy/deploy.env`.
4. If you prefer manual server setup, use `deploy/tax-con-question-backend.service.example` and `deploy/nginx.tax-con-question.conf.example` as templates.
5. Set `DEPLOY_RESTART_COMMAND` and `DEPLOY_POST_DEPLOY_COMMAND` in `deploy/deploy.env` if you want the deploy to restart `systemd` and reload Nginx automatically.
6. If you want a non-default management route for the `web` app, set `VITE_MANAGEMENT_PATH` in an ignored local file such as `apps/web/.env.production.local`.

### What The Deploy Script Does

- Builds `apps/backend`, `apps/web`, and `apps/h5` locally
- Uploads a release bundle to ECS over SSH
- Creates a new release under `/srv/tax-con-question/releases/<timestamp>`
- Installs production dependencies for `backend`
- Switches `/srv/tax-con-question/current` to the new release
- Runs your optional restart/reload commands
- Keeps only the latest configured releases
