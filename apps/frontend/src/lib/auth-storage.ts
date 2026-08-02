import { User } from '../types/models';

let accessToken: string | null = null;
const USER_KEY = 'user';

export function getAccessToken() { return accessToken; }
export function setAccessToken(token: string | null) { accessToken = token; localStorage.removeItem('accessToken'); localStorage.removeItem('token'); }
export function setRefreshToken(_token?: string | null) { localStorage.removeItem('refreshToken'); }
export function getStoredUser(): User | null { try { const value = localStorage.getItem(USER_KEY); return value ? JSON.parse(value) as User : null; } catch { return null; } }
export function setStoredUser(user: User | null) { if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); else localStorage.removeItem(USER_KEY); localStorage.removeItem('user.id'); localStorage.removeItem('user.email'); localStorage.removeItem('user.role'); }
export function isAuthenticated() { return Boolean(accessToken); }
export function isAdmin() { return getStoredUser()?.role === 'ADMIN' && isAuthenticated(); }
export function logout() { setAccessToken(null); setRefreshToken(null); setStoredUser(null); }
