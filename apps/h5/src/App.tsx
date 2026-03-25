import { useEffect, useMemo, useState } from 'react';

type QuestionRoute = 'meeting_only' | 'public_discuss';
type AppScreen = 'ask' | 'discussion';
type DiscussionSort = 'date' | 'count';
type DisplayStatus = 'pending' | 'show_raw' | 'count_only' | 'redirect_official' | 'archived';

type SubmissionState = 'form' | 'confirm' | 'success';

type PublicQuestion = {
  id: string;
  text: string;
  tag: string;
  route: QuestionRoute;
  count: number;
  createdAt: string;
};

type AppSettings = {
  autoPublishEnabled: boolean;
};

type RouteMeta = {
  title: string;
  description: string;
  confirmBody: string;
  confirmNote?: string;
  successBody: string;
  successNote?: string;
};

const BASE_ROUTE_META: Record<QuestionRoute, RouteMeta> = {
  meeting_only: {
    title: '会上公开',
    description: '会前不公开，会上统一回应。',
    confirmBody: '你的问题会在会上统一回应。',
    confirmNote: '会前不公开。',
    successBody: '你的问题已收到，会在会上统一回应。',
    successNote: '会前不公开。',
  },
  public_discuss: {
    title: '公开讨论',
    description: '提交后进入公开池，其他同事可以看到。',
    confirmBody: '你的问题提交后会进入公开池，其他同事可以看到。',
    successBody: '你的问题已收到，已进入公开池。',
  },
};

const ROUTE_ORDER: QuestionRoute[] = ['public_discuss', 'meeting_only'];
const DEFAULT_SETTINGS: AppSettings = {
  autoPublishEnabled: false,
};

const MIN_LENGTH = 10;
const MAX_LENGTH = 500;
const REQUEST_TIMEOUT_MS = 10000;
const ALL_TOPICS = '全部';
const CARED_QUESTION_IDS_KEY = 'tcq_cared_question_ids';
const INPUT_HINT = '把你真正关心、想被回应的问题写下来。尽量聚焦问题本身，避免涉及敏感或违规内容。';
const RISK_NOTES = [
  '默认不收集姓名、工号等实名字段。',
  '请避免填写具体人名、项目名、时间点等可识别信息。',
  '当前版本适合非实名收集，不建议提交高风险敏感内容。',
] as const;

function getValidationMessage(text: string): string {
  const trimmedLength = text.trim().length;

  if (trimmedLength === 0) {
    return '请输入你希望被回应的问题。';
  }

  if (trimmedLength < MIN_LENGTH) {
    return `至少写 ${MIN_LENGTH} 个字。`;
  }

  if (text.length > MAX_LENGTH) {
    return `问题请控制在 ${MAX_LENGTH} 字以内。`;
  }

  return '';
}

function formatRelativeTime(value: string, now: number): string {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return '';
  }

  const diff = Math.max(0, now - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return '刚刚';
  }

  if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`;
  }

  if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`;
  }

  return `${Math.floor(diff / day)}天前`;
}

function getRouteMeta(route: QuestionRoute, autoPublishEnabled: boolean): RouteMeta {
  const base = BASE_ROUTE_META[route];

  if (!autoPublishEnabled) {
    return base;
  }

  return {
    title: base.title,
    description: '当前已开启自动直出，提交后会直接进入公开池和大屏。',
    confirmBody: '你的问题提交后会直接进入公开池和大屏。',
    confirmNote: '本次不经过人工处理。',
    successBody: '你的问题已收到，已直接进入公开池和大屏。',
    successNote: '本次为自动直出。',
  };
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('ask');
  const [text, setText] = useState('');
  const [route, setRoute] = useState<QuestionRoute>('meeting_only');
  const [submissionState, setSubmissionState] = useState<SubmissionState>('form');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [submittedRoute, setSubmittedRoute] = useState<QuestionRoute>('meeting_only');
  const [submittedAutoPublish, setSubmittedAutoPublish] = useState(false);
  const [publicQuestions, setPublicQuestions] = useState<PublicQuestion[]>([]);
  const [isPublicLoading, setIsPublicLoading] = useState(false);
  const [publicErrorMessage, setPublicErrorMessage] = useState('');
  const [careErrorMessage, setCareErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTopic, setSelectedTopic] = useState(ALL_TOPICS);
  const [discussionSort, setDiscussionSort] = useState<DiscussionSort>('count');
  const [discussionReloadKey, setDiscussionReloadKey] = useState(0);
  const [caredQuestionIds, setCaredQuestionIds] = useState<string[]>([]);
  const [caringQuestionId, setCaringQuestionId] = useState('');
  const [recentlyCaredQuestionId, setRecentlyCaredQuestionId] = useState('');
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const activeRouteMeta = useMemo(
    () => getRouteMeta(route, appSettings.autoPublishEnabled),
    [appSettings.autoPublishEnabled, route],
  );
  const submittedRouteMeta = useMemo(
    () => getRouteMeta(submittedRoute, submittedAutoPublish),
    [submittedAutoPublish, submittedRoute],
  );

  const validationMessage = useMemo(() => getValidationMessage(text), [text]);
  const canContinue = validationMessage === '';
  const helperMessage = text.length > 0 ? validationMessage : '';
  const discussionTopics = useMemo(() => {
    const tags = Array.from(
      new Set(
        publicQuestions
          .map((question) => question.tag.trim())
          .filter(Boolean),
      ),
    );

    return tags.length > 0 ? [ALL_TOPICS, ...tags] : [];
  }, [publicQuestions]);
  const filteredQuestions = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();

    return publicQuestions.filter((question) => {
      const topic = question.tag.trim();
      const matchesTopic = selectedTopic === ALL_TOPICS || topic === selectedTopic;
      const matchesQuery = !normalizedQuery
        || question.text.toLowerCase().includes(normalizedQuery)
        || topic.toLowerCase().includes(normalizedQuery);

      return matchesTopic && matchesQuery;
    });
  }, [publicQuestions, searchTerm, selectedTopic]);
  const visibleQuestions = useMemo(() => {
    return [...filteredQuestions].sort((left, right) => {
      if (discussionSort === 'count') {
        const countDelta = (right.count ?? 1) - (left.count ?? 1);
        if (countDelta !== 0) {
          return countDelta;
        }
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [discussionSort, filteredQuestions]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CARED_QUESTION_IDS_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) {
        setCaredQuestionIds(parsed.filter((item): item is string => typeof item === 'string'));
      }
    } catch (_error) {
      window.localStorage.removeItem(CARED_QUESTION_IDS_KEY);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings(): Promise<void> {
      try {
        const response = await fetch('/api/settings', {
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as Partial<AppSettings>;

        if (typeof data.autoPublishEnabled === 'boolean') {
          setAppSettings({ autoPublishEnabled: data.autoPublishEnabled });
        }
      } catch (_error) {
        // Keep default behavior when settings cannot be loaded.
      }
    }

    void loadSettings();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (discussionTopics.length === 0 && selectedTopic !== ALL_TOPICS) {
      setSelectedTopic(ALL_TOPICS);
    }
  }, [discussionTopics, selectedTopic]);

  useEffect(() => {
    if (!recentlyCaredQuestionId) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRecentlyCaredQuestionId('');
    }, 420);

    return () => {
      window.clearTimeout(timer);
    };
  }, [recentlyCaredQuestionId]);

  useEffect(() => {
    if (screen !== 'discussion') {
      return;
    }

    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [screen]);

  useEffect(() => {
    if (screen !== 'discussion') {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    async function loadPublicQuestions(): Promise<void> {
      setIsPublicLoading(true);
      setPublicErrorMessage('');
      setCareErrorMessage('');

      try {
        const response = await fetch('/api/questions/public', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('公开问题加载失败，请稍后再试。');
        }

        const data = (await response.json()) as { items?: PublicQuestion[] };
        setPublicQuestions(Array.isArray(data.items) ? data.items : []);
      } catch (error) {
        const message = error instanceof Error && error.name === 'AbortError'
          ? '加载超时，请稍后重试。'
          : error instanceof Error
            ? error.message
            : '公开问题加载失败，请稍后再试。';

        setPublicErrorMessage(message);
      } finally {
        window.clearTimeout(timeoutId);
        setIsPublicLoading(false);
      }
    }

    void loadPublicQuestions();

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [appSettings.autoPublishEnabled, screen, discussionReloadKey]);

  async function submitQuestion(): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage('');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch('/api/questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          text,
          route,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        message?: string;
        displayStatus?: DisplayStatus;
      } | null;

      if (!response.ok) {
        throw new Error(data?.message ?? '提交失败，请稍后再试。');
      }

      setSubmittedRoute(route);
      setSubmittedAutoPublish(data?.displayStatus === 'show_raw');
      setSubmissionState('success');
      setText('');
    } catch (error) {
      const message = error instanceof Error && error.name === 'AbortError'
        ? '提交超时，请稍后重试。'
        : error instanceof Error
          ? error.message
          : '提交失败，请稍后再试。';

      setErrorMessage(
        message,
      );
    } finally {
      window.clearTimeout(timeoutId);
      setIsSubmitting(false);
    }
  }

  function resetForm(): void {
    setSubmissionState('form');
    setErrorMessage('');
  }

  function openDiscussion(options?: { fromSuccess?: boolean }): void {
    setSearchTerm('');
    setSelectedTopic(ALL_TOPICS);
    setDiscussionSort('count');
    setPublicErrorMessage('');
    setCareErrorMessage('');

    if (options?.fromSuccess) {
      setSubmissionState('form');
      setErrorMessage('');
    }

    setScreen('discussion');
  }

  function closeDiscussion(): void {
    setScreen('ask');
  }

  async function careQuestion(id: string): Promise<void> {
    if (caredQuestionIds.includes(id) || caringQuestionId) {
      return;
    }

    setCaringQuestionId(id);
    setCareErrorMessage('');

    try {
      const response = await fetch(`/api/questions/${id}/care`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? '操作失败，请稍后再试。');
      }

      const updated = (await response.json()) as PublicQuestion;

      setPublicQuestions((previous) =>
        previous.map((question) => (question.id === updated.id ? updated : question)),
      );
      setRecentlyCaredQuestionId(updated.id);
      setCaredQuestionIds((previous) => {
        const next = previous.includes(id) ? previous : [...previous, id];
        window.localStorage.setItem(CARED_QUESTION_IDS_KEY, JSON.stringify(next));
        return next;
      });
    } catch (error) {
      setCareErrorMessage(
        error instanceof Error ? error.message : '操作失败，请稍后再试。',
      );
    } finally {
      setCaringQuestionId('');
    }
  }

  return (
    <div className="page-shell">
      <main className="phone-frame">
        {screen === 'discussion' ? (
          <>
            <header className="discussion-header">
              <button
                className="back-button compact-nav-button"
                onClick={closeDiscussion}
                aria-label="返回"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h1 className="discussion-title">公开问题</h1>
            </header>

            <section className="discussion-search-section">
              <input
                className="search-input"
                placeholder="搜索公开问题"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </section>

            <section className="sort-strip" aria-label="排序方式">
              <button
                type="button"
                className={discussionSort === 'count' ? 'sort-chip selected' : 'sort-chip'}
                onClick={() => setDiscussionSort('count')}
              >
                最热
              </button>
              <button
                type="button"
                className={discussionSort === 'date' ? 'sort-chip selected' : 'sort-chip'}
                onClick={() => setDiscussionSort('date')}
              >
                最新
              </button>
            </section>

            {discussionTopics.length > 0 ? (
              <section className="topic-strip" aria-label="议题筛选">
                {discussionTopics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    className={topic === selectedTopic ? 'topic-chip selected' : 'topic-chip'}
                    onClick={() => setSelectedTopic(topic)}
                  >
                    {topic}
                  </button>
                ))}
              </section>
            ) : null}

            {publicErrorMessage ? (
              <section className="empty-state">
                <h2>暂时无法加载公开问题</h2>
                <p>{publicErrorMessage}</p>
                <div className="page-button-stack">
                  <button
                    className="primary-button"
                    onClick={() => setDiscussionReloadKey((value) => value + 1)}
                  >
                    重新加载
                  </button>
                  <button className="secondary-button" onClick={closeDiscussion}>
                    去提问
                  </button>
                </div>
              </section>
            ) : isPublicLoading ? (
              <section className="empty-state">
                <h2>加载中</h2>
                <p>正在整理公开问题。</p>
              </section>
            ) : publicQuestions.length === 0 ? (
              <section className="empty-state">
                <h2>暂时还没有公开问题</h2>
                <p>你仍然可以先提交自己的问题。</p>
                <button className="primary-button" onClick={closeDiscussion}>
                  去提问
                </button>
              </section>
            ) : filteredQuestions.length === 0 ? (
              <section className="empty-state">
                <h2>没有找到相关问题</h2>
                <p>换个关键词试试，或者返回继续提问。</p>
                <div className="page-button-stack">
                  <button className="secondary-button" onClick={() => setSearchTerm('')}>
                    清空搜索
                  </button>
                  <button className="primary-button" onClick={closeDiscussion}>
                    去提问
                  </button>
                </div>
              </section>
            ) : (
              <>
                {careErrorMessage ? <div className="submit-error">{careErrorMessage}</div> : null}
                <section className="discussion-list">
                  {visibleQuestions.map((question) => {
                    const isCared = caredQuestionIds.includes(question.id);
                    const isCaring = caringQuestionId === question.id;
                    const careButtonClass = [
                      'care-button',
                      isCared ? 'cared' : '',
                      isCaring ? 'pending' : '',
                      recentlyCaredQuestionId === question.id ? 'just-cared' : '',
                    ].filter(Boolean).join(' ');

                    return (
                      <article key={question.id} className="discussion-card">
                        <h2>{question.text}</h2>
                        <div className="discussion-card-foot">
                          <span className="discussion-age">
                            {formatRelativeTime(question.createdAt, nowTimestamp)}
                          </span>
                          <button
                            type="button"
                            className={careButtonClass}
                            disabled={isCared || isCaring}
                            onClick={() => careQuestion(question.id)}
                            aria-label={isCared ? '已关心' : '我也关心'}
                          >
                            <svg
                              className="care-icon"
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.9"
                            >
                              <path d="M12 20.8 4.9 13.9a4.8 4.8 0 0 1 0-6.8 4.74 4.74 0 0 1 6.72 0L12 7.48l.38-.38a4.74 4.74 0 0 1 6.72 0 4.8 4.8 0 0 1 0 6.8Z" />
                            </svg>
                            <span>{question.count ?? 1}</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </section>

                <footer className="action-footer discussion-footer">
                  <button className="primary-button" onClick={closeDiscussion}>
                    去提问
                  </button>
                </footer>
              </>
            )}
          </>
        ) : submissionState === 'success' ? (
          <section className="success-panel">
            <div className="success-visual" aria-hidden="true">
              <div className="success-visual-ring">
                <div className="success-visual-core" />
              </div>
            </div>
            <div className="success-copy">
              <div className="success-badge">已收到</div>
              <h1>提交成功</h1>
              <p>{submittedRouteMeta.successBody}</p>
            </div>
            <div className="summary-card">
              <span className="summary-label">处理方式</span>
              <strong>{submittedRouteMeta.title}</strong>
              {submittedRouteMeta.successNote ? (
                <p className="summary-note">{submittedRouteMeta.successNote}</p>
              ) : null}
            </div>
            <div className="page-button-stack success-actions">
              <button className="primary-button" onClick={resetForm}>
                继续提问
              </button>
              {submittedRoute === 'public_discuss' || submittedAutoPublish ? (
                <button
                  className="secondary-button"
                  onClick={() => openDiscussion({ fromSuccess: true })}
                >
                  查看公开问题
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <>
            <header className="page-header">
              <h1>税务心声</h1>
              <p className="subtitle">写下你希望在大会上被回应的问题，请避免填写可识别个人信息。</p>
            </header>

            <section className="risk-note-card" aria-label="提交提醒">
              {RISK_NOTES.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </section>

            <section className="editor-section">
              <label className="section-title" htmlFor="question-input">
                你的问题
              </label>
              <textarea
                id="question-input"
                className="question-input"
                placeholder="例如：今年晋升标准会调整吗？"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <div className="editor-meta">
                {helperMessage ? (
                  <span className="hint error">{helperMessage}</span>
                ) : <span className="hint">{INPUT_HINT}</span>}
                <span className="count">{text.length} / {MAX_LENGTH}</span>
              </div>
            </section>

            <section className="route-section">
              <h2 className="section-title">处理方式</h2>
              <div className="route-list">
                {ROUTE_ORDER.map((key) => {
                  const meta = getRouteMeta(key, appSettings.autoPublishEnabled);

                  return (
                    <button
                      key={key}
                      type="button"
                      className={key === route ? 'route-card selected' : 'route-card'}
                      onClick={() => setRoute(key)}
                    >
                      <div className="route-card-head">
                        <strong>{meta.title}</strong>
                      </div>
                      <p>{meta.description}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {errorMessage ? <div className="submit-error">{errorMessage}</div> : null}

            <footer className="action-footer">
              <div className="page-button-stack">
                <button
                  className="primary-button"
                  disabled={!canContinue || isSubmitting}
                  onClick={() => {
                    setErrorMessage('');
                    setSubmissionState('confirm');
                  }}
                >
                  {isSubmitting ? '提交中...' : '继续'}
                </button>
                <button className="link-button" onClick={() => openDiscussion()}>
                  查看公开问题
                </button>
              </div>
            </footer>
          </>
        )}
      </main>

      {submissionState === 'confirm' ? (
        <div className="modal-root" role="presentation">
          <div className="modal-scrim" onClick={resetForm} />
          <section className="bottom-sheet" aria-modal="true" role="dialog">
            <div className="sheet-handle" />
            <div className="sheet-visual" aria-hidden="true">
              <div className="sheet-visual-ring" />
            </div>
            <p className="sheet-kicker">提交确认</p>
            <h2>确认提交？</h2>
            <p className="sheet-body">{activeRouteMeta.confirmBody}</p>
            <div className="summary-card sheet-summary-card">
              <span className="summary-label">处理方式</span>
              <strong>{activeRouteMeta.title}</strong>
              <p className="summary-note">{activeRouteMeta.description}</p>
            </div>
            {activeRouteMeta.confirmNote ? (
              <p className="sheet-note">{activeRouteMeta.confirmNote}</p>
            ) : null}
            {errorMessage ? <p className="submit-error sheet-error">{errorMessage}</p> : null}
            <div className="sheet-actions">
              <button
                className="primary-button"
                disabled={isSubmitting}
                onClick={submitQuestion}
              >
                {isSubmitting ? '提交中...' : '确认'}
              </button>
              <button className="secondary-button" onClick={resetForm}>
                返回
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
