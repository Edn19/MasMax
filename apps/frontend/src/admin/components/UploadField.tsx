import { CheckCircle2, FileUp, Image as ImageIcon, RotateCcw, Trash2, UploadCloud } from 'lucide-react';
import { DragEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, deleteJson, patchJson, postJson, uploadFile } from '../../lib/api';
import { cancelResumableUpload, getResumableUpload, initiateResumableUpload, listResumableUploads, matchesResumableFile, ResumableUploadResult, ResumableUploadSession, UploadControl, uploadResumableVideo, VideoProcessingJob } from '../../lib/resumable-upload';
import { acceptedVideoInput, validateVideoSelection } from '../../lib/video-upload-policy';
import { formatBytes } from './admin-utils';

type UploadedDetails = { originalUrl?: string; thumbnailUrl?: string };

export function UploadField({ type, label, onUploaded }: { type: 'video' | 'image'; label: string; onUploaded: (url: string, mimeType: string, details?: UploadedDetails) => void }) {
  const maxVideoUploadMb = Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_MB ?? 2048);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const [retryMessage, setRetryMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<ResumableUploadSession | null>(null);
  const [pending, setPending] = useState<ResumableUploadSession[]>([]);
  const [processingJob, setProcessingJob] = useState<VideoProcessingJob | null>(null);
  const [uploadedResult, setUploadedResult] = useState<ResumableUploadResult | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [keepOriginal, setKeepOriginal] = useState(String(import.meta.env.VITE_VIDEO_KEEP_ORIGINAL_DEFAULT ?? 'true').toLowerCase() === 'true');
  const controlRef = useRef<UploadControl>({ paused: false, cancelled: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  useEffect(() => { if (type === 'video') void listResumableUploads().then(setPending).catch(() => undefined); }, [type]);
  useEffect(() => {
    if (!processingJob) return;
    if (processingJob.status === 'COMPLETED' && processingJob.masterUrl) {
      setProcessingJob(null);
      onUploadedRef.current(processingJob.masterUrl, 'application/vnd.apple.mpegurl', { originalUrl: uploadedResult?.url, thumbnailUrl: processingJob.thumbnailUrl ?? undefined });
      toast.success('Video HLS procesado y listo');
      return;
    }
    if (!['QUEUED', 'PROCESSING'].includes(processingJob.status)) return;
    const timeout = window.setTimeout(() => void api<VideoProcessingJob>(`/admin/video-processing/${processingJob.id}`).then(setProcessingJob).catch((error: Error) => toast.error(error.message)), 2000);
    return () => window.clearTimeout(timeout);
  }, [processingJob, uploadedResult]);

  async function select(selected?: File) {
    if (!selected) return;
    setError(''); setCompleted(false);
    if (type === 'video') {
      const validationError = validateVideoSelection(selected, maxVideoUploadMb);
      if (validationError) { setError(validationError); return toast.error(validationError); }
      setFile(selected);
      const existing = pending.find((item) => matchesResumableFile(item, selected));
      await startVideo(selected, existing ?? await initiateResumableUpload(selected));
      return;
    }
    const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!imageTypes.includes(selected.type)) { const message = 'Formato no permitido. Usa JPG, PNG o WebP.'; setError(message); return toast.error(message); }
    const maxImageMb = Number(import.meta.env.VITE_MAX_IMAGE_UPLOAD_MB ?? 10);
    if (selected.size > maxImageMb * 1024 * 1024) { const message = `La imagen supera el limite de ${maxImageMb} MB.`; setError(message); return toast.error(message); }
    setFile(selected);
    setUploading(true); setProgress(0);
    try { const result = await uploadFile<{ url: string; mimeType: string }>('/admin/uploads/image', selected, setProgress); onUploaded(result.url, result.mimeType); setCompleted(true); toast.success('Archivo subido'); }
    catch (caught) { const message = (caught as Error).message; setError(message); toast.error(message); }
    finally { setUploading(false); }
  }

  async function startVideo(selected: File, current: ResumableUploadSession) {
    const control: UploadControl = { paused: false, cancelled: false, abortController: new AbortController() };
    controlRef.current = control;
    setSession(current); setPaused(false); setUploading(true); setProgress(current.uploadedBytes / current.size * 100);
    try {
      const outcome = await uploadResumableVideo(selected, current, control, ({ progress: value, speedBytesPerSecond, etaSeconds, retry }) => { setProgress(value); setSpeed(speedBytesPerSecond); setEta(etaSeconds); setRetryMessage(retry ? `Reintentando fragmento ${retry.part} de ${retry.totalParts} - intento ${retry.attempt} de ${retry.maxAttempts}` : ''); });
      setSession(outcome.session);
      if (outcome.result) {
        setPending((items) => items.filter((item) => item.id !== current.id)); setSession(null); setFile(null);
        if (outcome.result.processingJob) { const configuredJob = await patchJson<VideoProcessingJob>(`/admin/video-processing/${outcome.result.processingJob.id}/settings`, { retainOriginal: keepOriginal }); setUploadedResult(outcome.result); setProcessingJob(configuredJob); toast.success('Video subido. Procesamiento HLS en cola'); }
        else { onUploaded(outcome.result.url, outcome.result.mimeType); setCompleted(true); toast.success('Video validado y subido'); }
      }
    } catch (error) {
      if (control.cancelled) return;
      if (error instanceof Error && 'code' in error && error.code === 'UPLOAD_PAUSED') {
        const refreshed = await getResumableUpload(current.id).catch(() => current);
        setSession(refreshed);
        setProgress(refreshed.uploadedBytes / refreshed.size * 100);
      } else { setError((error as Error).message); toast.error((error as Error).message); }
    }
    finally { setUploading(false); }
  }

  function pause() { controlRef.current.paused = true; controlRef.current.abortController?.abort(); controlRef.current.request?.abort(); setRetryMessage(''); setPaused(true); setUploading(false); }
  async function resume() { if (file && session) await startVideo(file, session); }
  async function cancel() { controlRef.current.cancelled = true; controlRef.current.abortController?.abort(); controlRef.current.request?.abort(); if (session) await cancelResumableUpload(session.id).catch(() => undefined); setSession(null); setFile(null); setPaused(false); setUploading(false); setProgress(0); setRetryMessage(''); setPending((items) => items.filter((item) => item.id !== session?.id)); }
  function clearSelection() { setFile(null); setError(''); setCompleted(false); setProgress(0); if (inputRef.current) inputRef.current.value = ''; }
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); if (!uploading) void select(event.dataTransfer.files?.[0]); }
  async function cancelProcessing() { if (!processingJob) return; try { setProcessingJob(await deleteJson<VideoProcessingJob>(`/admin/video-processing/${processingJob.id}`)); toast.success('Cancelacion solicitada'); } catch (error) { toast.error((error as Error).message); } }
  async function retryProcessing() { if (!processingJob) return; try { setProcessingJob(await postJson<VideoProcessingJob>(`/admin/video-processing/${processingJob.id}/retry`, {})); toast.success('Procesamiento reenviado'); } catch (error) { toast.error((error as Error).message); } }

  return (
    <div className="min-w-0 text-sm text-slate-300">
      <span className="mb-1.5 block font-medium text-slate-200">{label}</span>
      <div className={`rounded-xl border border-dashed p-4 text-center transition ${dragging ? 'border-brand bg-brand/10' : error ? 'border-coral/70 bg-coral/5' : 'border-line bg-ink/30 hover:border-slate-600'}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={drop}>
        <input ref={inputRef} className="sr-only" type="file" aria-label={label} accept={type === 'video' ? acceptedVideoInput : 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'} disabled={uploading} onChange={(event) => void select(event.target.files?.[0])} />
        {!file ? <><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand">{type === 'image' ? <ImageIcon size={22} /> : <UploadCloud size={22} />}</span><p className="mt-3 font-medium text-slate-200">Arrastra {type === 'image' ? 'una imagen' : 'un video MP4 o MKV'} aqui</p><p className="mt-1 text-xs text-slate-400">o selecciona un archivo desde tu equipo</p><button type="button" className="button-secondary mt-3" disabled={uploading} onClick={() => inputRef.current?.click()}><FileUp size={16} />Seleccionar archivo</button><p className="mt-3 text-xs text-slate-500">{type === 'video' ? `MP4 o MKV hasta ${maxVideoUploadMb} MB. La salida sera HLS.` : `JPG, PNG o WebP · maximo ${Number(import.meta.env.VITE_MAX_IMAGE_UPLOAD_MB ?? 10)} MB`}</p></> : <div className="flex flex-col items-center gap-3 sm:flex-row sm:text-left"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${completed ? 'bg-mint/10 text-mint' : 'bg-brand/10 text-brand'}`}>{completed ? <CheckCircle2 size={23} /> : type === 'image' ? <ImageIcon size={23} /> : <FileUp size={23} />}</span><div className="min-w-0 flex-1"><p className="truncate font-medium text-slate-200">{file.name}</p><p className="mt-1 text-xs text-slate-400">{formatBytes(String(file.size))} · {file.type || 'Tipo no informado'}</p>{completed && <p className="mt-1 text-xs font-medium text-mint">Carga completada</p>}</div><div className="flex gap-2"><button type="button" className="button-ghost" disabled={uploading} onClick={() => inputRef.current?.click()} aria-label="Reemplazar archivo"><RotateCcw size={16} />Reemplazar</button><button type="button" className="icon-button text-coral" disabled={uploading} onClick={clearSelection} aria-label="Eliminar seleccion"><Trash2 size={17} /></button></div></div>}
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-coral">{error}</p>}
      {type === 'video' && !session && !processingJob && <label className="mt-3 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={keepOriginal} onChange={(event) => setKeepOriginal(event.target.checked)} /> Conservar archivo original despues del procesamiento</label>}
      {type === 'video' && pending.length > 0 && !session && <p className="mt-2 text-xs text-amber-300">Hay una carga pendiente. Selecciona nuevamente el mismo archivo para continuarla.</p>}
      {(uploading || paused || session) && <><div className="mt-3 h-2 overflow-hidden rounded bg-ink" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-brand" style={{ width: `${progress}%` }} /></div><div className="mt-1 flex flex-wrap justify-between gap-2 text-xs"><span>{progress.toFixed(1)}%</span>{speed > 0 && <span>{formatBytes(String(speed))}/s | {eta === null ? 'Calculando...' : `${formatDuration(eta)} restantes`}</span>}</div></>}
      {retryMessage && <p role="status" className="mt-2 text-xs font-medium text-amber-300">{retryMessage}</p>}
      {type === 'video' && session && <div className="mt-3 flex gap-2">{uploading ? <button type="button" onClick={pause} className="rounded border border-amber-400 px-3 py-1 text-amber-300">Pausar</button> : paused && file ? <button type="button" onClick={() => void resume()} className="rounded border border-brand px-3 py-1 text-brand">Continuar</button> : null}<button type="button" onClick={() => void cancel()} className="rounded border border-coral px-3 py-1 text-coral">Cancelar</button></div>}
      {processingJob && <div className="mt-3 rounded-lg border border-line bg-ink/50 p-3"><div className="flex justify-between text-xs"><span>{stageLabel(processingJob.stage, processingJob.status)}</span><span>{processingJob.progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded bg-panel"><div className="h-full bg-mint" style={{ width: `${processingJob.progress}%` }} /></div>{processingJob.sourceFormat && <p className="mt-2 text-xs text-slate-400">Contenedor: {processingJob.sourceFormat} · Video: {processingJob.sourceVideoCodec ?? 'detectando'} · Audio: {jsonCodecs(processingJob.sourceAudioCodecs)}</p>}{processingJob.profiles.length > 0 && <p className="mt-1 text-xs text-slate-400">Calidades: {(processingJob.generatedQualities.length ? processingJob.generatedQualities : processingJob.profiles).map((profile) => `${profile}p`).join(', ')}</p>}{processingJob.errorMessage && <p className="mt-2 text-xs text-coral">{processingJob.errorMessage}</p>}<div className="mt-2 flex gap-2">{['QUEUED', 'PROCESSING'].includes(processingJob.status) && <button type="button" onClick={() => void cancelProcessing()} className="rounded border border-coral px-3 py-1 text-coral">Cancelar procesamiento</button>}{['FAILED', 'CANCELLED'].includes(processingJob.status) && <button type="button" onClick={() => void retryProcessing()} className="rounded border border-brand px-3 py-1 text-brand">Reintentar</button>}</div></div>}
    </div>
  );
}

export function FileSelectionField({ id, label, accept, hint, file, error, disabled, onChange }: { id: string; label: string; accept: string; hint: string; file: File | null; error?: string; disabled?: boolean; onChange: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  function choose(selected?: File) { if (selected) onChange(selected); }
  return <div className="min-w-0"><label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-200">{label}</label><div className={`rounded-xl border border-dashed p-4 text-center ${dragging ? 'border-brand bg-brand/10' : error ? 'border-coral bg-coral/5' : 'border-line bg-ink/30'}`} onDragOver={(event) => event.preventDefault()} onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files?.[0]); }}><input ref={inputRef} id={id} type="file" className="sr-only" accept={accept} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} onChange={(event) => choose(event.target.files?.[0])} />{file ? <div className="flex items-center gap-3 text-left"><FileUp className="text-brand" /><div className="min-w-0 flex-1"><p className="truncate font-medium text-slate-200">{file.name}</p><p className="text-xs text-slate-400">{formatBytes(String(file.size))} · {file.type || 'Tipo no informado'}</p></div><button type="button" className="icon-button text-coral" aria-label="Eliminar seleccion" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = ''; }}><Trash2 size={17} /></button></div> : <><UploadCloud className="mx-auto text-brand" /><p className="mt-2 text-sm text-slate-300">Arrastra el archivo aqui</p><button type="button" className="button-secondary mt-3" disabled={disabled} onClick={() => inputRef.current?.click()}>Seleccionar archivo</button></>}</div><p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-400">{hint}</p>{error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-coral">{error}</p>}</div>;
}

function formatDuration(seconds: number) { if (!Number.isFinite(seconds)) return 'Calculando...'; const rounded = Math.max(0, Math.round(seconds)); return rounded >= 3600 ? `${Math.floor(rounded / 3600)}h ${Math.floor(rounded % 3600 / 60)}m` : rounded >= 60 ? `${Math.floor(rounded / 60)}m ${rounded % 60}s` : `${rounded}s`; }
function processingLabel(status: VideoProcessingJob['status']) { return ({ QUEUED: 'En cola', PROCESSING: 'Procesando', COMPLETED: 'Listo', FAILED: 'Error', CANCELLED: 'Cancelado' })[status]; }
function stageLabel(stage: string | undefined, status: VideoProcessingJob['status']) { if (!stage) return processingLabel(status); if (stage.startsWith('GENERATING_HLS_')) return `Generando ${stage.replace('GENERATING_HLS_', '').replace('P', 'p')}`; return ({ QUEUED: 'Archivo subido · en cola', PROBING: 'Analizando video', PREPARING: 'Preparando conversion', EXTRACTING_SUBTITLES: 'Extrayendo subtitulos', GENERATING_THUMBNAIL: 'Generando miniatura', VALIDATING: 'Validando salida', UPLOADING_OUTPUT: 'Guardando salida HLS', AWAITING_ASSOCIATION: 'Procesado · pendiente de asociar', ASSOCIATING: 'Asociando al contenido', COMPLETED: 'Procesamiento completado', FAILED: 'Procesamiento fallido', CANCELLED: 'Procesamiento cancelado' } as Record<string, string>)[stage] ?? stage; }
function jsonCodecs(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join(', ') || 'sin audio' : 'detectando'; }
