import { Activity, Clapperboard, Database, Eye, Film, HardDrive, MessageSquare, Server, Users } from 'lucide-react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LoadingBlock } from '../../components/Layout';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Stats } from '../../types/models';
import { Panel, ResourceError } from '../components/AdminUi';
import { formatBytes } from '../components/admin-utils';

const typeLabels = { series: 'Serie', episode: 'Episodio', movie: 'Pelicula' } as const;

function MetricCard({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: string; icon: ReactNode }) {
  return (
    <article className="rounded-xl border border-line bg-ink p-4">
      <div className="flex items-center justify-between text-slate-400"><p className="text-xs font-semibold uppercase tracking-wide">{label}</p>{icon}</div>
      <strong className="mt-3 block text-2xl text-white">{value}</strong>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-xl border border-line bg-ink/70 p-4"><h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>{children}</section>;
}

function HealthItem({ label, status }: { label: string; status: 'ok' | 'error' }) {
  return <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-3 py-2"><span className="text-sm text-slate-300">{label}</span><span className={status === 'ok' ? 'text-mint' : 'text-coral'}>{status === 'ok' ? 'Operativo' : 'Error'}</span></div>;
}

export function DashboardPage() {
  const dashboard = useAsync<Stats>(() => api('/admin/stats'), []);
  if (dashboard.loading) return <LoadingBlock />;
  const data = dashboard.data;
  if (!data) return <Panel title="Dashboard"><ResourceError message={dashboard.error ?? 'No se pudieron cargar las metricas.'} /></Panel>;

  const maxDailyViews = Math.max(...data.views.daily.map((item) => item.views), 1);
  const generatedAt = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt));

  return (
    <Panel title="Dashboard">
      <ResourceError message={dashboard.error} />
      <p className="mb-5 text-xs text-slate-500">Actualizado {generatedAt}</p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Peliculas" value={data.totals.movies} icon={<Film size={18} />} />
        <MetricCard label="Series" value={data.totals.series} icon={<Film size={18} />} />
        <MetricCard label="Temporadas" value={data.totals.seasons ?? '—'} detail={data.totals.seasons === null ? 'Disponible tras la fase de temporadas' : undefined} icon={<Clapperboard size={18} />} />
        <MetricCard label="Episodios" value={data.totals.episodes} icon={<Clapperboard size={18} />} />
        <MetricCard label="Usuarios" value={data.totals.users} detail={`${data.usersSummary.activeRecently} activos en 30 dias`} icon={<Users size={18} />} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Link to="/admin/processing"><MetricCard label="Procesando ahora" value={data.mediaSummary.active} icon={<Activity size={18} />} /></Link>
        <Link to="/admin/media?status=FAILED"><MetricCard label="Fallidos" value={data.mediaSummary.failed} icon={<Activity size={18} />} /></Link>
        <Link to="/admin/media?status=COMPLETED"><MetricCard label="HLS listos" value={data.mediaSummary.completed} icon={<HardDrive size={18} />} /></Link>
        <Link to="/admin/media?contentType=UNASSIGNED"><MetricCard label="Sin asignar" value={data.mediaSummary.unassigned} icon={<Database size={18} />} /></Link>
        <Link to="/admin/media?publication=PUBLISHED"><MetricCard label="Publicados" value={data.mediaSummary.published} icon={<Eye size={18} />} /></Link>
        <Link to="/admin/media?publication=DRAFT"><MetricCard label="Borradores" value={data.mediaSummary.drafts} icon={<Clapperboard size={18} />} /></Link>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr,1fr]">
        <Section title="Reproducciones diarias">
          <div className="flex h-52 items-end gap-1" aria-label="Reproducciones de los ultimos 14 dias">
            {data.views.daily.map((item) => {
              const height = Math.max((item.views / maxDailyViews) * 100, item.views ? 6 : 2);
              return <div key={item.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${item.date}: ${item.views} reproducciones`}><span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100">{item.views}</span><div className="w-full rounded-t bg-brand/80 transition hover:bg-brand" style={{ height: `${height}%` }} /><span className="hidden text-[9px] text-slate-500 sm:block">{item.date.slice(8)}</span></div>;
            })}
          </div>
          <p className="mt-3 text-sm text-slate-400"><Eye className="mr-1 inline" size={16} /> {data.views.total} reproducciones registradas</p>
        </Section>
        <Section title="Estado del sistema">
          <div className="grid gap-2"><HealthItem label="Backend" status={data.health.backend} /><HealthItem label="PostgreSQL" status={data.health.database} /><HealthItem label="Almacenamiento" status={data.health.storage} /></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-panel p-3"><span className="text-slate-500">Sesiones activas</span><strong className="block text-xl text-white">{data.usersSummary.activeSessions}</strong></div><div className="rounded-lg bg-panel p-3"><span className="text-slate-500">Cuentas activas</span><strong className="block text-xl text-white">{data.usersSummary.active}</strong></div></div>
        </Section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Section title="Contenido mas visto">
          <div className="grid gap-2">{data.content.mostViewed.length ? data.content.mostViewed.map((item) => <div key={`${item.type}-${item.id}`} className="flex items-center justify-between rounded-lg bg-panel p-3"><div className="min-w-0"><p className="truncate font-bold text-white">{item.title}</p><p className="text-xs text-slate-500">{item.subtitle ?? typeLabels[item.type]}</p></div><span className="ml-3 whitespace-nowrap text-sm text-brand">{item.views} vistas</span></div>) : <p className="text-sm text-slate-400">Todavia no hay contenido reproducido.</p>}</div>
        </Section>
        <Section title="Agregado recientemente">
          <div className="grid gap-2">{data.content.recentlyAdded.map((item) => <div key={`${item.type}-${item.id}`} className="flex items-center justify-between rounded-lg bg-panel p-3"><div className="min-w-0"><p className="truncate font-bold text-white">{item.title}</p><p className="text-xs text-slate-500">{typeLabels[item.type]}</p></div><time className="ml-3 text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString('es-PE')}</time></div>)}</div>
        </Section>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Comentarios pendientes" value={data.comments.pending} icon={<MessageSquare size={18} />} />
        <MetricCard label="Sin portada" value={data.content.withoutPoster} detail={`${data.content.seriesWithoutCover} series · ${data.content.moviesWithoutPoster} peliculas`} icon={<Film size={18} />} />
        <MetricCard label="Episodios sin video" value={data.content.episodesWithoutVideo} icon={<Clapperboard size={18} />} />
        <MetricCard label="Archivos huerfanos" value={data.files.orphaned} detail={`${data.files.failed} fallidos · ${data.files.processing} procesando`} icon={<HardDrive size={18} />} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Section title="Almacenamiento">
          <div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Videos" value={formatBytes(data.storage.videoBytes)} detail={`${data.storage.videos} archivos`} icon={<HardDrive size={18} />} /><MetricCard label="Imagenes" value={formatBytes(data.storage.imageBytes)} detail={`${data.storage.images} archivos`} icon={<Database size={18} />} /><MetricCard label="Espacio libre" value={formatBytes(data.storage.freeBytes)} detail={`${formatBytes(data.storage.totalBytes)} utilizados`} icon={<Server size={18} />} /></div>
        </Section>
        <Section title="Actividad reciente">
          <div className="grid gap-2">{data.recentActivity.length ? data.recentActivity.slice(0, 6).map((item) => <div key={item.id} className="rounded-lg bg-panel p-3"><p className="text-sm font-bold text-white">{item.action}</p><p className="text-xs text-slate-500">{item.actor?.email ?? 'Sistema'} · {item.entity} · {new Date(item.createdAt).toLocaleString('es-PE')}</p></div>) : <p className="text-sm text-slate-400">No hay actividad administrativa reciente.</p>}</div>
        </Section>
      </div>

      {data.files.recentErrors.length > 0 && <div className="mt-5"><Section title="Errores recientes de procesamiento"><div className="grid gap-2">{data.files.recentErrors.map((item) => <div key={item.id} role="alert" className="rounded-lg border border-coral/30 bg-coral/10 p-3"><p className="font-bold text-coral">{item.originalName}</p><p className="text-sm text-slate-300">{item.errorMessage ?? 'Procesamiento fallido sin detalle.'}</p></div>)}</div></Section></div>}
    </Panel>
  );
}
