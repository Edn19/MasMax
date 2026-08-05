import { Activity, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState } from '../../components/Layout';
import { api, postJson } from '../../lib/api';
import { VideoProcessingJob } from '../../lib/resumable-upload';
import { boundedPercent } from '../../lib/ui';
import { useVideoProcessingJobs } from '../../lib/video-processing-jobs';
import { ProcessingJobRow, processingStageLabel } from '../../lib/video-processing-state';
import { Episode, Movie } from '../../types/models';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Panel, ResourceError } from '../components/AdminUi';

type ProcessingRow = ProcessingJobRow;
type WorkerHealth = { queue: string; worker: string; heartbeat?: string | null };
type EpisodePage = { items: Episode[] };
type AssociationChoice = { targetType: 'EPISODE' | 'MOVIE'; targetId: string };

export function VideoProcessingAdminPage() {
  const processing = useVideoProcessingJobs();
  const jobs = processing.jobs;
  const [health, setHealth] = useState<WorkerHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<ProcessingRow | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [associations, setAssociations] = useState<Record<string, AssociationChoice>>({});

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [nextHealth, episodePage, movieItems] = await Promise.all([api<WorkerHealth>('/admin/video-processing/worker-health'), api<EpisodePage>('/admin/episodes?page=1&limit=100'), api<Movie[]>('/admin/movies')]);
        if (mounted) { setHealth(nextHealth); setEpisodes(episodePage.items); setMovies(movieItems); setError(null); }
      } catch (reason) { if (mounted) setError((reason as Error).message); }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  async function retry(id: string) { try { await processing.retry(id); toast.success('Trabajo reenviado'); } catch (reason) { toast.error((reason as Error).message); } }
  async function cancel() { if (!pendingCancel) return; try { await processing.cancel(pendingCancel.id); toast.success('Cancelacion solicitada'); setPendingCancel(null); } catch (reason) { toast.error((reason as Error).message); } }
  async function associate(job: ProcessingRow) { const choice = associations[job.id]; if (!choice?.targetId) return toast.error('Selecciona una pelicula o episodio'); try { await postJson(`/admin/video-processing/${job.id}/associate`, choice); await processing.refresh(); toast.success('HLS asociado al contenido'); } catch (reason) { toast.error((reason as Error).message); } }
  function changeAssociation(jobId: string, update: Partial<AssociationChoice>) { setAssociations((current) => ({ ...current, [jobId]: { targetType: update.targetType ?? current[jobId]?.targetType ?? 'EPISODE', targetId: update.targetId ?? (update.targetType ? '' : current[jobId]?.targetId ?? '') } })); }

  return <Panel title="Procesamiento de video" description="Supervisa la conversion a HLS, la cola Redis y la disponibilidad del worker." action={<Link to="/admin/episodes" className="button-primary"><Upload size={17} /> Subir video</Link>}>
    <ResourceError message={error ?? processing.error} />
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:max-w-xl"><HealthCard label="Redis" value={health?.queue} /><HealthCard label="Worker" value={health?.worker} detail={health?.heartbeat ? `Ultimo latido: ${new Date(health.heartbeat).toLocaleTimeString()}` : undefined} /></div>
    {jobs.length === 0 ? <EmptyState icon={<Activity size={30} />} title="No hay videos en procesamiento" description="Los videos enviados para convertir a HLS apareceran aqui." action={<Link to="/admin/episodes" className="button-primary"><Upload size={17} /> Subir video</Link>} /> : <div className="admin-table-shell" role="region" aria-label="Trabajos de procesamiento" tabIndex={0}>
      <table className="min-w-[1220px]"><thead><tr><th>Archivo</th><th>Estado</th><th>Etapa y origen</th><th>Progreso</th><th>Calidades</th><th>Original</th><th>Destino</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>{jobs.map((job) => { const progress = boundedPercent(job.progress); const choice = associations[job.id] ?? { targetType: 'EPISODE' as const, targetId: '' }; const targets = choice.targetType === 'EPISODE' ? episodes : movies; return <tr key={job.id}><td className="max-w-xs"><p className="truncate font-medium text-white" title={job.input.originalName}>{job.input.originalName}</p>{job.errorMessage && <details className="mt-1 text-xs text-coral"><summary className="cursor-pointer">Ver error</summary><p className="mt-1 max-w-sm whitespace-normal">{job.errorMessage}</p></details>}</td><td><JobBadge status={job.status} /></td><td className="max-w-56 text-xs text-slate-400"><p>{processingStageLabel(job.stage, job.status)}</p><p>{job.sourceFormat ?? 'Analizando'} · {job.sourceVideoCodec ?? 'codec pendiente'}</p></td><td><div className="w-36"><div className="mb-1 flex justify-between text-xs text-slate-400"><span>{job.status === 'PROCESSING' ? 'Procesando' : 'Avance'}</span><span>{Math.round(progress)}%</span></div><div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-ink"><div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress}%` }} /></div></div></td><td>{(job.generatedQualities.length ? job.generatedQualities : job.profiles).map((profile) => `${profile}p`).join(', ') || '-'}</td><td>{job.retainOriginal ? 'Conservar' : 'Eliminar al asociar'}</td><td>{job.associatedAt ? <span className="text-mint">Asociado</span> : job.status === 'COMPLETED' ? <div className="grid min-w-52 gap-2"><select className="input min-h-9 py-1" value={choice.targetType} onChange={(event) => changeAssociation(job.id, { targetType: event.target.value as AssociationChoice['targetType'] })}><option value="EPISODE">Episodio</option><option value="MOVIE">Pelicula</option></select><select className="input min-h-9 py-1" value={choice.targetId} onChange={(event) => changeAssociation(job.id, { targetId: event.target.value })}><option value="">Selecciona contenido</option>{targets.map((target) => <option key={target.id} value={target.id}>{choice.targetType === 'EPISODE' ? `${(target as Episode).series?.title ?? 'Serie'} · E${(target as Episode).number} · ${target.title}` : target.title}</option>)}</select><button type="button" className="button-primary min-h-9 px-3 py-1" onClick={() => void associate(job)}>Asociar</button></div> : '-'}</td><td className="whitespace-nowrap text-slate-400">{new Date(job.createdAt).toLocaleDateString()}</td><td><div className="flex gap-2">{['FAILED', 'CANCELLED'].includes(job.status) && <button type="button" onClick={() => void retry(job.id)} className="button-secondary min-h-9 px-3 py-1"><RefreshCw size={15} /> Reintentar</button>}{['QUEUED', 'PROCESSING'].includes(job.status) && <button type="button" onClick={() => setPendingCancel(job)} className="button-secondary min-h-9 border-coral/40 px-3 py-1 text-coral">Cancelar</button>}</div></td></tr>; })}</tbody></table>
    </div>}
    <ConfirmDialog open={Boolean(pendingCancel)} title="Cancelar procesamiento" itemName={pendingCancel?.input.originalName} description="La conversion FFmpeg se detendra. Podras reintentar el trabajo posteriormente." confirmLabel="Cancelar procesamiento" onCancel={() => setPendingCancel(null)} onConfirm={() => void cancel()} />
  </Panel>;
}

function HealthCard({ label, value, detail }: { label: string; value?: string; detail?: string }) {
  const healthy = value === 'ok'; const waiting = !value;
  return <div className="rounded-xl border border-line bg-ink/55 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-white">{label}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${waiting ? 'border-line text-slate-400' : healthy ? 'border-mint/35 bg-mint/10 text-mint' : 'border-coral/35 bg-coral/10 text-coral'}`}>{waiting ? 'Consultando' : healthy ? 'Disponible' : 'No disponible'}</span></div>{detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}</div>;
}

function JobBadge({ status }: { status: VideoProcessingJob['status'] }) {
  const style = status === 'COMPLETED' ? 'border-mint/35 bg-mint/10 text-mint' : status === 'FAILED' || status === 'CANCELLED' ? 'border-coral/35 bg-coral/10 text-coral' : 'border-warning/35 bg-warning/10 text-warning';
  const label = { QUEUED: 'Pendiente', PROCESSING: 'Procesando', COMPLETED: 'Completado', FAILED: 'Error', CANCELLED: 'Cancelado' }[status];
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>;
}
