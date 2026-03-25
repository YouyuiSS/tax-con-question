import { query } from './db.js';
import type {
  DisplayStatus,
  Question,
  QuestionRoute,
  UpdateQuestionInput,
} from '../types.js';

type QuestionRow = {
  id: string;
  text: string;
  tag: string;
  route: Question['route'];
  display_status: Question['displayStatus'];
  answer_status: Question['answerStatus'];
  submitter_key: string;
  count: number;
  created_at: string;
  updated_at: string;
};

function mapQuestionRow(row: QuestionRow): Question {
  return {
    id: row.id,
    text: row.text,
    tag: row.tag,
    route: row.route,
    displayStatus: row.display_status,
    answerStatus: row.answer_status,
    count: row.count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listQuestions(
  route?: QuestionRoute,
  displayStatus?: DisplayStatus,
): Promise<Question[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (route) {
    params.push(route);
    conditions.push(`route = $${params.length}`);
  }

  if (displayStatus) {
    params.push(displayStatus);
    conditions.push(`display_status = $${params.length}`);
  }

  const whereClause = conditions.length > 0
    ? `where ${conditions.join(' and ')}`
    : '';
  const result = await query<QuestionRow>(
    `
      select id, text, tag, route, display_status, answer_status, submitter_key, count, created_at, updated_at
      from {{questions}}
      ${whereClause}
      order by created_at desc
    `,
    params,
  );

  return result.rows.map(mapQuestionRow);
}

export async function createQuestion(question: Question): Promise<Question> {
  const result = await query<QuestionRow>(
    `
      insert into {{questions}} (
        id,
        text,
        tag,
        route,
        display_status,
        answer_status,
        submitter_key,
        count,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning id, text, tag, route, display_status, answer_status, submitter_key, count, created_at, updated_at
    `,
    [
      question.id,
      question.text,
      question.tag,
      question.route,
      question.displayStatus,
      question.answerStatus,
      question.submitterKey ?? '',
      question.count ?? 1,
      question.createdAt,
      question.updatedAt,
    ],
  );

  return mapQuestionRow(result.rows[0]);
}

export async function deleteQuestionById(id: string): Promise<Question | null> {
  const result = await query<QuestionRow>(
    `
      delete from {{questions}}
      where id = $1
      returning id, text, tag, route, display_status, answer_status, submitter_key, count, created_at, updated_at
    `,
    [id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapQuestionRow(result.rows[0]);
}

export async function incrementQuestionCountById(id: string): Promise<Question | null> {
  const result = await query<QuestionRow>(
    `
      update {{questions}}
      set count = count + 1,
          updated_at = now()
      where id = $1
      returning id, text, tag, route, display_status, answer_status, submitter_key, count, created_at, updated_at
    `,
    [id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapQuestionRow(result.rows[0]);
}

export async function updateQuestionById(
  id: string,
  updates: UpdateQuestionInput,
): Promise<Question | null> {
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (updates.tag !== undefined) {
    params.push(updates.tag);
    assignments.push(`tag = $${params.length}`);
  }

  if (updates.displayStatus !== undefined) {
    params.push(updates.displayStatus);
    assignments.push(`display_status = $${params.length}`);
  }

  if (updates.answerStatus !== undefined) {
    params.push(updates.answerStatus);
    assignments.push(`answer_status = $${params.length}`);
  }

  if (assignments.length === 0) {
    return null;
  }

  params.push(id);

  const result = await query<QuestionRow>(
    `
      update {{questions}}
      set ${assignments.join(', ')},
          updated_at = now()
      where id = $${params.length}
      returning id, text, tag, route, display_status, answer_status, submitter_key, count, created_at, updated_at
    `,
    params,
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapQuestionRow(result.rows[0]);
}

export async function countQuestionsBySubmitterKey(submitterKey: string): Promise<number> {
  const result = await query<{ total: string }>(
    `
      select count(*)::text as total
      from {{questions}}
      where submitter_key = $1
    `,
    [submitterKey],
  );

  return Number(result.rows[0]?.total ?? '0');
}
