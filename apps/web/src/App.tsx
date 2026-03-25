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
  Wifi,
  WifiOff,
} from 'lucide-react';
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
type ConnectionState = 'connecting' | 'live' | 'error';
type LoadingState = 'loading' | 'ready' | 'error';
type TimeRange = 'all' | 'today' | 'three_days' | 'seven_days';

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

type QuestionEvent =
  | { type: 'question.created'; payload: Question }
  | { type: 'question.updated'; payload: Question }
  | { type: 'question.deleted'; payload: { id: string } };

type AppSettings = {
  autoPublishEnabled: boolean;
};

type FilterState = {
  keyword: string;
  route: 'all' | QuestionRoute;
  displayStatus: 'all' | DisplayStatus;
  answerStatus: 'all' | AnswerStatus;
  timeRange: TimeRange;
};

type SummaryCardProps = {
  label: string;
  value: number;
  hint: string;
  active?: boolean;
  onClick: () => void;
};

const ROUTE_LABEL: Record<QuestionRoute, string> = {
  public_discuss: '公开讨论',
  meeting_only: '会上公开',
};

const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = {
  pending: '待处理',
  show_raw: '原文可展示',
  count_only: '仅计数不展示',
  redirect_official: '转正式渠道',
  archived: '已归档',
};

const ANSWER_STATUS_LABEL: Record<AnswerStatus, string> = {
  unanswered: '待回答',
  answered_live: '已现场回答',
  answered_post: '会后补答',
};

const DISPLAY_STATUS_ORDER: Record<DisplayStatus, number> = {
  pending: 0,
  show_raw: 1,
  count_only: 2,
  redirect_official: 3,
  archived: 4,
};

const ROUTE_BADGE_STYLES: Record<QuestionRoute, string> = {
  public_discuss: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  meeting_only: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
};

const DISPLAY_STATUS_BADGE_STYLES: Record<DisplayStatus, string> = {
  pending: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  show_raw: 'border-teal-300/30 bg-teal-300/10 text-teal-100',
  count_only: 'border-indigo-300/30 bg-indigo-300/10 text-indigo-100',
  redirect_official: 'border-rose-300/30 bg-rose-300/10 text-rose-100',
  archived: 'border-slate-300/20 bg-slate-200/10 text-slate-200',
};

const ANSWER_STATUS_BADGE_STYLES: Record<AnswerStatus, string> = {
  unanswered: 'border-white/10 bg-white/6 text-white/80',
  answered_live: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
  answered_post: 'border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100',
};

const ROUTE_OPTIONS = [
  { value: 'all', label: '全部处理方式' },
  { value: 'public_discuss', label: '公开讨论' },
  { value: 'meeting_only', label: '会上公开' },
] as const;

const DISPLAY_STATUS_OPTIONS = [
  { value: 'all', label: '全部展示状态' },
  { value: 'pending', label: '待处理' },
  { value: 'show_raw', label: '原文可展示' },
  { value: 'count_only', label: '仅计数不展示' },
  { value: 'redirect_official', label: '转正式渠道' },
  { value: 'archived', label: '已归档' },
] as const;

const ANSWER_STATUS_OPTIONS = [
  { value: 'all', label: '全部答复状态' },
  { value: 'unanswered', label: '待回答' },
  { value: 'answered_live', label: '已现场回答' },
  { value: 'answered_post', label: '会后补答' },
] as const;

const TIME_RANGE_OPTIONS = [
  { value: 'all', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: 'three_days', label: '近 3 天' },
  { value: 'seven_days', label: '近 7 天' },
] as const;

const DEFAULT_FILTERS: FilterState = {
  keyword: '',
  route: 'all',
  displayStatus: 'all',
  answerStatus: 'all',
  timeRange: 'all',
};

function parseQuestionEvent(raw: string): QuestionEvent | null {
  try {
    return JSON.parse(raw) as QuestionEvent;
  } catch (_error) {
    return null;
  }
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

function matchesTimeRange(value: string, timeRange: TimeRange): boolean {
  if (timeRange === 'all') {
    return true;
  }

  const createdAt = new Date(value).getTime();
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (timeRange === 'today') {
    return createdAt >= startOfToday.getTime();
  }

  const days = timeRange === 'three_days' ? 3 : 7;

  return createdAt >= now - days * 24 * 60 * 60 * 1000;
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
  const [appSettings, setAppSettings] = useState<AppSettings>({ autoPublishEnabled: false });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const deferredKeyword = useDeferredValue(filters.keyword.trim().toLowerCase());

  async function loadQuestions(mode: 'initial' | 'refresh' = 'initial') {
    if (mode === 'initial') {
      setLoadingState('loading');
    } else {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch('/api/questions');
      const data = (await response.json()) as { items?: Question[]; message?: string };

      if (!response.ok || !data.items) {
        throw new Error(data.message || '问题列表加载失败。');
      }

      startTransition(() => {
        setQuestions(data.items ?? []);
        setLoadingState('ready');
        setErrorMessage('');
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '问题列表加载失败。';
      setErrorMessage(message);

      if (mode === 'initial') {
        setLoadingState('error');
      }
    } finally {
      if (mode === 'refresh') {
        setIsRefreshing(false);
      }
    }
  }

  async function loadSettings() {
    try {
      const response = await fetch('/api/settings');
      const data = (await response.json()) as Partial<AppSettings> & { message?: string };

      if (!response.ok || typeof data.autoPublishEnabled !== 'boolean') {
        throw new Error(data.message || '自动直出设置加载失败。');
      }

      setAppSettings({ autoPublishEnabled: data.autoPublishEnabled });
      setSettingsError('');
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : '自动直出设置加载失败。');
    }
  }

  useEffect(() => {
    void loadQuestions();
    void loadSettings();
  }, []);

  useEffect(() => {
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('connected', () => {
      setConnectionState('live');
    });

    eventSource.addEventListener('ping', () => {
      setConnectionState('live');
    });

    eventSource.addEventListener('question.created', (event) => {
      const parsed = parseQuestionEvent((event as MessageEvent<string>).data);

      if (!parsed || parsed.type !== 'question.created') {
        return;
      }

      setActionMessage('刚刚收到一条新问题，已加入待处理列表。');
      setActionError('');
      startTransition(() => {
        setQuestions((previous) => upsertQuestion(previous, parsed.payload));
      });
    });

    eventSource.addEventListener('question.updated', (event) => {
      const parsed = parseQuestionEvent((event as MessageEvent<string>).data);

      if (!parsed || parsed.type !== 'question.updated') {
        return;
      }

      startTransition(() => {
        setQuestions((previous) => upsertQuestion(previous, parsed.payload));
      });
    });

    eventSource.addEventListener('question.deleted', (event) => {
      const parsed = parseQuestionEvent((event as MessageEvent<string>).data);

      if (!parsed || parsed.type !== 'question.deleted') {
        return;
      }

      startTransition(() => {
        setQuestions((previous) =>
          previous.filter((item) => item.id !== parsed.payload.id),
        );
      });
    });

    eventSource.onerror = () => {
      setConnectionState('error');
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const filteredQuestions = useMemo(() => {
    return [...questions]
      .filter((question) => {
        if (filters.route !== 'all' && question.route !== filters.route) {
          return false;
        }

        if (
          filters.displayStatus !== 'all'
          && question.displayStatus !== filters.displayStatus
        ) {
          return false;
        }

        if (
          filters.answerStatus !== 'all'
          && question.answerStatus !== filters.answerStatus
        ) {
          return false;
        }

        if (!matchesTimeRange(question.createdAt, filters.timeRange)) {
          return false;
        }

        if (!deferredKeyword) {
          return true;
        }

        return (
          question.text.toLowerCase().includes(deferredKeyword)
          || ROUTE_LABEL[question.route].includes(deferredKeyword)
        );
      })
      .sort((left, right) => {
        const statusDelta =
          DISPLAY_STATUS_ORDER[left.displayStatus] - DISPLAY_STATUS_ORDER[right.displayStatus];

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

  const summary = useMemo(() => {
    const total = questions.length;
    const pending = questions.filter((item) => item.displayStatus === 'pending').length;
    const showRaw = questions.filter((item) => item.displayStatus === 'show_raw').length;
    const redirected = questions.filter((item) => item.displayStatus === 'redirect_official').length;
    const postAnswered = questions.filter((item) => item.answerStatus === 'answered_post').length;

    return {
      total,
      pending,
      showRaw,
      redirected,
      postAnswered,
    };
  }, [questions]);

  async function updateQuestion(
    questionId: string,
    payload: Partial<Pick<Question, 'displayStatus' | 'answerStatus'>>,
    action: string,
  ) {
    setSavingKey(`${action}:${questionId}`);
    setActionMessage('');
    setActionError('');

    try {
      const response = await fetch(`/api/questions/${questionId}`, {
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

      setActionMessage('问题状态已更新。');
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

  async function toggleAutoPublish() {
    const nextValue = !appSettings.autoPublishEnabled;
    setIsSavingSettings(true);
    setSettingsError('');

    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          autoPublishEnabled: nextValue,
        }),
      });
      const data = (await response.json()) as Partial<AppSettings> & { message?: string };

      if (!response.ok || typeof data.autoPublishEnabled !== 'boolean') {
        throw new Error(data.message || '自动直出设置保存失败。');
      }

      setAppSettings({ autoPublishEnabled: data.autoPublishEnabled });
      setActionError('');
      setActionMessage(
        data.autoPublishEnabled
          ? '自动直出已开启，新提交的问题会直接进入公开池和大屏。'
          : '自动直出已关闭，新提交的问题会回到待处理。',
      );
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : '自动直出设置保存失败。');
    } finally {
      setIsSavingSettings(false);
    }
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
                  原始问题只读保留，会务端只做归类、展示判断和答复推进。
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

        <div className="mt-5 rounded-[1.8rem] border border-amber-300/16 bg-amber-300/8 px-5 py-4 text-sm leading-7 text-amber-50/90 shadow-[0_16px_40px_rgba(120,53,15,0.14)]">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
            <p>
              原始问题不可编辑、不可改写。如果原文包含隐私、点名或强识别信息，请改展示状态，不要改原文。
            </p>
          </div>
        </div>

        <section className="panel mt-5 rounded-[1.8rem] border border-white/8 px-5 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
                自动直出
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                开启后，新提交的问题跳过人工处理
              </h2>
              <p className="mt-2 text-sm leading-7 text-white/58">
                新问题会直接标记为“原文可展示”，立即进入公开池和大屏。仅影响开启后的新提交，历史问题不会自动回填。
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-white">
                  {appSettings.autoPublishEnabled ? '已开启' : '已关闭'}
                </p>
                <p className="mt-1 text-xs text-white/48">
                  {appSettings.autoPublishEnabled ? '直接公开展示' : '仍需人工处理'}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={appSettings.autoPublishEnabled}
                disabled={isSavingSettings}
                onClick={() => void toggleAutoPublish()}
                className={cn(
                  'relative inline-flex h-11 w-20 items-center rounded-full border px-1 transition',
                  appSettings.autoPublishEnabled
                    ? 'border-emerald-300/35 bg-emerald-300/18'
                    : 'border-white/10 bg-white/8',
                  isSavingSettings && 'cursor-not-allowed opacity-70',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-950 transition-transform',
                    appSettings.autoPublishEnabled ? 'translate-x-9' : 'translate-x-0',
                  )}
                >
                  {isSavingSettings ? '...' : appSettings.autoPublishEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>

          {settingsError ? (
            <div className="mt-4 rounded-[1.2rem] border border-rose-300/16 bg-rose-300/8 px-4 py-3 text-sm text-rose-50/88">
              {settingsError}
            </div>
          ) : null}
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
          <SummaryCard
            label="总问题数"
            value={summary.total}
            hint="包含公开讨论和会上公开"
            active={
              filters.route === 'all'
              && filters.displayStatus === 'all'
              && filters.answerStatus === 'all'
            }
            onClick={resetFilters}
          />
          <SummaryCard
            label="待处理"
            value={summary.pending}
            hint="优先归类和判断是否可展示"
            active={filters.displayStatus === 'pending'}
            onClick={() => setQuickFilter({ displayStatus: 'pending' })}
          />
          <SummaryCard
            label="原文可展示"
            value={summary.showRaw}
            hint="可进入公开池或大会展示"
            active={filters.displayStatus === 'show_raw'}
            onClick={() => setQuickFilter({ displayStatus: 'show_raw' })}
          />
          <SummaryCard
            label="转正式渠道"
            value={summary.redirected}
            hint="不进入当前大会流程"
            active={filters.displayStatus === 'redirect_official'}
            onClick={() => setQuickFilter({ displayStatus: 'redirect_official' })}
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
              subtitle="按处理方式、展示状态、答复状态和时间范围快速收敛待处理问题。"
            />

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="control-shell xl:col-span-2">
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
                  value={filters.displayStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      displayStatus: event.target.value as FilterState['displayStatus'],
                    }))
                  }
                  className="control-input"
                >
                  {DISPLAY_STATUS_OPTIONS.map((option) => (
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
                  value={filters.timeRange}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      timeRange: event.target.value as TimeRange,
                    }))
                  }
                  className="control-input"
                >
                  {TIME_RANGE_OPTIONS.map((option) => (
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
                  subtitle={`当前命中 ${filteredQuestions.length} 条，默认优先展示待处理问题。`}
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
                    <div className="mt-4 grid grid-cols-[110px_120px_minmax(0,2.2fr)_160px_150px_140px] gap-3 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/38">
                      <span>ID</span>
                      <span>处理方式</span>
                      <span>原始问题</span>
                      <span>展示状态</span>
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
                              'grid w-full grid-cols-[110px_120px_minmax(0,2.2fr)_160px_150px_140px] gap-3 rounded-[1.5rem] border px-3 py-3 text-left transition',
                              isSelected
                                ? 'border-cyan-300/28 bg-cyan-300/10 shadow-[0_16px_45px_rgba(6,182,212,0.14)]'
                                : 'border-white/8 bg-white/4 hover:border-white/15 hover:bg-white/6',
                            )}
                          >
                            <div className="space-y-2">
                              <p className="font-mono text-sm font-semibold text-white/88">
                                {shortQuestionId(question.id)}
                              </p>
                              <p className="text-xs text-white/38">{question.count ?? 1} 条同类</p>
                            </div>

                            <div className="pt-0.5">
                              <StatusBadge tone={ROUTE_BADGE_STYLES[question.route]}>
                                {ROUTE_LABEL[question.route]}
                              </StatusBadge>
                            </div>

                            <div className="space-y-2">
                              <p className="line-clamp-2 text-sm leading-7 text-white/88">
                                {question.text}
                              </p>
                              <p className="text-xs text-white/42">
                                更新时间 {formatDateTime(question.updatedAt)}
                              </p>
                            </div>

                            <div className="pt-0.5">
                              <StatusBadge tone={DISPLAY_STATUS_BADGE_STYLES[question.displayStatus]}>
                                {DISPLAY_STATUS_LABEL[question.displayStatus]}
                              </StatusBadge>
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
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/42">
                          详情面板
                        </p>
                        <h2 className="mt-2 text-2xl font-bold text-white">
                          {questionTitle(selectedQuestion)}
                        </h2>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={ROUTE_BADGE_STYLES[selectedQuestion.route]}>
                          {ROUTE_LABEL[selectedQuestion.route]}
                        </StatusBadge>
                        <StatusBadge tone={DISPLAY_STATUS_BADGE_STYLES[selectedQuestion.displayStatus]}>
                          {DISPLAY_STATUS_LABEL[selectedQuestion.displayStatus]}
                        </StatusBadge>
                      </div>
                    </div>

                    <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-black/18 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/38">
                        原始问题
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-8 text-white/88">
                        {selectedQuestion.text}
                      </p>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="meta-block">
                        <span className="meta-label">问题 ID</span>
                        <span className="meta-value font-mono">{selectedQuestion.id}</span>
                      </div>
                      <div className="meta-block">
                        <span className="meta-label">同类提交数</span>
                        <span className="meta-value">{selectedQuestion.count ?? 1}</span>
                      </div>
                      <div className="meta-block">
                        <span className="meta-label">提交时间</span>
                        <span className="meta-value">{formatDateTime(selectedQuestion.createdAt)}</span>
                      </div>
                      <div className="meta-block">
                        <span className="meta-label">最近更新</span>
                        <span className="meta-value">{formatDateTime(selectedQuestion.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="mt-6 space-y-6">
                      <section>
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-cyan-100" />
                          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                            展示状态
                          </h3>
                        </div>
                        <div className="mt-4 grid gap-2">
                          {(
                            [
                              ['pending', '待处理', '尚未判断是否展示'],
                              ['show_raw', '标记原文可展示', '可进入公开池或大会现场展示'],
                              ['count_only', '仅计数不展示', '原文不公开，但保留为内部统计'],
                              ['redirect_official', '转正式渠道', '不进入大会流程，转到正式处理路径'],
                              ['archived', '归档', '当前轮次不再继续处理'],
                            ] as Array<[DisplayStatus, string, string]>
                          ).map(([value, label, description]) => {
                            const active = selectedQuestion.displayStatus === value;
                            const isSaving = savingKey === `displayStatus:${selectedQuestion.id}`;

                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  void updateQuestion(
                                    selectedQuestion.id,
                                    { displayStatus: value },
                                    'displayStatus',
                                  )
                                }
                                disabled={active || !!savingKey}
                                className={cn(
                                  'rounded-[1.35rem] border px-4 py-3 text-left transition',
                                  active
                                    ? 'border-cyan-300/28 bg-cyan-300/12'
                                    : 'border-white/8 bg-white/4 hover:border-white/16 hover:bg-white/6',
                                  isSaving && 'animate-pulse',
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-white">{label}</p>
                                    <p className="mt-1 text-sm leading-6 text-white/52">
                                      {description}
                                    </p>
                                  </div>
                                  {active ? (
                                    <StatusBadge tone={DISPLAY_STATUS_BADGE_STYLES[value]}>
                                      当前状态
                                    </StatusBadge>
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
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
                        右侧会显示原始问题全文、当前状态和可执行的管理动作。
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

function questionTitle(question: Question): string {
  const normalized = question.text.trim().replace(/\s+/g, ' ');

  if (normalized.length <= 26) {
    return normalized;
  }

  return `${normalized.slice(0, 26)}...`;
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
