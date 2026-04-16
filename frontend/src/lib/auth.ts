/**
 * Auth token helpers for ShieldPay
 * Stores JWT and user in localStorage.
 */

const TOKEN_KEY = 'shieldpay_token';
const USER_KEY  = 'shieldpay_user';

export const setToken  = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const getToken  = (): string | null => localStorage.getItem(TOKEN_KEY);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const setUser  = (user: Record<string, unknown>) => localStorage.setItem(USER_KEY, JSON.stringify(user));
export const getUser  = (): Record<string, unknown> | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
export const clearUser = () => localStorage.removeItem(USER_KEY);

export const clearAuth = () => { clearToken(); clearUser(); };

export const isLoggedIn = (): boolean => !!getToken();

/** Build Authorization header for fetch calls */
export const authHeaders = (): HeadersInit => {
  const token = getToken();
  return token
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
};
