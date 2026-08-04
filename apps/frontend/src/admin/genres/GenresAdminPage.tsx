import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { api, deleteJson, patchJson, postJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Genre } from '../../types/models';
import { FormActions, FormField, FormHint, FormLabel, TextInput } from '../components/AdminForms';
import { AdminTable, Button, Panel, ResourceError } from '../components/AdminUi';

const emptyGenre = { name: '', slug: '' };
export function GenresAdminPage() {
  const genres = useAsync<Genre[]>(() => api('/genres'), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyGenre);
  async function submit(event: FormEvent) { event.preventDefault(); try { const saved = editingId ? await patchJson<Genre>(`/admin/genres/${editingId}`, form) : await postJson<Genre>('/admin/genres', form); genres.setData(editingId ? (genres.data ?? []).map((item) => item.id === saved.id ? saved : item) : [...(genres.data ?? []), saved]); setEditingId(null); setForm(emptyGenre); toast.success(editingId ? 'Genero actualizado' : 'Genero creado'); } catch (error) { toast.error((error as Error).message); } }
  return <Panel title="Generos" description="Crea clasificaciones reutilizables para series y peliculas.">
    <ResourceError message={genres.error} />
    <form onSubmit={submit} className="mb-6 grid items-start gap-4 rounded-2xl border border-line bg-ink/25 p-4 md:grid-cols-[1fr_1fr_auto]">
      <FormField><FormLabel htmlFor="genre-name" required>Nombre</FormLabel><TextInput id="genre-name" required placeholder="Ej. Misterio" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FormField>
      <FormField><FormLabel htmlFor="genre-slug">Slug</FormLabel><TextInput id="genre-slug" placeholder="misterio" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /><FormHint>Opcional; se genera a partir del nombre.</FormHint></FormField>
      <FormActions><Button>{editingId ? 'Guardar' : 'Crear genero'}</Button>{editingId && <button type="button" className="button-secondary" onClick={() => { setEditingId(null); setForm(emptyGenre); }}>Cancelar</button>}</FormActions>
    </form>
    <AdminTable rows={genres.data ?? []} columns={['name', 'slug']} onEdit={(item) => { setEditingId(item.id); setForm({ name: item.name, slug: item.slug }); }} onDelete={async (id) => { await deleteJson(`/admin/genres/${id}`); genres.setData((genres.data ?? []).filter((item) => item.id !== id)); }} rowLabel={(genre) => genre.name} deleteTitle="Eliminar genero" deleteDescription="El genero se retirara de las clasificaciones. Si esta en uso, se mostrara el error especifico del servidor." emptyMessage="No hay generos registrados" emptyDescription="Crea el primer genero para clasificar tu catalogo." />
  </Panel>;
}
