import express from 'express';
import { config } from './config.js';
import { createEventsRouter } from './routes/events.js';
import { createQuestionsRouter } from './routes/questions.js';
import { initializeDatabase } from './store/db.js';

async function startServer(): Promise<void> {
  await initializeDatabase();

  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');

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
      schema: config.database.schema,
      tablePrefix: config.database.tablePrefix,
    });
  });

  app.use('/api/questions', createQuestionsRouter());
  app.use('/api/events', createEventsRouter());

  app.listen(config.port, () => {
    console.log(
      `backend listening on http://localhost:${config.port} using schema ${config.database.schema}`,
    );
  });
}

startServer().catch((error) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});
