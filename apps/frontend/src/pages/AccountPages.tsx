import { Film, Heart, Laptop, Mail, Play, ShieldCheck, Trash2, UserCircle } from 'lucide-react';
import { EmptyState, LoadingBlock } from '../components/Layout';
import { MovieCard } from '../components/MovieCard';
import { SeriesCard } from '../components/SeriesCard';
import { api, deleteJson } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import { Favorite, Movie, Series, Session } from '../types/models';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

export function SeriesCatalogPage() {
  const { data, loading } = useAsync<Series[]>(() => api('/series'), []);

  return (
    <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-10">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand">Catalogo</p>
      <h1 className="mt-2 text-4xl font-black text-white">Series</h1>
      <p className="mt-3 text-slate-400">Explora todas las series disponibles en la plataforma.</p>
      {loading ? (
        <div className="mt-8"><LoadingBlock /></div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {(data ?? []).map((item) => <SeriesCard key={item.id} item={item} />)}
        </div>
      )}
    </main>
  );
}

export function MoviesPage() {
  const { data, loading } = useAsync<Movie[]>(() => api('/movies'), []);
  return (
    <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-10">
      <div className="mb-8 flex items-center gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-coral/15 text-coral"><Film /></span>
        <div>
          <h1 className="text-4xl font-black text-white">Peliculas</h1>
          <p className="mt-1 text-slate-400">Tu coleccion de largometrajes aparecera aqui.</p>
        </div>
      </div>
      {loading ? <LoadingBlock /> : (data?.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{data.map((movie) => <MovieCard key={movie.id} item={movie} />)}</div>
      ) : <EmptyState title="Todavia no hay peliculas publicadas." />)}
    </main>
  );
}

export function FavoritesPage() {
  const favorites = useAsync<Favorite[]>(() => api('/favorites'), []);

  async function remove(id: string) {
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
                <Link to={`/watch/${favorite.episode.id}`}><img src={favorite.episode.thumbnailUrl} alt={favorite.episode.title} className="aspect-video w-full object-cover" /><div className="p-4"><p className="text-xs text-brand">{favorite.episode.series?.title}</p><h3 className="mt-1 font-bold text-white">{favorite.episode.title}</h3><span className="mt-3 inline-flex items-center gap-1 text-sm text-slate-400"><Play size={15} /> Reproducir</span></div></Link>
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

  return (
    <main className="mx-auto min-h-[70vh] max-w-3xl px-4 py-10">
      <section className="overflow-hidden rounded-3xl border border-line bg-panel/80 shadow-glow">
        <div className="h-28 bg-gradient-to-r from-brand/30 via-sky-500/15 to-coral/25" />
        <div className="px-6 pb-8 sm:px-9">
          <span className="-mt-12 grid h-24 w-24 place-items-center rounded-3xl border-4 border-panel bg-ink text-brand">
            <UserCircle size={52} />
          </span>
          <h1 className="mt-5 text-3xl font-black text-white">{user?.name}</h1>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-ink/60 p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><Mail size={15} /> Email</p>
              <p className="mt-2 font-semibold text-white">{user?.email}</p>
            </div>
            <div className="rounded-2xl border border-line bg-ink/60 p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><ShieldCheck size={15} /> Rol</p>
              <p className="mt-2 font-semibold text-white">{user?.role === 'ADMIN' ? 'Administrador' : 'Usuario'}</p>
            </div>
          </div>
          <Link to="/profile/security" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-bold text-ink"><Laptop size={18}/> Seguridad y dispositivos</Link>
        </div>
      </section>
    </main>
  );
}

export function SecurityPage() {
  const sessions = useAsync<Session[]>(() => api('/auth/sessions'), []);
  async function revoke(id:string){try{await deleteJson(`/auth/sessions/${id}`);sessions.setData((sessions.data??[]).map((item)=>item.id===id?{...item,revokedAt:new Date().toISOString()}:item));toast.success('Sesion revocada')}catch(error){toast.error((error as Error).message)}}
  return <main className="mx-auto min-h-[70vh] max-w-4xl px-4 py-10"><div className="flex items-center gap-3"><Laptop className="text-brand"/><div><h1 className="text-3xl font-black text-white">Seguridad y dispositivos</h1><p className="mt-1 text-slate-400">Revisa y cierra sesiones de tu cuenta.</p></div></div>{sessions.loading?<div className="mt-8"><LoadingBlock/></div>:<div className="mt-8 space-y-3">{(sessions.data??[]).map((session)=><article key={session.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-panel p-5 sm:flex-row sm:items-center"><div><p className="font-bold text-white">{session.deviceName||session.userAgent?.slice(0,80)||'Dispositivo desconocido'}</p><p className="mt-1 text-sm text-slate-400">Ultimo uso: {new Date(session.lastUsedAt).toLocaleString()} · {session.ipAddress||'IP no disponible'}</p><p className={`mt-2 text-xs font-bold ${session.revokedAt?'text-coral':'text-emerald-400'}`}>{session.revokedAt?'Revocada':'Activa'}</p></div>{!session.revokedAt&&<button onClick={()=>revoke(session.id)} className="rounded-xl border border-coral/50 px-4 py-2 text-sm font-bold text-coral">Cerrar sesion</button>}</article>)}</div>}</main>;
}
