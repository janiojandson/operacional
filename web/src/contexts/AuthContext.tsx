import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'CLIENT';
  clientId?: string;
  name?: string;
  whatsapp?: string;
  whatsappValidado?: boolean;
  planActive?: boolean;
  planType?: string;
  planExpiresAt?: number | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, password: string, whatsapp: string, confirmPassword?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAdmin: boolean;
  isClient: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restaurar sessão do localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('mfp_token');
    const savedUser = localStorage.getItem('mfp_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('mfp_token');
        localStorage.removeItem('mfp_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Erro ao fazer login.' };

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('mfp_token', data.token);
      localStorage.setItem('mfp_user', JSON.stringify(data.user));

      return { success: true };
    } catch (err) {
      return { success: false, error: 'Erro de conexão com o servidor.' };
    }
  };

  const signup = async (name: string, email: string, password: string, whatsapp: string, confirmPassword?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, confirmPassword: confirmPassword || password, whatsapp })
      });

      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Erro ao cadastrar conta.' };

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('mfp_token', data.token);
      localStorage.setItem('mfp_user', JSON.stringify(data.user));

      return { success: true };
    } catch (err) {
      return { success: false, error: 'Erro de conexão com o servidor.' };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('mfp_token');
    localStorage.removeItem('mfp_user');
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      login,
      signup,
      logout,
      isAdmin: user?.role === 'ADMIN',
      isClient: user?.role === 'CLIENT'
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}

// Helper: adicionar token nas requisições fetch
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('mfp_token');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    localStorage.removeItem('mfp_token');
    localStorage.removeItem('mfp_user');
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login?expired=1';
    }
  }

  return res;
}

