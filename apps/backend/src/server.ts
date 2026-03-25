import express from 'express';
import { config } from './config.js';
import { createAdminRouter } from './routes/admin.js';
import { createEventsRouter } from './routes/events.js';
import { createQuestionsRouter } from './routes/questions.js';
import { createSettingsRouter } from './routes/settings.js';
import { initializeDatabase } from './store/db.js';

function getRequestProtocol(req: express.Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'];

  if (typeof forwardedProto === 'string' && forwardedProto.trim()) {
    return forwardedProto.split(',')[0]?.trim() || req.protocol;
  }

  if (Array.isArray(forwardedProto) && forwardedProto[0]) {
    return forwardedProto[0].split(',')[0]?.trim() || req.protocol;
  }

  return req.protocol;
}

function isAllowedOrigin(req: express.Request, origin: string): boolean {
  const host = req.get('host');

  if (host) {
    const requestOrigin = `${getRequestProtocol(req)}://${host}`;

    if (origin === requestOrigin) {
      return true;
    }
  }

  return config.corsAllowedOrigins.includes(origin);
}

async function startServer(): Promise<void> {
  await initializeDatabase();

  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Actor');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.header('Vary', 'Origin');

    const origin = req.headers.origin;

    if (!origin) {
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }

      next();
      return;
    }

    if (!isAllowedOrigin(req, origin)) {
      res.status(403).json({ message: 'Origin not allowed.' });
      return;
    }

    res.header('Access-Control-Allow-Origin', origin);

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'backend',
    });
  });

  app.use('/api/questions', createQuestionsRouter());
  app.use('/api/settings', createSettingsRouter());
  app.use('/api/events', createEventsRouter());
  app.use('/api/admin', createAdminRouter());

  app.listen(config.port, () => {
    console.log(`backend listening on http://localhost:${config.port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});
