import { Calendar, Eye, Play } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { LoadingBlock } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Series } from '../types/models';

export function SeriesDetailPage() {
  const { slug = '' } = useParams();
  const { data: series, loading } = useAsync<Series>(() => api(`/series/${slug}`), [slug]);

  if (loading) return <main className="mx-auto max-w-7xl px-4 py-12"><LoadingBlock /></main>;
  if (!series) return <main className="mx-auto max-w-7xl px-4 py-12">Serie no encontrada</main>;

  return (
    <main>
      <section className="relative min-h-[54vh] overflow-hidden">
        <img src={series.banner} alt={series.title} className="absolute inset-0 h-full w-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/80 to-ink/10" />
        <div className="relative mx-auto grid min-h-[54vh] max-w-7xl items-end gap-8 px-4 pb-10 pt-20 md:grid-cols-[220px,1fr]">
          <img src={series.cover} alt={series.title} className="hidden aspect-[2/3] w-full rounded-lg border border-line object-cover shadow-glow md:block" />
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <StatusBadge status={series.status} />
              {series.genres.map((genre) => <span key={genre.id} className="rounded-full border border-line px-3 py-1 text-xs text-slate-300">{genre.name}</span>)}
            </div>
            <h1 className="text-4xl font-black text-white md:text-6xl">{series.title}</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{series.description}</p>
            <div className="mt-5 flex flex-wrap gap-5 text-sm text-slate-400">
              <span className="flex items-center gap-2"><Calendar size={16} /> {series.year}</span>
              <span className="flex items-center gap-2"><Eye size={16} /> {series.views} vistas</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <h2 className="mb-5 text-2xl font-black text-white">Episodios</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(series.episodes ?? []).map((episode) => (
            <Link key={episode.id} to={`/watch/${episode.id}`} className="flex overflow-hidden rounded-lg border border-line bg-panel/70 hover:border-brand/50">
              {episode.thumbnailUrl && <img src={episode.thumbnailUrl} alt={episode.title} className="w-32 object-cover sm:w-44" />}
              <div className="flex flex-1 flex-col justify-center p-4">
                <p className="text-sm text-brand">Episodio {episode.number}</p>
                <h3 className="font-bold text-white">{episode.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-slate-400">{episode.description}</p>
              </div>
              <div className="flex items-center pr-4 text-brand"><Play size={20} /></div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
