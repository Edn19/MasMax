import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, deleteJson, patchJson, postJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Season, Series } from '../../types/models';
import { Checkbox, FormActions, FormField, FormHint, FormLabel, FormSection, NumberInput, Select, TextArea, TextInput } from '../components/AdminForms';
import { AdminTable, Button, FormDisclosure, Panel, ResourceError } from '../components/AdminUi';
import { UploadField } from '../components/UploadField';

const emptyForm = { number: '', title: '', description: '', posterUrl: '', published: false };

export function SeasonsAdminPage() {
  const series = useAsync<Series[]>(() => api('/admin/series'), []);
  const [seriesId, setSeriesId] = useState('');
  const seasons = useAsync<Season[]>(() => seriesId ? api(`/admin/series/${seriesId}/seasons`) : Promise.resolve([]), [seriesId]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  useEffect(() => { if (!seriesId && series.data?.[0]) setSeriesId(series.data[0].id); }, [series.data, seriesId]);
  function reset() { setEditingId(null); setForm(emptyForm); setFormOpen(false); }
  function edit(season: Season) { setEditingId(season.id); setFormOpen(true); setForm({ number: String(season.number), title: season.title, description: season.description, posterUrl: season.posterUrl ?? '', published: season.published }); }
  async function submit(event: FormEvent) { event.preventDefault(); if (!seriesId) return toast.error('Selecciona una serie'); const payload = { seriesId, number: form.number ? Number(form.number) : undefined, title: form.title || undefined, description: form.description, posterUrl: form.posterUrl || undefined, published: form.published }; try { const saved = editingId ? await patchJson<Season>(`/admin/seasons/${editingId}`, payload) : await postJson<Season>('/admin/seasons', payload); seasons.setData(editingId ? (seasons.data ?? []).map((item) => item.id === saved.id ? saved : item) : [...(seasons.data ?? []), saved].sort((a, b) => a.number - b.number)); toast.success(editingId ? 'Temporada actualizada' : 'Temporada creada'); reset(); } catch (error) { toast.error((error as Error).message); } }
  const rows = (seasons.data ?? []).map((season) => ({ ...season, estado: season.published ? 'PUBLISHED' : 'DRAFT', episodios: season._count?.episodes ?? 0 }));
  return <Panel title="Temporadas" description="Organiza temporadas y su disponibilidad por serie." action={<button type="button" className="button-primary" disabled={!seriesId} onClick={() => { setEditingId(null); setForm(emptyForm); setFormOpen(true); }}>Crear temporada</button>}>
    <ResourceError message={series.error ?? seasons.error} />
    <FormField className="mb-5"><FormLabel htmlFor="season-series" required>Serie</FormLabel><Select id="season-series" value={seriesId} onChange={(event) => { setSeriesId(event.target.value); reset(); }}><option value="">Selecciona una serie</option>{(series.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select><FormHint>Las temporadas se mostraran para la serie seleccionada.</FormHint></FormField>
    <FormDisclosure open={formOpen} title="Temporada" description="Define numeracion, publicacion y material grafico." editing={Boolean(editingId)} onToggle={() => setFormOpen((value) => !value)}><form onSubmit={submit} className="grid gap-5">
      <FormSection title="Datos de la temporada">
        <FormField><FormLabel htmlFor="season-number">Numero</FormLabel><NumberInput id="season-number" min={1} value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} /><FormHint>Se asigna automaticamente si se deja vacio.</FormHint></FormField>
        <FormField><FormLabel htmlFor="season-title">Titulo opcional</FormLabel><TextInput id="season-title" placeholder="Ej. El despertar" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></FormField>
        <FormField fullWidth><FormLabel htmlFor="season-description">Descripcion</FormLabel><TextArea id="season-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField>
        <FormField fullWidth><Checkbox label="Temporada publicada" hint="Estara disponible para los usuarios cuando su contenido tambien este publicado." checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /></FormField>
      </FormSection>
      <FormSection title="Poster"><FormField><FormLabel htmlFor="season-poster">Poster URL</FormLabel><TextInput id="season-poster" type="url" placeholder="https://..." value={form.posterUrl} onChange={(event) => setForm({ ...form, posterUrl: event.target.value })} /></FormField><UploadField type="image" label="Subir poster" onUploaded={(posterUrl) => setForm({ ...form, posterUrl })} /></FormSection>
      <FormActions><button type="button" className="button-secondary" onClick={reset}>Cancelar</button><Button disabled={!seriesId}>{editingId ? 'Guardar cambios' : 'Crear temporada'}</Button></FormActions>
    </form></FormDisclosure>
    <AdminTable rows={rows} columns={['number', 'title', 'estado', 'episodios', { key: 'updatedAt', label: 'Actualizacion', render: (season) => new Date(season.updatedAt).toLocaleDateString('es-PE') }]} onEdit={edit} onDelete={async (id) => { await deleteJson(`/admin/seasons/${id}`); seasons.setData((seasons.data ?? []).filter((item) => item.id !== id)); }} rowLabel={(season) => `Temporada ${season.number}${season.title ? `: ${season.title}` : ''}`} deleteTitle="Eliminar temporada" deleteDescription="La temporada y su organizacion dejaran de estar disponibles." emptyMessage={seriesId ? 'La serie no tiene temporadas' : 'Selecciona una serie'} emptyDescription={seriesId ? 'Crea la primera temporada para organizar sus episodios.' : 'Elige una serie para consultar su contenido.'} />
  </Panel>;
}
