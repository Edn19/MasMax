import { Activity, ArrowLeft, BarChart3, CalendarRange, Captions, ChevronDown, Clapperboard, Database, Film, Menu, MessageSquare, Palette, PanelLeftClose, PanelLeftOpen, ScrollText, Settings, Tags, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useSiteSettings } from '../lib/site-settings';
import { isNavigationPathActive } from '../lib/ui';
import { useVideoProcessingJobs } from '../lib/video-processing-jobs';
import { processingStageLabel } from '../lib/video-processing-state';

const groups = [
  { label: 'General', links: [{ to: '/admin', label: 'Dashboard', icon: BarChart3, end: true }] },
  { label: 'Contenido', links: [
    { to: '/admin/series', label: 'Series', icon: Film }, { to: '/admin/seasons', label: 'Temporadas', icon: CalendarRange },
    { to: '/admin/episodes', label: 'Episodios', icon: Clapperboard }, { to: '/admin/movies', label: 'Peliculas', icon: Film },
    { to: '/admin/genres', label: 'Generos', icon: Tags }, { to: '/admin/subtitles', label: 'Subtitulos', icon: Captions },
  ] },
  { label: 'Multimedia', links: [{ to: '/admin/processing', label: 'Procesamiento', icon: Activity }, { to: '/admin/storage', label: 'Almacenamiento', icon: Database }] },
  { label: 'Administracion', links: [{ to: '/admin/users', label: 'Usuarios', icon: Users }, { to: '/admin/comments', label: 'Comentarios', icon: MessageSquare }, { to: '/admin/audit', label: 'Auditoria', icon: ScrollText }] },
  { label: 'Sistema', links: [{ to: '/admin/settings', label: 'Configuracion', icon: Settings, end: true }, { to: '/admin/settings/design', label: 'Diseno del sitio', icon: Palette }] },
];

export function AdminShell() {
  const location = useLocation();
  const settings = useSiteSettings();
  const processing = useVideoProcessingJobs();
  const currentJob = processing.activeJobs[0];
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('masmax:admin-sidebar-collapsed') === 'true');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try { return { General: true, Contenido: true, Multimedia: true, Administracion: true, Sistema: true, ...JSON.parse(localStorage.getItem('masmax:admin-sidebar-groups') ?? '{}') as Record<string, boolean> }; }
    catch { return { General: true, Contenido: true, Multimedia: true, Administracion: true, Sistema: true }; }
  });
  const active = groups.flatMap((group) => group.links).find((link) => isNavigationPathActive(location.pathname, link.to, link.end));

  useEffect(() => { localStorage.setItem('masmax:admin-sidebar-collapsed', String(collapsed)); }, [collapsed]);
  useEffect(() => { localStorage.setItem('masmax:admin-sidebar-groups', JSON.stringify(openGroups)); }, [openGroups]);
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawerOpen(false); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, []);

  return <div className="min-h-screen bg-ink text-slate-100">
    <a href="#main-content" className="skip-link">Saltar al contenido</a>
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-ink/95 px-4 backdrop-blur lg:hidden">
      <button type="button" className="icon-button" aria-label="Abrir navegacion administrativa" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><Menu size={20} /></button>
      <div className="min-w-0 text-center"><p className="truncate text-sm font-semibold text-white">{settings.siteName} Admin</p><p className="text-xs text-slate-500">{active?.label ?? 'Panel'}</p></div>
      <Link to="/home" className="icon-button" aria-label="Volver al sitio"><ArrowLeft size={20} /></Link>
    </header>

    {drawerOpen && <button type="button" aria-label="Cerrar navegacion administrativa" className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setDrawerOpen(false)} />}
    <div className={`mx-auto grid max-w-[1600px] lg:min-h-screen ${collapsed ? 'lg:grid-cols-[5.25rem_1fr]' : 'lg:grid-cols-[var(--admin-sidebar-width)_1fr]'}`}>
      <aside className={`${drawerOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 flex w-[min(19rem,88vw)] flex-col border-r border-line bg-surface p-3 shadow-2xl transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0 lg:shadow-none`} aria-label="Panel administrativo">
        <div className="mb-3 flex h-12 items-center justify-between gap-2 px-1">
          <Link to="/home" className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-white" title="Volver al sitio"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-ink"><Film size={19} /></span>{!collapsed && <span className="truncate">{settings.siteName}</span>}</Link>
          <button type="button" className="icon-button hidden lg:inline-flex" title={collapsed ? 'Expandir sidebar' : 'Contraer sidebar'} aria-label={collapsed ? 'Expandir sidebar' : 'Contraer sidebar'} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
          <button type="button" autoFocus className="icon-button lg:hidden" aria-label="Cerrar menu" onClick={() => setDrawerOpen(false)}><X size={19} /></button>
        </div>
        <Link to="/home" className={`button-secondary mb-3 ${collapsed ? 'px-2' : 'justify-start'}`} title="Volver al sitio"><ArrowLeft size={18} /><span className={collapsed ? 'sr-only' : ''}>Volver al sitio</span></Link>
        <nav className="admin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
          {groups.map((group) => <div key={group.label} className="mb-4">
            {!collapsed && <button type="button" className="flex w-full items-center justify-between px-3 pb-1.5 text-[.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500 hover:text-slate-300" aria-expanded={openGroups[group.label]} onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}><span>{group.label}</span><ChevronDown size={13} className={`transition ${openGroups[group.label] ? 'rotate-180' : ''}`} /></button>}
            {(collapsed || openGroups[group.label]) && <div className="grid gap-1">{group.links.map((link) => { const Icon = link.icon; const count = link.to === '/admin/processing' ? processing.activeJobs.length : 0; return <NavLink key={link.to} to={link.to} end={link.end} title={collapsed ? `${link.label}${count ? ` (${count})` : ''}` : undefined} className={({ isActive }) => `relative flex min-h-11 items-center rounded-xl text-sm font-medium transition ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${isActive ? 'bg-brand text-ink shadow-[0_8px_24px_rgba(34,211,238,.12)]' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}><Icon size={18} /><span className={collapsed ? 'sr-only' : ''}>{link.label}{count ? ` (${count})` : ''}</span>{collapsed && count > 0 && <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">{count}</span>}</NavLink>; })}</div>}
          </div>)}
        </nav>
        <p className={`${collapsed ? 'sr-only' : 'px-3'} pt-2 text-xs text-slate-600`}>Panel administrativo · v{import.meta.env.VITE_APP_VERSION ?? '2.0.0'}</p>
      </aside>

      <main id="main-content" tabIndex={-1} className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <nav aria-label="Migas de pan" className="mb-4 text-xs text-slate-500"><Link to="/admin" className="hover:text-brand">Administracion</Link><span aria-hidden="true"> / </span><span aria-current="page" className="text-slate-300">{active?.label ?? 'Panel'}</span></nav>
        {currentJob && <Link to="/admin/processing" className="mb-5 block rounded-xl border border-brand/30 bg-brand/5 p-3 transition hover:border-brand/60" aria-label={`Ver procesamiento de ${currentJob.input.originalName}`}><div className="flex items-center justify-between gap-4 text-sm"><div className="min-w-0"><p className="truncate font-semibold text-white">{currentJob.input.originalName}</p><p className="mt-0.5 text-xs text-slate-400">{processingStageLabel(currentJob.stage, currentJob.status)}</p></div><strong className="shrink-0 text-brand">{currentJob.progress}%</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink"><div className="h-full bg-brand transition-[width]" style={{ width: `${currentJob.progress}%` }} /></div></Link>}
        <Outlet />
      </main>
    </div>
    <Toaster richColors theme="dark" />
  </div>;
}
