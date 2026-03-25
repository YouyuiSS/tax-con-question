import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminAuth } from '../middleware/adminAuth.js';
import {
  addAdminClient,
  addBoardClient,
  removeAdminClient,
  removeBoardClient,
} from '../store/sse.js';

const HEARTBEAT_INTERVAL_MS = 15000;

export function createEventsRouter(): Router {
  const router = Router();

  function setupEventStream(
    req: Request,
    res: Response,
    addClient: typeof addAdminClient,
    removeClient: typeof removeAdminClient,
  ): void {
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
  }

  router.get('/', requireAdminAuth, (req, res) => {
    setupEventStream(req, res, addAdminClient, removeAdminClient);
  });

  router.get('/board', requireAdminAuth, (req, res) => {
    setupEventStream(req, res, addBoardClient, removeBoardClient);
  });

  return router;
}
