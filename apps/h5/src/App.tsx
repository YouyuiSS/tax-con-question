import { useMemo, useState } from 'react';

type QuestionRoute = 'meeting_only' | 'public_discuss';

type SubmissionState = 'form' | 'confirm' | 'success';

type RouteMeta = {
  title: string;
  shortTitle: string;
  description: string;
  successBody: string;
};

const ROUTE_META: Record<QuestionRoute, RouteMeta> = {
  meeting_only: {
    title: '会上公开',
    shortTitle: '会上公开',
    description: '会前不公开，大会现场统一展示并答复。',
    successBody: '你的问题会在大会前保留不公开，并视安排在会上展示。',
  },
  public_discuss: {
    title: '公开讨论',
    shortTitle: '公开讨论',
    description: '审核后进入公开问题池，适合希望提前公开讨论的问题。',
    successBody: '你的问题将在审核后进入公开问题池。',
  },
};

const MIN_LENGTH = 10;
const MAX_LENGTH = 500;

function getValidationMessage(text: string): string {
  const trimmedLength = text.trim().length;

  if (trimmedLength === 0) {
    return '请输入你希望被回应的问题。';
  }

  if (trimmedLength < MIN_LENGTH) {
    return `至少写 ${MIN_LENGTH} 个字，方便会务整理。`;
  }

  if (text.length > MAX_LENGTH) {
    return `问题请控制在 ${MAX_LENGTH} 字以内。`;
  }

  return '';
}

export default function App() {
  const [text, setText] = useState('');
  const [route, setRoute] = useState<QuestionRoute>('meeting_only');
  const [submissionState, setSubmissionState] = useState<SubmissionState>('form');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [submittedRoute, setSubmittedRoute] = useState<QuestionRoute>('meeting_only');

  const validationMessage = useMemo(() => getValidationMessage(text), [text]);
  const canContinue = validationMessage === '';

  async function submitQuestion(): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          route,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? '提交失败，请稍后再试。');
      }

      setSubmittedRoute(route);
      setSubmissionState('success');
      setText('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '提交失败，请稍后再试。',
      );
      setSubmissionState('form');
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm(): void {
    setSubmissionState('form');
    setErrorMessage('');
  }

  return (
    <div className="page-shell">
      <main className="phone-frame">
        {submissionState === 'success' ? (
          <section className="success-panel">
            <div className="success-badge">已收到</div>
            <h1>提交成功</h1>
            <p>{ROUTE_META[submittedRoute].successBody}</p>
            <p className="success-note">提交后将进入会务整理流程。</p>
            <button className="primary-button" onClick={resetForm}>
              继续提问
            </button>
          </section>
        ) : (
          <>
            <header className="page-header">
              <p className="eyebrow">全员大会提问</p>
              <h1>匿名提问</h1>
              <p className="subtitle">
                写下你希望在大会上被回应的问题。默认会上公开，会前不公开。
              </p>
            </header>

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
                <span className={validationMessage ? 'hint error' : 'hint'}>
                  {validationMessage || '尽量描述问题本身，避免填写可识别细节。'}
                </span>
                <span className="count">{text.length} / {MAX_LENGTH}</span>
              </div>
            </section>

            <section className="route-section">
              <div className="section-heading">
                <h2 className="section-title">处理方式</h2>
                <span className="route-caption">提交前可再确认</span>
              </div>
              <div className="route-list">
                {(Object.entries(ROUTE_META) as [QuestionRoute, RouteMeta][]).map(
                  ([key, meta]) => (
                    <button
                      key={key}
                      type="button"
                      className={key === route ? 'route-card selected' : 'route-card'}
                      onClick={() => setRoute(key)}
                    >
                      <div className="route-card-head">
                        <strong>{meta.title}</strong>
                        {key === 'meeting_only' ? (
                          <span className="route-badge">默认</span>
                        ) : null}
                      </div>
                      <p>{meta.description}</p>
                    </button>
                  ),
                )}
              </div>
            </section>

            <section className="trust-strip">
              <span>会前默认不公开</span>
              <span>原始问题不会被改写</span>
            </section>

            {errorMessage ? <div className="submit-error">{errorMessage}</div> : null}

            <footer className="action-footer">
              <button
                className="primary-button"
                disabled={!canContinue || isSubmitting}
                onClick={() => setSubmissionState('confirm')}
              >
                {isSubmitting ? '提交中...' : '继续'}
              </button>
            </footer>
          </>
        )}
      </main>

      {submissionState === 'confirm' ? (
        <div className="modal-root" role="presentation">
          <div className="modal-scrim" onClick={resetForm} />
          <section className="bottom-sheet" aria-modal="true" role="dialog">
            <div className="sheet-handle" />
            <p className="eyebrow">确认处理方式</p>
            <h2>确认{ROUTE_META[route].shortTitle}？</h2>
            <p className="sheet-body">{ROUTE_META[route].description}</p>
            <p className="sheet-note">提交后将进入会务整理流程。</p>
            <div className="sheet-actions">
              <button className="secondary-button" onClick={resetForm}>
                返回修改
              </button>
              <button
                className="primary-button"
                disabled={isSubmitting}
                onClick={submitQuestion}
              >
                {isSubmitting ? '提交中...' : '确认提交'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
