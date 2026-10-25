// FOUNDATION (maintained by Member 1). Provides the logged-in user to the whole app.
//   const { user, isAdmin, isVerifiedLender, login, logout, refreshUser } = useAuth();
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth.api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await authApi.me();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  // login/logout call Member 1's endpoints; the UI forms live in pages/auth/*
  const login = useCallback(async (username, password) => {
    const { user } = await authApi.login({ username, password });
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user, setUser, loading, refreshUser, login, logout,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isMember: user?.role === 'member',
    isVerifiedLender: user?.role === 'member' && user?.lenderStatus === 'verified',
  }), [user, loading, refreshUser, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
