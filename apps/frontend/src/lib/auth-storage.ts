import { User } from '../types/models';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';
const USER_ID_KEY = 'user.id';
const USER_EMAIL_KEY = 'user.email';
const USER_ROLE_KEY = 'user.role';

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? localStorage.getItem('token');
}

export function setAccessToken(token: string | null) {
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    localStorage.removeItem('token');
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem('token');
  }
}

export function setRefreshToken(token?: string | null) {
  if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
  else localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function setStoredUser(user: User | null) {
  if (!user) {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
    localStorage.removeItem(USER_ROLE_KEY);
    return;
  }

  const userId = user.id ?? user.sub ?? '';
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(USER_ID_KEY, userId);
  localStorage.setItem(USER_EMAIL_KEY, user.email);
  localStorage.setItem(USER_ROLE_KEY, user.role);
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}

export function isAdmin() {
  return isAuthenticated() && localStorage.getItem(USER_ROLE_KEY) === 'ADMIN';
}

export function logout() {
  setAccessToken(null);
  setRefreshToken(null);
  setStoredUser(null);
}
