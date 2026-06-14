import { Film, Heart, LogOut, Search, ShieldCheck, UserCircle } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from '../lib/auth';
import { useSiteSettings } from '../lib/site-settings';

export function PublicLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const settings = useSiteSettings();

  return (
    <div className="min-h-screen text-slate-100">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/home" className="flex items-center gap-3 text-lg font-black tracking-wide text-white">
            {settings.logo ? (
              <img src={settings.logo} alt={settings.siteName} className="h-10 w-10 rounded-lg object-contain" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-ink"><Film size={22} /></span>
            )}
            {settings.siteName}
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-slate-300 lg:flex">
            <NavLink to="/home" className={({ isActive }) => (isActive ? 'text-brand' : 'hover:text-white')}>
              Inicio
            </NavLink>
            <NavLink to="/series" className={({ isActive }) => (isActive ? 'text-brand' : 'hover:text-white')}>Series</NavLink>
            <NavLink to="/movies" className={({ isActive }) => (isActive ? 'text-brand' : 'hover:text-white')}>Peliculas</NavLink>
            <NavLink to="/favorites" className={({ isActive }) => `flex items-center gap-1.5 ${isActive ? 'text-brand' : 'hover:text-white'}`}>
              <Heart size={15} /> Favoritos
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => `flex items-center gap-1.5 ${isActive ? 'text-brand' : 'hover:text-white'}`}>
              <UserCircle size={16} /> Perfil
            </NavLink>
            {user?.role === 'ADMIN' && (
              <NavLink to="/admin" className="flex items-center gap-2 rounded-lg bg-brand/10 px-3 py-2 font-bold text-brand hover:bg-brand hover:text-ink">
                <ShieldCheck size={16} /> Panel Admin
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-2">
            <button
              className="hidden rounded-lg border border-line p-2 text-slate-300 hover:border-brand hover:text-white sm:inline-flex"
              title="Buscar"
              onClick={() => navigate('/home#catalogo')}
            >
              <Search size={18} />
            </button>
            {user ? (
              <button
                className="rounded-lg border border-line p-2 text-slate-300 hover:border-coral hover:text-white"
                title="Cerrar sesion"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                <LogOut size={18} />
              </button>
            ) : (
              <Link className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-ink hover:bg-brand" to="/login">
                Entrar
              </Link>
            )}
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto border-t border-line/60 px-4 py-2 text-xs text-slate-300 lg:hidden">
          <NavLink to="/home" className={({ isActive }) => `shrink-0 rounded-lg px-3 py-2 ${isActive ? 'bg-brand text-ink' : 'bg-panel'}`}>Inicio</NavLink>
          <NavLink to="/series" className={({ isActive }) => `shrink-0 rounded-lg px-3 py-2 ${isActive ? 'bg-brand text-ink' : 'bg-panel'}`}>Series</NavLink>
          <NavLink to="/movies" className={({ isActive }) => `shrink-0 rounded-lg px-3 py-2 ${isActive ? 'bg-brand text-ink' : 'bg-panel'}`}>Peliculas</NavLink>
          <NavLink to="/favorites" className={({ isActive }) => `shrink-0 rounded-lg px-3 py-2 ${isActive ? 'bg-brand text-ink' : 'bg-panel'}`}>Favoritos</NavLink>
          <NavLink to="/profile" className={({ isActive }) => `shrink-0 rounded-lg px-3 py-2 ${isActive ? 'bg-brand text-ink' : 'bg-panel'}`}>Perfil</NavLink>
          {user?.role === 'ADMIN' && (
            <NavLink to="/admin" className={({ isActive }) => `shrink-0 rounded-lg px-3 py-2 font-bold ${isActive ? 'bg-brand text-ink' : 'bg-brand/10 text-brand'}`}>
              Panel Admin
            </NavLink>
          )}
        </nav>
      </header>
      <Outlet />
      {settings.showFooter && (
        <footer className="border-t border-line bg-ink px-4 py-8 text-center text-sm text-slate-500">
          {settings.siteName}. {settings.footerText}
        </footer>
      )}
      <Toaster richColors theme="dark" />
    </div>
  );
}

export function LoadingBlock({ label = 'Cargando contenido' }: { label?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel/70 p-8 text-center text-slate-400">
      <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {label}
    </div>
  );
}

export function EmptyState({ title }: { title: string }) {
  return <div className="rounded-lg border border-dashed border-line p-8 text-center text-slate-400">{title}</div>;
}
