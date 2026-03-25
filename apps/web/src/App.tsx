import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BadgeCheck,
  Clock3,
  Filter,
  MessageSquareText,
  RefreshCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { adminFetch } from './lib/adminAuth';
import { cn } from './lib/utils';
import { BoardView } from './BoardView';

type QuestionRoute = 'public_discuss' | 'meeting_only';
type DisplayStatus =
  | 'pending'
  | 'show_raw'
  | 'count_only'
  | 'redirect_official'
  | 'archived';
type AnswerStatus = 'unanswered' | 'answered_live' | 'answered_post';
type ArchiveState = 'all' | 'active' | 'archived';
type ConnectionState = 'connecting' | 'live' | 'error';
type LoadingState = 'loading' | 'ready' | 'error';

type Question = {
  id: string;
  text: string;
  tag: string;
  route: QuestionRoute;
  displayStatus: DisplayStatus;
  answerStatus: AnswerStatus;
  count?: number;
  createdAt: string;
  updatedAt: string;
};

type FilterState = {
  keyword: string;
  route: 'all' | QuestionRoute;
  archiveState: ArchiveState;
  answerStatus: 'all' | AnswerStatus;
  tag: string;
};

type SummaryCardProps = {
  label: string;
  value: number;
  hint: string;
  active?: boolean;
  onClick: () => void;
};

const ROUTE_LABEL: Record<QuestionRoute, string> = {
  public_discuss: '公开问题',
  meeting_only: '会上公开',
};

const ANSWER_STATUS_LABEL: Record<AnswerStatus, string> = {
  unanswered: '待回答',
  answered_live: '已现场回答',
  answered_post: '会后补答',
};

const ROUTE_BADGE_STYLES: Record<QuestionRoute, string> = {
  public_discuss: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  meeting_only: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
};

const ARCHIVED_BADGE_TONE = 'border-slate-300/20 bg-slate-200/10 text-slate-200';

const ANSWER_STATUS_BADGE_STYLES: Record<AnswerStatus, string> = {
  unanswered: 'border-white/10 bg-white/6 text-white/80',
  answered_live: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
  answered_post: 'border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100',
};

const ROUTE_OPTIONS = [
  { value: 'all', label: '全部处理方式' },
  { value: 'public_discuss', label: '公开问题' },
  { value: 'meeting_only', label: '会上公开' },
] as const;

const ARCHIVE_STATE_OPTIONS = [
  { value: 'all', label: '全部归档状态' },
  { value: 'active', label: '未归档' },
  { value: 'archived', label: '已归档' },
] as const;

const ANSWER_STATUS_OPTIONS = [
  { value: 'all', label: '全部答复状态' },
  { value: 'unanswered', label: '待回答' },
  { value: 'answered_live', label: '已现场回答' },
  { value: 'answered_post', label: '会后补答' },
] as const;

const UNCLASSIFIED_TAG_VALUE = '__untagged__';

const DEFAULT_FILTERS: FilterState = {
  keyword: '',
  route: 'all',
  archiveState: 'all',
  answerStatus: 'all',
  tag: 'all',
};

function isArchivedStatus(status: DisplayStatus): boolean {
  return status === 'archived';
}

function upsertQuestion(list: Question[], question: Question): Question[] {
  const exists = list.some((item) => item.id === question.id);

  if (exists) {
    return list.map((item) => (item.id === question.id ? question : item));
  }

  return [question, ...list];
}

function shortQuestionId(value: string): string {
  return value.slice(0, 8).toUpperCase();
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function SummaryCard({ label, value, hint, active = false, onClick }: SummaryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'panel relative overflow-hidden rounded-[1.75rem] border px-5 py-5 text-left transition duration-200',
        active
          ? 'border-cyan-300/30 shadow-[0_18px_50px_rgba(16,185,129,0.16)]'
          : 'border-white/8 hover:border-white/16',
      )}
    >
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="text-4xl font-black tracking-tight text-white">{value}</p>
        <p className="max-w-[9rem] text-right text-sm leading-6 text-white/55">{hint}</p>
      </div>
    </button>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-cyan-100">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-white/55">{subtitle}</p>
      </div>
    </div>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: string;
}) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium', tone)}>
      {children}
    </span>
  );
}

function ManagementView({ onOpenBoard }: { onOpenBoard: () => void }) {
  const POLL_INTERVAL_MS = 10000;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const deferredKeyword = useDeferredValue(filters.keyword.trim().toLowerCase());

  async function loadQuestions(mode: 'initial' | 'refresh' = 'initial') {
    if (mode === 'initial') {
      setLoadingState('loading');
    } else {
      setIsRefreshing(true);
    }

    try {
      const response = await adminFetch('/api/questions');
      const data = (await response.json()) as { items?: Question[]; message?: string };

      if (!response.ok || !data.items) {
        throw new Error(data.message || '问题列表加载失败。');
      }

      startTransition(() => {
        setQuestions(data.items ?? []);
        setLoadingState('ready');
        setConnectionState('live');
        setErrorMessage('');
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '问题列表加载失败。';
      setErrorMessage(message);
      setConnectionState('error');

      if (mode === 'initial') {
        setLoadingState('error');
      }
    } finally {
      if (mode === 'refresh') {
        setIsRefreshing(false);
      }
    }
  }

  useEffect(() => {
    void loadQuestions();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadQuestions('refresh');
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const filteredQuestions = useMemo(() => {
    return [...questions]
      .filter((question) => {
        if (filters.route !== 'all' && question.route !== filters.route) {
          return false;
        }

        if (filters.archiveState === 'active' && isArchivedStatus(question.displayStatus)) {
          return false;
        }

        if (filters.archiveState === 'archived' && !isArchivedStatus(question.displayStatus)) {
          return false;
        }

        if (
          filters.answerStatus !== 'all'
          && question.answerStatus !== filters.answerStatus
        ) {
          return false;
        }

        const normalizedTag = question.tag.trim();

        if (filters.tag === UNCLASSIFIED_TAG_VALUE && normalizedTag.length > 0) {
          return false;
        }

        if (
          filters.tag !== 'all'
          && filters.tag !== UNCLASSIFIED_TAG_VALUE
          && normalizedTag !== filters.tag
        ) {
          return false;
        }

        if (!deferredKeyword) {
          return true;
        }

        return (
          question.text.toLowerCase().includes(deferredKeyword)
          || question.tag.toLowerCase().includes(deferredKeyword)
          || ROUTE_LABEL[question.route].includes(deferredKeyword)
        );
      })
      .sort((left, right) => {
        const statusDelta =
          Number(isArchivedStatus(left.displayStatus)) - Number(isArchivedStatus(right.displayStatus));

        if (statusDelta !== 0) {
          return statusDelta;
        }

        const countDelta = (right.count ?? 1) - (left.count ?? 1);

        if (countDelta !== 0) {
          return countDelta;
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });
  }, [deferredKeyword, filters, questions]);

  const tagOptions = useMemo(() => {
    const options = [{ value: 'all', label: '全部标签' }];

    if (questions.some((question) => question.tag.trim().length === 0)) {
      options.push({ value: UNCLASSIFIED_TAG_VALUE, label: '未分类' });
    }

    const tags = Array.from(
      new Set(
        questions
          .map((question) => question.tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'));

    return options.concat(tags.map((tag) => ({ value: tag, label: tag })));
  }, [questions]);

  useEffect(() => {
    if (filteredQuestions.length === 0) {
      setSelectedQuestionId(null);
      return;
    }

    if (!filteredQuestions.some((question) => question.id === selectedQuestionId)) {
      setSelectedQuestionId(filteredQuestions[0].id);
    }
  }, [filteredQuestions, selectedQuestionId]);

  const selectedQuestion = useMemo(
    () => filteredQuestions.find((question) => question.id === selectedQuestionId) ?? null,
    [filteredQuestions, selectedQuestionId],
  );

  useEffect(() => {
    setActionError('');
  }, [selectedQuestion?.id]);

  useEffect(() => {
    setTagDraft(selectedQuestion?.tag ?? '');
  }, [selectedQuestion?.id, selectedQuestion?.tag]);

  const summary = useMemo(() => {
    const total = questions.length;
    const archived = questions.filter((item) => isArchivedStatus(item.displayStatus)).length;
    const active = total - archived;
    const postAnswered = questions.filter((item) => item.answerStatus === 'answered_post').length;

    return {
      total,
      active,
      archived,
      postAnswered,
    };
  }, [questions]);

  async function updateQuestion(
    questionId: string,
    payload: Partial<Pick<Question, 'displayStatus' | 'answerStatus' | 'tag'>>,
    action: string,
    successMessage = '问题状态已更新。',
  ) {
    setSavingKey(`${action}:${questionId}`);
    setActionMessage('');
    setActionError('');

    try {
      const response = await adminFetch(`/api/questions/${questionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as Question | { message?: string };

      if (!response.ok || !('id' in data)) {
        throw new Error(('message' in data && data.message) || '更新失败，请稍后重试。');
      }

      startTransition(() => {
        setQuestions((previous) => upsertQuestion(previous, data));
      });

      setActionMessage(successMessage);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '更新失败，请稍后重试。');
    } finally {
      setSavingKey('');
    }
  }

  function setQuickFilter(next: Partial<FilterState>) {
    startTransition(() => {
      setFilters((current) => ({
        ...current,
        ...next,
      }));
    });
  }

  function resetFilters() {
    startTransition(() => {
      setFilters(DEFAULT_FILTERS);
    });
  }

  return (
    <div className="app-shell min-h-screen text-white">
      <div className="mx-auto max-w-[1680px] px-4 pb-10 pt-4 md:px-6 xl:px-8">
        <header className="panel sticky top-4 z-20 rounded-[2rem] border border-white/8 px-5 py-5 backdrop-blur-xl md:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-[0_0_30px_rgba(45,212,191,0.12)]">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">
                  Organizer Console
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">
                  问题管理
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-white/58">
                  原始问题只读保留，会务端只做归类和答复推进。
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <nav className="flex flex-wrap gap-2 rounded-2xl border border-white/8 bg-white/5 p-1.5">
                <button
                  type="button"
                  className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(255,255,255,0.2)]"
                >
                  问题管理
                </button>
                <button
                  type="button"
                  onClick={onOpenBoard}
                  className="rounded-2xl px-4 py-2.5 text-sm text-white/65 transition hover:bg-white/8 hover:text-white"
                >
                  大会展示
                </button>
              </nav>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-white/70">
                  {connectionState === 'live' ? (
                    <Wifi className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-amber-200" />
                  )}
                  <span>
                    {connectionState === 'live'
                      ? '实时同步中'
                      : connectionState === 'connecting'
                        ? '连接中'
                        : '连接异常'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void loadQuestions('refresh')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10"
                >
                  <RefreshCcw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                  刷新
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <SummaryCard
            label="总问题数"
            value={summary.total}
            hint="包含公开问题和会上公开"
            active={
              filters.route === 'all'
              && filters.archiveState === 'all'
              && filters.answerStatus === 'all'
              && filters.tag === 'all'
            }
            onClick={resetFilters}
          />
          <SummaryCard
            label="展示中"
            value={summary.active}
            hint="未归档的问题会继续出现在页面中"
            active={filters.archiveState === 'active'}
            onClick={() => setQuickFilter({ archiveState: 'active' })}
          />
          <SummaryCard
            label="已归档"
            value={summary.archived}
            hint="已从展示流中移出的内容"
            active={filters.archiveState === 'archived'}
            onClick={() => setQuickFilter({ archiveState: 'archived' })}
          />
          <SummaryCard
            label="会后补答"
            value={summary.postAnswered}
            hint="现场未答，需要后续跟进"
            active={filters.answerStatus === 'answered_post'}
            onClick={() => setQuickFilter({ answerStatus: 'answered_post' })}
          />
        </section>

        <section className="panel mt-6 rounded-[2rem] border border-white/8 px-5 py-5 md:px-6">
          <div className="flex flex-col gap-6">
            <SectionTitle
              icon={<Filter className="h-5 w-5" />}
              title="筛选与检索"
              subtitle="按处理方式、归档状态、答复状态和标签快速筛选问题。"
            />

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <label className="control-shell">
                <Search className="h-4 w-4 text-white/35" />
                <input
                  value={filters.keyword}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, keyword: event.target.value }))
                  }
                  placeholder="搜索原始问题"
                  className="control-input"
                />
              </label>

              <label className="control-shell">
                <select
                  value={filters.route}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      route: event.target.value as FilterState['route'],
                    }))
                  }
                  className="control-input"
                >
                  {ROUTE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="control-shell">
                <select
                  value={filters.archiveState}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      archiveState: event.target.value as ArchiveState,
                    }))
                  }
                  className="control-input"
                >
                  {ARCHIVE_STATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="control-shell">
                <select
                  value={filters.answerStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      answerStatus: event.target.value as FilterState['answerStatus'],
                    }))
                  }
                  className="control-input"
                >
                  {ANSWER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="control-shell">
                <select
                  value={filters.tag}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      tag: event.target.value,
                    }))
                  }
                  className="control-input"
                >
                  {tagOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        {loadingState === 'loading' ? (
          <div className="mt-6 flex min-h-[420px] items-center justify-center rounded-[2rem] border border-white/8 bg-white/4">
            <div className="rounded-2xl border border-white/10 bg-white/8 px-6 py-4 text-white/70">
              正在加载问题管理数据...
            </div>
          </div>
        ) : loadingState === 'error' ? (
          <div className="mt-6 rounded-[2rem] border border-rose-300/18 bg-rose-300/8 px-6 py-10 text-center">
            <h2 className="text-2xl font-bold text-white">管理页暂时不可用</h2>
            <p className="mt-3 text-sm leading-7 text-white/65">{errorMessage}</p>
            <button
              type="button"
              onClick={() => void loadQuestions()}
              className="mt-6 rounded-2xl border border-white/12 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/12"
            >
              重新加载
            </button>
          </div>
        ) : (
          <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.95fr)]">
            <div className="panel min-w-0 rounded-[2rem] border border-white/8">
              <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
                <SectionTitle
                  icon={<MessageSquareText className="h-5 w-5" />}
                  title="问题列表"
                  subtitle={`当前命中 ${filteredQuestions.length} 条，默认优先展示未归档问题。`}
                />
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/65">
                  <Clock3 className="h-4 w-4" />
                  已按更新时间与关注度排序
                </div>
              </div>

              {errorMessage && loadingState === 'ready' ? (
                <div className="border-b border-rose-300/12 bg-rose-300/6 px-6 py-3 text-sm text-rose-50/85">
                  {errorMessage}
                </div>
              ) : null}

              {actionMessage ? (
                <div className="border-b border-emerald-300/12 bg-emerald-300/6 px-6 py-3 text-sm text-emerald-50/90">
                  {actionMessage}
                </div>
              ) : null}

              {filteredQuestions.length === 0 ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/8 text-cyan-100">
                    <BadgeCheck className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold text-white">当前筛选下没有问题</h3>
                  <p className="mt-3 max-w-md text-sm leading-7 text-white/58">
                    可以清空筛选条件，或者等待 H5 端有新问题进入。
                  </p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-6 rounded-2xl border border-white/12 bg-white/8 px-4 py-2.5 text-sm text-white/78 transition hover:border-white/20 hover:bg-white/12"
                  >
                    清空筛选
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[960px] px-4 pb-4 md:px-6">
                    <div className="mt-4 grid grid-cols-[110px_120px_minmax(0,2.2fr)_150px_140px] gap-3 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/38">
                      <span>ID</span>
                      <span>处理方式</span>
                      <span>原始问题</span>
                      <span>答复状态</span>
                      <span>提交时间</span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {filteredQuestions.map((question) => {
                        const isSelected = question.id === selectedQuestionId;

                        return (
                          <button
                            key={question.id}
                            type="button"
                            onClick={() => setSelectedQuestionId(question.id)}
                            className={cn(
                              'grid w-full grid-cols-[110px_120px_minmax(0,2.2fr)_150px_140px] gap-3 rounded-[1.5rem] border px-3 py-3 text-left transition',
                              isSelected
                                ? 'border-cyan-300/28 bg-cyan-300/10 shadow-[0_16px_45px_rgba(6,182,212,0.14)]'
                                : 'border-white/8 bg-white/4 hover:border-white/15 hover:bg-white/6',
                            )}
                          >
                            <div className="space-y-2">
                              <p className="font-mono text-sm font-semibold text-white/88">
                                {shortQuestionId(question.id)}
                              </p>
                              <p className="text-xs text-white/38">关心人数 {question.count ?? 1}</p>
                            </div>

                            <div className="pt-0.5">
                              <StatusBadge tone={ROUTE_BADGE_STYLES[question.route]}>
                                {ROUTE_LABEL[question.route]}
                              </StatusBadge>
                            </div>

                            <div className="space-y-2">
                              <p className="truncate text-sm leading-7 text-white/88">
                                {question.text}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span
                                  className={cn(
                                    'inline-flex items-center rounded-full border px-2.5 py-1',
                                    question.tag.trim()
                                      ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100/88'
                                      : 'border-white/10 bg-white/6 text-white/45',
                                  )}
                                >
                                  {question.tag.trim() || '未分类'}
                                </span>
                                {isArchivedStatus(question.displayStatus) ? (
                                  <StatusBadge tone={ARCHIVED_BADGE_TONE}>
                                    已归档
                                  </StatusBadge>
                                ) : null}
                                <span className="text-white/42">
                                  更新时间 {formatDateTime(question.updatedAt)}
                                </span>
                              </div>
                            </div>

                            <div className="pt-0.5">
                              <StatusBadge tone={ANSWER_STATUS_BADGE_STYLES[question.answerStatus]}>
                                {ANSWER_STATUS_LABEL[question.answerStatus]}
                              </StatusBadge>
                            </div>

                            <div className="pt-1 text-sm text-white/64">
                              {formatDateTime(question.createdAt)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="xl:sticky xl:top-[7.6rem] xl:self-start">
              <AnimatePresence mode="wait">
                {selectedQuestion ? (
                  <motion.aside
                    key={selectedQuestion.id}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 18 }}
                    transition={{ duration: 0.24, ease: 'easeOut' }}
                    className="panel rounded-[2rem] border border-white/8 p-5 md:p-6"
                  >
                    <div className="flex flex-wrap items-start justify-end gap-3">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={ROUTE_BADGE_STYLES[selectedQuestion.route]}>
                          {ROUTE_LABEL[selectedQuestion.route]}
                        </StatusBadge>
                        {isArchivedStatus(selectedQuestion.displayStatus) ? (
                          <StatusBadge tone={ARCHIVED_BADGE_TONE}>
                            已归档
                          </StatusBadge>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-black/18 px-4 py-4">
                      <p className="whitespace-pre-wrap text-sm leading-8 text-white/88">
                        {selectedQuestion.text}
                      </p>
                    </div>

                    <div className="mt-5">
                      <div className="meta-block">
                        <span className="meta-label">关心人数</span>
                        <span className="meta-value">{selectedQuestion.count ?? 1}</span>
                      </div>
                    </div>

                    <div className="mt-6 space-y-6">
                      <section>
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-cyan-100" />
                          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                            标签
                          </h3>
                        </div>

                        <div className="mt-4 rounded-[1.35rem] border border-white/8 bg-white/4 p-4">
                          <p className="text-sm leading-6 text-white/55">
                            用于公开问题筛选和大屏表格模式分类展示。
                          </p>

                          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                            <input
                              value={tagDraft}
                              onChange={(event) => setTagDraft(event.target.value)}
                              placeholder="例如：晋升与发展"
                              maxLength={120}
                              className="min-w-0 flex-1 rounded-[1.15rem] border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/24 focus:bg-white/8"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                void updateQuestion(
                                  selectedQuestion.id,
                                  { tag: tagDraft.trim() },
                                  'tag',
                                  tagDraft.trim() ? '标签已更新。' : '标签已清空。',
                                )
                              }
                              disabled={!!savingKey || tagDraft.trim() === selectedQuestion.tag.trim()}
                              className={cn(
                                'rounded-[1.15rem] border px-4 py-3 text-sm font-medium transition sm:min-w-[110px]',
                                savingKey === `tag:${selectedQuestion.id}`
                                  ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
                                  : 'border-white/10 bg-white/8 text-white/82 hover:border-white/18 hover:bg-white/10',
                                (savingKey || tagDraft.trim() === selectedQuestion.tag.trim())
                                && 'cursor-not-allowed opacity-60',
                              )}
                            >
                              {savingKey === `tag:${selectedQuestion.id}` ? '保存中...' : '保存标签'}
                            </button>
                          </div>
                        </div>
                      </section>

                      <section>
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-cyan-100" />
                          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                            归档
                          </h3>
                        </div>
                        <div className="mt-4 rounded-[1.35rem] border border-white/8 bg-white/4 p-4">
                          {isArchivedStatus(selectedQuestion.displayStatus) ? (
                            <div className="space-y-3">
                              <StatusBadge tone={ARCHIVED_BADGE_TONE}>
                                已归档
                              </StatusBadge>
                              <p className="text-sm leading-6 text-white/55">
                                这条问题已从当前展示流中移出，不会继续在大屏中出现。
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <p className="text-sm leading-6 text-white/55">
                                当前所有问题默认直接展示，只有归档后才会从大屏和当前流程中移出。
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  void updateQuestion(
                                    selectedQuestion.id,
                                    { displayStatus: 'archived' },
                                    'archive',
                                    '问题已归档。',
                                  )
                                }
                                disabled={!!savingKey}
                                className={cn(
                                  'rounded-[1.15rem] border px-4 py-3 text-sm font-medium transition',
                                  savingKey === `archive:${selectedQuestion.id}`
                                    ? 'border-slate-300/20 bg-slate-200/10 text-slate-100'
                                    : 'border-white/10 bg-white/8 text-white/82 hover:border-white/18 hover:bg-white/10',
                                  !!savingKey && 'cursor-not-allowed opacity-60',
                                )}
                              >
                                {savingKey === `archive:${selectedQuestion.id}` ? '归档中...' : '归档这条问题'}
                              </button>
                            </div>
                          )}
                        </div>
                      </section>

                      <section>
                        <div className="flex items-center gap-2">
                          <BadgeCheck className="h-4 w-4 text-cyan-100" />
                          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                            答复推进
                          </h3>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          {(
                            [
                              ['unanswered', '待回答'],
                              ['answered_live', '已现场回答'],
                              ['answered_post', '会后补答'],
                            ] as Array<[AnswerStatus, string]>
                          ).map(([value, label]) => {
                            const active = selectedQuestion.answerStatus === value;

                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  void updateQuestion(
                                    selectedQuestion.id,
                                    { answerStatus: value },
                                    'answerStatus',
                                  )
                                }
                                disabled={active || !!savingKey}
                                className={cn(
                                  'rounded-[1.35rem] border px-4 py-3 text-sm font-medium transition',
                                  active
                                    ? 'border-cyan-300/28 bg-cyan-300/12 text-white'
                                    : 'border-white/8 bg-white/4 text-white/78 hover:border-white/16 hover:bg-white/6',
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    </div>

                    {actionError ? (
                      <div className="mt-5 rounded-[1.35rem] border border-rose-300/16 bg-rose-300/8 px-4 py-3 text-sm text-rose-50/90">
                        {actionError}
                      </div>
                    ) : null}
                  </motion.aside>
                ) : (
                  <motion.div
                    key="empty-detail"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 18 }}
                    className="panel flex min-h-[520px] items-center justify-center rounded-[2rem] border border-white/8 px-6 text-center"
                  >
                    <div>
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/8 text-cyan-100">
                        <MessageSquareText className="h-7 w-7" />
                      </div>
                      <h2 className="mt-5 text-2xl font-semibold text-white">选择一条问题查看详情</h2>
                      <p className="mt-3 max-w-sm text-sm leading-7 text-white/55">
                        右侧会显示原始问题全文、标签、归档动作和答复推进。
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const BOARD_PATH = normalizeAppPath(import.meta.env.VITE_BOARD_PATH ?? '/board/');
const MANAGEMENT_PATH = normalizeAppPath(import.meta.env.VITE_MANAGEMENT_PATH ?? '/console/');

function normalizeAppPath(path: string): string {
  const trimmed = path.trim();

  if (trimmed.length === 0 || trimmed === '/') {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function resolvePage(): 'management' | 'board' {
  if (typeof window === 'undefined') {
    return 'management';
  }

  if (window.location.pathname.startsWith(BOARD_PATH) || window.location.hash === '#board') {
    return 'board';
  }

  return 'management';
}

function navigateTo(path: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.location.assign(path);
}

export default function App() {
  const [page, setPage] = useState<'management' | 'board'>(() => resolvePage());

  useEffect(() => {
    function syncPageFromLocation() {
      setPage(resolvePage());
    }

    window.addEventListener('popstate', syncPageFromLocation);
    window.addEventListener('hashchange', syncPageFromLocation);

    return () => {
      window.removeEventListener('popstate', syncPageFromLocation);
      window.removeEventListener('hashchange', syncPageFromLocation);
    };
  }, []);

  if (page === 'board') {
    return <BoardView onOpenManagement={() => navigateTo(MANAGEMENT_PATH)} />;
  }

  return <ManagementView onOpenBoard={() => navigateTo(BOARD_PATH)} />;
}
