export const AUTH_EXPIRED_LOGIN_MESSAGE = 'Сессия истекла. Войдите заново.';

const AUTH_SESSION_STORAGE_KEY = 'asterisk_cdr_session';
const AUTH_EXPIRED_EVENT_NAME = 'pbxpuls:auth-expired';

let authExpiredHandled = false;
let fetchInterceptorInstalled = false;
let originalFetch: typeof fetch | null = null;

function isAuthLoginRequest(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname === '/api/auth/login';
  } catch {
    return String(url).includes('/api/auth/login');
  }
}

export function clearStoredAuthSession() {
  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function resetAuthExpiredHandled() {
  authExpiredHandled = false;
}

export function markAuthExpiredHandled(): boolean {
  if (authExpiredHandled) return false;
  authExpiredHandled = true;
  clearStoredAuthSession();
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT_NAME));
  return true;
}

export function handleAuthExpiredResponse(response?: Response): boolean {
  if (response && response.status !== 401) return false;
  return markAuthExpiredHandled();
}

export function addAuthExpiredListener(listener: () => void): () => void {
  window.addEventListener(AUTH_EXPIRED_EVENT_NAME, listener);
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT_NAME, listener);
}

export function installAuthExpiredFetchInterceptor() {
  if (fetchInterceptorInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return;

  fetchInterceptorInstalled = true;
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch!(input, init);
    if (response.status === 401 && !isAuthLoginRequest(input)) {
      handleAuthExpiredResponse(response);
    }
    return response;
  };
}
