import { LockKeyhole, LogOut } from 'lucide-react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isAuthenticated } from '../lib/auth-storage';
import { LoadingBlock } from './Layout';

function SessionLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4">
      <LoadingBlock label="Validando sesion" />
    </main>
  );
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return <SessionLoading />;
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function AdminRoute() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) return <SessionLoading />;
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (!user) return <Navigate to="/login" replace />;

  if (user.role !== 'ADMIN') {
    return (
      <main className="grid min-h-screen place-items-center bg-ink px-4 text-slate-100">
        <section className="w-full max-w-md rounded-3xl border border-line bg-panel/90 p-8 text-center shadow-glow">
          <LockKeyhole className="mx-auto text-coral" size={44} />
          <h1 className="mt-5 text-3xl font-black text-white">Acceso denegado</h1>
          <p className="mt-3 text-slate-400">Tu cuenta no tiene permisos para entrar al panel administrativo.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              className="rounded-xl bg-brand px-5 py-3 font-bold text-ink hover:bg-white"
              onClick={() => navigate('/home')}
            >
              Volver al inicio
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-5 py-3 font-bold text-slate-200 hover:border-coral"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              <LogOut size={18} /> Cerrar sesion
            </button>
          </div>
        </section>
      </main>
    );
  }

  return <Outlet />;
}
