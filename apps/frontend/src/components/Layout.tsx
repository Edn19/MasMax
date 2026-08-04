import { Film, Heart, Inbox, LogOut, Menu, RefreshCw, Search, ShieldCheck, UserCircle, X } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from '../lib/auth';
import { accountNavigationItems, mainNavigationItems, mobileNavigationItems } from '../lib/navigation';
import { useSiteSettings } from '../lib/site-settings';
import { User } from '../types/models';
import { InstallAppButton } from './InstallAppButton';

export function PublicLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useSiteSettings();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const profileArea = useRef<HTMLDivElement | null>(null);
  const profileButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setProfileOpen(false); setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!profileArea.current?.contains(event.target as Node)) setProfileOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { const restoreProfileFocus = profileOpen; setProfileOpen(false); setMobileOpen(false); if (restoreProfileFocus) window.requestAnimationFrame(() => profileButton.current?.focus()); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [profileOpen]);

  const signOut = () => { logout(); navigate('/login'); };
  return (
    <div className="min-h-screen text-slate-100">
      <a href="#main-content" className="skip-link">Saltar al contenido</a>
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 shadow-[0_8px_32px_rgba(0,0,0,.22)] backdrop-blur-xl">
        <div className="page-container flex h-[var(--header-height)] items-center justify-between gap-4">
          <Link to="/home" className="flex min-w-0 items-center gap-2.5 text-lg font-bold tracking-wide text-white" aria-label={`${settings.siteName}, ir al inicio`}>
            {settings.logo ? <img src={settings.logo} alt="" width="38" height="38" decoding="async" className="h-9 w-9 shrink-0 rounded-xl object-contain" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-ink"><Film size={20} /></span>}
            <span className="truncate">{settings.siteName}</span>
          </Link>

          <DesktopNavigation />

          <div className="flex items-center gap-2">
            <InstallAppButton />
            <button className="icon-button hidden sm:inline-flex" title="Buscar" aria-label="Buscar en el catalogo" onClick={() => navigate('/home#catalogo')}><Search size={18} /></button>
            {user && <div ref={profileArea} className="relative hidden lg:block">
              <button ref={profileButton} type="button" aria-label="Abrir menu del perfil" aria-haspopup="menu" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)} className="button-ghost max-w-52 px-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/15 text-brand"><UserCircle size={21} /></span>
                <span className="max-w-28 truncate">{user.name}</span>
              </button>
              {profileOpen && <div role="menu" className="surface-card absolute right-0 top-[calc(100%+.65rem)] w-64 p-2">
                <div className="border-b border-line px-3 py-2.5"><p className="truncate text-sm font-semibold text-white">{user.name}</p><p className="truncate text-xs text-slate-400">{user.email}</p></div>
                <UserMenuItems user={user} onSignOut={signOut} />
              </div>}
            </div>}
            <button type="button" className="icon-button lg:hidden" aria-label={mobileOpen ? 'Cerrar menu' : 'Abrir menu'} aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => setMobileOpen((open) => !open)}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>

        {mobileOpen && <nav id="mobile-navigation" aria-label="Navegacion movil" className="border-t border-line bg-surface/98 px-4 py-4 shadow-2xl lg:hidden">
          <MobileNavigation user={user} onSignOut={signOut} />
        </nav>}
      </header>

      <div id="main-content" tabIndex={-1}><Outlet /></div>
      {settings.showFooter && <footer className="mt-10 border-t border-line bg-ink/80"><div className="page-container flex flex-col items-center justify-between gap-2 py-7 text-center text-sm text-slate-400 sm:flex-row sm:text-left"><p><span className="font-semibold text-slate-200">{settings.siteName}</span>. {settings.footerText}</p><p className="text-xs text-slate-500">v{import.meta.env.VITE_APP_VERSION ?? '2.0.0'}</p></div></footer>}
      <Toaster richColors theme="dark" />
    </div>
  );
}

export function DesktopNavigation() {
  return <nav aria-label="Navegacion principal" className="hidden items-center gap-1 lg:flex">{mainNavigationItems.map(({ to, label }) => <NavLink key={to} to={to} className={({ isActive }) => `inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition ${isActive ? 'bg-brand/12 text-brand' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>{to === '/favorites' && <Heart size={16} />}{label}</NavLink>)}</nav>;
}

export function UserMenuItems({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return <>{accountNavigationItems(user).map((item) => <ProfileMenuLink key={item.to} to={item.to} label={item.label} icon={item.to === '/profile' ? <UserCircle size={17} /> : <ShieldCheck size={17} />} />)}<button role="menuitem" type="button" onClick={onSignOut} className="button-ghost mt-1 w-full justify-start text-coral"><LogOut size={17} /> Cerrar sesion</button></>;
}

export function MobileNavigation({ user, onSignOut }: { user: User | null; onSignOut: () => void }) {
  return <div className="mx-auto grid max-w-7xl gap-1">{mobileNavigationItems(user).map(({ to, label }) => <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium ${isActive ? 'bg-brand text-ink' : to === '/admin' ? 'font-semibold text-brand hover:bg-brand/10' : 'text-slate-200 hover:bg-white/5'}`}>{to === '/favorites' ? <Heart size={18} /> : to === '/profile' ? <UserCircle size={18} /> : to === '/admin' ? <ShieldCheck size={18} /> : null}{label}</NavLink>)}<button type="button" onClick={onSignOut} className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border-t border-line px-4 text-left text-sm font-medium text-coral"><LogOut size={18} /> Cerrar sesion</button></div>;
}

function ProfileMenuLink({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return <Link role="menuitem" to={to} className="button-ghost mt-1 w-full justify-start">{icon}{label}</Link>;
}

export function PageContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`page-container min-h-[70vh] py-8 sm:py-10 ${className}`}>{children}</main>;
}

export function PageHeader({ eyebrow, title, description, icon, action }: { eyebrow?: string; title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return <header className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div className="flex min-w-0 items-start gap-4">{icon && <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">{icon}</span>}<div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">{description}</p>}</div></div>{action}</header>;
}

export function LoadingBlock({ label = 'Cargando contenido' }: { label?: string }) {
  return <div role="status" aria-live="polite" className="surface-card overflow-hidden p-5"><span className="sr-only">{label}</span><div className="skeleton h-5 w-40" /><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="skeleton h-24" /><div className="skeleton h-24" /><div className="skeleton h-24" /><div className="skeleton h-24" /></div></div>;
}

export function SkeletonGrid({ count = 5, label = 'Cargando catalogo' }: { count?: number; label?: string }) {
  return <div role="status" aria-live="polite"><span className="sr-only">{label}</span><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">{Array.from({ length: count }, (_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-line bg-panel/60"><div className="skeleton aspect-[2/3] rounded-none" /><div className="space-y-3 p-4"><div className="skeleton h-5 w-4/5" /><div className="skeleton h-4 w-2/5" /></div></div>)}</div></div>;
}

export function EmptyState({ title, description, action, secondaryAction, icon }: { title: string; description?: string; action?: ReactNode; secondaryAction?: ReactNode; icon?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line bg-panel/35 px-5 py-10 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-slate-500">{icon ?? <Inbox size={30} />}</span><h3 className="mt-4 text-lg font-semibold text-slate-100">{title}</h3>{description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">{description}</p>}{(action || secondaryAction) && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}{secondaryAction}</div>}</div>;
}

export function ErrorState({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return <div role="alert" className="rounded-xl border border-coral/40 bg-coral/10 p-5 text-coral"><p className="font-semibold">No pudimos cargar esta seccion</p><p className="mt-1 text-sm">{message}</p>{onRetry && <button type="button" onClick={onRetry} className="button-secondary mt-4 border-coral/50 text-coral"><RefreshCw size={16} /> Reintentar</button>}</div>;
}
