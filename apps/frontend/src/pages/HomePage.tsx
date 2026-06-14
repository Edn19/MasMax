import { Filter, Search } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Episode, Genre, Series } from '../types/models';
import { LoadingBlock } from '../components/Layout';
import { MovieCard } from '../components/MovieCard';
import { SeriesCard } from '../components/SeriesCard';
import { useSiteSettings } from '../lib/site-settings';
import { Favorite, Movie } from '../types/models';

const statusOptions = [
  { value: '', label: 'Todos' },
  { value: 'AIRING', label: 'En emision' },
  { value: 'FINISHED', label: 'Finalizado' },
  { value: 'PAUSED', label: 'Pausado' },
];

export function HomePage() {
  const [filters, setFilters] = useState({ search: '', genre: '', status: '', year: '' });
  const [query, setQuery] = useState(filters);
  const params = useMemo(() => new URLSearchParams(Object.entries(query).filter(([, value]) => value)), [query]);
  const { data: series, loading } = useAsync<Series[]>(() => api(`/series?${params.toString()}`), [params.toString()]);
  const { data: featured } = useAsync<Series[]>(() => api('/series/featured'), []);
  const { data: latest } = useAsync<Episode[]>(() => api('/episodes/latest'), []);
  const { data: genres } = useAsync<Genre[]>(() => api('/genres'), []);
  const { data: movies } = useAsync<Movie[]>(() => api('/movies'), []);
  const { data: favorites } = useAsync<Favorite[]>(() => api('/favorites'), []);
  const settings = useSiteSettings();

  function submit(event: FormEvent) {
    event.preventDefault();
    setQuery(filters);
  }

  const selectedFeatured = settings.featuredSeriesIds.length
    ? (series ?? []).filter((item) => settings.featuredSeriesIds.includes(item.id))
    : (featured ?? []);
  const hero = selectedFeatured[0] ?? featured?.[0];
  const order = (section: string) => {
    const index = settings.sectionOrder.indexOf(section);
    return index === -1 ? 99 : index;
  };

  return (
    <main className="flex flex-col">
      <section className="relative min-h-[72vh] overflow-hidden">
        {(settings.heroImage || hero?.banner) && <img src={settings.heroImage || hero?.banner} alt={settings.heroTitle} className="absolute inset-0 h-full w-full object-cover opacity-40" />}
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/80 to-ink/20" />
        <div className="relative mx-auto flex min-h-[72vh] max-w-7xl flex-col justify-end px-4 pb-12 pt-20">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-bold uppercase text-brand">{settings.siteName}</p>
            <h1 className="text-4xl font-black text-white sm:text-6xl">{settings.heroTitle}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{settings.heroText}</p>
            {hero && (
              <Link
                to={`/series/${hero.slug}`}
                className="mt-8 inline-flex rounded-lg bg-brand px-5 py-3 font-black text-ink hover:bg-white"
              >
                Ver detalles
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-10" style={{ order: order('featured') }}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black text-white">Series destacadas</h2>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-3">
          {selectedFeatured.map((item) => (
            <div key={item.id} className="w-64 shrink-0">
              <SeriesCard item={item} />
            </div>
          ))}
        </div>
      </section>

      {settings.showLatestEpisodes && <section className="mx-auto w-full max-w-7xl px-4 py-8" style={{ order: order('latest') }}>
        <div className="mb-5 flex items-center gap-3">
          <h2 className="text-2xl font-black text-white">Ultimos episodios</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(latest ?? []).slice(0, 8).map((episode) => (
            <Link
              to={`/watch/${episode.id}`}
              key={episode.id}
              className="overflow-hidden rounded-lg border border-line bg-panel/70 hover:border-brand/50"
            >
              {episode.thumbnailUrl && <img src={episode.thumbnailUrl} alt={episode.title} className="aspect-video w-full object-cover" />}
              <div className="p-4">
                <p className="text-xs font-bold uppercase text-brand">{episode.series?.title}</p>
                <h3 className="mt-1 font-bold text-white">E{episode.number}. {episode.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      </section>}

      <section className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-black text-white">Ultimas peliculas</h2>
          <Link to="/movies" className="text-sm font-bold text-brand">Ver todas</Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {(movies ?? []).slice(0, 5).map((movie) => <MovieCard key={movie.id} item={movie} />)}
        </div>
      </section>

      {settings.showPopularSeries && (
        <section className="mx-auto w-full max-w-7xl px-4 py-8" style={{ order: order('popular') }}>
          <h2 className="mb-5 text-2xl font-black text-white">Series populares</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {[...(series ?? [])].sort((a, b) => b.views - a.views).slice(0, 5).map((item) => <SeriesCard key={item.id} item={item} />)}
          </div>
        </section>
      )}

      <section className="mx-auto w-full max-w-7xl px-4 py-8">
        <h2 className="mb-5 text-2xl font-black text-white">Peliculas populares</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {[...(movies ?? [])].sort((a, b) => b.views - a.views).slice(0, 5).map((movie) => <MovieCard key={movie.id} item={movie} />)}
        </div>
      </section>

      {(favorites ?? []).length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 py-8">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-black text-white">Tus favoritos</h2>
            <Link to="/favorites" className="text-sm font-bold text-brand">Abrir favoritos</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3">
            {(favorites ?? []).slice(0, 8).map((favorite) => favorite.movie ? (
              <div key={favorite.id} className="w-52 shrink-0"><MovieCard item={favorite.movie} /></div>
            ) : favorite.episode ? (
              <Link key={favorite.id} to={`/watch/${favorite.episode.id}`} className="w-72 shrink-0 overflow-hidden rounded-xl border border-line bg-panel">
                <img src={favorite.episode.thumbnailUrl} alt={favorite.episode.title} className="aspect-video w-full object-cover" />
                <div className="p-4"><p className="text-xs text-brand">{favorite.episode.series?.title}</p><h3 className="mt-1 font-bold text-white">{favorite.episode.title}</h3></div>
              </Link>
            ) : null)}
          </div>
        </section>
      )}

      {settings.showGenres && (
        <section className="mx-auto w-full max-w-7xl px-4 py-8" style={{ order: order('genres') }}>
          <h2 className="mb-5 text-2xl font-black text-white">Generos</h2>
          <div className="flex flex-wrap gap-3">
            {(genres ?? []).map((genre) => <button key={genre.id} onClick={() => { setFilters({ ...filters, genre: genre.slug }); setQuery({ ...filters, genre: genre.slug }); }} className="rounded-full border border-line bg-panel px-4 py-2 text-sm hover:border-brand">{genre.name}</button>)}
          </div>
        </section>
      )}

      <section id="catalogo" className="mx-auto w-full max-w-7xl px-4 py-12" style={{ order: order('catalog') }}>
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-2xl font-black text-white">Catalogo</h2>
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_160px_120px_auto]">
            <label className="relative">
              <Search className="absolute left-3 top-3 text-slate-500" size={18} />
              <input
                id="catalog-search"
                className="w-full rounded-lg border border-line bg-panel px-10 py-2.5 text-white outline-none focus:border-brand"
                placeholder="Buscar serie"
                value={filters.search}
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              />
            </label>
            <select className="rounded-lg border border-line bg-panel px-3 py-2.5" value={filters.genre} onChange={(event) => setFilters({ ...filters, genre: event.target.value })}>
              <option value="">Genero</option>
              {(genres ?? []).map((genre) => <option key={genre.id} value={genre.slug}>{genre.name}</option>)}
            </select>
            <select className="rounded-lg border border-line bg-panel px-3 py-2.5" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <input className="rounded-lg border border-line bg-panel px-3 py-2.5" placeholder="Ano" value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })} />
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 font-bold text-ink hover:bg-brand">
              <Filter size={18} /> Filtrar
            </button>
          </form>
        </div>
        {loading ? <LoadingBlock /> : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {(series ?? []).map((item) => <SeriesCard key={item.id} item={item} />)}
          </div>
        )}
      </section>
    </main>
  );
}
