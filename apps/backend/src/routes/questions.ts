import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { broadcast } from '../store/sse.js';
import {
  countQuestionsBySubmitterKey,
  createQuestion,
  deleteQuestionById,
  incrementQuestionCountById,
  listQuestions,
  updateQuestionById,
} from '../store/questions.js';
import type {
  AnswerStatus,
  CreateQuestionInput,
  DisplayStatus,
  QuestionEvent,
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
const MAX_QUESTIONS_PER_SUBMITTER = 3;

function extractSubmitterKey(req: Request): string {
  const headerValue = req.header('x-submitter-key')?.trim() ?? '';

  if (headerValue.length > 0) {
    return headerValue.slice(0, 120);
  }

  const fallback = (req.ip ?? '').trim();
  return fallback.slice(0, 120);
}

function isQuestionRoute(value: string): value is QuestionRoute {
  return ALLOWED_ROUTES.includes(value as QuestionRoute);
}

function isDisplayStatus(value: string): value is DisplayStatus {
  return ALLOWED_DISPLAY_STATUSES.includes(value as DisplayStatus);
}

function isAnswerStatus(value: string): value is AnswerStatus {
  return ALLOWED_ANSWER_STATUSES.includes(value as AnswerStatus);
}

function parseCreateQuestionInput(body: unknown, submitterKey: string): CreateQuestionInput {
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
    submitterKey,
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

  router.get('/', async (req, res, next) => {
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
      const submitterKey = extractSubmitterKey(req);
      const input = parseCreateQuestionInput(req.body, submitterKey);
      const existingCount = await countQuestionsBySubmitterKey(input.submitterKey);

      if (existingCount >= MAX_QUESTIONS_PER_SUBMITTER) {
        res.status(429).json({ message: `每人最多可提交 ${MAX_QUESTIONS_PER_SUBMITTER} 个问题。` });
        return;
      }

      const now = new Date().toISOString();
      const question = await createQuestion({
        id: randomUUID(),
        text: input.text,
        tag: input.tag ?? '',
        route: input.route,
        submitterKey: input.submitterKey,
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

      broadcast(event);
      res.status(201).json(question);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/care', async (req, res, next) => {
    try {
      const updated = await incrementQuestionCountById(req.params.id);

      if (!updated) {
        res.status(404).json({ message: 'Question not found.' });
        return;
      }

      const event: QuestionEvent = {
        type: 'question.updated',
        payload: updated,
      };

      broadcast(event);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const input = parseUpdateQuestionInput(req.body);
      const updated = await updateQuestionById(req.params.id, input);

      if (!updated) {
        res.status(404).json({ message: 'Question not found.' });
        return;
      }

      const event: QuestionEvent = {
        type: 'question.updated',
        payload: updated,
      };

      broadcast(event);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const deleted = await deleteQuestionById(req.params.id);

      if (!deleted) {
        res.status(404).json({ message: 'Question not found.' });
        return;
      }

      const event: QuestionEvent<{ id: string }> = {
        type: 'question.deleted',
        payload: { id: deleted.id },
      };

      broadcast(event);
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
