import { Calendar, Clock3, Play } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { FavoriteButton } from '../components/FavoriteButton';
import { LoadingBlock } from '../components/Layout';
import { VideoPlayer } from '../components/VideoPlayer';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Movie } from '../types/models';

export function MovieWatchPage() {
  const { slug = '' } = useParams();
  const movie = useAsync<Movie>(() => api(`/movies/${slug}`), [slug]);
  const recommendations = useAsync<Movie[]>(() => movie.data ? api(`/movies/${movie.data.id}/recommendations`) : Promise.resolve([]), [movie.data?.id]);

  if (movie.loading) return <main className="mx-auto max-w-7xl px-4 py-12"><LoadingBlock /></main>;
  if (!movie.data) return <main className="mx-auto max-w-7xl px-4 py-12">Pelicula no encontrada</main>;

  const item = movie.data;
  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6">
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0">
          <VideoPlayer src={item.processedVideoUrl || item.videoUrl} originalSrc={item.originalVideoUrl} type={item.videoType} source={item.videoSource} poster={item.bannerUrl || item.posterUrl} />
          <h1 className="mt-5 text-2xl font-black text-white sm:text-3xl">{item.title}</h1>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
            <div className="flex flex-wrap gap-4 text-sm text-slate-400">
              <span className="flex items-center gap-2"><Calendar size={16} /> {item.releaseYear}</span>
              <span className="flex items-center gap-2"><Clock3 size={16} /> {item.duration} minutos</span>
            </div>
            <FavoriteButton movieId={item.id} />
          </div>
          <div className="mt-5 rounded-xl bg-panel/70 p-5">
            <div className="mb-3 flex flex-wrap gap-2">{item.genres.map((genre) => <span key={genre.id} className="rounded-full bg-ink px-3 py-1 text-xs text-brand">{genre.name}</span>)}</div>
            <p className="leading-7 text-slate-300">{item.description}</p>
          </div>
        </section>
        <aside>
          <h2 className="mb-4 text-xl font-black text-white">Peliculas recomendadas</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {(recommendations.data ?? []).map((recommended) => (
              <Link key={recommended.id} to={`/watch/movie/${recommended.slug}`} className="group grid grid-cols-[150px,1fr] gap-3 rounded-xl p-2 hover:bg-panel">
                <div className="relative"><img src={recommended.bannerUrl || recommended.posterUrl} alt={recommended.title} className="aspect-video w-full rounded-lg object-cover" /><Play className="absolute inset-0 m-auto text-white opacity-0 group-hover:opacity-100" fill="currentColor" /></div>
                <div><h3 className="line-clamp-2 font-bold text-white">{recommended.title}</h3><p className="mt-2 text-xs text-slate-400">{recommended.releaseYear} · {recommended.duration} min</p></div>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
