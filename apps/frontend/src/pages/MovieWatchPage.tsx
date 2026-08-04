import { Calendar, Clock3, Play } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { FavoriteButton } from '../components/FavoriteButton';
import { EmptyState, ErrorState, LoadingBlock } from '../components/Layout';
import { VideoPlayer } from '../components/VideoPlayer';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Movie } from '../types/models';
import { SmartImage } from '../components/SmartImage';

export function MovieWatchPage() {
  const { slug = '' } = useParams();
  const movie = useAsync<Movie>(() => api(`/movies/${slug}`), [slug]);
  const recommendations = useAsync<Movie[]>(() => movie.data ? api(`/movies/${movie.data.id}/recommendations`) : Promise.resolve([]), [movie.data?.id]);

  if (movie.loading) return <main className="mx-auto max-w-7xl px-4 py-12"><LoadingBlock /></main>;
  if (!movie.data) return <main className="mx-auto max-w-7xl px-4 py-12"><ErrorState message={movie.error ?? 'La pelicula no existe o no esta publicada.'} onRetry={movie.reload} /></main>;

  const item = movie.data;
  return (
    <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_clamp(320px,27vw,400px)]">
        <section className="min-w-0">
          <VideoPlayer type={item.videoType} source={item.videoSource} poster={item.bannerUrl || item.posterUrl} movieId={item.id} subtitles={item.subtitles}
            markers={{ introStartSec: item.introStartSec, introEndSec: item.introEndSec, recapStartSec: item.recapStartSec, recapEndSec: item.recapEndSec }} />
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-white sm:text-3xl">{item.title}</h1>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
            <div className="flex flex-wrap gap-4 text-sm text-slate-400">
              <span className="flex items-center gap-2"><Calendar size={16} /> {item.releaseYear}</span>
              <span className="flex items-center gap-2"><Clock3 size={16} /> {item.duration} minutos</span>
            </div>
            <FavoriteButton movieId={item.id} />
          </div>
          <div className="mt-5 rounded-2xl border border-line bg-panel/60 p-5">
            <div className="mb-3 flex flex-wrap gap-2">{item.genres.map((genre) => <span key={genre.id} className="rounded-full bg-ink px-3 py-1 text-xs text-brand">{genre.name}</span>)}</div>
            <p className="leading-7 text-slate-300">{item.description}</p>
          </div>
        </section>
        <aside className="xl:sticky xl:top-[calc(var(--header-height)+1rem)] xl:max-h-[calc(100vh-var(--header-height)-2rem)]">
          <h2 className="mb-4 text-xl font-bold text-white">Peliculas recomendadas</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:max-h-[calc(100vh-var(--header-height)-5rem)] xl:grid-cols-1 xl:overflow-y-auto xl:pr-2">
            {(recommendations.data ?? []).map((recommended) => (
              <Link key={recommended.id} to={`/watch/movie/${recommended.slug}`} className="group grid grid-cols-[150px,1fr] gap-3 rounded-xl p-2 hover:bg-panel">
                <div className="relative"><SmartImage src={recommended.bannerUrl || recommended.posterUrl} alt={`Miniatura de ${recommended.title}`} className="aspect-video w-full rounded-lg object-cover" /><Play className="absolute inset-0 m-auto text-white opacity-0 group-hover:opacity-100" fill="currentColor" /></div>
                <div><h3 className="line-clamp-2 font-bold text-white">{recommended.title}</h3><p className="mt-2 text-xs text-slate-400">{recommended.releaseYear} · {recommended.duration} min</p></div>
              </Link>
            ))}
          </div>
          {!recommendations.loading && (recommendations.data ?? []).length === 0 && <EmptyState title="No hay recomendaciones disponibles" />}
        </aside>
      </div>
    </main>
  );
}
