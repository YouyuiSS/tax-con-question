const ADMIN_TOKEN_STORAGE_KEY = 'tcq_admin_token';
const ADMIN_ACTOR_STORAGE_KEY = 'tcq_admin_actor';
const DEFAULT_ADMIN_ACTOR = 'shared_admin_token';

function promptForAdminToken(message: string): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.prompt(message)?.trim() ?? '';
}

function promptForAdminActor(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_ADMIN_ACTOR;
  }

  return (
    window.prompt('请输入本次管理操作记录名（用于审计日志，可填姓名、缩写或角色名）。留空将记为共享管理员。')
      ?.trim()
    || DEFAULT_ADMIN_ACTOR
  );
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

export function getStoredAdminActor(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_ADMIN_ACTOR;
  }

  return window.sessionStorage.getItem(ADMIN_ACTOR_STORAGE_KEY)?.trim() || '';
}

export function setStoredAdminActor(actor: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = actor.trim() || DEFAULT_ADMIN_ACTOR;
  window.sessionStorage.setItem(ADMIN_ACTOR_STORAGE_KEY, normalized);
}

export function clearStoredAdminToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}

function ensureAdminActor(): string {
  const stored = getStoredAdminActor();

  if (stored) {
    return stored;
  }

  const entered = promptForAdminActor();
  setStoredAdminActor(entered);
  return entered;
}

function ensureAdminToken(forcePrompt = false): string {
  const stored = getStoredAdminToken();

  if (!forcePrompt && stored) {
    return stored;
  }

  const message = forcePrompt
    ? '管理员令牌无效，请重新输入。'
    : '请输入管理员令牌以继续管理操作。';
  const entered = promptForAdminToken(message);

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
    headers.set('X-Admin-Actor', ensureAdminActor());

    return fetch(input, {
      ...init,
      headers,
    });
  };

  const token = ensureAdminToken();

  if (!token) {
    throw new Error('需要先输入管理员令牌。');
  }

  let response = await requestWithToken(token);

  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  clearStoredAdminToken();

  const retryToken = ensureAdminToken(true);

  if (!retryToken) {
    throw new Error('管理员令牌无效，请重新输入后再试。');
  }

  response = await requestWithToken(retryToken);

  if (response.status === 401 || response.status === 403) {
    clearStoredAdminToken();
  }

  return response;
}
