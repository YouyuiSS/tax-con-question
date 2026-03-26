# Web

This app hosts the organizer console and the meeting board experience.

## Responsibilities

- Organizer question management
- Meeting board display
- Real-time updates from `apps/backend`

## Run Locally

From the repo root:

1. Install dependencies with `npm install`
2. Start the backend with `npm run dev:backend`
3. Start this app with `npm run dev:web`

Default local port: `3100`

## Optional Route Overrides

For production builds, you can override the app paths with an ignored local file such as `apps/web/.env.production.local`:

- `VITE_BOARD_PATH`
- `VITE_MANAGEMENT_PATH`
