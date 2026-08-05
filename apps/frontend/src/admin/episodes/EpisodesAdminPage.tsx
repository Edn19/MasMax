import { AlertTriangle, Settings2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { VideoPlayer } from '../../components/VideoPlayer';
import { api, deleteJson, patchJson, postJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Episode, Season, Series, VideoSource, VideoType } from '../../types/models';
import { Checkbox, DateInput, fieldA11y, FormActions, FormError, FormField, FormHint, FormLabel, FormSection, NumberInput, Select, TextArea, TextInput } from '../components/AdminForms';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, FormDisclosure, Panel, ResourceError } from '../components/AdminUi';
import { validatePlaybackMarkers, videoTypeForSource } from '../components/admin-utils';
import { UploadField } from '../components/UploadField';
import { BulkEpisodeTools } from './BulkEpisodeTools';
import { CsvEpisodeImport } from './CsvEpisodeImport';

type EpisodeForm = { number: string; position: string; title: string; description: string; videoUrl: string; originalVideoUrl: string; processedVideoUrl: string; videoSource: VideoSource; videoType: VideoType; thumbnailUrl: string; durationSec: string; introStartSec: string; introEndSec: string; recapStartSec: string; recapEndSec: string; published: boolean; publishedAt: string };
type AdminEpisodeResponse = { items: Episode[]; total: number; page: number; limit: number };
const emptyEpisode = (): EpisodeForm => ({ number: '', position: '', title: '', description: '', videoUrl: '', originalVideoUrl: '', processedVideoUrl: '', videoSource: 'URL', videoType: 'MP4', thumbnailUrl: '', durationSec: '', introStartSec: '', introEndSec: '', recapStartSec: '', recapEndSec: '', published: false, publishedAt: new Date().toISOString().slice(0, 10) });

export function EpisodesAdminPage() {
  const series = useAsync<Series[]>(() => api('/admin/series'), []);
  const [seriesId, setSeriesId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [revision, setRevision] = useState(0);
  const seasons = useAsync<Season[]>(() => seriesId ? api(`/admin/series/${seriesId}/seasons`) : Promise.resolve([]), [seriesId, revision]);
  const episodes = useAsync<AdminEpisodeResponse>(() => seasonId ? api(`/admin/episodes?seriesId=${encodeURIComponent(seriesId)}&seasonId=${encodeURIComponent(seasonId)}&limit=100`) : Promise.resolve({ items: [], total: 0, page: 1, limit: 100 }), [seriesId, seasonId, revision]);
  const gaps = useAsync<{ max: number; missing: number[] }>(() => seasonId ? api(`/admin/seasons/${seasonId}/episode-gaps`) : Promise.resolve({ max: 0, missing: [] }), [seasonId, revision]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState<EpisodeForm>(emptyEpisode);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<Episode | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { if (!seriesId && series.data?.[0]) setSeriesId(series.data[0].id); }, [series.data, seriesId]);
  useEffect(() => { if (!seasons.data?.some((season) => season.id === seasonId)) setSeasonId(seasons.data?.[0]?.id ?? ''); }, [seasons.data, seasonId]);
  const items = episodes.data?.items ?? [];
  const refresh = () => setRevision((value) => value + 1);
  function reset() { setEditingId(null); setForm(emptyEpisode()); setErrors({}); setFormOpen(false); }
  function edit(item: Episode) { setSeriesId(item.seriesId); setSeasonId(item.seasonId); setEditingId(item.id); setFormOpen(true); setErrors({}); setForm({ number: String(item.number), position: String(item.position), title: item.title, description: item.description, videoUrl: item.videoUrl ?? '', originalVideoUrl: item.originalVideoUrl ?? item.videoUrl ?? '', processedVideoUrl: item.processedVideoUrl ?? item.videoUrl ?? '', videoSource: item.videoSource, videoType: item.videoType, thumbnailUrl: item.thumbnailUrl ?? '', durationSec: item.durationSec == null ? '' : String(item.durationSec), introStartSec: item.introStartSec == null ? '' : String(item.introStartSec), introEndSec: item.introEndSec == null ? '' : String(item.introEndSec), recapStartSec: item.recapStartSec == null ? '' : String(item.recapStartSec), recapEndSec: item.recapEndSec == null ? '' : String(item.recapEndSec), published: item.published, publishedAt: item.publishedAt.slice(0, 10) }); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validatePlaybackMarkers(form);
    if (!seriesId) nextErrors.seriesId = 'Selecciona una serie.';
    if (!seasonId) nextErrors.seasonId = 'Selecciona una temporada.';
    if (!form.number && !editingId) nextErrors.number = 'El numero del episodio es obligatorio.';
    if (!form.title.trim()) nextErrors.title = 'El titulo es obligatorio.';
    if (!form.videoUrl.trim()) nextErrors.videoUrl = 'Agrega una URL o sube un video.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return toast.error('Revisa los campos marcados antes de guardar');
    try {
      const payload = { seriesId, seasonId, episodeNumber: form.number ? Number(form.number) : undefined, position: form.position ? Number(form.position) : undefined, title: form.title, description: form.description, videoSource: form.videoSource, videoType: form.videoType, videoUrl: form.videoUrl, originalVideoUrl: form.originalVideoUrl || undefined, processedVideoUrl: form.processedVideoUrl || undefined, thumbnailUrl: form.thumbnailUrl || undefined, durationSec: form.durationSec ? Number(form.durationSec) : undefined, introStartSec: form.introStartSec ? Number(form.introStartSec) : null, introEndSec: form.introEndSec ? Number(form.introEndSec) : null, recapStartSec: form.recapStartSec ? Number(form.recapStartSec) : null, recapEndSec: form.recapEndSec ? Number(form.recapEndSec) : null, published: form.published, publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : undefined };
      editingId ? await patchJson<Episode>(`/admin/episodes/${editingId}`, payload) : await postJson<Episode>('/admin/episodes', payload);
      toast.success(editingId ? 'Episodio actualizado' : 'Episodio creado'); reset(); refresh();
    } catch (error) { toast.error((error as Error).message); }
  }

  function changeSource(videoSource: VideoSource) { setForm({ ...form, videoSource, videoType: videoTypeForSource(videoSource), videoUrl: '', originalVideoUrl: '', processedVideoUrl: '' }); setErrors((current) => ({ ...current, videoUrl: '' })); }
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  async function removeEpisode() { if (!pendingDelete) return; setDeleting(true); try { await deleteJson(`/admin/episodes/${pendingDelete.id}`); setPendingDelete(null); refresh(); toast.success('Episodio eliminado'); } catch (error) { toast.error((error as Error).message); } finally { setDeleting(false); } }

  return <Panel title="Episodios" description="Gestiona numeracion, video, miniaturas y marcadores de reproduccion." action={<button type="button" className="button-primary" disabled={!seasonId} onClick={() => { setEditingId(null); setForm(emptyEpisode()); setErrors({}); setFormOpen(true); }}>Crear episodio</button>}>
    <ResourceError message={series.error ?? seasons.error ?? episodes.error ?? gaps.error} />
    <div className="mb-5 grid gap-4 md:grid-cols-2">
      <FormField><FormLabel htmlFor="episode-series" required>Serie</FormLabel><Select id="episode-series" value={seriesId} {...fieldA11y('episode-series', undefined, errors.seriesId)} onChange={(event) => { setSeriesId(event.target.value); setSeasonId(''); setSelected([]); reset(); }}><option value="">Selecciona una serie</option>{(series.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select><FormError id="episode-series-error">{errors.seriesId}</FormError></FormField>
      <FormField><FormLabel htmlFor="episode-season" required>Temporada</FormLabel><Select id="episode-season" value={seasonId} {...fieldA11y('episode-season', undefined, errors.seasonId)} onChange={(event) => { setSeasonId(event.target.value); setSelected([]); reset(); }}><option value="">Selecciona una temporada</option>{(seasons.data ?? []).map((season) => <option key={season.id} value={season.id}>Temporada {season.number}: {season.title}</option>)}</Select><FormError id="episode-season-error">{errors.seasonId}</FormError></FormField>
    </div>
    {seasonId && gaps.data?.missing.length ? <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center"><AlertTriangle className="shrink-0 text-warning" /><p className="flex-1 text-slate-200"><strong>Faltan los episodios:</strong> {gaps.data.missing.join(', ')}</p><button type="button" className="button-secondary" onClick={() => { setEditingId(null); setForm({ ...emptyEpisode(), number: String(gaps.data?.missing[0] ?? '') }); setFormOpen(true); }}>Crear el siguiente</button></div> : seasonId && <div className="mb-5 rounded-xl border border-mint/30 bg-mint/5 p-3 text-sm text-mint">Numeracion completa hasta el episodio {gaps.data?.max ?? 0}.</div>}
    <FormDisclosure open={formOpen} title="Episodio" description="El formulario esta dividido para reducir errores y desplazamiento." editing={Boolean(editingId)} onToggle={() => setFormOpen((value) => !value)}><form onSubmit={submit} className="grid gap-5">
      <FormSection title="Informacion basica">
        <FormField><FormLabel htmlFor="episode-number" required>Numero</FormLabel><NumberInput id="episode-number" min={1} value={form.number} {...fieldA11y('episode-number', undefined, errors.number)} onChange={(event) => setForm({ ...form, number: event.target.value })} /><FormError id="episode-number-error">{errors.number}</FormError></FormField>
        <FormField><FormLabel htmlFor="episode-position">Posicion</FormLabel><NumberInput id="episode-position" min={0} value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} /><FormHint>Se asigna automaticamente si se deja vacio.</FormHint></FormField>
        <FormField><FormLabel htmlFor="episode-title" required>Titulo</FormLabel><TextInput id="episode-title" value={form.title} {...fieldA11y('episode-title', undefined, errors.title)} onChange={(event) => setForm({ ...form, title: event.target.value })} /><FormError id="episode-title-error">{errors.title}</FormError></FormField>
        <FormField><FormLabel htmlFor="episode-duration">Duracion en segundos</FormLabel><NumberInput id="episode-duration" min={0} value={form.durationSec} onChange={(event) => setForm({ ...form, durationSec: event.target.value })} /></FormField>
        <FormField><FormLabel htmlFor="episode-date">Fecha de publicacion</FormLabel><DateInput id="episode-date" value={form.publishedAt} onChange={(event) => setForm({ ...form, publishedAt: event.target.value })} /></FormField>
        <FormField><Checkbox label="Episodio publicado" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /></FormField>
        <FormField fullWidth><FormLabel htmlFor="episode-description">Descripcion</FormLabel><TextArea id="episode-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField>
      </FormSection>
      <FormSection title="Miniatura"><FormField><FormLabel htmlFor="episode-thumbnail">Miniatura URL</FormLabel><TextInput id="episode-thumbnail" type="url" placeholder="https://..." value={form.thumbnailUrl} onChange={(event) => setForm({ ...form, thumbnailUrl: event.target.value })} /></FormField><UploadField type="image" label="Subir miniatura" onUploaded={(thumbnailUrl) => setForm({ ...form, thumbnailUrl })} /></FormSection>
      <FormSection title="Fuente de video">
        <FormField><FormLabel htmlFor="episode-source" required>Fuente</FormLabel><Select id="episode-source" value={form.videoSource} onChange={(event) => changeSource(event.target.value as VideoSource)}><option value="LOCAL">Subir video local MP4</option><option value="URL">URL externa MP4</option><option value="HLS">URL HLS .m3u8</option><option value="DRIVE">URL de Google Drive</option><option value="EMBED">Embed iframe</option></Select></FormField>
        <FormField><FormLabel htmlFor="episode-video-type">Tipo de video</FormLabel><TextInput id="episode-video-type" value={form.videoType} readOnly /></FormField>
        {form.videoSource !== 'LOCAL' && <FormField fullWidth><FormLabel htmlFor="episode-video-url" required>URL del video</FormLabel><TextInput id="episode-video-url" type="url" placeholder="https://..." value={form.originalVideoUrl} {...fieldA11y('episode-video-url', undefined, errors.videoUrl)} onChange={(event) => setForm({ ...form, originalVideoUrl: event.target.value, videoUrl: event.target.value, processedVideoUrl: '' })} /><FormError id="episode-video-url-error">{errors.videoUrl}</FormError></FormField>}
        {form.videoSource === 'LOCAL' && <FormField fullWidth><UploadField type="video" label={`Subir video MP4 o MKV (${Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_MB ?? 2048)} MB)`} target={editingId ? { type: 'EPISODE', id: editingId } : undefined} onUploaded={(url, mimeType, details) => setForm({ ...form, videoUrl: url, originalVideoUrl: details?.originalUrl ?? url, processedVideoUrl: url, thumbnailUrl: form.thumbnailUrl || details?.thumbnailUrl || '', videoType: mimeType.includes('mpegurl') ? 'HLS' : 'MP4', videoSource: 'LOCAL' })} /><FormError>{errors.videoUrl}</FormError></FormField>}
        {form.videoUrl && <div className="md:col-span-2"><VideoPlayer src={form.processedVideoUrl || form.videoUrl} originalSrc={form.originalVideoUrl} source={form.videoSource} type={form.videoType} poster={form.thumbnailUrl || undefined} /></div>}
      </FormSection>
      <details className="group rounded-2xl border border-line bg-ink/25"><summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold text-white sm:px-5"><Settings2 size={18} className="text-brand" />Configuracion avanzada de reproduccion<span className="ml-auto text-xs font-normal text-slate-400 group-open:hidden">Mostrar</span></summary><div className="grid gap-4 border-t border-line p-4 md:grid-cols-2 sm:p-5">
        {([['introStartSec', 'Inicio de introduccion'], ['introEndSec', 'Fin de introduccion'], ['recapStartSec', 'Inicio de resumen'], ['recapEndSec', 'Fin de resumen']] as const).map(([key, label]) => <FormField key={key}><FormLabel htmlFor={`episode-${key}`}>{label} (segundos)</FormLabel><NumberInput id={`episode-${key}`} min={0} value={form[key]} {...fieldA11y(`episode-${key}`, undefined, errors[key])} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /><FormError id={`episode-${key}-error`}>{errors[key]}</FormError></FormField>)}
      </div></details>
      <FormActions><button type="button" className="button-secondary" onClick={reset}>Cancelar</button><Button disabled={!seasonId}>{editingId ? 'Guardar cambios' : 'Crear episodio'}</Button></FormActions>
    </form></FormDisclosure>
    <BulkEpisodeTools seriesId={seriesId} seasonId={seasonId} episodes={items} selected={selected} onSelected={setSelected} onChanged={() => { setSelected([]); refresh(); }} />
    <div className="admin-table-shell" role="region" aria-label="Episodios de la temporada" tabIndex={0}><table><thead><tr><th><input type="checkbox" aria-label="Seleccionar todos" checked={items.length > 0 && selected.length === items.length} onChange={(event) => setSelected(event.target.checked ? items.map((item) => item.id) : [])} /></th><th>Orden</th><th>Numero</th><th>Titulo</th><th>Video</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={7} className="p-10 text-center"><p className="font-medium text-slate-200">No hay episodios en esta temporada</p><p className="mt-1 text-sm text-slate-400">Crea el primer episodio o importa un archivo CSV.</p></td></tr> : items.map((item) => <tr key={item.id}><td><input type="checkbox" aria-label={`Seleccionar ${item.title}`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td><td>{item.position}</td><td>{item.number}</td><td className="max-w-xs truncate">{item.title}</td><td>{item.videoType}</td><td>{item.published ? 'Publicado' : 'Borrador'}</td><td className="flex gap-2"><button type="button" className="rounded-lg border border-brand px-3 py-1.5 text-brand" onClick={() => edit(item)}>Editar</button><button type="button" className="rounded-lg border border-coral px-3 py-1.5 text-coral" onClick={() => setPendingDelete(item)}>Eliminar</button></td></tr>)}</tbody></table></div>
    <CsvEpisodeImport seriesId={seriesId} onImported={refresh} />
    <ConfirmDialog open={Boolean(pendingDelete)} title="Eliminar episodio" itemName={pendingDelete ? `E${pendingDelete.number}. ${pendingDelete.title}` : undefined} description="El episodio dejara de estar disponible y se retirara del catalogo." busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void removeEpisode()} />
  </Panel>;
}
