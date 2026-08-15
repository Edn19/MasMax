import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, apiText, deleteJson, patchJson, uploadForm } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Episode, Movie, SubtitleTrack } from '../../types/models';
import { Checkbox, FormActions, FormField, FormHint, FormLabel, FormSection, Select, TextInput } from '../components/AdminForms';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, FormDisclosure, Panel, ResourceError } from '../components/AdminUi';
import { FileSelectionField } from '../components/UploadField';

type AdminEpisodes = { items: Episode[] };
const emptyForm = { language: 'es', label: 'Espanol', isDefault: false, isForced: false, isActive: true };

export function SubtitlesAdminPage() {
  const [searchParams] = useSearchParams();
  const requestedEpisodeId = searchParams.get('episodeId') ?? '';
  const episodes = useAsync<AdminEpisodes>(() => api('/admin/episodes?limit=100'), []);
  const movies = useAsync<Movie[]>(() => api('/admin/movies'), []);
  const [targetType, setTargetType] = useState<'episode' | 'movie'>('episode');
  const [targetId, setTargetId] = useState(requestedEpisodeId);
  const [revision, setRevision] = useState(0);
  const tracks = useAsync<SubtitleTrack[]>(() => targetId ? api(`/admin/subtitles?${targetType}Id=${encodeURIComponent(targetId)}`) : Promise.resolve([]), [targetType, targetId, revision]);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<{ name: string; content: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SubtitleTrack | null>(null);
  const targets = targetType === 'episode' ? (episodes.data?.items ?? []) : (movies.data ?? []);
  useEffect(() => { if (targets.length && !targets.some((item) => item.id === targetId)) setTargetId(targets[0].id); }, [targetType, targets, targetId]);
  function reset() { setEditingId(null); setForm(emptyForm); setFile(null); setFileError(''); setProgress(0); setFormOpen(false); }
  function edit(track: SubtitleTrack) { setEditingId(track.id); setFormOpen(true); setForm({ language: track.language, label: track.label, isDefault: track.isDefault, isForced: track.isForced, isActive: track.isActive }); setFile(null); setFileError(''); }
  function refresh() { setRevision((value) => value + 1); }
  function selectFile(selected: File | null) { setFileError(''); if (!selected) return setFile(null); const maxBytes = Number(import.meta.env.VITE_MAX_SUBTITLE_UPLOAD_KB ?? 1024) * 1024; if (!/\.(vtt|srt)$/i.test(selected.name)) return setFileError('El formato no esta permitido. Usa VTT o SRT.'); if (selected.size > maxBytes) return setFileError(`El archivo supera ${Math.round(maxBytes / 1024)} KB.`); setFile(selected); }
  async function submit(event: FormEvent) { event.preventDefault(); if (!targetId) return toast.error('Selecciona un episodio o pelicula'); if (!editingId && !file) { setFileError('Selecciona un archivo VTT o SRT.'); return; } setBusy(true); try { if (editingId) { await patchJson(`/admin/subtitles/${editingId}`, form); toast.success('Pista actualizada'); } else if (file) { await uploadForm('/admin/subtitles', file, { [`${targetType}Id`]: targetId, ...form }, setProgress); toast.success('Subtitulo cargado y validado'); } reset(); refresh(); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  async function showPreview(track: SubtitleTrack) { try { setPreview({ name: `${track.label} (${track.language})`, content: await apiText(`/admin/subtitles/${track.id}/preview`) }); } catch (error) { toast.error((error as Error).message); } }
  async function remove() { if (!pendingDelete) return; setBusy(true); try { await deleteJson(`/admin/subtitles/${pendingDelete.id}`); setPendingDelete(null); refresh(); toast.success('Pista eliminada'); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  return <Panel title="Subtitulos" description="Gestiona pistas VTT y SRT para episodios y peliculas." action={<button type="button" className="button-primary" disabled={!targetId} onClick={() => { setEditingId(null); setForm(emptyForm); setFile(null); setFormOpen(true); }}>Subir subtitulo</button>}>
    <ResourceError message={episodes.error ?? movies.error ?? tracks.error} />
    <div className="mb-5 grid gap-4 md:grid-cols-2"><FormField><FormLabel htmlFor="subtitle-type" required>Tipo de contenido</FormLabel><Select id="subtitle-type" value={targetType} onChange={(event) => { setTargetType(event.target.value as 'episode' | 'movie'); setTargetId(''); reset(); }}><option value="episode">Episodio</option><option value="movie">Pelicula</option></Select></FormField><FormField><FormLabel htmlFor="subtitle-target" required>Contenido</FormLabel><Select id="subtitle-target" value={targetId} onChange={(event) => { setTargetId(event.target.value); reset(); }}><option value="">Selecciona contenido</option>{targets.map((item) => <option key={item.id} value={item.id}>{targetType === 'episode' ? `${(item as Episode).series?.title ?? 'Serie'} · T${(item as Episode).season?.number ?? '?'} E${(item as Episode).number} · ${item.title}` : item.title}</option>)}</Select></FormField></div>
    <FormDisclosure open={formOpen} title="Subtitulo" description="Configura idioma, archivo y comportamiento de la pista." editing={Boolean(editingId)} onToggle={() => setFormOpen((value) => !value)}><form onSubmit={submit} className="grid gap-5">
      <FormSection title="Datos de la pista"><FormField><FormLabel htmlFor="subtitle-language" required>Idioma</FormLabel><TextInput id="subtitle-language" required placeholder="es, en, es-PE" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} /><FormHint>Usa un codigo de idioma reconocido.</FormHint></FormField><FormField><FormLabel htmlFor="subtitle-label" required>Etiqueta visible</FormLabel><TextInput id="subtitle-label" required placeholder="Espanol Latino" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></FormField>{!editingId && <FormField fullWidth><FileSelectionField id="subtitle-file" label="Archivo" accept=".vtt,.srt,text/vtt,application/x-subrip" hint={`VTT o SRT · maximo ${Number(import.meta.env.VITE_MAX_SUBTITLE_UPLOAD_KB ?? 1024)} KB`} file={file} error={fileError} disabled={busy} onChange={selectFile} /></FormField>}</FormSection>
      <FormSection title="Opciones de la pista"><Checkbox label="Predeterminada" hint="Se selecciona automaticamente." checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked, isActive: event.target.checked ? true : form.isActive })} /><Checkbox label="Forzada" hint="Aparece en escenas especificas." checked={form.isForced} onChange={(event) => setForm({ ...form, isForced: event.target.checked })} /><Checkbox label="Activa" hint="Esta disponible en el reproductor." checked={form.isActive} disabled={form.isDefault} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /></FormSection>
      {progress > 0 && <div><div className="h-2 overflow-hidden rounded bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full bg-brand" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-slate-400">Subida: {progress}%</p></div>}
      <FormActions><button type="button" className="button-secondary" onClick={reset}>Cancelar</button><Button disabled={busy || !targetId}>{busy ? 'Procesando...' : editingId ? 'Guardar cambios' : 'Subir subtitulo'}</Button></FormActions>
    </form></FormDisclosure>
    <div className="admin-table-shell" role="region" aria-label="Pistas de subtitulos" tabIndex={0}><table><thead><tr><th>Idioma</th><th>Etiqueta</th><th>Formato</th><th>Estado</th><th>Predeterminada</th><th>Forzada</th><th>Acciones</th></tr></thead><tbody>{(tracks.data ?? []).length === 0 ? <tr><td colSpan={7} className="p-10 text-center"><p className="font-medium text-slate-200">Este contenido no tiene subtitulos</p><p className="mt-1 text-sm text-slate-400">Sube una pista VTT o SRT para agregar subtitulos.</p></td></tr> : (tracks.data ?? []).map((track) => <tr key={track.id}><td>{track.language}</td><td>{track.label}</td><td>{track.sourceFormat}</td><td>{track.isActive ? 'Activa' : 'Inactiva'}</td><td>{track.isDefault ? 'Si' : 'No'}</td><td>{track.isForced ? 'Si' : 'No'}</td><td className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border border-brand px-3 py-1.5 text-brand" onClick={() => edit(track)}>Editar</button><button type="button" className="rounded-lg border border-line px-3 py-1.5" onClick={() => void showPreview(track)}>Vista previa</button><button type="button" className="rounded-lg border border-coral px-3 py-1.5 text-coral" onClick={() => setPendingDelete(track)}>Eliminar</button></td></tr>)}</tbody></table></div>
    {preview && <section className="mt-5 rounded-xl border border-line bg-ink p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-white">Vista previa: {preview.name}</h2><button type="button" className="button-ghost" onClick={() => setPreview(null)}>Cerrar</button></div><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-3 text-xs text-slate-300">{preview.content}</pre></section>}
    <ConfirmDialog open={Boolean(pendingDelete)} title="Eliminar subtitulo" itemName={pendingDelete?.label} description="La pista y su archivo fisico se eliminaran de forma permanente." busy={busy} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove()} />
  </Panel>;
}
