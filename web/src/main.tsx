import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import PresellPage from './pages/PresellPage';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import ClientDashboard from './pages/ClientDashboard';
import './index.css';

// ─── Rotas Protegidas ─────────────────────────────────────────────────────

function RequireAuth({ children, role }: { children: React.ReactElement; role?: 'ADMIN' | 'CLIENT' }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="text-slate-400 text-sm font-mono animate-pulse">Autenticando...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    // Admin tentando acessar /dashboard → redireciona para /admin
    if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
    // Cliente tentando acessar /admin → redireciona para /dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function AppRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="text-slate-400 text-sm font-mono animate-pulse">Carregando MarketFlow Pro...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Pre-sell / Apresentação Institucional */}
        <Route path="/" element={<PresellPage />} />
        <Route path="/presell" element={<PresellPage />} />

        {/* Login — redireciona se já autenticado */}
        <Route
          path="/login"
          element={
            user
              ? <Navigate to={user.role === 'ADMIN' ? '/admin' : '/dashboard'} replace />
              : <LoginPage />
          }
        />

        {/* Admin Dashboard */}
        <Route
          path="/admin/*"
          element={
            <RequireAuth role="ADMIN">
              <AdminDashboard />
            </RequireAuth>
          }
        />

        {/* Client Dashboard */}
        <Route
          path="/dashboard/*"
          element={
            <RequireAuth role="CLIENT">
              <ClientDashboard />
            </RequireAuth>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  </React.StrictMode>
);
