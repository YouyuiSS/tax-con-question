export type QuestionRoute = 'public_discuss' | 'meeting_only';

export type DisplayStatus =
  | 'pending'
  | 'show_raw'
  | 'count_only'
  | 'redirect_official'
  | 'archived';

export type AnswerStatus =
  | 'unanswered'
  | 'answered_live'
  | 'answered_post';

export type Question = {
  id: string;
  text: string;
  tag: string;
  route: QuestionRoute;
  displayStatus: DisplayStatus;
  answerStatus: AnswerStatus;
  submitterKey?: string;
  createdAt: string;
  updatedAt: string;
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
  submitterKey: string;
};

export type UpdateQuestionInput = {
  tag?: string;
  displayStatus?: DisplayStatus;
  answerStatus?: AnswerStatus;
};

export type AppSettings = {
  autoPublishEnabled: boolean;
};
