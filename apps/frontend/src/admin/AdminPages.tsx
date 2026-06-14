import { FormEvent, ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { LoadingBlock } from '../components/Layout';
import { VideoPlayer } from '../components/VideoPlayer';
import { api, deleteJson, patchJson, postJson, uploadFile } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Comment, Episode, Genre, Movie, Series, SiteSetting, Stats, User } from '../types/models';

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel/80 p-5">
      <h1 className="mb-5 text-2xl font-black text-white">{title}</h1>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full rounded-lg border border-line bg-ink p-2.5 text-sm outline-none focus:border-brand" />;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className="min-h-24 w-full rounded-lg border border-line bg-ink p-2.5 text-sm outline-none focus:border-brand" />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="w-full rounded-lg border border-line bg-ink p-2.5 text-sm outline-none focus:border-brand" />;
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="rounded-lg bg-brand px-4 py-2 text-sm font-black text-ink hover:bg-white disabled:opacity-60" />;
}

function UploadField({
  type,
  label,
  onUploaded,
}: {
  type: 'video' | 'image';
  label: string;
  onUploaded: (url: string, mimeType: string) => void;
}) {
  const maxVideoUploadMb = Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_MB ?? 2048);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  async function upload(file?: File) {
    if (!file) return;
    if (type === 'video') {
      const allowedMimeTypes = ['video/mp4', 'application/mp4', 'application/octet-stream', ''];
      const extensionIsMp4 = file.name.toLowerCase().endsWith('.mp4');
      if (!extensionIsMp4 || !allowedMimeTypes.includes(file.type.toLowerCase())) {
        toast.error(`Formato no permitido. Solo se permite MP4. Archivo: ${file.name}, mimetype: ${file.type || '(vacio)'}`);
        return;
      }
    }
    if (type === 'video' && file.size > maxVideoUploadMb * 1024 * 1024) {
      toast.error(`El archivo supera el limite de ${maxVideoUploadMb} MB.`);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const result = await uploadFile<{ url: string; mimeType: string }>(`/admin/uploads/${type}`, file, setProgress);
      onUploaded(result.url, result.mimeType);
      toast.success('Archivo subido');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <label className="rounded-lg border border-dashed border-line p-3 text-sm text-slate-300">
      <span className="mb-2 block font-bold">{label}</span>
      <input type="file" accept={type === 'video' ? 'video/mp4,.mp4' : 'image/*'} disabled={uploading} onChange={(event) => upload(event.target.files?.[0])} />
      {uploading && <div className="mt-2 h-2 overflow-hidden rounded bg-ink"><div className="h-full bg-brand" style={{ width: `${progress}%` }} /></div>}
      {uploading && <span className="mt-1 block text-xs">{progress}%</span>}
    </label>
  );
}

const emptySeries = {
  title: '',
  slug: '',
  description: '',
  cover: '',
  banner: '',
  year: '2026',
  status: 'AIRING',
  genreIds: [] as string[],
  featured: false,
};

const emptyEpisode = {
  seriesId: '',
  number: '1',
  title: '',
  description: '',
  videoUrl: '',
  originalVideoUrl: '',
  processedVideoUrl: '',
  videoSource: 'URL',
  videoType: 'MP4',
  thumbnailUrl: '',
  publishedAt: new Date().toISOString().slice(0, 10),
};

const emptyMovie = {
  title: '',
  slug: '',
  description: '',
  posterUrl: '',
  bannerUrl: '',
  videoUrl: '',
  originalVideoUrl: '',
  processedVideoUrl: '',
  videoSource: 'URL',
  videoType: 'MP4',
  duration: '90',
  releaseYear: String(new Date().getFullYear()),
  genreIds: [] as string[],
  status: 'DRAFT',
};

export function DashboardPage() {
  const { data, loading } = useAsync<Stats>(() => api('/admin/stats'), []);
  if (loading) return <LoadingBlock />;

  const cards: Array<[string, number | undefined]> = [
    ['Series', data?.series],
    ['Episodios', data?.episodes],
    ['Peliculas', data?.movies],
    ['Usuarios', data?.users],
    ['Vistas totales', data?.totalViews],
  ];

  return (
    <Panel title="Dashboard">
      <div className="grid gap-4 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-ink p-5">
            <p className="text-sm text-slate-400">{label}</p>
            <strong className="mt-2 block text-3xl text-white">{value ?? 0}</strong>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function MoviesAdminPage() {
  const movies = useAsync<Movie[]>(() => api('/admin/movies'), []);
  const genres = useAsync<Genre[]>(() => api('/genres'), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyMovie);

  function edit(item: Movie) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      slug: item.slug,
      description: item.description,
      posterUrl: item.posterUrl,
      bannerUrl: item.bannerUrl,
      videoUrl: item.videoUrl,
      originalVideoUrl: item.originalVideoUrl ?? item.videoUrl,
      processedVideoUrl: item.processedVideoUrl ?? item.videoUrl,
      videoSource: item.videoSource,
      videoType: item.videoType,
      duration: String(item.duration),
      releaseYear: String(item.releaseYear),
      genreIds: item.genres.map((genre) => genre.id),
      status: item.status,
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.videoUrl.trim()) return toast.error('Agrega o sube un video');
    try {
      const payload = {
        ...form,
        duration: Number(form.duration),
        releaseYear: Number(form.releaseYear),
        originalVideoUrl: form.originalVideoUrl || undefined,
        processedVideoUrl: form.processedVideoUrl || undefined,
      };
      const saved = editingId
        ? await patchJson<Movie>(`/admin/movies/${editingId}`, payload)
        : await postJson<Movie>('/admin/movies', payload);
      movies.setData(editingId
        ? (movies.data ?? []).map((item) => item.id === saved.id ? saved : item)
        : [saved, ...(movies.data ?? [])]);
      setEditingId(null);
      setForm(emptyMovie);
      toast.success(editingId ? 'Pelicula actualizada' : 'Pelicula creada');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Panel title="Peliculas">
      <form onSubmit={submit} className="mb-6 grid gap-3 md:grid-cols-2">
        <Input required placeholder="Titulo" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <Input placeholder="Slug opcional" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
        <Input required placeholder="Portada URL" value={form.posterUrl} onChange={(event) => setForm({ ...form, posterUrl: event.target.value })} />
        <UploadField type="image" label="Subir portada" onUploaded={(url) => setForm({ ...form, posterUrl: url })} />
        <Input required placeholder="Banner URL" value={form.bannerUrl} onChange={(event) => setForm({ ...form, bannerUrl: event.target.value })} />
        <UploadField type="image" label="Subir banner" onUploaded={(url) => setForm({ ...form, bannerUrl: url })} />
        <Input required type="number" min={1} placeholder="Duracion en minutos" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} />
        <Input required type="number" min={1900} max={2200} placeholder="Ano de estreno" value={form.releaseYear} onChange={(event) => setForm({ ...form, releaseYear: event.target.value })} />
        <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="DRAFT">Borrador</option>
          <option value="PUBLISHED">Publicada</option>
          <option value="HIDDEN">Oculta</option>
        </Select>
        <Select value={form.videoSource} onChange={(event) => {
          const source = event.target.value;
          const type = source === 'HLS' ? 'HLS' : source === 'DRIVE' ? 'DRIVE' : source === 'EMBED' ? 'EMBED' : 'MP4';
          setForm({ ...form, videoSource: source, videoType: type, videoUrl: '', originalVideoUrl: '', processedVideoUrl: '' });
        }}>
          <option value="LOCAL">Subir video local MP4</option>
          <option value="URL">URL externa MP4</option>
          <option value="HLS">URL HLS .m3u8</option>
          <option value="DRIVE">URL de Google Drive</option>
          <option value="EMBED">Embed iframe</option>
        </Select>
        {form.videoSource !== 'LOCAL' ? (
          <Input
            required
            placeholder={form.videoSource === 'DRIVE' ? 'Enlace de Google Drive' : form.videoSource === 'HLS' ? 'https://servidor/video.m3u8' : form.videoSource === 'EMBED' ? 'https://proveedor/embed/...' : 'https://servidor/video.mp4'}
            value={form.originalVideoUrl}
            onChange={(event) => setForm({ ...form, originalVideoUrl: event.target.value, videoUrl: event.target.value, processedVideoUrl: '' })}
          />
        ) : (
          <UploadField type="video" label="Subir pelicula MP4 local 1080p" onUploaded={(url) => setForm({ ...form, videoUrl: url, originalVideoUrl: url, processedVideoUrl: url, videoSource: 'LOCAL', videoType: 'MP4' })} />
        )}
        <select
          multiple
          className="min-h-28 rounded-lg border border-line bg-ink p-2.5 text-sm outline-none focus:border-brand"
          value={form.genreIds}
          onChange={(event) => setForm({ ...form, genreIds: Array.from(event.target.selectedOptions).map((option) => option.value) })}
        >
          {(genres.data ?? []).map((genre) => <option key={genre.id} value={genre.id}>{genre.name}</option>)}
        </select>
        <Textarea required placeholder="Descripcion" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        {form.videoUrl && <div className="md:col-span-2"><VideoPlayer src={form.processedVideoUrl || form.videoUrl} originalSrc={form.originalVideoUrl} source={form.videoSource as Movie['videoSource']} type={form.videoType as Movie['videoType']} poster={form.posterUrl || undefined} /></div>}
        <div className="flex gap-2 md:col-span-2">
          <Button>{editingId ? 'Guardar cambios' : 'Crear pelicula'}</Button>
          {editingId && <button type="button" className="rounded-lg border border-line px-4 py-2" onClick={() => { setEditingId(null); setForm(emptyMovie); }}>Cancelar</button>}
        </div>
      </form>
      <AdminTable
        rows={movies.data ?? []}
        columns={['title', 'releaseYear', 'duration', 'status', 'videoType']}
        onEdit={edit}
        onDelete={(id) => deleteJson(`/admin/movies/${id}`).then(() => movies.setData((movies.data ?? []).filter((item) => item.id !== id)))}
      />
    </Panel>
  );
}

export function SeriesAdminPage() {
  const series = useAsync<Series[]>(() => api('/series'), []);
  const genres = useAsync<Genre[]>(() => api('/genres'), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptySeries);

  function edit(item: Series) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      slug: item.slug,
      description: item.description,
      cover: item.cover,
      banner: item.banner,
      year: String(item.year),
      status: item.status,
      genreIds: item.genres.map((genre) => genre.id),
      featured: item.featured,
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const payload = { ...form, year: Number(form.year) };
      const saved = editingId
        ? await patchJson<Series>(`/admin/series/${editingId}`, payload)
        : await postJson<Series>('/admin/series', payload);
      const next = editingId
        ? (series.data ?? []).map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...(series.data ?? [])];
      series.setData(next);
      setEditingId(null);
      setForm(emptySeries);
      toast.success(editingId ? 'Serie actualizada' : 'Serie creada');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Panel title="Series">
      <form onSubmit={submit} className="mb-6 grid gap-3 md:grid-cols-2">
        <Input placeholder="Titulo" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <Input placeholder="Slug" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
        <Input placeholder="Portada URL" value={form.cover} onChange={(event) => setForm({ ...form, cover: event.target.value })} />
        <Input placeholder="Banner URL" value={form.banner} onChange={(event) => setForm({ ...form, banner: event.target.value })} />
        <Input placeholder="Ano" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} />
        <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="AIRING">En emision</option>
          <option value="FINISHED">Finalizado</option>
          <option value="PAUSED">Pausado</option>
        </Select>
        <Textarea placeholder="Descripcion" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <select
          multiple
          className="min-h-24 rounded-lg border border-line bg-ink p-2.5 text-sm outline-none focus:border-brand"
          value={form.genreIds}
          onChange={(event) => setForm({ ...form, genreIds: Array.from(event.target.selectedOptions).map((option) => option.value) })}
        >
          {(genres.data ?? []).map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} />
          Destacada
        </label>
        <div className="flex gap-2">
          <Button>{editingId ? 'Guardar cambios' : 'Crear serie'}</Button>
          {editingId && (
            <button type="button" className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-slate-300" onClick={() => { setEditingId(null); setForm(emptySeries); }}>
              Cancelar
            </button>
          )}
        </div>
      </form>
      <AdminTable
        rows={series.data ?? []}
        columns={['title', 'year', 'status']}
        onEdit={edit}
        onDelete={(id) => deleteJson(`/admin/series/${id}`).then(() => series.setData((series.data ?? []).filter((item) => item.id !== id)))}
      />
    </Panel>
  );
}

export function EpisodesAdminPage() {
  const episodes = useAsync<Episode[]>(() => api('/episodes/latest'), []);
  const series = useAsync<Series[]>(() => api('/series'), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyEpisode);

  function edit(item: Episode) {
    setEditingId(item.id);
    setForm({
      seriesId: item.seriesId,
      number: String(item.number),
      title: item.title,
      description: item.description,
      videoUrl: item.videoUrl,
      originalVideoUrl: item.originalVideoUrl ?? item.videoUrl,
      processedVideoUrl: item.processedVideoUrl ?? item.videoUrl,
      videoSource: item.videoSource,
      videoType: item.videoType,
      thumbnailUrl: item.thumbnailUrl ?? '',
      publishedAt: item.publishedAt.slice(0, 10),
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.seriesId) {
      toast.error('Selecciona una serie');
      return;
    }
    if (!form.videoUrl.trim()) {
      toast.error('Agrega o sube un video');
      return;
    }
    try {
      const payload = {
        seriesId: form.seriesId,
        episodeNumber: Number(form.number),
        title: form.title,
        description: form.description,
        videoSource: form.videoSource,
        videoType: form.videoType,
        videoUrl: form.videoUrl,
        originalVideoUrl: form.originalVideoUrl || undefined,
        processedVideoUrl: form.processedVideoUrl || undefined,
        thumbnailUrl: form.thumbnailUrl || undefined,
        publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : undefined,
      };
      const saved = editingId
        ? await patchJson<Episode>(`/admin/episodes/${editingId}`, payload)
        : await postJson<Episode>('/admin/episodes', payload);
      const next = editingId
        ? (episodes.data ?? []).map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...(episodes.data ?? [])];
      episodes.setData(next);
      setEditingId(null);
      setForm(emptyEpisode);
      toast.success(editingId ? 'Episodio actualizado' : 'Episodio creado');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Panel title="Episodios">
      <form onSubmit={submit} className="mb-6 grid gap-3 md:grid-cols-2">
        <Select value={form.seriesId} onChange={(event) => setForm({ ...form, seriesId: event.target.value })}>
          <option value="">Serie</option>
          {(series.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </Select>
        <Input placeholder="Numero" value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} />
        <Input placeholder="Titulo" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <Input placeholder="Miniatura URL" value={form.thumbnailUrl} onChange={(event) => setForm({ ...form, thumbnailUrl: event.target.value })} />
        <UploadField type="image" label="Subir miniatura" onUploaded={(url) => setForm({ ...form, thumbnailUrl: url })} />
        <Select value={form.videoSource} onChange={(event) => {
          const source = event.target.value;
          const type = source === 'HLS' ? 'HLS' : source === 'DRIVE' ? 'DRIVE' : source === 'EMBED' ? 'EMBED' : 'MP4';
          setForm({ ...form, videoSource: source, videoType: type, videoUrl: '', originalVideoUrl: '', processedVideoUrl: '' });
        }}>
          <option value="LOCAL">Subir video local MP4</option>
          <option value="URL">URL externa MP4</option>
          <option value="HLS">URL HLS .m3u8</option>
          <option value="DRIVE">URL de Google Drive</option>
          <option value="EMBED">Embed iframe</option>
        </Select>
        <Input value={form.videoType} readOnly aria-label="Tipo de video" />
        {form.videoSource !== 'LOCAL' && (
          <Input
            placeholder={
              form.videoSource === 'DRIVE' ? 'Enlace publico de Google Drive' :
              form.videoSource === 'HLS' ? 'https://servidor/video.m3u8' :
              form.videoSource === 'EMBED' ? 'https://proveedor/embed/...' :
              'https://servidor/video.mp4'
            }
            value={form.originalVideoUrl}
            onChange={(event) => setForm({ ...form, originalVideoUrl: event.target.value, videoUrl: event.target.value, processedVideoUrl: '' })}
          />
        )}
        {form.videoSource === 'LOCAL' && <UploadField type="video" label={`Subir video MP4 (maximo 1080p, ${Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_MB ?? 2048)} MB)`} onUploaded={(url) => setForm({ ...form, videoUrl: url, originalVideoUrl: url, processedVideoUrl: url, videoType: 'MP4', videoSource: 'LOCAL' })} />}
        <Input type="date" value={form.publishedAt} onChange={(event) => setForm({ ...form, publishedAt: event.target.value })} />
        <Textarea placeholder="Descripcion" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        {form.videoUrl && <div className="md:col-span-2">
          <VideoPlayer
            src={form.processedVideoUrl || form.videoUrl}
            originalSrc={form.originalVideoUrl}
            source={form.videoSource as Episode['videoSource']}
            type={form.videoType as Episode['videoType']}
            poster={form.thumbnailUrl || undefined}
          />
        </div>}
        <div className="flex gap-2">
          <Button>{editingId ? 'Guardar cambios' : 'Crear episodio'}</Button>
          {editingId && (
            <button type="button" className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-slate-300" onClick={() => { setEditingId(null); setForm(emptyEpisode); }}>
              Cancelar
            </button>
          )}
        </div>
      </form>
      <AdminTable
        rows={episodes.data ?? []}
        columns={['title', 'number', 'videoType']}
        onEdit={edit}
        onDelete={(id) => deleteJson(`/admin/episodes/${id}`).then(() => episodes.setData((episodes.data ?? []).filter((item) => item.id !== id)))}
      />
    </Panel>
  );
}

export function GenresAdminPage() {
  const genres = useAsync<Genre[]>(() => api('/genres'), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '' });

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const saved = editingId
        ? await patchJson<Genre>(`/admin/genres/${editingId}`, form)
        : await postJson<Genre>('/admin/genres', form);
      genres.setData(editingId ? (genres.data ?? []).map((item) => (item.id === saved.id ? saved : item)) : [...(genres.data ?? []), saved]);
      setEditingId(null);
      setForm({ name: '', slug: '' });
      toast.success(editingId ? 'Genero actualizado' : 'Genero creado');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Panel title="Generos">
      <form onSubmit={submit} className="mb-6 grid gap-3 md:grid-cols-[1fr,1fr,auto]">
        <Input placeholder="Nombre" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <Input placeholder="Slug opcional" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
        <Button>{editingId ? 'Guardar' : 'Crear'}</Button>
      </form>
      <AdminTable
        rows={genres.data ?? []}
        columns={['name', 'slug']}
        onEdit={(item) => { setEditingId(item.id); setForm({ name: item.name, slug: item.slug }); }}
        onDelete={(id) => deleteJson(`/admin/genres/${id}`).then(() => genres.setData((genres.data ?? []).filter((item) => item.id !== id)))}
      />
    </Panel>
  );
}

export function UsersAdminPage() {
  const users = useAsync<User[]>(() => api('/admin/users'), []);
  const emptyUser = { name: '', email: '', role: 'USER', active: true, password: '', confirmPassword: '' };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyUser);

  function edit(user: User) {
    setEditingId(user.id ?? null);
    setForm({ name: user.name, email: user.email, role: user.role, active: user.active ?? true, password: '', confirmPassword: '' });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (!editingId && form.password !== form.confirmPassword) throw new Error('Las contrasenas no coinciden');
      const saved = editingId
        ? await patchJson<User>(`/admin/users/${editingId}`, { name: form.name, email: form.email, role: form.role, active: form.active })
        : await postJson<User>('/admin/users', { name: form.name, email: form.email, role: form.role, active: form.active, password: form.password });
      users.setData(editingId ? (users.data ?? []).map((item) => item.id === saved.id ? saved : item) : [saved, ...(users.data ?? [])]);
      setEditingId(null);
      setForm(emptyUser);
      toast.success(editingId ? 'Usuario actualizado' : 'Usuario creado');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function changePassword() {
    if (!editingId) return;
    if (form.password.length < 8) return toast.error('La contrasena debe tener al menos 8 caracteres');
    if (form.password !== form.confirmPassword) return toast.error('Las contrasenas no coinciden');
    try {
      await patchJson(`/admin/users/${editingId}/password`, { password: form.password, confirmPassword: form.confirmPassword });
      setForm({ ...form, password: '', confirmPassword: '' });
      toast.success('Contrasena actualizada');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Panel title="Usuarios">
      <form onSubmit={submit} className="mb-6 grid gap-3 md:grid-cols-2">
        <Input placeholder="Nombre" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <Input type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </Select>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Usuario activo</label>
        <Input type="password" minLength={8} required={!editingId} placeholder={editingId ? 'Nueva contrasena (opcional)' : 'Contrasena'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <Input type="password" minLength={8} required={!editingId} placeholder="Confirmar contrasena" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} />
        <div className="flex flex-wrap gap-2">
          <Button>{editingId ? 'Guardar usuario' : 'Crear usuario'}</Button>
          {editingId && form.password && <button type="button" className="rounded-lg border border-brand px-4 py-2 text-brand" onClick={changePassword}>Cambiar contrasena</button>}
          {editingId && <button type="button" className="rounded-lg border border-line px-4 py-2" onClick={() => { setEditingId(null); setForm(emptyUser); }}>Cancelar</button>}
        </div>
      </form>
      <AdminTable
        rows={users.data ?? []}
        columns={['name', 'email', 'role', 'active']}
        onEdit={edit}
        onDelete={(id) => deleteJson(`/admin/users/${id}`).then(() => users.setData((users.data ?? []).filter((item) => item.id !== id)))}
      />
    </Panel>
  );
}

export function CommentsAdminPage() {
  const comments = useAsync<Comment[]>(() => api('/admin/comments'), []);

  async function approve(id: string) {
    const saved = await patchJson<Comment>(`/admin/comments/${id}`, { approved: true });
    comments.setData((comments.data ?? []).map((item) => (item.id === id ? { ...item, approved: saved.approved } : item)));
    toast.success('Comentario aprobado');
  }

  return (
    <Panel title="Comentarios">
      <AdminTable
        rows={comments.data ?? []}
        columns={['body', 'approved']}
        onApprove={approve}
        onDelete={(id) => deleteJson(`/admin/comments/${id}`).then(() => comments.setData((comments.data ?? []).filter((item) => item.id !== id)))}
      />
    </Panel>
  );
}

export function SettingsAdminPage() {
  const settings = useAsync<SiteSetting>(() => api('/settings'), []);
  const [form, setForm] = useState<Partial<SiteSetting>>({});
  const current: Partial<SiteSetting> = { ...(settings.data ?? {}), ...form };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { siteName, logo, primaryColor, facebook, instagram, youtube, tiktok } = current;
    const updated = await patchJson<SiteSetting>('/admin/settings', { siteName, logo, primaryColor, facebook, instagram, youtube, tiktok });
    settings.setData(updated);
    toast.success('Configuracion guardada');
  }

  return (
    <Panel title="Configuracion">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        {(['siteName', 'logo', 'primaryColor', 'facebook', 'instagram', 'youtube', 'tiktok'] as const).map((key) => (
          <Input key={key} placeholder={key} value={(current[key] as string) ?? ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
        ))}
        <Button>Guardar</Button>
      </form>
    </Panel>
  );
}

export function DesignAdminPage() {
  const settings = useAsync<SiteSetting>(() => api('/site-settings'), []);
  const series = useAsync<Series[]>(() => api('/series'), []);
  const [form, setForm] = useState<Partial<SiteSetting>>({});
  const current = { ...(settings.data ?? {}), ...form } as Partial<SiteSetting>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const {
        siteName, logo, favicon, primaryColor, secondaryColor, colorMode, heroTitle, heroText, heroImage,
        featuredSeriesIds, sectionOrder, showLatestEpisodes, showPopularSeries, showGenres, showComments,
        showFooter, footerText, facebook, instagram, youtube, tiktok,
      } = current;
      const updated = await patchJson<SiteSetting>('/admin/site-settings', {
        siteName, logo, favicon, primaryColor, secondaryColor, colorMode, heroTitle, heroText, heroImage,
        featuredSeriesIds, sectionOrder, showLatestEpisodes, showPopularSeries, showGenres, showComments,
        showFooter, footerText, facebook, instagram, youtube, tiktok,
      });
      settings.setData(updated);
      setForm({});
      toast.success('Diseno guardado. Recarga el sitio publico para verlo.');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const toggleFeatured = (id: string) => {
    const ids = current.featuredSeriesIds ?? [];
    setForm({ ...form, featuredSeriesIds: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] });
  };

  return (
    <Panel title="Diseno del sitio">
      {settings.loading ? <LoadingBlock /> : (
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <Input placeholder="Nombre del sitio" value={current.siteName ?? ''} onChange={(event) => setForm({ ...form, siteName: event.target.value })} />
          <Select value={current.colorMode ?? 'dark'} onChange={(event) => setForm({ ...form, colorMode: event.target.value as SiteSetting['colorMode'] })}>
            <option value="dark">Modo oscuro</option>
            <option value="light">Modo claro</option>
          </Select>
          <Input placeholder="Logo URL" value={current.logo ?? ''} onChange={(event) => setForm({ ...form, logo: event.target.value })} />
          <UploadField type="image" label="Subir logo" onUploaded={(url) => setForm({ ...form, logo: url })} />
          <Input placeholder="Favicon URL" value={current.favicon ?? ''} onChange={(event) => setForm({ ...form, favicon: event.target.value })} />
          <UploadField type="image" label="Subir favicon" onUploaded={(url) => setForm({ ...form, favicon: url })} />
          <label className="text-sm">Color principal<Input type="color" value={current.primaryColor ?? '#22d3ee'} onChange={(event) => setForm({ ...form, primaryColor: event.target.value })} /></label>
          <label className="text-sm">Color secundario<Input type="color" value={current.secondaryColor ?? '#fb7185'} onChange={(event) => setForm({ ...form, secondaryColor: event.target.value })} /></label>
          <Input placeholder="Titulo del hero" value={current.heroTitle ?? ''} onChange={(event) => setForm({ ...form, heroTitle: event.target.value })} />
          <Input placeholder="Imagen del hero" value={current.heroImage ?? ''} onChange={(event) => setForm({ ...form, heroImage: event.target.value })} />
          <Textarea placeholder="Texto del hero" value={current.heroText ?? ''} onChange={(event) => setForm({ ...form, heroText: event.target.value })} />
          <UploadField type="image" label="Subir banner del hero" onUploaded={(url) => setForm({ ...form, heroImage: url })} />
          <label className="md:col-span-2 text-sm">Orden de secciones, separado por comas
            <Input value={(current.sectionOrder ?? []).join(',')} onChange={(event) => setForm({ ...form, sectionOrder: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} />
          </label>
          <div className="md:col-span-2">
            <p className="mb-2 font-bold">Series destacadas</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(series.data ?? []).map((item) => <label key={item.id} className="flex items-center gap-2 rounded border border-line p-2"><input type="checkbox" checked={(current.featuredSeriesIds ?? []).includes(item.id)} onChange={() => toggleFeatured(item.id)} />{item.title}</label>)}
            </div>
          </div>
          {([
            ['showLatestEpisodes', 'Mostrar ultimos episodios'],
            ['showPopularSeries', 'Mostrar series populares'],
            ['showGenres', 'Mostrar generos'],
            ['showComments', 'Mostrar comentarios'],
            ['showFooter', 'Mostrar footer'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={current[key] ?? true} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />{label}</label>
          ))}
          <Input placeholder="Texto del footer" value={current.footerText ?? ''} onChange={(event) => setForm({ ...form, footerText: event.target.value })} />
          <div className="md:col-span-2"><Button>Guardar diseno</Button></div>
        </form>
      )}
    </Panel>
  );
}

function AdminTable<T extends { id?: string }>({
  rows,
  columns,
  onEdit,
  onDelete,
  onApprove,
  extraAction,
}: {
  rows: T[];
  columns: string[];
  onEdit?: (row: T) => void;
  onDelete?: (id: string) => void;
  onApprove?: (id: string) => void;
  extraAction?: (row: T) => ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-ink text-slate-400">
          <tr>
            {columns.map((column) => (
              <th key={column} className="p-3 capitalize">
                {column}
              </th>
            ))}
            <th className="p-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? index} className="border-t border-line">
              {columns.map((column) => (
                <td key={column} className="max-w-xs truncate p-3 text-slate-200">
                  {String((row as Record<string, unknown>)[column] ?? '')}
                </td>
              ))}
              <td className="flex min-w-52 flex-wrap gap-2 p-3">
                {extraAction?.(row)}
                {onEdit && (
                  <button type="button" className="rounded border border-brand px-2 py-1 text-brand" onClick={() => onEdit(row)}>
                    Editar
                  </button>
                )}
                {onApprove && (
                  <button type="button" className="rounded border border-mint px-2 py-1 text-mint" onClick={() => row.id && onApprove(row.id)}>
                    Aprobar
                  </button>
                )}
                {onDelete && (
                  <button type="button" className="rounded border border-coral px-2 py-1 text-coral" onClick={() => row.id && onDelete(row.id)}>
                    Eliminar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
