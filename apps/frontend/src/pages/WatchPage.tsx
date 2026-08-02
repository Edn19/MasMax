import { Calendar, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FavoriteButton } from '../components/FavoriteButton';
import { LoadingBlock } from '../components/Layout';
import { VideoPlayer } from '../components/VideoPlayer';
import { api, postJson } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import { useSiteSettings } from '../lib/site-settings';
import { Comment, Episode } from '../types/models';

export function WatchPage() {
  const { episodeId: id = '' } = useParams();
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const episode = useAsync<Episode>(() => api(`/episodes/${id}`), [id]);
  const related = useAsync<Episode[]>(
    () => episode.data?.series?.slug ? api(`/series/${episode.data.series.slug}/episodes`) : Promise.resolve([]),
    [episode.data?.series?.slug],
  );
  const comments = useAsync<Comment[]>(() => api(`/comments/${id}`), [id]);
  const settings = useSiteSettings();
  const ordered = useMemo(() => [...(related.data ?? [])].sort((a, b) => a.number - b.number), [related.data]);
  const currentIndex = ordered.findIndex((item) => item.id === id);
  const previous = currentIndex > 0 ? ordered[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 ? ordered[currentIndex + 1] : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    try {
      await postJson('/comments', { episodeId: id, body });
      comments.setData([...(comments.data ?? []), { id: crypto.randomUUID(), body, approved: true, createdAt: new Date().toISOString(), user: { name: user?.name ?? 'Usuario' } }]);
      setBody('');
      toast.success('Comentario publicado');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  if (episode.loading) return <main className="mx-auto max-w-7xl px-4 py-12"><LoadingBlock /></main>;
  if (!episode.data) return <main className="mx-auto max-w-7xl px-4 py-12">Episodio no encontrado</main>;

  const item = episode.data;
  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6">
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0">
          <VideoPlayer src={item.processedVideoUrl || item.videoUrl} originalSrc={item.originalVideoUrl} type={item.videoType} source={item.videoSource} poster={item.thumbnailUrl} episodeId={item.id} />
          <h1 className="mt-5 text-2xl font-black text-white sm:text-3xl">E{item.number}. {item.title}</h1>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
            <div>
              <Link className="font-bold text-brand" to={`/series/${item.series?.slug}`}>{item.series?.title}</Link>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-400"><Calendar size={15} /> {new Date(item.publishedAt).toLocaleDateString()}</p>
            </div>
            <FavoriteButton episodeId={item.id} />
          </div>

          <div className="mt-5 flex gap-3">
            {previous && <Link to={`/watch/${previous.id}`} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-bold hover:border-brand"><ChevronLeft size={17} /> Anterior</Link>}
            {next && <Link to={`/watch/${next.id}`} className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-ink hover:bg-white">Siguiente <ChevronRight size={17} /></Link>}
          </div>

          <div className="mt-5 rounded-xl bg-panel/70 p-5">
            <p className="leading-7 text-slate-300">{item.description}</p>
          </div>

          {settings.showComments && (
            <section className="mt-8">
              <h2 className="mb-4 text-xl font-black text-white">Comentarios</h2>
              <form onSubmit={submit} className="mb-6 flex flex-col gap-3 sm:flex-row">
                <textarea className="min-h-24 flex-1 rounded-xl border border-line bg-panel p-3 outline-none focus:border-brand" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escribe tu comentario" />
                <button className="h-fit rounded-xl bg-brand px-5 py-3 font-bold text-ink hover:bg-white">Publicar</button>
              </form>
              <div className="space-y-3">
                {(comments.data ?? []).map((comment) => (
                  <article key={comment.id} className="rounded-xl border border-line bg-panel/60 p-4">
                    <p className="font-bold text-white">{comment.user.name}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{comment.body}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>

        <aside>
          <h2 className="mb-4 text-xl font-black text-white">Episodios de la serie</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {ordered.filter((relatedEpisode) => relatedEpisode.id !== item.id).map((relatedEpisode) => (
              <Link key={relatedEpisode.id} to={`/watch/${relatedEpisode.id}`} className="group grid grid-cols-[150px,1fr] gap-3 rounded-xl p-2 hover:bg-panel">
                <div className="relative">
                  <img src={relatedEpisode.thumbnailUrl} alt={relatedEpisode.title} className="aspect-video w-full rounded-lg bg-ink object-cover" />
                  <Play className="absolute inset-0 m-auto text-white opacity-0 group-hover:opacity-100" size={22} fill="currentColor" />
                </div>
                <div>
                  <h3 className="line-clamp-2 font-bold text-white">E{relatedEpisode.number}. {relatedEpisode.title}</h3>
                  <p className="mt-2 text-xs text-slate-400">{item.series?.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
