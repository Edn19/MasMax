import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { api, postJson } from './api';
import {
  getAccessToken,
  logout as clearSession,
  setAccessToken,
  setRefreshToken,
  setStoredUser,
} from './auth-storage';
import { User } from '../types/models';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    api<User>('/auth/me')
      .then((currentUser) => {
        setUser(currentUser);
        setStoredUser(currentUser);
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const result = await postJson<{
          accessToken?: string;
          token?: string;
          refreshToken?: string;
          user: User;
        }>('/auth/login', { email, password });
        const accessToken = result.accessToken ?? result.token;
        if (!accessToken) throw new Error('El servidor no devolvio un token de acceso.');
        setAccessToken(accessToken);
        setRefreshToken(result.refreshToken);
        setStoredUser(result.user);
        setUser(result.user);
        return result.user;
      },
      async register(name, email, password) {
        const result = await postJson<{ accessToken?: string; token?: string; user: User }>('/auth/register', { name, email, password });
        const accessToken = result.accessToken ?? result.token;
        if (!accessToken) throw new Error('El servidor no devolvio un token de acceso.');
        setAccessToken(accessToken);
        setStoredUser(result.user);
        setUser(result.user);
      },
      logout() {
        clearSession();
        setUser(null);
      },
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
