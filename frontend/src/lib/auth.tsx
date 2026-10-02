'use client';
/* F1-F3: kirish holati va ruxsatlar (P1-P10). Backend ham har so'rovda ruxsatni tekshiradi. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken, type User } from './api';
import { useI18n } from './i18n';

export type Perm = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9' | 'P10' | 'P11';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login(login: string, password: string): Promise<User>;
  logout(): void;
  refresh(): Promise<void>;
  can(p: Perm): boolean;
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true, login: async () => { throw new Error('no provider'); }, logout: () => undefined, refresh: async () => undefined, can: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { setLang } = useI18n();

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      const u = await api.me();
      setUser(u);
      if (u.lang) setLang(u.lang);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [setLang]);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (l: string, p: string) => {
    const r = await api.login(l, p);
    setToken(r.token);
    setUser(r.user);
    if (r.user.lang) setLang(r.user.lang);
    return r.user;
  }, [setLang]);

  const logout = useCallback(() => { setToken(null); setUser(null); location.href = '/login'; }, []);
  const can = useCallback((p: Perm) => !!user && user.permissions.indexOf(p) >= 0, [user]);

  return <Ctx.Provider value={{ user, loading, login, logout, refresh, can }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
