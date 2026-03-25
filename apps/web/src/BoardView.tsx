import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useMotionValue,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { Check, Globe, Grid2X2, Sparkles, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { adminFetch, getStoredAdminToken } from './lib/adminAuth';
import { cn } from './lib/utils';

type QuestionRoute = 'public_discuss' | 'meeting_only';
type DisplayStatus = 'pending' | 'show_raw' | 'count_only' | 'redirect_official' | 'archived';
type AnswerStatus = 'unanswered' | 'answered_live' | 'answered_post';
type SortType = 'count' | 'date';
type ViewMode = 'grid' | 'globe';
type ConnectionState = 'connecting' | 'live' | 'error';
type GlobeLayout = {
  horizontalRadius: number;
  verticalRadius: number;
  centerYOffset: number;
  containerWidth: number;
  containerHeight: number;
  horizontalSafeInset: number;
  topSafeInset: number;
  bottomSafeInset: number;
};

type Question = {
  id: string;
  text: string;
  tag: string;
  route: QuestionRoute;
  displayStatus: DisplayStatus;
  answerStatus: AnswerStatus;
  count?: number;
  createdAt: string;
};

const HIGHLIGHT_DURATION_MS = 2600;
const ALL_TAGS = '全部';
const BOARD_POLL_INTERVAL_MS = 10000;

function isVisibleOnBoard(question: Question): boolean {
  return question.displayStatus !== 'archived';
}

function getQuestionTagLabel(question: Pick<Question, 'tag'>): string {
  return question.tag.trim() || '未分类';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getGlobeLayout(
  containerWidth: number,
  containerHeight: number,
  questionCount: number,
): GlobeLayout {
  const topSafeInset = Math.max(112, containerHeight * 0.11);
  const bottomSafeInset = Math.max(36, containerHeight * 0.045);
  const horizontalSafeInset = Math.max(36, containerWidth * 0.03);
  const safeWidth = Math.max(320, containerWidth - horizontalSafeInset * 2);
  const safeHeight = Math.max(260, containerHeight - topSafeInset - bottomSafeInset);
  const densityBoost = questionCount <= 18 ? 1.16 : questionCount <= 28 ? 1.08 : 1;
  const horizontalRadius = Math.min(
    (containerWidth / 2) - 150,
    safeWidth * 0.46 * densityBoost,
  );
  const verticalRadius = Math.min(
    (containerHeight / 2) - 104,
    safeHeight * 0.52 * densityBoost,
  );

  return {
    horizontalRadius: Math.max(320, horizontalRadius),
    verticalRadius: Math.max(220, verticalRadius),
    centerYOffset: topSafeInset + safeHeight / 2 - containerHeight / 2,
    containerWidth,
    containerHeight,
    horizontalSafeInset,
    topSafeInset,
    bottomSafeInset,
  };
}

function getCardMetrics(count: number): { width: number; height: number } {
  if (count >= 6) {
    return { width: 512, height: 256 };
  }

  if (count >= 3) {
    return { width: 448, height: 224 };
  }

  return { width: 352, height: 176 };
}

function getCardSizeClass(count: number) {
  if (count >= 6) {
    return 'w-[32rem] min-h-[16rem] p-8 text-3xl font-bold border-cyan-400/40 shadow-[0_0_30px_rgba(34,211,238,0.18)]';
  }

  if (count >= 3) {
    return 'w-[28rem] min-h-[14rem] p-6 text-2xl font-semibold border-blue-400/30 shadow-[0_0_20px_rgba(59,130,246,0.15)]';
  }

  return 'w-[22rem] min-h-[11rem] p-5 text-xl font-medium border-white/10';
}

function formatQuestionTime(value: string, nowTimestamp: number): string {
  const timestamp = new Date(value).getTime();
  const diffMs = Math.max(nowTimestamp - timestamp, 0);
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return '刚刚';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}天前`;
}

function isAnswered(question: Pick<Question, 'answerStatus'>): boolean {
  return question.answerStatus !== 'unanswered';
}

function upsertQuestion(list: Question[], question: Question): Question[] {
  const exists = list.some((item) => item.id === question.id);

  if (exists) {
    return list.map((item) => (item.id === question.id ? question : item));
  }

  return [question, ...list];
}

function QuestionCard({
  q,
  viewMode,
  nowTimestamp,
  onClick,
  focused = false,
}: {
  q: Question;
  viewMode: ViewMode;
  nowTimestamp: number;
  onClick?: () => void;
  focused?: boolean;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-300, 300], [8, -8]);
  const rotateY = useTransform(x, [-300, 300], [-8, 8]);
  const count = q.count ?? 1;
  const tagLabel = getQuestionTagLabel(q);

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (viewMode === 'globe') {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    x.set(event.clientX - rect.left - rect.width / 2);
    y.set(event.clientY - rect.top - rect.height / 2);
  }

  function handleMouseLeave() {
    if (viewMode === 'globe') {
      return;
    }

    x.set(0);
    y.set(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!onClick) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <motion.article
      layout={viewMode === 'grid'}
      initial={viewMode === 'grid' ? { opacity: 0, scale: 0.85, y: 40 } : undefined}
      animate={viewMode === 'grid' ? { opacity: 1, scale: 1, y: 0 } : undefined}
      exit={viewMode === 'grid' ? { opacity: 0, scale: 0.8, filter: 'blur(12px)' } : undefined}
      transition={{
        layout: { type: 'spring', stiffness: 180, damping: 24 },
        opacity: { duration: 0.3 },
      }}
      style={viewMode === 'grid' ? { rotateX, rotateY, transformPerspective: 1000 } : {}}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'glass-card holo-sweep relative flex flex-col justify-between rounded-3xl transition-colors duration-500',
        getCardSizeClass(count),
        focused ? 'border-cyan-300/38 shadow-[0_0_42px_rgba(34,211,238,0.18)]' : 'hover:border-white/30',
        onClick && 'cursor-pointer hover:-translate-y-1',
      )}
    >
      <div className="relative z-10">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-cyan-100/90">
            {tagLabel}
          </span>
        </div>

        <p className="leading-relaxed break-words text-white/92 drop-shadow-md">{q.text}</p>
      </div>

      <div className="relative z-10 mt-6 flex items-center justify-between gap-4 border-t border-white/10 pt-4 text-sm">
        <time className="text-white/45">{formatQuestionTime(q.createdAt, nowTimestamp)}</time>
        <span className="text-white/72">关心人数 {count}</span>
      </div>
    </motion.article>
  );
}

function FocusedQuestionOverlay({
  question,
  nowTimestamp,
  onClose,
  onMarkAnswered,
  markingAnswered = false,
}: {
  question: Question;
  nowTimestamp: number;
  onClose: () => void;
  onMarkAnswered: () => void;
  markingAnswered?: boolean;
}) {
  const count = question.count ?? 1;
  const tag = getQuestionTagLabel(question);

  return (
    <motion.div
      initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      animate={{ opacity: 1, backdropFilter: 'blur(16px)' }}
      exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      className="fixed inset-0 z-[35] flex items-center justify-center bg-slate-950/38 px-10"
    >
      <button
        type="button"
        aria-label="关闭聚焦展示"
        onClick={onClose}
        className="absolute inset-0"
      />

      <motion.section
        initial={{ scale: 0.84, y: 48, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0, filter: 'blur(12px)' }}
        transition={{ type: 'spring', stiffness: 200, damping: 24 }}
        className="glass-card relative z-10 w-[88vw] max-w-6xl overflow-hidden rounded-[3rem] border border-cyan-300/24 p-12 shadow-[0_0_80px_rgba(34,211,238,0.14)]"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/8 via-transparent to-blue-500/8" />

        <div className="relative z-10 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full border border-white/14 bg-white/8 px-4 py-2 text-white/78">
            {tag}
          </span>
        </div>

        <h2 className="relative z-10 mt-8 text-5xl font-bold leading-[1.28] text-white drop-shadow-[0_0_28px_rgba(255,255,255,0.08)]">
          {question.text}
        </h2>

        <div className="relative z-10 mt-10 grid grid-cols-[1fr_auto_1fr] items-center gap-6 border-t border-white/10 pt-5 text-base">
          <time className="justify-self-start text-white/45">
            {formatQuestionTime(question.createdAt, nowTimestamp)}
          </time>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white/72 transition hover:border-white/18 hover:bg-white/8 hover:text-white/88"
            >
              <X className="h-4 w-4" />
              <span>关闭</span>
            </button>

            <button
              type="button"
              onClick={onMarkAnswered}
              disabled={markingAnswered}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition',
                markingAnswered
                  ? 'cursor-wait border-cyan-300/16 bg-cyan-300/10 text-cyan-100/70'
                  : 'border-cyan-300/24 bg-cyan-300/12 text-cyan-100/92 hover:border-cyan-300/36 hover:bg-cyan-300/16',
              )}
            >
              <Check className="h-4 w-4" />
              <span>{markingAnswered ? '处理中...' : '已回答'}</span>
            </button>
          </div>

          <span className="justify-self-end text-white/72">关心人数 {count}</span>
        </div>
      </motion.section>
    </motion.div>
  );
}

function GlobeNode({
  q,
  index,
  total,
  globalRotation,
  nowTimestamp,
  layout,
}: {
  q: Question;
  index: number;
  total: number;
  globalRotation: MotionValue<number>;
  nowTimestamp: number;
  layout: GlobeLayout;
}) {
  const {
    horizontalRadius,
    verticalRadius,
    centerYOffset,
    containerWidth,
    containerHeight,
    horizontalSafeInset,
    topSafeInset,
    bottomSafeInset,
  } = layout;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const baseAngle = index * goldenAngle;
  const yRatio = 1 - ((index + 0.5) / total) * 2;
  const latitude = Math.asin(yRatio);
  const currentRadius = Math.cos(latitude) * horizontalRadius;
  const yOffset = yRatio * verticalRadius;
  const count = q.count ?? 1;
  const metrics = getCardMetrics(count);
  const halfWidth = metrics.width / 2;
  const halfHeight = metrics.height / 2;

  const xPos = useTransform(globalRotation, (rotation) => {
    const unclamped = Math.sin(rotation + baseAngle) * currentRadius;
    const minX = -(containerWidth / 2 - horizontalSafeInset - halfWidth);
    const maxX = containerWidth / 2 - horizontalSafeInset - halfWidth;

    return `calc(-50% + ${clamp(unclamped, minX, maxX)}px)`;
  });
  const z = useTransform(globalRotation, (rotation) => Math.cos(rotation + baseAngle) * currentRadius);
  const scale = useTransform(z, (value) => (1100 + value) / 1100);
  const opacity = useTransform(z, [-horizontalRadius, horizontalRadius], [0.12, 1]);
  const zIndex = useTransform(z, (value) => Math.round(value + horizontalRadius));
  const minY = -(containerHeight / 2 - topSafeInset - halfHeight);
  const maxY = containerHeight / 2 - bottomSafeInset - halfHeight;
  const clampedY = clamp(centerYOffset + yOffset, minY, maxY);

  return (
    <motion.div
      initial={{ opacity: 0, filter: 'blur(12px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, filter: 'blur(12px)' }}
      transition={{ duration: 0.5 }}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        x: xPos,
        y: `calc(-50% + ${clampedY}px)`,
        scale,
        zIndex,
      }}
    >
      <motion.div
        style={{ opacity }}
        animate={{ y: [0, -10, 0] }}
        transition={{
          duration: 4 + (index % 4),
          repeat: Infinity,
          ease: 'easeInOut',
          delay: (index % 5) * 0.35,
        }}
      >
        <QuestionCard q={q} viewMode="globe" nowTimestamp={nowTimestamp} />
      </motion.div>
    </motion.div>
  );
}

export function BoardView({
  onOpenManagement: _onOpenManagement,
}: {
  onOpenManagement: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [highlightedQuestion, setHighlightedQuestion] = useState<Question | null>(null);
  const [incomingQueue, setIncomingQueue] = useState<Question[]>([]);
  const [sortType, setSortType] = useState<SortType>('count');
  const [viewMode, setViewMode] = useState<ViewMode>('globe');
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [loadingState, setLoadingState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [isGlobeHovered, setIsGlobeHovered] = useState(false);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [selectedTag, setSelectedTag] = useState(ALL_TAGS);
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<string[]>([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const globalRotation = useMotionValue(0);
  const isPlayingIncomingRef = useRef(false);
  const questionsRef = useRef<Question[]>([]);
  const incomingQueueRef = useRef<Question[]>([]);
  const highlightedQuestionRef = useRef<Question | null>(null);
  const questionStatusRef = useRef<Map<string, AnswerStatus>>(new Map());
  const globeContainerRef = useRef<HTMLDivElement | null>(null);
  const [globeLayout, setGlobeLayout] = useState<GlobeLayout>({
    horizontalRadius: 560,
    verticalRadius: 320,
    centerYOffset: 56,
    containerWidth: 1280,
    containerHeight: 720,
    horizontalSafeInset: 40,
    topSafeInset: 112,
    bottomSafeInset: 36,
  });

  useAnimationFrame((_time, delta) => {
    if (!isGlobeHovered && viewMode === 'globe') {
      globalRotation.set(globalRotation.get() + delta * 0.00025);
    }
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    incomingQueueRef.current = incomingQueue;
  }, [incomingQueue]);

  useEffect(() => {
    highlightedQuestionRef.current = highlightedQuestion;
  }, [highlightedQuestion]);

  function replaceQuestionSnapshots(items: Question[]) {
    questionStatusRef.current = new Map(items.map((item) => [item.id, item.answerStatus]));
    setAnsweredCount(items.filter(isAnswered).length);
  }

  function upsertQuestionSnapshot(question: Question) {
    const previousStatus = questionStatusRef.current.get(question.id);
    questionStatusRef.current.set(question.id, question.answerStatus);

    if (previousStatus === question.answerStatus) {
      return;
    }

    const wasAnswered = previousStatus !== undefined && previousStatus !== 'unanswered';
    const isNowAnswered = question.answerStatus !== 'unanswered';

    if (wasAnswered === isNowAnswered) {
      return;
    }

    setAnsweredCount((current) => current + (isNowAnswered ? 1 : -1));
  }

  function removeQuestionSnapshot(questionId: string) {
    const previousStatus = questionStatusRef.current.get(questionId);

    if (previousStatus === undefined) {
      return;
    }

    questionStatusRef.current.delete(questionId);

    if (previousStatus !== 'unanswered') {
      setAnsweredCount((current) => Math.max(0, current - 1));
    }
  }

  function syncBoardSnapshot(items: Question[], mode: 'initial' | 'refresh') {
    replaceQuestionSnapshots(items);
    const visibleItems = items.filter(isVisibleOnBoard);

    if (mode === 'initial') {
      setQuestions(visibleItems);
      setIncomingQueue([]);
      setHighlightedQuestion(null);
      setLoadingState('ready');
      setConnectionState('live');
      setErrorMessage('');
      return;
    }

    const visibleById = new Map(visibleItems.map((item) => [item.id, item]));
    const knownIds = new Set<string>([
      ...questionsRef.current.map((item) => item.id),
      ...incomingQueueRef.current.map((item) => item.id),
      ...(highlightedQuestionRef.current ? [highlightedQuestionRef.current.id] : []),
    ]);
    const newItems = visibleItems.filter((item) => !knownIds.has(item.id));

    setQuestions((previous) =>
      previous
        .filter((item) => visibleById.has(item.id))
        .map((item) => visibleById.get(item.id) ?? item),
    );
    setIncomingQueue((previous) => {
      const syncedQueue = previous
        .filter((item) => visibleById.has(item.id))
        .map((item) => visibleById.get(item.id) ?? item);
      const existingIds = new Set(syncedQueue.map((item) => item.id));

      newItems.forEach((item) => {
        if (!existingIds.has(item.id)) {
          syncedQueue.push(item);
          existingIds.add(item.id);
        }
      });

      return syncedQueue;
    });
    setHighlightedQuestion((current) => {
      if (!current) {
        return current;
      }

      return visibleById.get(current.id) ?? null;
    });
    setConnectionState('live');
    setErrorMessage('');
  }

  useEffect(() => {
    if (viewMode !== 'globe') {
      return;
    }

    const container = globeContainerRef.current;

    if (!container) {
      return;
    }

    const updateLayout = () => {
      const { width, height } = container.getBoundingClientRect();

      if (width <= 0 || height <= 0) {
        return;
      }

      setGlobeLayout(getGlobeLayout(width, height, questionsRef.current.length));
    };

    updateLayout();

    const observer = new ResizeObserver(() => {
      updateLayout();
    });

    observer.observe(container);
    window.addEventListener('resize', updateLayout);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateLayout);
    };
  }, [questions.length, viewMode]);

  useEffect(() => {
    let isCancelled = false;

    async function loadQuestions(mode: 'initial' | 'refresh') {
      if (mode === 'refresh' && !getStoredAdminToken()) {
        return;
      }

      try {
        const response = await adminFetch('/api/questions/board');
        const data = (await response.json().catch(() => null)) as {
          items?: Question[];
          message?: string;
        } | null;

        if (!response.ok) {
          throw new Error(data?.message ?? '大屏数据加载失败。');
        }

        if (!isCancelled && Array.isArray(data?.items)) {
          syncBoardSnapshot(data.items, mode);
        }
      } catch (error) {
        if (!isCancelled) {
          setConnectionState('error');
          setErrorMessage(error instanceof Error ? error.message : '大屏数据加载失败。');

          if (mode === 'initial') {
            setLoadingState('error');
          }
        }
      }
    }

    void loadQuestions('initial');
    const timer = window.setInterval(() => {
      void loadQuestions('refresh');
    }, BOARD_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (incomingQueue.length === 0 || isPlayingIncomingRef.current) {
      return;
    }

    const nextQuestion = incomingQueue[0];
    isPlayingIncomingRef.current = true;
    setHighlightedQuestion(nextQuestion);

    confetti({
      particleCount: 70,
      spread: 90,
      origin: { y: 0.55 },
      colors: ['#22d3ee', '#38bdf8', '#a855f7'],
      disableForReducedMotion: true,
      zIndex: 120,
    });

    const timer = window.setTimeout(() => {
      setQuestions((previous) => upsertQuestion(previous, nextQuestion));
      setHighlightedQuestion(null);
      setIncomingQueue((previous) =>
        previous.filter((item) => item.id !== nextQuestion.id),
      );
      isPlayingIncomingRef.current = false;
    }, HIGHLIGHT_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [incomingQueue]);

  const effectiveSortType: SortType = viewMode === 'globe' ? 'date' : sortType;

  const sortedQuestions = useMemo(() => {
    return [...questions].sort((left, right) => {
      if (effectiveSortType === 'count') {
        const countDelta = (right.count ?? 1) - (left.count ?? 1);

        if (countDelta !== 0) {
          return countDelta;
        }
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [effectiveSortType, questions]);

  const groupedQuestions = useMemo(() => {
    const groups = new Map<string, Question[]>();

    for (const question of sortedQuestions) {
      const tag = question.tag.trim() || '未分类';
      const existing = groups.get(tag);

      if (existing) {
        existing.push(question);
      } else {
        groups.set(tag, [question]);
      }
    }

    return Array.from(groups.entries()).map(([tag, items]) => ({
      tag,
      items,
      count: items.length,
      totalCare: items.reduce((sum, item) => sum + (item.count ?? 1), 0),
    }));
  }, [sortedQuestions]);

  const tagOptions = useMemo(
    () => [
      {
        tag: ALL_TAGS,
        count: sortedQuestions.length,
        totalCare: sortedQuestions.reduce((sum, item) => sum + (item.count ?? 1), 0),
      },
      ...groupedQuestions,
    ],
    [groupedQuestions, sortedQuestions],
  );

  useEffect(() => {
    if (!tagOptions.some((option) => option.tag === selectedTag)) {
      setSelectedTag(ALL_TAGS);
    }
  }, [selectedTag, tagOptions]);

  useEffect(() => {
    if (viewMode !== 'grid') {
      setFocusedQuestionId(null);
    }
  }, [viewMode]);

  const gridQuestions = useMemo(() => {
    if (selectedTag === ALL_TAGS) {
      return sortedQuestions;
    }

    return sortedQuestions.filter((question) => (question.tag.trim() || '未分类') === selectedTag);
  }, [selectedTag, sortedQuestions]);

  const focusedQuestion = useMemo(
    () => questions.find((question) => question.id === focusedQuestionId) ?? null,
    [focusedQuestionId, questions],
  );

  useEffect(() => {
    if (!focusedQuestionId) {
      return;
    }

    if (!focusedQuestion) {
      setFocusedQuestionId(null);
    }
  }, [focusedQuestion, focusedQuestionId]);

  useEffect(() => {
    if (!focusedQuestionId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFocusedQuestionId(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [focusedQuestionId]);

  async function markQuestionAnswered(questionId: string) {
    if (answeredQuestionIds.includes(questionId)) {
      return;
    }

    setAnsweredQuestionIds((previous) => [...previous, questionId]);
    setFocusedQuestionId((current) => (current === questionId ? null : current));

    try {
      const response = await adminFetch(`/api/questions/${questionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answerStatus: 'answered_live',
          displayStatus: 'archived',
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? '标记已回答失败。');
      }

      const updated = (await response.json()) as Question;

      upsertQuestionSnapshot(updated);
      if (!isVisibleOnBoard(updated)) {
        removeQuestionSnapshot(questionId);
        setQuestions((previous) => previous.filter((item) => item.id !== questionId));
      } else {
        setQuestions((previous) => upsertQuestion(previous, updated));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '标记已回答失败。');
    } finally {
      setAnsweredQuestionIds((previous) => previous.filter((item) => item !== questionId));
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-mesh font-sans text-white selection:bg-cyan-500/20">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="orb h-[36vw] w-[36vw] animate-[float_22s_infinite_alternate] bg-cyan-600/15 left-[-8%] top-[-10%]" />
        <div className="orb h-[44vw] w-[44vw] animate-[float_28s_infinite_alternate_reverse] bg-indigo-500/16 bottom-[-18%] right-[-10%]" />
        <div className="orb h-[30vw] w-[30vw] animate-[float_32s_infinite_alternate] bg-sky-500/12 left-[42%] top-[42%]" />
      </div>

      <header className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-start justify-between px-8 pb-8 pt-4">
        <div>
          <h1 className="text-5xl font-black leading-[0.92] tracking-tight text-white drop-shadow-[0_0_18px_rgba(34,211,238,0.22)] xl:text-6xl">
            问政税务
          </h1>
        </div>

        <div className="pointer-events-auto absolute left-1/2 top-8 -translate-x-1/2">
          <div className="relative flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/6 p-1.5 backdrop-blur-md">
              <button
                className={cn(
                  'rounded-xl p-2 transition-all',
                  viewMode === 'grid'
                    ? 'bg-white/12 text-white shadow-[0_0_16px_rgba(255,255,255,0.15)]'
                    : 'text-white/50 hover:bg-white/6 hover:text-white/80',
                )}
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <Grid2X2 className="h-5 w-5" />
              </button>
              <button
                className={cn(
                  'rounded-xl p-2 transition-all',
                  viewMode === 'globe'
                    ? 'bg-white/12 text-white shadow-[0_0_16px_rgba(255,255,255,0.15)]'
                    : 'text-white/50 hover:bg-white/6 hover:text-white/80',
                )}
                onClick={() => setViewMode('globe')}
                title="Globe View"
              >
                <Globe className="h-5 w-5" />
              </button>
            </div>

            <div
              className={cn(
                'absolute left-full ml-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/6 p-1.5 backdrop-blur-md transition-all duration-300',
                viewMode === 'grid'
                  ? 'pointer-events-auto translate-x-0 opacity-100'
                  : 'pointer-events-none translate-x-[-12px] opacity-0',
              )}
            >
              <button
                className={cn(
                  'min-w-[4.5rem] whitespace-nowrap rounded-xl px-5 py-2 text-sm font-semibold transition-all',
                  sortType === 'count'
                    ? 'bg-white/12 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.12)]'
                    : 'text-white/50 hover:bg-white/6 hover:text-white/80',
                )}
                onClick={() => setSortType('count')}
                tabIndex={viewMode === 'grid' ? 0 : -1}
              >
                关注度
              </button>
              <button
                className={cn(
                  'min-w-[4.5rem] whitespace-nowrap rounded-xl px-5 py-2 text-sm font-semibold transition-all',
                  sortType === 'date'
                    ? 'bg-white/12 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.12)]'
                    : 'text-white/50 hover:bg-white/6 hover:text-white/80',
                )}
                onClick={() => setSortType('date')}
                tabIndex={viewMode === 'grid' ? 0 : -1}
              >
                最新
              </button>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div
            className={cn(
              'mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] backdrop-blur-md',
              connectionState === 'live'
                ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
                : connectionState === 'connecting'
                  ? 'border-white/10 bg-white/8 text-white/70'
                  : 'border-amber-300/20 bg-amber-300/10 text-amber-100',
            )}
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                connectionState === 'live'
                  ? 'bg-cyan-300'
                  : connectionState === 'connecting'
                    ? 'bg-white/50'
                    : 'bg-amber-300',
              )}
            />
            {connectionState === 'live'
              ? '实时同步中'
              : connectionState === 'connecting'
                ? '连接中'
                : '连接异常'}
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-5xl font-mono font-black text-white">{questions.length}</p>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/45">Visible Questions</p>
            </div>
            <div className="border-t border-white/8 pt-3">
              <p className="text-4xl font-mono font-black text-cyan-100">{answeredCount}</p>
              <p className="text-[11px] font-bold tracking-[0.24em] text-cyan-100/52">ANSWERED</p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 h-screen w-full">
        {loadingState === 'loading' ? (
          <div className="flex h-full items-center justify-center px-8 pb-12 pt-32">
            <div className="rounded-3xl border border-white/10 bg-white/6 px-8 py-6 text-white/75 backdrop-blur-md">
              正在加载大屏数据...
            </div>
          </div>
        ) : loadingState === 'error' ? (
          <div className="flex h-full items-center justify-center px-8 pb-12 pt-32">
            <div className="max-w-xl rounded-3xl border border-amber-300/15 bg-amber-300/8 px-8 py-6 text-center text-amber-50 backdrop-blur-md">
              <h2 className="mb-2 text-2xl font-bold">大屏暂时不可用</h2>
              <p className="text-sm leading-7 text-amber-50/80">{errorMessage}</p>
            </div>
          </div>
        ) : sortedQuestions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-8 pb-12 pt-32">
            <div className="max-w-xl rounded-[2rem] border border-white/10 bg-white/6 px-10 py-10 text-center backdrop-blur-md">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-300/12 text-cyan-200">
                <Sparkles className="h-7 w-7" />
              </div>
              <h2 className="mb-3 text-3xl font-bold text-white">等待新问题进入现场</h2>
              <p className="text-base leading-8 text-white/68">
                新提交的问题会直接出现在这里，归档后会从大屏移出。
              </p>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <motion.div
            layout
            className="mx-auto h-full max-w-[1760px] overflow-y-auto px-8 pb-12 pt-32"
          >
            <div className="space-y-8 pb-8">
              {groupedQuestions.length > 0 ? (
                <div className="sticky top-0 z-10 -mx-2 overflow-x-auto px-2 pb-2 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex min-w-max items-center gap-3">
                    {tagOptions.map((option) => {
                      const active = option.tag === selectedTag;

                      return (
                        <button
                          key={option.tag}
                          type="button"
                          onClick={() => setSelectedTag(option.tag)}
                          className={cn(
                            'inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm transition',
                            active
                              ? 'border-cyan-300/26 bg-cyan-300/12 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]'
                              : 'border-white/10 bg-white/6 text-white/58 hover:border-white/18 hover:bg-white/8 hover:text-white/78',
                          )}
                        >
                          <span className="font-semibold">{option.tag}</span>
                          <span className={cn('text-xs', active ? 'text-cyan-100/72' : 'text-white/40')}>
                            {option.count} 条
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <motion.div layout className="flex flex-wrap gap-8">
                <AnimatePresence mode="popLayout">
                  {gridQuestions.map((question) => (
                    <QuestionCard
                      key={question.id}
                      q={question}
                      viewMode="grid"
                      nowTimestamp={nowTimestamp}
                      onClick={() => setFocusedQuestionId(question.id)}
                      focused={focusedQuestionId === question.id}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <div
            ref={globeContainerRef}
            className="absolute inset-x-8 top-0 bottom-12 min-h-[34rem]"
            onMouseEnter={() => setIsGlobeHovered(true)}
            onMouseLeave={() => setIsGlobeHovered(false)}
          >
            <AnimatePresence>
              {sortedQuestions.map((question, index) => (
                <GlobeNode
                  key={question.id}
                  q={question}
                  index={index}
                  total={sortedQuestions.length}
                  globalRotation={globalRotation}
                  nowTimestamp={nowTimestamp}
                  layout={globeLayout}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <AnimatePresence>
        {focusedQuestion && viewMode === 'grid' ? (
          <FocusedQuestionOverlay
            question={focusedQuestion}
            nowTimestamp={nowTimestamp}
            onClose={() => setFocusedQuestionId(null)}
            onMarkAnswered={() => void markQuestionAnswered(focusedQuestion.id)}
            markingAnswered={answeredQuestionIds.includes(focusedQuestion.id)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {highlightedQuestion ? (
          <motion.div
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(18px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/32"
          >
            <motion.section
              initial={{ scale: 0.6, y: 80, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0, filter: 'blur(20px)' }}
              transition={{ type: 'spring', stiffness: 180, damping: 22 }}
              className="glass-card relative w-[92vw] max-w-5xl overflow-hidden rounded-[3rem] border border-cyan-300/25 p-14 text-left shadow-[0_0_90px_rgba(34,211,238,0.15)]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/8 via-transparent to-blue-500/8" />
              <div className="relative z-10 mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100">
                <Sparkles className="h-4 w-4" />
                新问题进入现场
              </div>

              <h2 className="relative z-10 mb-10 text-5xl font-bold leading-tight text-white drop-shadow-2xl">
                “{highlightedQuestion.text}”
              </h2>

              <div className="relative z-10 flex items-center justify-start gap-3 text-sm text-white/80">
                <span className="rounded-full border border-cyan-300/18 bg-cyan-300/10 px-4 py-2">
                  {getQuestionTagLabel(highlightedQuestion)}
                </span>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
