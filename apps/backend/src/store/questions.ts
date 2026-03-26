import { query, type SqlExecutor } from './db.js';
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
  count: number;
  created_at: string;
  updated_at: string;
};

type QuestionCareSessionRow = {
  question_id: string;
};

const BOARD_VISIBLE_STATUSES: Question['displayStatus'][] = [
  'pending',
  'show_raw',
  'count_only',
  'redirect_official',
];

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
  execute: SqlExecutor = query,
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
  const result = await execute<QuestionRow>(
    `
      select id, text, tag, route, display_status, answer_status, count, created_at, updated_at
      from {{questions}}
      ${whereClause}
      order by created_at desc
    `,
    params,
  );

  return result.rows.map(mapQuestionRow);
}

export async function listPublicQuestions(
  execute: SqlExecutor = query,
): Promise<Question[]> {
  const result = await execute<QuestionRow>(
    `
      select id, text, tag, route, display_status, answer_status, count, created_at, updated_at
      from {{questions}}
      where display_status = 'show_raw'
        and route = 'public_discuss'
      order by created_at desc
    `,
  );

  return result.rows.map(mapQuestionRow);
}

export async function listBoardQuestions(
  execute: SqlExecutor = query,
): Promise<Question[]> {
  const result = await execute<QuestionRow>(
    `
      select id, text, tag, route, display_status, answer_status, count, created_at, updated_at
      from {{questions}}
      where display_status = any($1::varchar[])
      order by created_at desc
    `,
    [BOARD_VISIBLE_STATUSES],
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
        count,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning id, text, tag, route, display_status, answer_status, count, created_at, updated_at
    `,
    [
      question.id,
      question.text,
      question.tag,
      question.route,
      question.displayStatus,
      question.answerStatus,
      question.count ?? 1,
      question.createdAt,
      question.updatedAt,
    ],
  );

  return mapQuestionRow(result.rows[0]);
}

export async function getQuestionById(
  id: string,
  execute: SqlExecutor = query,
): Promise<Question | null> {
  const result = await execute<QuestionRow>(
    `
      select id, text, tag, route, display_status, answer_status, count, created_at, updated_at
      from {{questions}}
      where id = $1
    `,
    [id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapQuestionRow(result.rows[0]);
}

export async function deleteQuestionById(
  id: string,
  execute: SqlExecutor = query,
): Promise<Question | null> {
  const result = await execute<QuestionRow>(
    `
      delete from {{questions}}
      where id = $1
      returning id, text, tag, route, display_status, answer_status, count, created_at, updated_at
    `,
    [id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapQuestionRow(result.rows[0]);
}

export async function incrementQuestionCountById(
  id: string,
  sessionHash: string,
  expiresAt: string,
  execute: SqlExecutor = query,
): Promise<{ question: Question | null; cared: boolean; changed: boolean }> {
  const result = await execute<QuestionRow & { cared: boolean; changed: boolean }>(
    `
      with target_question as (
        select id
        from {{questions}}
        where id = $1
        for update
      ),
      existing_active_session as (
        select question_id
        from {{question_care_sessions}}
        where question_id = $1
          and session_hash = $2
          and expires_at > now()
      ),
      inserted_session as (
        insert into {{question_care_sessions}} (question_id, session_hash, expires_at)
        select id, $2, $3
        from target_question
        where not exists (select 1 from existing_active_session)
        on conflict (question_id, session_hash) do update
        set expires_at = excluded.expires_at
        where {{question_care_sessions}}.expires_at <= now()
        returning question_id
      ),
      updated_question as (
        update {{questions}}
        set count = case
          when exists (select 1 from inserted_session) then count + 1
          else count
        end,
        updated_at = case
          when exists (select 1 from inserted_session)
            then now()
          else updated_at
        end
        where id = $1
          and exists (select 1 from target_question)
        returning id, text, tag, route, display_status, answer_status, count, created_at, updated_at
      )
      select
        id,
        text,
        tag,
        route,
        display_status,
        answer_status,
        count,
        created_at,
        updated_at,
        (
          exists(select 1 from existing_active_session)
          or exists(select 1 from inserted_session)
        ) as cared,
        exists(select 1 from inserted_session) as changed
      from updated_question
    `,
    [id, sessionHash, expiresAt],
  );

  if (result.rowCount === 0) {
    return {
      question: null,
      cared: false,
      changed: false,
    };
  }

  return {
    question: mapQuestionRow(result.rows[0]),
    cared: result.rows[0].cared,
    changed: result.rows[0].changed,
  };
}

export async function listCaredQuestionIdsBySessionHash(
  sessionHash: string,
  questionIds: string[],
  execute: SqlExecutor = query,
): Promise<string[]> {
  if (questionIds.length === 0) {
    return [];
  }

  const result = await execute<QuestionCareSessionRow>(
    `
      select question_id
      from {{question_care_sessions}}
      where session_hash = $1
        and expires_at > now()
        and question_id = any($2::uuid[])
    `,
    [sessionHash, questionIds],
  );

  return result.rows.map((row) => row.question_id);
}

export async function updateQuestionById(
  id: string,
  updates: UpdateQuestionInput,
  execute: SqlExecutor = query,
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

  const result = await execute<QuestionRow>(
    `
      update {{questions}}
      set ${assignments.join(', ')},
          updated_at = now()
      where id = $${params.length}
      returning id, text, tag, route, display_status, answer_status, count, created_at, updated_at
    `,
    params,
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapQuestionRow(result.rows[0]);
}
