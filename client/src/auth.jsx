import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from './api';

const AuthContext = createContext(null);
const TOKEN_KEY = 'oep_token';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    authApi.me(token)
      .then(setUser)
      .catch(() => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null); })
      .finally(() => setLoading(false));
  }, [token]);

  const signIn = useCallback(async (email, password) => {
    const result = await authApi.login(email, password);
    sessionStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
    const profile = await authApi.me(result.token);
    setUser(profile);
    return profile;
  }, []);

  const value = useMemo(() => ({
    token,
    user,
    loading,
    signIn,
    async signUp(name, email, password) {
      await authApi.register(name, email, password);
      return signIn(email, password);
    },
    signOut() {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    },
  }), [token, user, loading, signIn]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
