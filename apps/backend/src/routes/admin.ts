import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAdminAuth } from '../middleware/adminAuth.js';
import { listAdminAuditLogs } from '../store/adminAuditLogs.js';

const DEFAULT_AUDIT_LOG_LIMIT = 50;

function parseAuditLogLimit(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) {
    return DEFAULT_AUDIT_LOG_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Audit log limit must be a positive integer.');
  }

  return parsed;
}

export function createAdminRouter(): Router {
  const router = Router();

  router.get('/audit-logs', requireAdminAuth, async (req, res, next) => {
    try {
      const limit = parseAuditLogLimit(req.query.limit);
      const items = await listAdminAuditLogs(limit);
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    const statusCode = message.includes('positive integer') ? 400 : 500;
    res.status(statusCode).json({ message });
  });

  return router;
}
