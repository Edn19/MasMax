import { AlertTriangle, Settings2 } from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { SmartImage } from '../../components/SmartImage';
import { VideoPlayer } from '../../components/VideoPlayer';
import { api, deleteJson, patchJson, postJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Episode, EpisodeProcessingJob, Season, Series, VideoSource, VideoType } from '../../types/models';
import { Checkbox, DateInput, fieldA11y, FormActions, FormError, FormField, FormHint, FormLabel, FormSection, NumberInput, Select, TextArea, TextInput } from '../components/AdminForms';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, FormDisclosure, Panel, ResourceError } from '../components/AdminUi';
import { validatePlaybackMarkers, videoTypeForSource } from '../components/admin-utils';
import { UploadField } from '../components/UploadField';
import { BulkEpisodeTools } from './BulkEpisodeTools';
import { CsvEpisodeImport } from './CsvEpisodeImport';
import { EpisodeEditorSource, EpisodeFormState, episodeEditorErrorMessage, episodeFormToUpdatePayload, episodeToFormState, validateEpisodeBasicInfo, withEpisodeFormField, withEpisodePublished } from './episode-editor';
import { buildEpisodeListQuery, episodeDeleteLabel, episodePageCount, episodeProcessingLabel, EpisodePublishedFilter, EpisodeVideoFilter } from './episode-list';
import { episodeVideoError, episodeVideoIsReady, EpisodeVideoMode } from './episode-video-linking';

type EpisodeForm = Omit<EpisodeFormState, 'seriesId' | 'seasonId'>;
type EditorLoadState = { status: 'idle' | 'loading' | 'ready' | 'error'; episodeId?: string; message?: string };
type AdminEpisodeResponse = { items: Episode[]; total: number; page: number; limit: number };
const emptyEpisode = (): EpisodeForm => ({ number: '', position: '', title: '', description: '', videoMode: 'UPLOAD', processingJobId: '', processingJobStatus: 'NONE', videoUrl: '', originalVideoUrl: '', processedVideoUrl: '', videoSource: 'URL', videoType: 'MP4', thumbnailUrl: '', durationSec: '', introStartSec: '', introEndSec: '', recapStartSec: '', recapEndSec: '', published: false, publishedAt: new Date().toISOString().slice(0, 10) });

export function EpisodesAdminPage() {
  const series = useAsync<Series[]>(() => api('/admin/series'), []);
  const [seriesId, setSeriesId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [revision, setRevision] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [publishedFilter, setPublishedFilter] = useState<EpisodePublishedFilter>('ALL');
  const [videoFilter, setVideoFilter] = useState<EpisodeVideoFilter>('ALL');
  const [page, setPage] = useState(1);
  const limit = 20;
  const seasons = useAsync<Season[]>(() => seriesId ? api(`/admin/series/${seriesId}/seasons`) : Promise.resolve([]), [seriesId, revision]);
  const episodes = useAsync<AdminEpisodeResponse>(() => seasonId ? api(`/admin/episodes?${buildEpisodeListQuery({ seriesId, seasonId, search, published: publishedFilter, video: videoFilter, page, limit })}`) : Promise.resolve({ items: [], total: 0, page: 1, limit }), [seriesId, seasonId, search, publishedFilter, videoFilter, page, revision]);
  const gaps = useAsync<{ max: number; missing: number[] }>(() => seasonId ? api(`/admin/seasons/${seasonId}/episode-gaps`) : Promise.resolve({ max: 0, missing: [] }), [seasonId, revision]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState<EpisodeForm>(emptyEpisode);
  const [editorLoad, setEditorLoad] = useState<EditorLoadState>({ status: 'idle' });
  const pendingSeasonRef = useRef<{ seriesId: string; seasonId: string } | null>(null);
  const editorRequestRef = useRef(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<Episode | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const availableJobs = useAsync<EpisodeProcessingJob[]>(() => formOpen ? api('/admin/video-processing/jobs/available') : Promise.resolve([]), [formOpen, revision]);

  useEffect(() => { if (!seriesId && series.data?.[0] && editorLoad.status !== 'loading') setSeriesId(series.data[0].id); }, [editorLoad.status, series.data, seriesId]);
  useEffect(() => {
    const pending = pendingSeasonRef.current;
    if (pending?.seriesId === seriesId) {
      if (seasons.data?.some((season) => season.id === pending.seasonId && season.seriesId === pending.seriesId)) {
        setSeasonId(pending.seasonId);
        pendingSeasonRef.current = null;
      }
      return;
    }
    if (!seasons.data?.some((season) => season.id === seasonId)) setSeasonId(seasons.data?.[0]?.id ?? '');
  }, [seasons.data, seasonId, seriesId]);
  const items = episodes.data?.items ?? [];
  const refresh = () => setRevision((value) => value + 1);
  function reset() { editorRequestRef.current += 1; pendingSeasonRef.current = null; setEditingId(null); setForm(emptyEpisode()); setErrors({}); setEditorLoad({ status: 'idle' }); setFormOpen(false); }
  function createEpisode(number = '') { pendingSeasonRef.current = null; setEditingId(null); setForm({ ...emptyEpisode(), number }); setErrors({}); setEditorLoad({ status: 'ready' }); setFormOpen(true); }
  async function edit(episodeId: string) {
    const requestId = editorRequestRef.current + 1;
    editorRequestRef.current = requestId;
    setEditingId(episodeId);
    setFormOpen(true);
    setErrors({});
    setEditorLoad({ status: 'loading', episodeId });
    try {
      const episode = await api<EpisodeEditorSource>(`/admin/episodes/${episodeId}`);
      if (editorRequestRef.current !== requestId) return;
      const next = episodeToFormState(episode);
      if (!next.seriesId || !next.seasonId) throw new Error('El episodio no tiene una serie y temporada validas.');
      const { seriesId: nextSeriesId, seasonId: nextSeasonId, ...nextForm } = next;
      pendingSeasonRef.current = { seriesId: nextSeriesId, seasonId: nextSeasonId };
      setSeriesId(nextSeriesId);
      setSeasonId(nextSeasonId);
      setForm(nextForm);
      setEditorLoad({ status: 'ready', episodeId });
    } catch (error) {
      if (editorRequestRef.current !== requestId) return;
      setEditorLoad({ status: 'error', episodeId, message: episodeEditorErrorMessage(error) });
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const nextErrors = { ...validateEpisodeBasicInfo(form), ...validatePlaybackMarkers(form) };
    if (!seriesId) nextErrors.seriesId = 'Selecciona una serie.';
    if (!seasonId) nextErrors.seasonId = 'Selecciona una temporada.';
    const videoError = episodeVideoError(form.videoMode, form.videoUrl, form.processingJobId);
    if (videoError) nextErrors.videoUrl = videoError;
    const selectedJob = [...(availableJobs.data ?? []), ...items.flatMap((item) => item.processingJob ? [item.processingJob] : [])].find((job) => job.id === form.processingJobId);
    const hasReadyVideo = episodeVideoIsReady(form.videoUrl, selectedJob);
    if (form.published && !hasReadyVideo) nextErrors.published = 'El video debe estar listo antes de publicar.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return toast.error('Revisa los campos marcados antes de guardar');
    setSaving(true);
    try {
      const updatePayload = episodeFormToUpdatePayload({ ...form, seriesId, seasonId }, hasReadyVideo);
      const payload = editingId ? updatePayload : { ...updatePayload, seriesId };
      editingId ? await patchJson<Episode>(`/admin/episodes/${editingId}`, payload) : await postJson<Episode>('/admin/episodes', payload);
      toast.success(editingId ? 'Episodio actualizado' : 'Episodio creado'); reset(); refresh();
    } catch (error) { toast.error((error as Error).message); } finally { setSaving(false); }
  }

  function changeSource(videoSource: VideoSource) { setForm((current) => ({ ...current, videoSource, videoType: videoTypeForSource(videoSource), processingJobStatus: 'URL', videoUrl: '', originalVideoUrl: '', processedVideoUrl: '' })); setErrors((current) => ({ ...current, videoUrl: '' })); }
  function changeVideoMode(videoMode: EpisodeVideoMode) { setForm((current) => ({ ...current, videoMode, processingJobId: '', processingJobStatus: videoMode === 'URL' ? 'URL' : 'NONE', videoUrl: '', originalVideoUrl: '', processedVideoUrl: '', published: videoMode === 'NONE' || videoMode === 'UPLOAD' || videoMode === 'AVAILABLE' ? false : current.published })); setErrors((current) => ({ ...current, videoUrl: '', published: '' })); }
  function handlePublishedChange(event: ChangeEvent<HTMLInputElement>) {
    const checked = event.currentTarget.checked;
    setForm((current) => withEpisodePublished(current, checked));
    setErrors((current) => ({ ...current, published: '' }));
  }
  function updateFormField<K extends keyof EpisodeForm>(field: K, value: EpisodeForm[K]) {
    setForm((current) => withEpisodeFormField(current, field, value));
    setErrors((current) => ({ ...current, [field]: '' }));
  }
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  async function removeEpisode() { if (!pendingDelete) return; setDeleting(true); try { await deleteJson(`/admin/episodes/${pendingDelete.id}`); setPendingDelete(null); refresh(); toast.success('Episodio eliminado'); } catch (error) { toast.error((error as Error).message); } finally { setDeleting(false); } }
  async function changePublished(item: Episode) {
    setChangingId(item.id);
    try {
      await patchJson('/admin/episodes/publish', { ids: [item.id], published: !item.published });
      toast.success(item.published ? 'Episodio despublicado' : 'Episodio publicado');
      refresh();
    } catch (error) { toast.error((error as Error).message); } finally { setChangingId(null); }
  }

  const totalPages = episodePageCount(episodes.data?.total ?? 0, limit);

  return <Panel title="Episodios" description="Gestiona numeracion, video, miniaturas y marcadores de reproduccion." action={<button type="button" className="button-primary" disabled={!seasonId} onClick={() => createEpisode()}>Crear episodio</button>}>
    <ResourceError message={series.error ?? seasons.error ?? episodes.error ?? gaps.error} />
    <div className="mb-5 grid gap-4 md:grid-cols-2">
      <FormField><FormLabel htmlFor="episode-series" required>Serie</FormLabel><Select id="episode-series" value={seriesId} {...fieldA11y('episode-series', undefined, errors.seriesId)} onChange={(event) => { setSeriesId(event.target.value); setSeasonId(''); setSelected([]); reset(); }}><option value="">Selecciona una serie</option>{(series.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select><FormError id="episode-series-error">{errors.seriesId}</FormError></FormField>
      <FormField><FormLabel htmlFor="episode-season" required>Temporada</FormLabel><Select id="episode-season" value={seasonId} {...fieldA11y('episode-season', undefined, errors.seasonId)} onChange={(event) => { setSeasonId(event.target.value); setSelected([]); reset(); }}><option value="">Selecciona una temporada</option>{(seasons.data ?? []).map((season) => <option key={season.id} value={season.id}>Temporada {season.number}: {season.title}</option>)}</Select><FormError id="episode-season-error">{errors.seasonId}</FormError></FormField>
    </div>
    <form className="mb-5 grid gap-3 rounded-xl border border-line bg-ink/30 p-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput); setSelected([]); }}>
      <FormField><FormLabel htmlFor="episode-search">Buscar</FormLabel><TextInput id="episode-search" placeholder="Titulo o numero" value={searchInput} onChange={(event) => setSearchInput(event.currentTarget.value)} /></FormField>
      <FormField><FormLabel htmlFor="episode-published-filter">Publicacion</FormLabel><Select id="episode-published-filter" value={publishedFilter} onChange={(event) => { setPublishedFilter(event.currentTarget.value as EpisodePublishedFilter); setPage(1); setSelected([]); }}><option value="ALL">Todos</option><option value="PUBLISHED">Publicados</option><option value="DRAFT">Borradores</option></Select></FormField>
      <FormField><FormLabel htmlFor="episode-video-filter">Video</FormLabel><Select id="episode-video-filter" value={videoFilter} onChange={(event) => { setVideoFilter(event.currentTarget.value as EpisodeVideoFilter); setPage(1); setSelected([]); }}><option value="ALL">Todos</option><option value="READY">Listo</option><option value="MISSING">Sin video</option></Select></FormField>
      <div className="flex items-end"><Button type="submit" className="w-full">Buscar</Button></div>
    </form>
    {seasonId && gaps.data?.missing.length ? <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center"><AlertTriangle className="shrink-0 text-warning" /><p className="flex-1 text-slate-200"><strong>Faltan los episodios:</strong> {gaps.data.missing.join(', ')}</p><button type="button" className="button-secondary" onClick={() => createEpisode(String(gaps.data?.missing[0] ?? ''))}>Crear el siguiente</button></div> : seasonId && <div className="mb-5 rounded-xl border border-mint/30 bg-mint/5 p-3 text-sm text-mint">Numeracion completa hasta el episodio {gaps.data?.max ?? 0}.</div>}
    <FormDisclosure open={formOpen} title="Episodio" description="El formulario esta dividido para reducir errores y desplazamiento." editing={Boolean(editingId)} onToggle={() => setFormOpen((value) => !value)}>
      {editorLoad.status === 'loading' && <div role="status" className="rounded-xl border border-line bg-ink/40 p-6 text-sm text-slate-300">Cargando datos del episodio...</div>}
      {editorLoad.status === 'error' && <div role="alert" className="rounded-xl border border-coral/40 bg-coral/10 p-5"><p className="font-semibold text-coral">No se pudo abrir el editor del episodio.</p><p className="mt-2 text-sm text-slate-300">{editorLoad.message}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={reset}>Volver al listado</button>{editorLoad.episodeId && <Button type="button" onClick={() => { if (editorLoad.episodeId) void edit(editorLoad.episodeId); }}>Reintentar</Button>}</div></div>}
      {editorLoad.status === 'ready' && <form onSubmit={submit} className="grid gap-5">
      <FormSection title="Informacion basica">
        <FormField><FormLabel htmlFor="episode-number" required>Numero</FormLabel><NumberInput id="episode-number" min={1} value={form.number} {...fieldA11y('episode-number', undefined, errors.number)} onChange={(event) => updateFormField('number', event.currentTarget.value)} /><FormError id="episode-number-error">{errors.number}</FormError></FormField>
        <FormField><FormLabel htmlFor="episode-position">Posicion</FormLabel><NumberInput id="episode-position" min={0} value={form.position} {...fieldA11y('episode-position', undefined, errors.position)} onChange={(event) => updateFormField('position', event.currentTarget.value)} /><FormHint>Se asigna automaticamente si se deja vacio.</FormHint><FormError id="episode-position-error">{errors.position}</FormError></FormField>
        <FormField><FormLabel htmlFor="episode-title" required>Titulo</FormLabel><TextInput id="episode-title" value={form.title} {...fieldA11y('episode-title', undefined, errors.title)} onChange={(event) => updateFormField('title', event.currentTarget.value)} /><FormError id="episode-title-error">{errors.title}</FormError></FormField>
        <FormField><FormLabel htmlFor="episode-duration">Duracion en segundos</FormLabel><NumberInput id="episode-duration" min={0} value={form.durationSec} {...fieldA11y('episode-duration', undefined, errors.durationSec)} onChange={(event) => updateFormField('durationSec', event.currentTarget.value)} /><FormError id="episode-duration-error">{errors.durationSec}</FormError></FormField>
        <FormField><FormLabel htmlFor="episode-date">Fecha de publicacion</FormLabel><DateInput id="episode-date" value={form.publishedAt} {...fieldA11y('episode-date', undefined, errors.publishedAt)} onInput={(event) => updateFormField('publishedAt', event.currentTarget.value)} /><FormError id="episode-date-error">{errors.publishedAt}</FormError></FormField>
        <FormField><Checkbox label="Episodio publicado" checked={form.published} disabled={Boolean(form.processingJobId && !form.videoUrl)} onChange={handlePublishedChange} /><FormError>{errors.published}</FormError>{form.processingJobId && !form.videoUrl && <FormHint>Se guarda como borrador hasta que el video HLS este listo.</FormHint>}</FormField>
        <FormField fullWidth><FormLabel htmlFor="episode-description">Descripcion</FormLabel><TextArea id="episode-description" value={form.description} onChange={(event) => updateFormField('description', event.currentTarget.value)} /></FormField>
      </FormSection>
      <FormSection title="Miniatura"><FormField><FormLabel htmlFor="episode-thumbnail">Miniatura URL</FormLabel><TextInput id="episode-thumbnail" placeholder="https://... o /uploads/..." value={form.thumbnailUrl} onChange={(event) => updateFormField('thumbnailUrl', event.currentTarget.value)} /></FormField><UploadField type="image" label="Subir miniatura" onUploaded={(thumbnailUrl) => updateFormField('thumbnailUrl', thumbnailUrl)} />{form.thumbnailUrl && <div className="md:col-span-2"><SmartImage src={form.thumbnailUrl} alt="Vista previa de la miniatura" className="aspect-video w-full max-w-sm rounded-xl border border-line object-cover" /></div>}</FormSection>
      <FormSection title="Video del episodio">
        <FormField><FormLabel htmlFor="episode-video-mode" required>Origen</FormLabel><Select id="episode-video-mode" value={form.videoMode} onChange={(event) => changeVideoMode(event.target.value as EpisodeVideoMode)}><option value="UPLOAD">Subir un video nuevo</option><option value="AVAILABLE">Usar archivo cargado</option><option value="URL">Usar URL externa</option><option value="NONE">Crear episodio sin video</option></Select></FormField>
        {form.videoMode === 'URL' && <FormField><FormLabel htmlFor="episode-source" required>Fuente</FormLabel><Select id="episode-source" value={form.videoSource} onChange={(event) => changeSource(event.target.value as VideoSource)}><option value="URL">MP4 externa</option><option value="HLS">HLS .m3u8</option><option value="DRIVE">Google Drive</option><option value="EMBED">Embed permitido</option></Select></FormField>}
        {form.videoMode === 'URL' && <FormField fullWidth><FormLabel htmlFor="episode-video-url" required>URL del video</FormLabel><TextInput id="episode-video-url" placeholder="https://... o /uploads/..." value={form.originalVideoUrl} {...fieldA11y('episode-video-url', undefined, errors.videoUrl)} onChange={(event) => { const videoUrl = event.currentTarget.value; setForm((current) => ({ ...current, originalVideoUrl: videoUrl, videoUrl, processedVideoUrl: '' })); }} /><FormError id="episode-video-url-error">{errors.videoUrl}</FormError></FormField>}
        {form.videoMode === 'UPLOAD' && <FormField fullWidth><UploadField type="video" label={`Subir video MP4 o MKV (${Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_MB ?? 2048)} MB)`} selectedProcessingJobId={form.processingJobId} onProcessingJob={(job) => { setForm((current) => ({ ...current, processingJobId: job.id, processingJobStatus: job.status, videoUrl: '', originalVideoUrl: '', processedVideoUrl: '', published: false })); refresh(); }} onUploaded={(url, mimeType, details) => setForm((current) => details?.processingJobId ? ({ ...current, processingJobId: details.processingJobId, processingJobStatus: 'COMPLETED', thumbnailUrl: current.thumbnailUrl || details.thumbnailUrl || '' }) : ({ ...current, processingJobStatus: 'URL', videoUrl: url, originalVideoUrl: details?.originalUrl ?? url, processedVideoUrl: url, thumbnailUrl: current.thumbnailUrl || details?.thumbnailUrl || '', videoType: mimeType.includes('mpegurl') ? 'HLS' : 'MP4', videoSource: 'LOCAL' }))} /><FormError>{errors.videoUrl}</FormError></FormField>}
        {form.videoMode === 'AVAILABLE' && <FormField fullWidth><FormLabel htmlFor="episode-processing-job" required>Archivo cargado</FormLabel><Select id="episode-processing-job" value={form.processingJobId} {...fieldA11y('episode-processing-job', undefined, errors.videoUrl)} onChange={(event) => { const processingJobId = event.currentTarget.value; const selectedJob = [...(availableJobs.data ?? []), ...items.flatMap((item) => item.processingJob ? [item.processingJob] : [])].find((job) => job.id === processingJobId); setForm((current) => ({ ...current, processingJobId, processingJobStatus: selectedJob?.status ?? 'MISSING', published: false })); }}><option value="">Selecciona un archivo</option>{form.processingJobId && form.processingJobStatus === 'MISSING' && <option value={form.processingJobId}>Referencia existente no disponible</option>}{[...(availableJobs.data ?? []), ...items.flatMap((item) => item.processingJob?.id === form.processingJobId ? [item.processingJob] : [])].filter((job, index, all) => all.findIndex((candidate) => candidate.id === job.id) === index).map((job) => <option key={job.id} value={job.id}>{job.originalName} - {job.status} ({job.progress}%)</option>)}</Select><FormError>{errors.videoUrl}</FormError><FormHint>Solo aparecen trabajos tuyos, sin asignar y en cola, procesando o completados.</FormHint>{form.processingJobStatus === 'MISSING' && <p className="mt-2 text-xs text-warning">La referencia historica no esta disponible. Puedes guardar otros cambios sin crear otro procesamiento.</p>}<ResourceError message={availableJobs.error} /></FormField>}
        {form.videoMode === 'NONE' && <div className="md:col-span-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-slate-300">El episodio se guardara como borrador. Puedes vincular un video mas adelante.</div>}
        {form.processingJobId && <div className="md:col-span-2 rounded-xl border border-mint/30 bg-mint/5 p-3 text-sm text-mint">Referencia persistente: {form.processingJobId}. Puedes guardar ahora; FFmpeg continuara en segundo plano.</div>}
        {form.videoUrl && <div className="md:col-span-2"><VideoPlayer src={form.processedVideoUrl || form.videoUrl} originalSrc={form.originalVideoUrl} source={form.videoSource} type={form.videoType} poster={form.thumbnailUrl || undefined} /></div>}
      </FormSection>
      <details className="group rounded-2xl border border-line bg-ink/25"><summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold text-white sm:px-5"><Settings2 size={18} className="text-brand" />Configuracion avanzada de reproduccion<span className="ml-auto text-xs font-normal text-slate-400 group-open:hidden">Mostrar</span></summary><div className="grid gap-4 border-t border-line p-4 md:grid-cols-2 sm:p-5">
        {([['introStartSec', 'Inicio de introduccion'], ['introEndSec', 'Fin de introduccion'], ['recapStartSec', 'Inicio de resumen'], ['recapEndSec', 'Fin de resumen']] as const).map(([key, label]) => <FormField key={key}><FormLabel htmlFor={`episode-${key}`}>{label} (segundos)</FormLabel><NumberInput id={`episode-${key}`} min={0} value={form[key]} {...fieldA11y(`episode-${key}`, undefined, errors[key])} onChange={(event) => updateFormField(key, event.currentTarget.value)} /><FormError id={`episode-${key}-error`}>{errors[key]}</FormError></FormField>)}
      </div></details>
      <FormActions><button type="button" className="button-secondary" disabled={saving} onClick={reset}>Cancelar</button><Button disabled={!seasonId || saving}>{saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear episodio'}</Button></FormActions>
      </form>}
    </FormDisclosure>
    <BulkEpisodeTools seriesId={seriesId} seasonId={seasonId} episodes={items} selected={selected} onSelected={setSelected} onChanged={() => { setSelected([]); refresh(); }} />
    <div className="admin-table-shell" role="region" aria-label="Episodios de la temporada" tabIndex={0}><table><thead><tr><th><input type="checkbox" aria-label="Seleccionar todos" checked={items.length > 0 && items.every((item) => selected.includes(item.id))} onChange={(event) => setSelected(event.target.checked ? items.map((item) => item.id) : [])} /></th><th>Serie</th><th>Temporada</th><th>Numero</th><th>Orden</th><th>Titulo</th><th>Video</th><th>Procesamiento</th><th>Publicacion</th><th>Acciones</th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={10} className="p-10 text-center"><p className="font-medium text-slate-200">No se encontraron episodios</p><p className="mt-1 text-sm text-slate-400">Ajusta los filtros, crea el primer episodio o importa un archivo CSV.</p></td></tr> : items.map((item) => <tr key={item.id}><td><input type="checkbox" aria-label={`Seleccionar ${item.title}`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td><td>{item.series?.title ?? '-'}</td><td>{item.season?.number ?? '-'}</td><td>{item.number}</td><td>{item.position}</td><td className="max-w-xs truncate">{item.title}</td><td>{item.videoUrl ? item.videoType : 'Sin video'}</td><td>{episodeProcessingLabel(item)}</td><td>{item.published ? 'Publicado' : 'Borrador'}</td><td><div className="flex min-w-max flex-wrap gap-2"><button type="button" className="rounded-lg border border-brand px-3 py-1.5 text-brand disabled:opacity-50" disabled={Boolean(changingId) || deleting} onClick={() => void edit(item.id)}>Editar</button><button type="button" className="rounded-lg border border-mint px-3 py-1.5 text-mint disabled:opacity-50" disabled={Boolean(changingId) || deleting} onClick={() => void changePublished(item)}>{changingId === item.id ? 'Procesando...' : item.published ? 'Despublicar' : 'Publicar'}</button><Link className="rounded-lg border border-line px-3 py-1.5 text-slate-200" to={`/admin/subtitles?episodeId=${encodeURIComponent(item.id)}`}>Subtitulos</Link>{item.processingJob && <Link className="rounded-lg border border-line px-3 py-1.5 text-slate-200" to="/admin/processing">Procesamiento</Link>}<button type="button" className="rounded-lg border border-coral px-3 py-1.5 text-coral disabled:opacity-50" disabled={Boolean(changingId) || deleting} onClick={() => setPendingDelete(item)}>Eliminar</button></div></td></tr>)}</tbody></table></div>
    <div className="mb-6 mt-3 flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between"><span>{episodes.data?.total ?? 0} episodios · Pagina {page} de {totalPages}</span><div className="flex gap-2"><button type="button" className="button-secondary" disabled={page <= 1} onClick={() => { setPage((value) => Math.max(1, value - 1)); setSelected([]); }}>Anterior</button><button type="button" className="button-secondary" disabled={page >= totalPages} onClick={() => { setPage((value) => Math.min(totalPages, value + 1)); setSelected([]); }}>Siguiente</button></div></div>
    <CsvEpisodeImport seriesId={seriesId} onImported={refresh} />
    <ConfirmDialog open={Boolean(pendingDelete)} title="Eliminar episodio" itemName={pendingDelete ? episodeDeleteLabel(pendingDelete) : undefined} description="El episodio se retirara del catalogo. Los archivos de video, HLS y subtitulos se conservaran en la biblioteca multimedia." busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void removeEpisode()} />
  </Panel>;
}
