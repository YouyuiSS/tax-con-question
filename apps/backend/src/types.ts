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
};

export type UpdateQuestionInput = {
  tag?: string;
  displayStatus?: DisplayStatus;
  answerStatus?: AnswerStatus;
};

export type AppSettings = {
  autoPublishEnabled: boolean;
};

export type AdminAuthMode = 'shared_token';

export type AdminAuditAction =
  | 'question.updated'
  | 'question.deleted'
  | 'settings.updated';

export type AdminAuditLog = {
  id: string;
  action: AdminAuditAction;
  resourceType: string;
  resourceId: string;
  actorLabel: string;
  authMode: AdminAuthMode;
  requestMethod: string;
  requestPath: string;
  origin: string;
  userAgent: string;
  details: Record<string, unknown>;
  createdAt: string;
};
