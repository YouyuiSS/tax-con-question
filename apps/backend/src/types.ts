export type QuestionRoute = 'public_discuss' | 'meeting_only';

export type Question = {
  id: string;
  text: string;
  tag: string;
  route: QuestionRoute;
  createdAt: string;
  count?: number;
};

export type QuestionEventType =
  | 'question.created'
  | 'question.updated'
  | 'question.deleted';

export type QuestionEvent<T = Question | { id: string }> = {
  type: QuestionEventType;
  payload: T;
};

export type CreateQuestionInput = {
  text: string;
  tag?: string;
  route: QuestionRoute;
};
