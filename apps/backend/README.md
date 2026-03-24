# Backend

This app will host the minimal API and SSE layer for the project.

## Planned Responsibilities

- Accept question submissions from the H5 app
- Store the current big-screen question list
- Broadcast incremental updates through SSE
- Support simple delete/update operations for live events

## Endpoints

- `POST /api/questions`
- `GET /api/questions`
- `GET /api/events`
- `DELETE /api/questions/:id`

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
