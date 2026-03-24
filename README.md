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

## One-Click ECS Deploy

You can now deploy the whole project to Aliyun ECS from your local machine with one command:

```bash
npm run deploy:ecs
```

### First-Time Setup

1. Copy `deploy/deploy.env.example` to `deploy/deploy.env` and fill in your ECS SSH info.
2. Put your backend env file on the server at `/srv/tax-con-question/shared/backend.env`, or change `BACKEND_ENV_PATH` in `deploy/deploy.env`.
3. Create a backend service on ECS using `deploy/tax-con-question-backend.service.example`.
4. Configure Nginx using `deploy/nginx.tax-con-question.conf.example`.
5. Set `DEPLOY_RESTART_COMMAND` and `DEPLOY_POST_DEPLOY_COMMAND` in `deploy/deploy.env` if you want the deploy to restart `systemd` and reload Nginx automatically.

### What The Deploy Script Does

- Builds `apps/backend`, `apps/web`, and `apps/h5` locally
- Uploads a release bundle to ECS over SSH
- Creates a new release under `/srv/tax-con-question/releases/<timestamp>`
- Installs production dependencies for `backend`
- Switches `/srv/tax-con-question/current` to the new release
- Runs your optional restart/reload commands
- Keeps only the latest configured releases
