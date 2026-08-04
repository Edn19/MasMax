import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { api, deleteJson, patchJson, postJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Genre, Series, SeriesStatus } from '../../types/models';
import { Checkbox, FormActions, FormField, FormHint, FormLabel, FormSection, NumberInput, Select, TextArea, TextInput } from '../components/AdminForms';
import { AdminTable, Button, FormDisclosure, Panel, ResourceError } from '../components/AdminUi';
import { MultiSelect } from '../components/MultiSelect';
import { UploadField } from '../components/UploadField';

const emptySeries = { title: '', slug: '', description: '', cover: '', banner: '', year: '2026', status: 'AIRING' as SeriesStatus, genreIds: [] as string[], featured: false };

export function SeriesAdminPage() {
  const series = useAsync<Series[]>(() => api('/admin/series'), []);
  const genres = useAsync<Genre[]>(() => api('/genres'), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(emptySeries);

  function reset() { setEditingId(null); setForm(emptySeries); setFormOpen(false); }
  function edit(item: Series) { setEditingId(item.id); setFormOpen(true); setForm({ title: item.title, slug: item.slug, description: item.description, cover: item.cover, banner: item.banner, year: String(item.year), status: item.status, genreIds: item.genres.map((genre) => genre.id), featured: item.featured }); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const saved = editingId ? await patchJson<Series>(`/admin/series/${editingId}`, { ...form, year: Number(form.year) }) : await postJson<Series>('/admin/series', { ...form, year: Number(form.year) });
      series.setData(editingId ? (series.data ?? []).map((item) => item.id === saved.id ? saved : item) : [saved, ...(series.data ?? [])]);
      toast.success(editingId ? 'Serie actualizada' : 'Serie creada');
      reset();
    } catch (error) { toast.error((error as Error).message); }
  }

  const rows = (series.data ?? []).filter((item) => item.title.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')) && (!statusFilter || item.status === statusFilter));

  return (
    <Panel title="Series" description="Administra las series disponibles en el catalogo." action={<button type="button" className="button-primary" onClick={() => { if (formOpen && !editingId) return setFormOpen(false); setEditingId(null); setForm(emptySeries); setFormOpen(true); }}>Crear serie</button>}>
      <ResourceError message={series.error ?? genres.error} />
      <FormDisclosure open={formOpen} title="Serie" description="Completa la informacion editorial, imagenes y clasificacion." editing={Boolean(editingId)} onToggle={() => setFormOpen((value) => !value)}>
        <form onSubmit={submit} className="grid gap-5">
          <FormSection title="Informacion basica">
            <FormField><FormLabel htmlFor="series-title" required>Titulo</FormLabel><TextInput id="series-title" required placeholder="Ej. Distrito Prisma" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /><FormHint>Nombre visible en el catalogo.</FormHint></FormField>
            <FormField><FormLabel htmlFor="series-slug">Slug</FormLabel><TextInput id="series-slug" placeholder="distrito-prisma" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /><FormHint>Se genera automaticamente si se deja vacio.</FormHint></FormField>
            <FormField><FormLabel htmlFor="series-year" required>Ano</FormLabel><NumberInput id="series-year" required min={1900} max={2200} value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} /></FormField>
            <FormField><FormLabel htmlFor="series-status" required>Estado</FormLabel><Select id="series-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as SeriesStatus })}><option value="AIRING">En emision</option><option value="FINISHED">Finalizada</option><option value="PAUSED">Pausada</option></Select></FormField>
            <FormField fullWidth><Checkbox label="Serie destacada" hint="Puede aparecer en el hero y en secciones promocionadas." checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} /></FormField>
          </FormSection>
          <FormSection title="Imagenes" description="Puedes pegar una URL o subir un archivo.">
            <FormField><FormLabel htmlFor="series-cover" required>Portada URL</FormLabel><TextInput id="series-cover" type="url" required placeholder="https://..." value={form.cover} onChange={(event) => setForm({ ...form, cover: event.target.value })} /></FormField>
            <UploadField type="image" label="Subir portada" onUploaded={(cover) => setForm({ ...form, cover })} />
            <FormField><FormLabel htmlFor="series-banner" required>Banner URL</FormLabel><TextInput id="series-banner" type="url" required placeholder="https://..." value={form.banner} onChange={(event) => setForm({ ...form, banner: event.target.value })} /></FormField>
            <UploadField type="image" label="Subir banner" onUploaded={(banner) => setForm({ ...form, banner })} />
          </FormSection>
          <FormSection title="Descripcion"><FormField fullWidth><FormLabel htmlFor="series-description" required>Descripcion</FormLabel><TextArea id="series-description" required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField></FormSection>
          <FormSection title="Clasificacion"><FormField fullWidth><MultiSelect id="series-genres" label="Generos" options={(genres.data ?? []).map((genre) => ({ value: genre.id, label: genre.name }))} value={form.genreIds} onChange={(genreIds) => setForm({ ...form, genreIds })} hint="Selecciona uno o mas generos." /></FormField></FormSection>
          <FormActions><button type="button" className="button-secondary" onClick={reset}>Cancelar</button><Button>{editingId ? 'Guardar cambios' : 'Crear serie'}</Button></FormActions>
        </form>
      </FormDisclosure>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <FormField><FormLabel htmlFor="series-search">Buscar por titulo</FormLabel><TextInput id="series-search" type="search" placeholder="Buscar serie..." value={query} onChange={(event) => setQuery(event.target.value)} /></FormField>
        <FormField><FormLabel htmlFor="series-filter">Filtrar por estado</FormLabel><Select id="series-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos los estados</option><option value="AIRING">En emision</option><option value="FINISHED">Finalizada</option><option value="PAUSED">Pausada</option></Select></FormField>
      </div>
      <AdminTable rows={rows} columns={[{ key: 'cover', label: 'Portada', render: (item) => <img src={item.cover} alt="" className="h-12 w-9 rounded object-cover" /> }, 'title', 'year', 'status', 'featured', { key: 'seasons', label: 'Temporadas', render: (item) => item.seasons?.length ?? '-' }]} onEdit={edit} onDelete={async (id) => { await deleteJson(`/admin/series/${id}`); series.setData((series.data ?? []).filter((item) => item.id !== id)); }} rowLabel={(item) => item.title} deleteTitle="Eliminar serie" deleteDescription="La serie dejara de estar disponible en el catalogo. Esta accion no se puede deshacer." emptyMessage="No hay series registradas" emptyDescription="Crea la primera serie para comenzar a organizar tu catalogo." />
    </Panel>
  );
}
