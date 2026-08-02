import { ArrowLeft, BarChart3, Clapperboard, Database, Film, MessageSquare, Palette, ScrollText, Settings, Tags, Users } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';

const links = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/admin/series', label: 'Series', icon: Film },
  { to: '/admin/episodes', label: 'Episodios', icon: Clapperboard },
  { to: '/admin/movies', label: 'Peliculas', icon: Film },
  { to: '/admin/genres', label: 'Generos', icon: Tags },
  { to: '/admin/users', label: 'Usuarios', icon: Users },
  { to: '/admin/comments', label: 'Comentarios', icon: MessageSquare },
  { to: '/admin/storage', label: 'Almacenamiento', icon: Database },
  { to: '/admin/audit', label: 'Auditoria', icon: ScrollText },
  { to: '/admin/settings', label: 'Configuracion', icon: Settings, end: true },
  { to: '/admin/settings/design', label: 'Diseno del sitio', icon: Palette },
];

export function AdminShell() {
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[240px,1fr]">
      <aside className="rounded-lg border border-line bg-panel/80 p-3 lg:sticky lg:top-24 lg:h-fit">
        <Link to="/home" className="mb-3 flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm font-bold text-slate-200 hover:border-brand hover:text-white">
          <ArrowLeft size={18} /> Volver a Home
        </Link>
        <nav className="grid gap-1">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold ${isActive ? 'bg-brand text-ink' : 'text-slate-300 hover:bg-ink hover:text-white'}`
                }
              >
                <Icon size={18} /> {link.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <section className="min-w-0">
        <Outlet />
      </section>
      <Toaster richColors theme="dark" />
    </main>
  );
}
