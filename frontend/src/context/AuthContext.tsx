import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TOKEN_KEY, USER_KEY } from '../api/client';
import { fetchMe, loginRequest } from '../api/resources';
import type { Role, User } from '../api/types';

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  /** true while a stored token is being validated on first load */
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  roleInTeam: (teamId: string) => Role | undefined;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(readStoredUser);
  const [initializing, setInitializing] = useState<boolean>(() => !!localStorage.getItem(TOKEN_KEY));

  // Validate stored token + refresh memberships on app load
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        localStorage.setItem(USER_KEY, JSON.stringify(me));
      })
      .catch(() => {
        /* 401 is handled by the axios interceptor */
      })
      .finally(() => !cancelled && setInitializing(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginRequest(email, password);
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const roleInTeam = useCallback(
    (teamId: string) => user?.memberships.find((m) => m.teamId === teamId)?.role,
    [user]
  );

  const value = useMemo(
    () => ({ user, token, initializing, login, logout, roleInTeam }),
    [user, token, initializing, login, logout, roleInTeam]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
