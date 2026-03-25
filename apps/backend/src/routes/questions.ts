import { createHash, randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAdminAuth } from '../middleware/adminAuth.js';
import {
  getAdminAuditContext,
  toQuestionAdminFieldState,
  toQuestionAuditSnapshot,
} from '../lib/adminAudit.js';
import { createAdminAuditLog } from '../store/adminAuditLogs.js';
import { broadcastAdmin, broadcastBoard } from '../store/sse.js';
import { withTransaction } from '../store/db.js';
import {
  createQuestion,
  deleteQuestionById,
  getQuestionById,
  incrementQuestionCountById,
  listBoardQuestions,
  listCaredQuestionIdsBySessionHash,
  listPublicQuestions,
  listQuestions,
  updateQuestionById,
} from '../store/questions.js';
import type {
  AnswerStatus,
  CreateQuestionInput,
  DisplayStatus,
  QuestionEvent,
  Question,
  QuestionRoute,
  UpdateQuestionInput,
} from '../types.js';

const ALLOWED_ROUTES: QuestionRoute[] = ['public_discuss', 'meeting_only'];
const ALLOWED_DISPLAY_STATUSES: DisplayStatus[] = [
  'pending',
  'show_raw',
  'count_only',
  'redirect_official',
  'archived',
];
const ALLOWED_ANSWER_STATUSES: AnswerStatus[] = [
  'unanswered',
  'answered_live',
  'answered_post',
];
const PUBLIC_TIME_BUCKET_MS = 30 * 60 * 1000;
const CARE_SESSION_COOKIE_NAME = 'tcq_care_session';
const CARE_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type PublicQuestionView = Pick<Question, 'id' | 'text' | 'tag' | 'route' | 'count' | 'createdAt'> & {
  caredBySession: boolean;
};
type BoardQuestionView = Pick<
  Question,
  'id' | 'text' | 'tag' | 'route' | 'displayStatus' | 'answerStatus' | 'count' | 'createdAt'
>;

function isQuestionRoute(value: string): value is QuestionRoute {
  return ALLOWED_ROUTES.includes(value as QuestionRoute);
}

function isDisplayStatus(value: string): value is DisplayStatus {
  return ALLOWED_DISPLAY_STATUSES.includes(value as DisplayStatus);
}

function isAnswerStatus(value: string): value is AnswerStatus {
  return ALLOWED_ANSWER_STATUSES.includes(value as AnswerStatus);
}

function getQuestionIdParam(req: Request): string {
  const value = req.params.id;

  if (typeof value === 'string') {
    return value;
  }

  return value?.[0] ?? '';
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.header('cookie') ?? '';

  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((result, part) => {
      const separatorIndex = part.indexOf('=');

      if (separatorIndex <= 0) {
        return result;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();

      if (!key || !value) {
        return result;
      }

      result[key] = decodeURIComponent(value);
      return result;
    }, {});
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) {
    return true;
  }

  const forwardedProto = req.header('x-forwarded-proto');
  return typeof forwardedProto === 'string' && forwardedProto.split(',')[0]?.trim() === 'https';
}

function ensureCareSessionId(req: Request, res: Response): string {
  const cookies = parseCookies(req);
  const existing = cookies[CARE_SESSION_COOKIE_NAME]?.trim();
  const sessionId = existing && existing.length <= 120 ? existing : randomUUID();

  res.cookie(CARE_SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: CARE_SESSION_MAX_AGE_MS,
  });

  return sessionId;
}

function hashCareSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

function bucketTimestamp(value: string): string {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(
    Math.floor(timestamp / PUBLIC_TIME_BUCKET_MS) * PUBLIC_TIME_BUCKET_MS,
  ).toISOString();
}

function isPubliclyVisibleQuestion(question: Question): boolean {
  return question.displayStatus === 'show_raw'
    && question.route === 'public_discuss';
}

function isBoardVisibleQuestion(question: Question): boolean {
  return question.displayStatus !== 'archived';
}

function toPublicQuestionView(question: Question, caredBySession = false): PublicQuestionView {
  return {
    id: question.id,
    text: question.text,
    tag: question.tag,
    route: question.route,
    count: question.count ?? 1,
    createdAt: bucketTimestamp(question.createdAt),
    caredBySession,
  };
}

function toBoardQuestionView(question: Question): BoardQuestionView {
  return {
    id: question.id,
    text: question.text,
    tag: question.tag,
    route: question.route,
    displayStatus: question.displayStatus,
    answerStatus: question.answerStatus,
    count: question.count ?? 1,
    createdAt: bucketTimestamp(question.createdAt),
  };
}

function broadcastBoardQuestionCreated(question: Question): void {
  if (!isBoardVisibleQuestion(question)) {
    return;
  }

  broadcastBoard({
    type: 'question.created',
    payload: toBoardQuestionView(question),
  });
}

function broadcastBoardQuestionUpdated(question: Question): void {
  broadcastBoard({
    type: 'question.updated',
    payload: toBoardQuestionView(question),
  });
}

function parseCreateQuestionInput(body: unknown): CreateQuestionInput {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body.');
  }

  const payload = body as Record<string, unknown>;
  const rawText = typeof payload.text === 'string' ? payload.text.trim() : '';
  const rawTag = typeof payload.tag === 'string' ? payload.tag.trim() : '';
  const route = typeof payload.route === 'string' ? payload.route : '';

  if (!rawText) {
    throw new Error('Question text is required.');
  }

  if (rawText.length < 10 || rawText.length > 500) {
    throw new Error('Question text must be between 10 and 500 characters.');
  }

  if (!isQuestionRoute(route)) {
    throw new Error('Route must be public_discuss or meeting_only.');
  }

  return {
    text: rawText,
    tag: rawTag,
    route,
  };
}

function parseUpdateQuestionInput(body: unknown): UpdateQuestionInput {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body.');
  }

  const payload = body as Record<string, unknown>;
  const result: UpdateQuestionInput = {};

  if ('tag' in payload) {
    if (typeof payload.tag !== 'string') {
      throw new Error('Tag must be a string.');
    }

    const tag = payload.tag.trim();

    if (tag.length > 120) {
      throw new Error('Tag must be 120 characters or fewer.');
    }

    result.tag = tag;
  }

  if ('displayStatus' in payload) {
    if (typeof payload.displayStatus !== 'string' || !isDisplayStatus(payload.displayStatus)) {
      throw new Error('Display status is invalid.');
    }

    result.displayStatus = payload.displayStatus;
  }

  if ('answerStatus' in payload) {
    if (typeof payload.answerStatus !== 'string' || !isAnswerStatus(payload.answerStatus)) {
      throw new Error('Answer status is invalid.');
    }

    result.answerStatus = payload.answerStatus;
  }

  if (
    result.tag === undefined
    && result.displayStatus === undefined
    && result.answerStatus === undefined
  ) {
    throw new Error('At least one updatable field is required.');
  }

  return result;
}

export function createQuestionsRouter(): Router {
  const router = Router();

  router.get('/public', async (_req, res, next) => {
    try {
      const sessionId = ensureCareSessionId(_req, res);
      const sessionHash = hashCareSessionId(sessionId);
      const visibleQuestions = await listPublicQuestions();
      const caredQuestionIds = new Set(
        await listCaredQuestionIdsBySessionHash(
          sessionHash,
          visibleQuestions.map((question) => question.id),
        ),
      );
      const visibleItems = visibleQuestions.map((question) =>
        toPublicQuestionView(question, caredQuestionIds.has(question.id))
      );

      res.json({ items: visibleItems });
    } catch (error) {
      next(error);
    }
  });

  router.get('/board', requireAdminAuth, async (_req, res, next) => {
    try {
      const items = await listBoardQuestions();
      const visibleItems = items.map(toBoardQuestionView);

      res.json({ items: visibleItems });
    } catch (error) {
      next(error);
    }
  });

  router.get('/', requireAdminAuth, async (req, res, next) => {
    try {
      const route = typeof req.query.route === 'string' ? req.query.route : '';
      const displayStatus = typeof req.query.displayStatus === 'string'
        ? req.query.displayStatus
        : '';

      if (route && !isQuestionRoute(route)) {
        res.status(400).json({ message: 'Route must be public_discuss or meeting_only.' });
        return;
      }

      if (displayStatus && !isDisplayStatus(displayStatus)) {
        res.status(400).json({ message: 'Display status is invalid.' });
        return;
      }

      const routeFilter = route ? (route as QuestionRoute) : undefined;
      const displayStatusFilter = displayStatus ? (displayStatus as DisplayStatus) : undefined;
      const items = await listQuestions(routeFilter, displayStatusFilter);
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const input = parseCreateQuestionInput(req.body);

      const now = new Date().toISOString();
      const question = await createQuestion({
        id: randomUUID(),
        text: input.text,
        tag: input.tag ?? '',
        route: input.route,
        displayStatus: 'show_raw',
        answerStatus: 'unanswered',
        createdAt: now,
        updatedAt: now,
        count: 1,
      });

      const event: QuestionEvent = {
        type: 'question.created',
        payload: question,
      };

      broadcastAdmin(event);
      broadcastBoardQuestionCreated(question);
      res.status(201).json(question);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/care', async (req, res, next) => {
    try {
      const sessionId = ensureCareSessionId(req, res);
      const { question: updated, cared, changed } = await incrementQuestionCountById(
        getQuestionIdParam(req),
        hashCareSessionId(sessionId),
        new Date(Date.now() + CARE_SESSION_MAX_AGE_MS).toISOString(),
      );

      if (!updated) {
        res.status(404).json({ message: 'Question not found.' });
        return;
      }

      if (!isPubliclyVisibleQuestion(updated)) {
        res.status(404).json({ message: 'Question not found.' });
        return;
      }

      if (changed) {
        const event: QuestionEvent = {
          type: 'question.updated',
          payload: updated,
        };

        broadcastAdmin(event);
        broadcastBoardQuestionUpdated(updated);
      }

      res.json(toPublicQuestionView(updated, cared));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', requireAdminAuth, async (req, res, next) => {
    try {
      const input = parseUpdateQuestionInput(req.body);
      const questionId = getQuestionIdParam(req);
      const auditContext = getAdminAuditContext(req);
      const changedFields = ['tag', 'displayStatus', 'answerStatus'].filter((field) =>
        Object.hasOwn(input, field),
      );
      const updated = await withTransaction(async (execute) => {
        const previous = await getQuestionById(questionId, execute);

        if (!previous) {
          return null;
        }

        const nextQuestion = await updateQuestionById(questionId, input, execute);

        if (!nextQuestion) {
          return null;
        }

        await createAdminAuditLog(
          {
            ...auditContext,
            action: 'question.updated',
            resourceType: 'question',
            resourceId: nextQuestion.id,
            details: {
              changedFields,
              before: toQuestionAdminFieldState(previous),
              after: toQuestionAdminFieldState(nextQuestion),
            },
          },
          execute,
        );

        return nextQuestion;
      });

      if (!updated) {
        res.status(404).json({ message: 'Question not found.' });
        return;
      }

      const event: QuestionEvent = {
        type: 'question.updated',
        payload: updated,
      };

      broadcastAdmin(event);
      broadcastBoardQuestionUpdated(updated);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', requireAdminAuth, async (req, res, next) => {
    try {
      const questionId = getQuestionIdParam(req);
      const auditContext = getAdminAuditContext(req);
      const deleted = await withTransaction(async (execute) => {
        const removed = await deleteQuestionById(questionId, execute);

        if (!removed) {
          return null;
        }

        await createAdminAuditLog(
          {
            ...auditContext,
            action: 'question.deleted',
            resourceType: 'question',
            resourceId: removed.id,
            details: {
              snapshot: toQuestionAuditSnapshot(removed),
            },
          },
          execute,
        );

        return removed;
      });

      if (!deleted) {
        res.status(404).json({ message: 'Question not found.' });
        return;
      }

      const event: QuestionEvent<{ id: string }> = {
        type: 'question.deleted',
        payload: { id: deleted.id },
      };

      broadcastAdmin(event);
      broadcastBoard({
        type: 'question.deleted',
        payload: { id: deleted.id },
      });
      res.json({ ok: true, id: deleted.id });
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
