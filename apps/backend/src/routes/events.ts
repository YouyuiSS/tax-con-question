import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { addClient, removeClient } from '../store/sse.js';

const HEARTBEAT_INTERVAL_MS = 15000;

export function createEventsRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const clientId = randomUUID();

    addClient({
      id: clientId,
      send: (event) => {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
    });

    res.write(
      `event: connected\ndata: ${JSON.stringify({ ok: true, clientId })}\n\n`,
    );

    const heartbeat = setInterval(() => {
      res.write(`event: ping\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    }, HEARTBEAT_INTERVAL_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      removeClient(clientId);
      res.end();
    });
  });

  return router;
}
