const ADMIN_TOKEN_STORAGE_KEY = 'tcq_admin_token';
let pendingAdminTokenPrompt: Promise<string> | null = null;

type AdminPromptOptions = {
  title: string;
  description: string;
  inputType: 'text' | 'password';
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

function openAdminPrompt(options: AdminPromptOptions): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve('');
  }

  return new Promise((resolve) => {
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const overlay = document.createElement('div');
    const dialog = document.createElement('div');
    const title = document.createElement('h2');
    const description = document.createElement('p');
    const form = document.createElement('form');
    const input = document.createElement('input');
    const actions = document.createElement('div');
    const cancelButton = document.createElement('button');
    const confirmButton = document.createElement('button');

    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:24px',
      'background:rgba(2,6,23,0.72)',
      'backdrop-filter:blur(10px)',
    ].join(';');

    dialog.style.cssText = [
      'width:min(100%,420px)',
      'border:1px solid rgba(148,163,184,0.22)',
      'border-radius:24px',
      'background:linear-gradient(180deg, rgba(15,23,42,0.98), rgba(15,23,42,0.94))',
      'box-shadow:0 24px 80px rgba(15,23,42,0.45)',
      'padding:24px',
      'color:#e2e8f0',
      'font-family:Inter, ui-sans-serif, system-ui, sans-serif',
    ].join(';');

    title.textContent = options.title;
    title.style.cssText = 'margin:0;font-size:20px;font-weight:700;line-height:1.4;color:#f8fafc;';

    description.textContent = options.description;
    description.style.cssText = 'margin:10px 0 0;font-size:14px;line-height:1.7;color:rgba(226,232,240,0.74);';

    form.style.cssText = 'margin-top:20px;';

    input.type = options.inputType;
    input.value = options.defaultValue ?? '';
    input.placeholder = options.placeholder ?? '';
    input.setAttribute(
      'autocomplete',
      options.inputType === 'password' ? 'current-password' : 'off',
    );
    input.setAttribute('aria-label', options.title);
    input.style.cssText = [
      'width:100%',
      'box-sizing:border-box',
      'border:1px solid rgba(148,163,184,0.24)',
      'border-radius:16px',
      'background:rgba(15,23,42,0.72)',
      'padding:14px 16px',
      'font-size:15px',
      'line-height:1.5',
      'color:#f8fafc',
      'outline:none',
    ].join(';');

    actions.style.cssText = 'margin-top:18px;display:flex;justify-content:flex-end;gap:12px;';

    cancelButton.type = 'button';
    cancelButton.textContent = options.cancelLabel ?? '取消';
    cancelButton.style.cssText = [
      'border:1px solid rgba(148,163,184,0.24)',
      'border-radius:14px',
      'background:rgba(15,23,42,0.58)',
      'padding:10px 16px',
      'font-size:14px',
      'color:#cbd5e1',
      'cursor:pointer',
    ].join(';');

    confirmButton.type = 'submit';
    confirmButton.textContent = options.confirmLabel ?? '确认';
    confirmButton.style.cssText = [
      'border:0',
      'border-radius:14px',
      'background:linear-gradient(135deg, #22c55e, #06b6d4)',
      'padding:10px 16px',
      'font-size:14px',
      'font-weight:600',
      'color:#082f49',
      'cursor:pointer',
    ].join(';');

    let settled = false;

    const cleanup = (value: string) => {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      previousActiveElement?.focus();
      resolve(value.trim());
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup('');
      }
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      cleanup(input.value);
    });

    cancelButton.addEventListener('click', () => {
      cleanup('');
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup('');
      }
    });

    actions.append(cancelButton, confirmButton);
    form.append(input, actions);
    dialog.append(title, description, form);
    overlay.append(dialog);
    document.body.append(overlay);
    window.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

async function promptForAdminToken(message: string): Promise<string> {
  if (pendingAdminTokenPrompt) {
    return pendingAdminTokenPrompt;
  }

  pendingAdminTokenPrompt = openAdminPrompt({
    title: '输入管理员令牌',
    description: message,
    inputType: 'password',
    placeholder: '请输入 ADMIN_TOKEN',
    confirmLabel: '继续',
  }).finally(() => {
    pendingAdminTokenPrompt = null;
  });

  return pendingAdminTokenPrompt;
}

export function getStoredAdminToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? '';
}

export function setStoredAdminToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = token.trim();

  if (!normalized) {
    window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, normalized);
}

export function clearStoredAdminToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}

async function ensureAdminToken(forcePrompt = false): Promise<string> {
  const stored = getStoredAdminToken();

  if (!forcePrompt && stored) {
    return stored;
  }

  const message = forcePrompt
    ? '管理员令牌无效，请重新输入。'
    : '请输入管理员令牌以继续管理操作。';
  const entered = await promptForAdminToken(message);

  if (!entered) {
    return '';
  }

  setStoredAdminToken(entered);
  return entered;
}

export async function adminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const requestWithToken = async (token: string): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);

    return fetch(input, {
      ...init,
      headers,
    });
  };

  const token = await ensureAdminToken();

  if (!token) {
    throw new Error('需要先输入管理员令牌。');
  }

  let response = await requestWithToken(token);

  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  clearStoredAdminToken();

  const retryToken = await ensureAdminToken(true);

  if (!retryToken) {
    throw new Error('管理员令牌无效，请重新输入后再试。');
  }

  response = await requestWithToken(retryToken);

  if (response.status === 401 || response.status === 403) {
    clearStoredAdminToken();
  }

  return response;
}
