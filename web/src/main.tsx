import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './index.css';

// Code-splitting (React.lazy): páginas carregadas sob demanda para reduzir o bundle inicial
const PresellPage = React.lazy(() => import('./pages/PresellPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const ClientDashboard = React.lazy(() => import('./pages/ClientDashboard'));
const TradingTerminal = React.lazy(() => import('./pages/TradingTerminal'));

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
      <React.Suspense fallback={<div className="h-screen w-screen bg-background flex items-center justify-center font-mono text-xs text-slate-400">Carregando...</div>}>
      <Routes>
        {/* Pre-sell / Apresentação Institucional */}
        <Route path="/" element={<PresellPage />} />
        <Route path="/presell" element={<PresellPage />} />
        <Route path="/terminal" element={<TradingTerminal />} />

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
      </React.Suspense>
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
