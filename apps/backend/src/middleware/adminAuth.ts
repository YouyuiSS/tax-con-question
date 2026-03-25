import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import type { AdminAuthMode } from '../types.js';

const BEARER_PREFIX = 'Bearer ';
const ADMIN_ACTOR_HEADER = 'x-admin-actor';
const DEFAULT_ADMIN_ACTOR_LABEL = 'shared_admin_token';

function isAuthorizedToken(value: string): boolean {
  const expected = config.adminToken;

  if (!expected) {
    return false;
  }

  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function normalizeAdminActorLabel(value: string): string {
  const normalized = value
    .replaceAll(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);

  return normalized || DEFAULT_ADMIN_ACTOR_LABEL;
}

export function getAuthenticatedAdmin(req: Request): {
  actorLabel: string;
  authMode: AdminAuthMode;
} {
  return {
    actorLabel: normalizeAdminActorLabel(req.header(ADMIN_ACTOR_HEADER) ?? ''),
    authMode: 'shared_token',
  };
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminToken) {
    res.status(503).json({ message: 'Admin token is not configured.' });
    return;
  }

  const header = req.header('authorization')?.trim() ?? '';

  if (!header.startsWith(BEARER_PREFIX)) {
    res.status(401).json({ message: 'Admin token is required.' });
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  if (!token || !isAuthorizedToken(token)) {
    res.status(403).json({ message: 'Admin token is invalid.' });
    return;
  }

  next();
}
