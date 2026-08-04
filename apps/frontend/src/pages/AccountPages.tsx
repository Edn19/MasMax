import { Clock3, Film, Heart, Laptop, Mail, Play, Settings2, ShieldCheck, Trash2, UserCircle } from 'lucide-react';
import { EmptyState, ErrorState, LoadingBlock, PageContainer, PageHeader, SkeletonGrid } from '../components/Layout';
import { MovieCard } from '../components/MovieCard';
import { SeriesCard } from '../components/SeriesCard';
import { api, deleteJson } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import { Favorite, Movie, Series, Session, WatchHistory } from '../types/models';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { SmartImage } from '../components/SmartImage';
import { loadPlayerPreferences } from '../components/player/player-preferences';

export function SeriesCatalogPage() {
  const { data, loading, error, reload } = useAsync<Series[]>(() => api('/series'), []);

  return (
    <PageContainer>
      <PageHeader eyebrow="Catalogo" title="Series" description="Explora todas las series disponibles en la plataforma." />
      <div className="mt-8"><ErrorState message={error} onRetry={reload} /></div>
      {loading ? <div className="mt-8"><SkeletonGrid /></div> : data?.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
          {(data ?? []).map((item) => <SeriesCard key={item.id} item={item} />)}
        </div>
      ) : <div className="mt-8"><EmptyState title="Todavia no hay series publicadas" /></div>}
    </PageContainer>
  );
}

export function MoviesPage() {
  const { data, loading, error, reload } = useAsync<Movie[]>(() => api('/movies'), []);
  return (
    <PageContainer>
      <PageHeader title="Peliculas" description="Tu coleccion de largometrajes aparecera aqui." icon={<Film />} />
      <ErrorState message={error} onRetry={reload} />
      {loading ? <SkeletonGrid /> : (data?.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">{data.map((movie) => <MovieCard key={movie.id} item={movie} />)}</div>
      ) : <EmptyState title="Todavia no hay peliculas publicadas." />)}
    </PageContainer>
  );
}

export function FavoritesPage() {
  const favorites = useAsync<Favorite[]>(() => api('/favorites'), []);

  async function remove(id: string) {
    if (!window.confirm('¿Quieres quitar este contenido de favoritos?')) return;
    try {
      await deleteJson(`/favorites/${id}`);
      favorites.setData((favorites.data ?? []).filter((item) => item.id !== id));
      toast.success('Eliminado de favoritos');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const movies = (favorites.data ?? []).filter((item) => item.movie);
  const episodes = (favorites.data ?? []).filter((item) => item.episode);
  return (
    <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-10">
      <div className="mb-8 flex items-center gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/15 text-brand"><Heart /></span>
        <div>
          <h1 className="text-4xl font-black text-white">Favoritos</h1>
          <p className="mt-1 text-slate-400">Guarda aqui las historias que quieras volver a ver.</p>
        </div>
      </div>
      {favorites.loading ? <LoadingBlock /> : (
        <div className="space-y-10">
          <ErrorState message={favorites.error} onRetry={favorites.reload} />
          <section>
            <h2 className="mb-4 text-2xl font-black text-white">Peliculas favoritas</h2>
            {movies.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{movies.map((favorite) => favorite.movie && (
              <article key={favorite.id} className="relative"><MovieCard item={favorite.movie} /><button onClick={() => remove(favorite.id)} className="absolute right-2 top-2 rounded-full bg-black/75 p-2 text-coral" title="Quitar de favoritos"><Trash2 size={17} /></button></article>
            ))}</div> : <EmptyState title="No tienes peliculas favoritas." />}
          </section>
          <section>
            <h2 className="mb-4 text-2xl font-black text-white">Episodios favoritos</h2>
            {episodes.length ? <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{episodes.map((favorite) => favorite.episode && (
              <article key={favorite.id} className="relative overflow-hidden rounded-xl border border-line bg-panel">
                <Link to={`/watch/${favorite.episode.id}`}><SmartImage src={favorite.episode.thumbnailUrl} alt={`Miniatura de ${favorite.episode.title}`} className="aspect-video w-full object-cover" /><div className="p-4"><p className="text-xs text-brand">{favorite.episode.series?.title}</p><h3 className="mt-1 font-bold text-white">{favorite.episode.title}</h3><span className="mt-3 inline-flex items-center gap-1 text-sm text-slate-400"><Play size={15} /> Reproducir</span></div></Link>
                <button onClick={() => remove(favorite.id)} className="absolute right-2 top-2 rounded-full bg-black/75 p-2 text-coral" title="Quitar de favoritos"><Trash2 size={17} /></button>
              </article>
            ))}</div> : <EmptyState title="No tienes episodios favoritos." />}
          </section>
        </div>
      )}
    </main>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const history = useAsync<WatchHistory[]>(() => api('/me/watch-history?limit=4'), []);
  const preferences = loadPlayerPreferences();

  return (
    <PageContainer>
      <PageHeader title="Mi perfil" description="Administra tu cuenta, preferencias locales y actividad reciente." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
        <div className="space-y-6">
          <section className="surface-card overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-brand/30 via-sky-500/15 to-coral/25" />
            <div className="px-5 pb-6 sm:px-7"><span className="-mt-10 grid h-20 w-20 place-items-center rounded-3xl border-4 border-panel bg-ink text-brand"><UserCircle size={44} /></span><h2 className="mt-4 text-2xl font-bold text-white">{user?.name}</h2><p className="mt-1 text-sm text-slate-400">Cuenta {user?.role === 'ADMIN' ? 'administradora' : 'personal'}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2"><InfoCard icon={<Mail size={16} />} label="Email" value={user?.email ?? ''} /><InfoCard icon={<ShieldCheck size={16} />} label="Rol" value={user?.role === 'ADMIN' ? 'Administrador' : 'Usuario'} /></div>
            </div>
          </section>
          <section className="surface-card p-5 sm:p-6"><div className="flex items-center gap-3"><Clock3 className="text-brand" /><div><h2 className="text-lg font-semibold text-white">Actividad reciente</h2><p className="text-sm text-slate-400">Continua desde donde lo dejaste.</p></div></div>{history.loading ? <div className="mt-5"><LoadingBlock label="Cargando actividad" /></div> : (history.data ?? []).length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{(history.data ?? []).slice(0, 4).map((entry) => { const href = entry.episode ? `/watch/${entry.episode.id}` : entry.movie ? `/watch/movie/${entry.movie.slug}` : '/home'; const title = entry.episode?.title ?? entry.movie?.title ?? 'Contenido'; return <Link key={entry.id} to={href} className="rounded-xl border border-line bg-ink/55 p-4 transition hover:border-brand"><p className="line-clamp-1 font-medium text-white">{title}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel"><div className="h-full bg-brand" style={{ width: `${Math.min(entry.percentage, 100)}%` }} /></div><p className="mt-2 text-xs text-slate-400">{Math.round(entry.percentage)} % visto</p></Link>; })}</div> : <div className="mt-5"><EmptyState title="Aun no hay actividad" description="Cuando reproduzcas contenido, aparecera aqui." /></div>}</section>
        </div>
        <div className="space-y-6">
          <section className="surface-card p-5 sm:p-6"><div className="flex items-center gap-3"><Settings2 className="text-brand" /><h2 className="text-lg font-semibold text-white">Preferencias de reproduccion</h2></div><dl className="mt-5 divide-y divide-line text-sm"><Preference label="Reproduccion automatica" value={preferences.autoplayNext ? 'Activada' : 'Desactivada'} /><Preference label="Velocidad" value={`${preferences.speed}x`} /><Preference label="Calidad" value={preferences.quality === 'auto' ? 'Automatica' : `${preferences.quality}p`} /><Preference label="Volumen" value={`${Math.round(preferences.volume * 100)} %`} /></dl><p className="mt-4 text-xs leading-5 text-slate-500">Estas preferencias se actualizan desde el reproductor y se guardan en este dispositivo.</p></section>
          <section className="surface-card p-5 sm:p-6"><div className="flex items-center gap-3"><Laptop className="text-brand" /><div><h2 className="text-lg font-semibold text-white">Seguridad y dispositivos</h2><p className="mt-1 text-sm text-slate-400">Revisa las sesiones activas de tu cuenta.</p></div></div><Link to="/profile/security" className="button-primary mt-5 w-full"><Laptop size={18} /> Revisar dispositivos</Link></section>
        </div>
      </div>
    </PageContainer>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-xl border border-line bg-ink/55 p-4"><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">{icon}{label}</p><p className="mt-2 break-words font-medium text-white">{value}</p></div>; }
function Preference({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 py-3"><dt className="text-slate-400">{label}</dt><dd className="font-medium text-slate-100">{value}</dd></div>; }

export function SecurityPage() {
  const sessions = useAsync<Session[]>(() => api('/auth/sessions'), []);
  async function revoke(id: string) {
    if (!window.confirm('¿Quieres cerrar esta sesion? El dispositivo debera iniciar sesion nuevamente.')) return;
    try {
      await deleteJson(`/auth/sessions/${id}`);
      sessions.setData((sessions.data ?? []).map((item) => item.id === id ? { ...item, revokedAt: new Date().toISOString() } : item));
      toast.success('Sesion revocada');
    } catch (error) { toast.error((error as Error).message); }
  }
  return <main className="mx-auto min-h-[70vh] max-w-4xl px-4 py-10"><div className="flex items-center gap-3"><Laptop className="text-brand"/><div><h1 className="text-3xl font-black text-white">Seguridad y dispositivos</h1><p className="mt-1 text-slate-400">Revisa y cierra sesiones de tu cuenta.</p></div></div><div className="mt-8"><ErrorState message={sessions.error} onRetry={sessions.reload}/></div>{sessions.loading?<div className="mt-8"><LoadingBlock/></div>:(sessions.data??[]).length?<div className="mt-8 space-y-3">{(sessions.data??[]).map((session)=><article key={session.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-panel p-5 sm:flex-row sm:items-center"><div><p className="font-bold text-white">{session.deviceName||session.userAgent?.slice(0,80)||'Dispositivo desconocido'}</p><p className="mt-1 text-sm text-slate-400">Ultimo uso: {new Date(session.lastUsedAt).toLocaleString()} · {session.ipAddress||'IP no disponible'}</p><p className={`mt-2 text-xs font-bold ${session.revokedAt?'text-coral':'text-emerald-400'}`}>{session.revokedAt?'Revocada':'Activa'}</p></div>{!session.revokedAt&&<button onClick={()=>revoke(session.id)} className="rounded-xl border border-coral/50 px-4 py-2 text-sm font-bold text-coral">Cerrar sesion</button>}</article>)}</div>:<div className="mt-8"><EmptyState title="No hay sesiones para mostrar"/></div>}</main>;
}
