// FOUNDATION (maintained by Member 1). Provides the logged-in user to the whole app.
//   const { user, isAdmin, isVerifiedLender, login, logout, refreshUser } = useAuth();
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  // login/logout call Member 1's endpoints; the UI forms live in pages/auth/*
  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally { setUser(null); }
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
