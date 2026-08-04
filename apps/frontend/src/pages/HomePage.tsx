import { Calendar, Filter, Info, Play, Search } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Episode, Genre, Series } from '../types/models';
import { EmptyState, ErrorState, SkeletonGrid } from '../components/Layout';
import { MovieCard } from '../components/MovieCard';
import { SeriesCard } from '../components/SeriesCard';
import { useSiteSettings } from '../lib/site-settings';
import { Favorite, Movie, WatchHistory } from '../types/models';
import { SmartImage } from '../components/SmartImage';
import { HorizontalRail } from '../components/HorizontalRail';

const statusOptions = [
  { value: '', label: 'Todos' },
  { value: 'AIRING', label: 'En emision' },
  { value: 'FINISHED', label: 'Finalizado' },
  { value: 'PAUSED', label: 'Pausado' },
];

export function HomePage() {
  const [filters, setFilters] = useState({ search: '', genre: '', status: '', year: '' });
  const [query, setQuery] = useState(filters);
  const [heroIndex, setHeroIndex] = useState(0);
  const params = useMemo(() => new URLSearchParams(Object.entries(query).filter(([, value]) => value)), [query]);
  const { data: series, loading, error, reload } = useAsync<Series[]>(() => api(`/series?${params.toString()}`), [params.toString()]);
  const { data: featured } = useAsync<Series[]>(() => api('/series/featured'), []);
  const { data: latest } = useAsync<Episode[]>(() => api('/episodes/latest'), []);
  const { data: genres } = useAsync<Genre[]>(() => api('/genres'), []);
  const { data: movies } = useAsync<Movie[]>(() => api('/movies'), []);
  const { data: favorites } = useAsync<Favorite[]>(() => api('/favorites'), []);
  const { data: continuing } = useAsync<WatchHistory[]>(() => api('/me/continue-watching?limit=10'), []);
  const settings = useSiteSettings();

  function submit(event: FormEvent) {
    event.preventDefault();
    setQuery(filters);
  }

  const selectedFeatured = settings.featuredSeriesIds.length
    ? (series ?? []).filter((item) => settings.featuredSeriesIds.includes(item.id))
    : (featured ?? []);
  const heroItems = selectedFeatured.length ? selectedFeatured : (featured ?? []);
  const hero = heroItems[heroIndex] ?? heroItems[0];
  const firstEpisode = hero?.episodes?.[0];
  const order = (section: string) => {
    const index = settings.sectionOrder.indexOf(section);
    return index === -1 ? 99 : index;
  };

  return (
    <main className="flex flex-col">
      <section className="relative min-h-[31rem] overflow-hidden sm:min-h-[36rem] lg:min-h-[42rem]" style={{ order: -2 }}>
        {(settings.heroImage || hero?.banner) && <SmartImage src={settings.heroImage || hero?.banner} alt="" loading="eager" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover object-center opacity-55" />}
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-black/25" />
        <div className="page-container relative flex min-h-[31rem] flex-col justify-end pb-10 pt-20 sm:min-h-[36rem] sm:pb-14 lg:min-h-[42rem]">
          <div className="max-w-2xl">
            <p className="eyebrow mb-3">{settings.siteName} presenta</p>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">{hero?.title ?? settings.heroTitle}</h1>
            <p className="mt-4 line-clamp-2 max-w-xl text-base leading-7 text-slate-200 sm:text-lg">{hero?.description || settings.heroText}</p>
            {hero && <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-300"><span className="inline-flex items-center gap-1.5"><Calendar size={15} /> {hero.year}</span>{hero.genres.slice(0, 2).map((genre) => <span key={genre.id}>{genre.name}</span>)}{hero.seasons?.length ? <span>{hero.seasons.length} temporada{hero.seasons.length === 1 ? '' : 's'}</span> : null}</div>}
            {hero && <div className="mt-7 flex flex-wrap gap-3">
              <Link to={firstEpisode ? `/watch/${firstEpisode.id}` : `/series/${hero.slug}`} className="button-primary"><Play size={18} fill="currentColor" /> Reproducir</Link>
              <Link to={`/series/${hero.slug}`} className="button-secondary"><Info size={18} /> Mas informacion</Link>
            </div>}
            {heroItems.length > 1 && <div className="mt-7 flex gap-2" role="tablist" aria-label="Contenido destacado">{heroItems.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={index === heroIndex} aria-label={`Mostrar ${item.title}`} onClick={() => setHeroIndex(index)} className={`h-2.5 rounded-full transition ${index === heroIndex ? 'w-8 bg-brand' : 'w-2.5 bg-white/45 hover:bg-white'}`} />)}</div>}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-10" style={{ order: order('featured') }}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="section-title">Series destacadas</h2>
        </div>
        {selectedFeatured.length ? <HorizontalRail label="Series destacadas">
          {selectedFeatured.map((item) => (
            <div key={item.id} className="w-[clamp(10.5rem,18vw,13.5rem)] shrink-0">
              <SeriesCard item={item} />
            </div>
          ))}
        </HorizontalRail> : <EmptyState title="No hay series destacadas" description="Las series marcadas como destacadas apareceran aqui." />}
      </section>

      {settings.showLatestEpisodes && <section className="mx-auto w-full max-w-7xl px-4 py-8" style={{ order: order('latest') }}>
        <div className="mb-5 flex items-center gap-3">
          <h2 className="section-title">Ultimos episodios</h2>
        </div>
        <HorizontalRail label="Ultimos episodios">
          {(latest ?? []).slice(0, 8).map((episode) => (
            <Link
              to={`/watch/${episode.id}`}
              key={episode.id}
              className="content-card w-[min(78vw,19rem)] shrink-0"
            >
              {episode.thumbnailUrl && <SmartImage src={episode.thumbnailUrl} alt={`Miniatura de ${episode.title}`} className="aspect-video w-full object-cover" />}
              <div className="p-4">
                <p className="text-xs font-bold uppercase text-brand">{episode.series?.title}</p>
                <h3 className="mt-1 font-bold text-white">E{episode.number}. {episode.title}</h3>
              </div>
            </Link>
          ))}
        </HorizontalRail>
        {(latest ?? []).length === 0 && <EmptyState title="No hay episodios recientes" />}
      </section>}

      <section className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="section-title">Ultimas peliculas</h2>
          <Link to="/movies" className="text-sm font-bold text-brand">Ver todas</Link>
        </div>
        <HorizontalRail label="Ultimas peliculas">{(movies ?? []).slice(0, 8).map((movie) => <div key={movie.id} className="w-[clamp(10.5rem,18vw,13.5rem)] shrink-0"><MovieCard item={movie} /></div>)}</HorizontalRail>
      </section>

      {(continuing ?? []).length > 0 && <section className="mx-auto w-full max-w-7xl px-4 py-8" style={{ order: -1 }}>
        <h2 className="mb-5 section-title">Continuar viendo</h2>
        <HorizontalRail label="Continuar viendo">{(continuing ?? []).map((entry) => {
          const href = entry.episode ? `/watch/${entry.episode.id}` : entry.movie ? `/watch/movie/${entry.movie.slug}` : '/home';
          const image = entry.episode?.thumbnailUrl || entry.movie?.bannerUrl || entry.movie?.posterUrl;
          const title = entry.episode?.title || entry.movie?.title;
          return <Link key={entry.id} to={href} className="w-72 shrink-0 overflow-hidden rounded-xl border border-line bg-panel"><SmartImage src={image} alt={title} className="aspect-video w-full object-cover"/><div className="p-4"><h3 className="line-clamp-1 font-bold text-white">{title}</h3><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink"><div className="h-full bg-brand" style={{width:`${Math.min(entry.percentage,100)}%`}}/></div><p className="mt-2 text-xs text-slate-400">{Math.round(entry.percentage)} % visto</p></div></Link>;
        })}</HorizontalRail>
      </section>}

      {settings.showPopularSeries && (
        <section className="mx-auto w-full max-w-7xl px-4 py-8" style={{ order: order('popular') }}>
          <h2 className="mb-5 section-title">Series populares</h2>
          <HorizontalRail label="Series populares">{[...(series ?? [])].sort((a, b) => b.views - a.views).slice(0, 8).map((item) => <div key={item.id} className="w-[clamp(10.5rem,18vw,13.5rem)] shrink-0"><SeriesCard item={item} /></div>)}</HorizontalRail>
        </section>
      )}

      <section className="mx-auto w-full max-w-7xl px-4 py-8">
        <h2 className="mb-5 section-title">Peliculas populares</h2>
        <HorizontalRail label="Peliculas populares">{[...(movies ?? [])].sort((a, b) => b.views - a.views).slice(0, 8).map((movie) => <div key={movie.id} className="w-[clamp(10.5rem,18vw,13.5rem)] shrink-0"><MovieCard item={movie} /></div>)}</HorizontalRail>
      </section>

      {(favorites ?? []).length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 py-8">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="section-title">Tus favoritos</h2>
            <Link to="/favorites" className="text-sm font-bold text-brand">Abrir favoritos</Link>
          </div>
          <HorizontalRail label="Tus favoritos">
            {(favorites ?? []).slice(0, 8).map((favorite) => favorite.movie ? (
              <div key={favorite.id} className="w-52 shrink-0"><MovieCard item={favorite.movie} /></div>
            ) : favorite.episode ? (
              <Link key={favorite.id} to={`/watch/${favorite.episode.id}`} className="w-72 shrink-0 overflow-hidden rounded-xl border border-line bg-panel">
                <SmartImage src={favorite.episode.thumbnailUrl} alt={`Miniatura de ${favorite.episode.title}`} className="aspect-video w-full object-cover" />
                <div className="p-4"><p className="text-xs text-brand">{favorite.episode.series?.title}</p><h3 className="mt-1 font-bold text-white">{favorite.episode.title}</h3></div>
              </Link>
            ) : null)}
          </HorizontalRail>
        </section>
      )}

      {settings.showGenres && (
        <section className="mx-auto w-full max-w-7xl px-4 py-8" style={{ order: order('genres') }}>
          <h2 className="mb-5 section-title">Generos</h2>
          <div className="flex flex-wrap gap-3">
            {(genres ?? []).map((genre) => <button key={genre.id} onClick={() => { setFilters({ ...filters, genre: genre.slug }); setQuery({ ...filters, genre: genre.slug }); }} className="rounded-full border border-line bg-panel px-4 py-2 text-sm hover:border-brand">{genre.name}</button>)}
          </div>
        </section>
      )}

      <section id="catalogo" className="mx-auto w-full max-w-7xl px-4 py-12" style={{ order: order('catalog') }}>
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="section-title">Catalogo</h2>
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_160px_120px_auto]">
            <label className="relative">
              <Search className="absolute left-3 top-3 text-slate-500" size={18} />
              <input
                id="catalog-search"
                className="form-control px-10"
                placeholder="Buscar serie"
                value={filters.search}
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              />
            </label>
            <select aria-label="Filtrar por genero" className="form-control" value={filters.genre} onChange={(event) => setFilters({ ...filters, genre: event.target.value })}>
              <option value="">Genero</option>
              {(genres ?? []).map((genre) => <option key={genre.id} value={genre.slug}>{genre.name}</option>)}
            </select>
            <select aria-label="Filtrar por estado" className="form-control" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <input aria-label="Filtrar por ano" inputMode="numeric" className="form-control" placeholder="Ano" value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })} />
            <button className="button-primary">
              <Filter size={18} /> Filtrar
            </button>
          </form>
        </div>
        <ErrorState message={error} onRetry={reload} />
        {loading ? <SkeletonGrid /> : (series ?? []).length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
            {(series ?? []).map((item) => <SeriesCard key={item.id} item={item} />)}
          </div>
        ) : <EmptyState title="No encontramos series" description="Prueba con otros filtros o limpia la busqueda." action={<button type="button" onClick={() => { setFilters({ search: '', genre: '', status: '', year: '' }); setQuery({ search: '', genre: '', status: '', year: '' }); }} className="rounded-lg bg-brand px-4 py-2 font-bold text-ink">Limpiar filtros</button>} />}
      </section>
    </main>
  );
}
