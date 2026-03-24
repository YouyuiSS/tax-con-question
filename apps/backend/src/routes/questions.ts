import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { broadcast } from '../store/sse.js';
import {
  createQuestion,
  deleteQuestionById,
  listQuestions,
} from '../store/questions.js';
import type { CreateQuestionInput, QuestionEvent, QuestionRoute } from '../types.js';

const ALLOWED_ROUTES: QuestionRoute[] = ['public_discuss', 'meeting_only'];

function isQuestionRoute(value: string): value is QuestionRoute {
  return ALLOWED_ROUTES.includes(value as QuestionRoute);
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

export function createQuestionsRouter(): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const items = await listQuestions();
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const input = parseCreateQuestionInput(req.body);
      const question = await createQuestion({
        id: randomUUID(),
        text: input.text,
        tag: input.tag ?? '',
        route: input.route,
        createdAt: new Date().toISOString(),
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
