import type { Request } from 'express';
import { getAuthenticatedAdmin } from '../middleware/adminAuth.js';
import type { Question } from '../types.js';

function sanitizeHeaderValue(value: string | undefined, maxLength: number): string {
  return (value ?? '')
    .replaceAll(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

export function getAdminAuditContext(req: Request) {
  const admin = getAuthenticatedAdmin(req);

  return {
    actorLabel: admin.actorLabel,
    authMode: admin.authMode,
    requestMethod: req.method,
    requestPath: (req.originalUrl || req.path || '').slice(0, 240),
    origin: sanitizeHeaderValue(req.header('origin') ?? '', 240),
    userAgent: sanitizeHeaderValue(req.header('user-agent') ?? '', 255),
  };
}

export function toQuestionAuditSnapshot(question: Question): Record<string, unknown> {
  return {
    route: question.route,
    tag: question.tag,
    displayStatus: question.displayStatus,
    answerStatus: question.answerStatus,
    count: question.count ?? 1,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
}

export function toQuestionAdminFieldState(question: Question): Record<string, unknown> {
  return {
    tag: question.tag,
    displayStatus: question.displayStatus,
    answerStatus: question.answerStatus,
  };
}
