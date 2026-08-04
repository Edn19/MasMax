import { Calendar, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FavoriteButton } from '../components/FavoriteButton';
import { EmptyState, ErrorState, LoadingBlock } from '../components/Layout';
import { VideoPlayer } from '../components/VideoPlayer';
import { api, postJson } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import { useSiteSettings } from '../lib/site-settings';
import { Comment, Episode } from '../types/models';
import { SmartImage } from '../components/SmartImage';
import { applyCreatedComment } from '../lib/comment-feedback';

export function WatchPage() {
  const { episodeId: id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const episode = useAsync<Episode>(() => api(`/episodes/${id}`), [id]);
  const related = useAsync<Episode[]>(
    () => episode.data?.series?.slug ? api(`/series/${episode.data.series.slug}/episodes`) : Promise.resolve([]),
    [episode.data?.series?.slug],
  );
  const comments = useAsync<Comment[]>(() => api(`/comments/${id}`), [id]);
  const settings = useSiteSettings();
  const ordered = useMemo(() => [...(related.data ?? [])].sort((a, b) => (a.season?.number ?? 0) - (b.season?.number ?? 0) || a.position - b.position || a.number - b.number), [related.data]);
  const currentIndex = ordered.findIndex((item) => item.id === id);
  const previous = currentIndex > 0 ? ordered[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 ? ordered[currentIndex + 1] : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    try {
      const created = await postJson<Comment>('/comments', { episodeId: id, body });
      const result = applyCreatedComment(comments.data ?? [], created);
      comments.setData(result.comments);
      setBody('');
      toast.success(result.message);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  if (episode.loading) return <main className="mx-auto max-w-7xl px-4 py-12"><LoadingBlock /></main>;
  if (!episode.data) return <main className="mx-auto max-w-7xl px-4 py-12"><ErrorState message={episode.error ?? 'El episodio no existe o no esta publicado.'} onRetry={episode.reload} /></main>;

  const item = episode.data;
  return (
    <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_clamp(320px,27vw,400px)]">
        <section className="min-w-0">
          <VideoPlayer type={item.videoType} source={item.videoSource} poster={item.thumbnailUrl} episodeId={item.id} subtitles={item.subtitles}
            markers={{ introStartSec: item.introStartSec, introEndSec: item.introEndSec, recapStartSec: item.recapStartSec, recapEndSec: item.recapEndSec }}
            nextItem={next ? { label: `E${next.number}. ${next.title}`, onPlay: () => navigate(`/watch/${next.id}`) } : undefined} />
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-white sm:text-3xl">E{item.number}. {item.title}</h1>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
            <div>
              <Link className="font-bold text-brand" to={`/series/${item.series?.slug}`}>{item.series?.title}</Link>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-400"><Calendar size={15} /> {new Date(item.publishedAt).toLocaleDateString()}</p>
            </div>
            <FavoriteButton episodeId={item.id} />
          </div>

          <div className="mt-5 flex gap-3">
            {previous && <Link to={`/watch/${previous.id}`} className="button-secondary rounded-full"><ChevronLeft size={17} /> Anterior</Link>}
            {next && <Link to={`/watch/${next.id}`} className="button-primary rounded-full">Siguiente <ChevronRight size={17} /></Link>}
          </div>

          <div className="mt-5 rounded-2xl border border-line bg-panel/60 p-5">
            <p className="leading-7 text-slate-300">{item.description}</p>
          </div>

          {settings.showComments && (
            <section className="mt-8">
              <h2 className="mb-4 text-xl font-bold text-white">Comentarios</h2>
              <form onSubmit={submit} className="mb-6 flex flex-col gap-3 sm:flex-row">
                <textarea aria-label="Comentario" className="form-control min-h-24 flex-1" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escribe tu comentario" />
                <button className="button-primary h-fit">Publicar</button>
              </form>
              <div className="space-y-3">
                {(comments.data ?? []).map((comment) => (
                  <article key={comment.id} className="rounded-xl border border-line bg-panel/60 p-4">
                    <p className="font-semibold text-white">{comment.user.name}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{comment.body}</p>
                  </article>
                ))}
              </div>
              {!comments.loading && (comments.data ?? []).length === 0 && <EmptyState title="Todavia no hay comentarios" description="Puedes iniciar la conversacion sobre este episodio." />}
            </section>
          )}
        </section>

        <aside className="xl:sticky xl:top-[calc(var(--header-height)+1rem)] xl:max-h-[calc(100vh-var(--header-height)-2rem)]">
          <h2 className="mb-4 text-xl font-bold text-white">Episodios de la serie</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:max-h-[calc(100vh-var(--header-height)-5rem)] xl:grid-cols-1 xl:overflow-y-auto xl:pr-2">
            {ordered.map((relatedEpisode) => {
              const active = relatedEpisode.id === item.id;
              return (
              <Link key={relatedEpisode.id} to={`/watch/${relatedEpisode.id}`} aria-current={active ? 'page' : undefined} className={`group grid grid-cols-[128px,1fr] gap-3 rounded-xl border p-2 transition sm:grid-cols-[150px,1fr] ${active ? 'border-brand/45 bg-brand/10' : 'border-transparent hover:border-line hover:bg-panel'}`}>
                <div className="relative">
                  <SmartImage src={relatedEpisode.thumbnailUrl} alt={`Miniatura de ${relatedEpisode.title}`} className="aspect-video w-full rounded-lg bg-ink object-cover" />
                  <Play className={`absolute inset-0 m-auto text-white transition ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} size={22} fill="currentColor" />
                </div>
                <div>
                  {active && <p className="mb-1 text-[.68rem] font-semibold uppercase tracking-wider text-brand">Reproduciendo</p>}
                  <h3 className="line-clamp-2 font-medium text-white">E{relatedEpisode.number}. {relatedEpisode.title}</h3>
                  <p className="mt-2 text-xs text-slate-400">Temporada {relatedEpisode.season?.number ?? 1}</p>
                </div>
              </Link>
            ); })}
          </div>
          {!related.loading && ordered.length <= 1 && <EmptyState title="No hay mas episodios publicados" />}
        </aside>
      </div>
    </main>
  );
}
