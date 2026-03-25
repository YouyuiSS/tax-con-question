import { Router, type NextFunction, type Request, type Response } from 'express';
import { getAppSettings, updateAppSettings } from '../store/settings.js';
import type { AppSettings } from '../types.js';

function parseSettingsInput(body: unknown): Partial<AppSettings> {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body.');
  }

  const payload = body as Record<string, unknown>;
  const updates: Partial<AppSettings> = {};

  if ('autoPublishEnabled' in payload) {
    if (typeof payload.autoPublishEnabled !== 'boolean') {
      throw new Error('autoPublishEnabled must be a boolean.');
    }

    updates.autoPublishEnabled = payload.autoPublishEnabled;
  }

  if (updates.autoPublishEnabled === undefined) {
    throw new Error('At least one setting is required.');
  }

  return updates;
}

export function createSettingsRouter(): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const settings = await getAppSettings();
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/', async (req, res, next) => {
    try {
      const updates = parseSettingsInput(req.body);
      const settings = await updateAppSettings(updates);
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    const statusCode = message.includes('required') || message.includes('must be')
      ? 400
      : 500;

    res.status(statusCode).json({ message });
  });

  return router;
}
