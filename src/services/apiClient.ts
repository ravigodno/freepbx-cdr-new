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

function getRequestAuthorization(input: RequestInfo | URL, init?: RequestInit): string {
  const fromInit = init?.headers;

  if (fromInit instanceof Headers) {
    return fromInit.get('Authorization') || fromInit.get('authorization') || '';
  }

  if (Array.isArray(fromInit)) {
    const found = fromInit.find(([key]) => String(key).toLowerCase() === 'authorization');
    return found ? String(found[1] || '') : '';
  }

  if (fromInit && typeof fromInit === 'object') {
    const obj = fromInit as Record<string, any>;
    return String(obj.Authorization || obj.authorization || '');
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.headers.get('Authorization') || input.headers.get('authorization') || '';
  }

  return '';
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

  const interceptorFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const authHeader = getRequestAuthorization(input, init);
    const hadBearerToken = /^Bearer\s+\S+/i.test(authHeader);

    const response = await originalFetch!(input, init);

    // Do not drop the user to login on random/public 401 responses.
    // Only expire session when the failed request actually used a Bearer token.
    if (
      response.status === 401 &&
      hadBearerToken &&
      !isAuthLoginRequest(input)
    ) {
      handleAuthExpiredResponse(response);
    }

    return response;
  };

  try {
    window.fetch = interceptorFetch;
  } catch (e) {
    try {
      Object.defineProperty(window, 'fetch', {
        value: interceptorFetch,
        configurable: true,
        writable: true,
        enumerable: true
      });
    } catch (err) {
      console.warn("Could not intercept window.fetch: property is read-only in this environment.", err);
    }
  }
}
