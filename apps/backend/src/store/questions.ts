import { query } from './db.js';
import type { Question } from '../types.js';

type QuestionRow = {
  id: string;
  text: string;
  tag: string;
  route: Question['route'];
  count: number;
  created_at: string;
};

function mapQuestionRow(row: QuestionRow): Question {
  return {
    id: row.id,
    text: row.text,
    tag: row.tag,
    route: row.route,
    count: row.count,
    createdAt: row.created_at,
  };
}

export async function listQuestions(): Promise<Question[]> {
  const result = await query<QuestionRow>(
    `
      select id, text, tag, route, count, created_at
      from {{questions}}
      order by created_at desc
    `,
  );

  return result.rows.map(mapQuestionRow);
}

export async function createQuestion(question: Question): Promise<Question> {
  const result = await query<QuestionRow>(
    `
      insert into {{questions}} (id, text, tag, route, count, created_at)
      values ($1, $2, $3, $4, $5, $6)
      returning id, text, tag, route, count, created_at
    `,
    [
      question.id,
      question.text,
      question.tag,
      question.route,
      question.count ?? 1,
      question.createdAt,
    ],
  );

  return mapQuestionRow(result.rows[0]);
}

export async function deleteQuestionById(id: string): Promise<Question | null> {
  const result = await query<QuestionRow>(
    `
      delete from {{questions}}
      where id = $1
      returning id, text, tag, route, count, created_at
    `,
    [id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapQuestionRow(result.rows[0]);
}
