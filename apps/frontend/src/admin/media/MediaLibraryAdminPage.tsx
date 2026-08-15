import { ExternalLink, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { LoadingBlock } from '../../components/Layout';
import { api, deleteJson, postJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useVideoProcessingJobs } from '../../lib/video-processing-jobs';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, Input, Panel, ResourceError, Select } from '../components/AdminUi';
import { formatBytes } from '../components/admin-utils';
import { AdminMediaItem, AdminMediaResponse, destructiveMediaCopy, mediaStatusLabels, mediaStatusTone } from './media-library';

type PendingAction = { kind: 'CANCEL' | 'HLS' | 'ORIGINAL'; item: AdminMediaItem };

export function MediaLibraryAdminPage() {
  const processing = useVideoProcessingJobs();
  const [initialParams] = useSearchParams();
  const [search, setSearch] = useState(() => initialParams.get('search') ?? '');
  const deferredSearch = useDeferredValue(search);
  const [contentType, setContentType] = useState(() => initialParams.get('contentType') ?? 'ALL');
  const [status, setStatus] = useState(() => initialParams.get('status') ?? 'ALL');
  const [publication, setPublication] = useState(() => initialParams.get('publication') ?? 'ALL');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const jobsRevision = useMemo(() => processing.jobs.map((job) => `${job.id}:${job.status}:${job.progress}:${job.stage}`).join('|'), [processing.jobs]);
  const query = useMemo(() => {
    const params = new URLSearchParams({ contentType, status, publication, sort, order, page: String(page), limit: '25' });
    if (deferredSearch.trim()) params.set('search', deferredSearch.trim());
    return params.toString();
  }, [contentType, deferredSearch, order, page, publication, sort, status]);
  const media = useAsync<AdminMediaResponse>(() => api(`/admin/media?${query}`), [query, jobsRevision]);

  function updateFilter(update: () => void) { setPage(1); update(); }
  async function mutate(item: AdminMediaItem, action: 'cancel' | 'retry' | 'publish' | 'unpublish' | 'hls' | 'original') {
    setBusyId(item.id);
    try {
      if (action === 'hls') await deleteJson(`/admin/media/${encodeURIComponent(item.id)}/hls`);
      else if (action === 'original') await deleteJson(`/admin/media/${encodeURIComponent(item.id)}/original`);
      else await postJson(`/admin/media/${encodeURIComponent(item.id)}/${action}`, {});
      const messages = { cancel: 'Procesamiento cancelado.', retry: 'Procesamiento reiniciado.', publish: 'Contenido publicado.', unpublish: 'Contenido despublicado.', hls: 'HLS eliminado; el original se conservo.', original: 'Archivo original eliminado.' };
      toast.success(messages[action]);
      setPending(null);
      await processing.refresh();
      media.reload();
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusyId(null); }
  }

  async function bulkMutate(action: 'retry' | 'unpublish') {
    const selectedItems = (media.data?.items ?? []).filter((item) => selectedIds.includes(item.id) && item.actions[action]);
    if (!selectedItems.length) {
      toast.error(action === 'retry' ? 'No hay elementos fallidos seleccionados.' : 'No hay contenido publicado seleccionado.');
      return;
    }
    setBusyId('__bulk__');
    try {
      for (const item of selectedItems) await postJson(`/admin/media/${encodeURIComponent(item.id)}/${action}`, {});
      toast.success(action === 'retry' ? `${selectedItems.length} procesamiento(s) reiniciado(s).` : `${selectedItems.length} contenido(s) despublicado(s).`);
      setSelectedIds([]);
      await processing.refresh();
      media.reload();
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusyId(null); }
  }

  const data = media.data;
  const confirmation = pending ? destructiveMediaCopy(pending.kind, pending.item) : null;
  return <Panel title="Biblioteca multimedia" description="Administra cargas, trabajos FFmpeg, HLS y archivos sin asignar desde una vista unificada." action={<Button type="button" className="button-secondary" onClick={() => { void processing.refresh(); media.reload(); }}><RefreshCw size={16} /> Actualizar</Button>}>
    <ResourceError message={media.error ?? processing.error} />
    {data && <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[['Activos', data.summary.active], ['Listos', data.summary.completed], ['Fallidos', data.summary.failed], ['Sin asignar', data.summary.unassigned], ['Publicados', data.summary.published], ['Borradores', data.summary.drafts]].map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-ink/70 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><strong className="mt-1 block text-xl text-white">{value}</strong></div>)}</div>}
    <div className="mb-5 grid gap-3 rounded-xl border border-line bg-ink/40 p-4 md:grid-cols-2 xl:grid-cols-6">
      <label className="relative xl:col-span-2"><span className="sr-only">Buscar multimedia</span><Search className="pointer-events-none absolute left-3 top-3 text-slate-500" size={17} /><Input className="pl-10" value={search} onChange={(event) => updateFilter(() => setSearch(event.target.value))} placeholder="Buscar por contenido o archivo" /></label>
      <Select aria-label="Tipo de contenido" value={contentType} onChange={(event) => updateFilter(() => setContentType(event.target.value))}><option value="ALL">Todos los tipos</option><option value="EPISODE">Episodios</option><option value="MOVIE">Peliculas</option><option value="UNASSIGNED">Sin asignar</option><option value="UPLOAD">Cargas</option></Select>
      <Select aria-label="Estado multimedia" value={status} onChange={(event) => updateFilter(() => setStatus(event.target.value))}><option value="ALL">Todos los estados</option><option value="UPLOADING">Subiendo</option><option value="QUEUED">En cola</option><option value="PROCESSING">Procesando</option><option value="COMPLETED">Completados</option><option value="FAILED">Fallidos</option><option value="CANCELLED">Cancelados</option><option value="UNASSIGNED">Sin asignar</option></Select>
      <Select aria-label="Publicacion" value={publication} onChange={(event) => updateFilter(() => setPublication(event.target.value))}><option value="ALL">Toda publicacion</option><option value="PUBLISHED">Publicado</option><option value="DRAFT">No publicado</option></Select>
      <Select aria-label="Ordenar multimedia" value={`${sort}:${order}`} onChange={(event) => { const [nextSort, nextOrder] = event.target.value.split(':'); setSort(nextSort); setOrder(nextOrder); }}><option value="createdAt:desc">Mas recientes</option><option value="createdAt:asc">Mas antiguos</option><option value="title:asc">Titulo A-Z</option><option value="size:desc">Mayor tamano</option><option value="progress:desc">Mayor progreso</option></Select>
    </div>
    {selectedIds.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/10 p-3"><strong className="text-sm text-white">{selectedIds.length} seleccionado(s)</strong><Button type="button" className="button-secondary" disabled={busyId === '__bulk__'} onClick={() => void bulkMutate('retry')}><RefreshCw size={14} /> Reintentar fallidos</Button><Button type="button" className="button-secondary" disabled={busyId === '__bulk__'} onClick={() => void bulkMutate('unpublish')}>Despublicar</Button><button type="button" className="text-sm text-slate-300 underline" onClick={() => setSelectedIds([])}>Limpiar seleccion</button></div>}
    {media.loading && !data ? <LoadingBlock label="Cargando biblioteca multimedia" /> : <div className="admin-table-shell" role="region" aria-label="Biblioteca multimedia" tabIndex={0}>
      <table className="min-w-[1360px]"><thead><tr><th><input type="checkbox" aria-label="Seleccionar todos los elementos visibles" checked={Boolean(data?.items.length) && data!.items.every((item) => selectedIds.includes(item.id))} onChange={(event) => setSelectedIds(event.target.checked ? (data?.items ?? []).map((item) => item.id) : [])} /></th><th>Contenido</th><th>Tipo</th><th>Archivo</th><th>Estado</th><th>Progreso</th><th>Resolucion</th><th>Tamano</th><th>Publicado</th><th>Fecha</th><th>Acciones</th></tr></thead>
        <tbody>{!data?.items.length ? <tr><td colSpan={11} className="p-10 text-center text-slate-400">No hay elementos que coincidan con los filtros.</td></tr> : data.items.map((item) => <tr key={item.id} aria-busy={busyId === item.id}>
          <td><input type="checkbox" aria-label={`Seleccionar ${item.title}`} checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} /></td>
          <td className="max-w-64"><p className="truncate font-semibold text-white" title={item.title}>{item.title}</p>{item.contentUrl && <Link to={item.contentUrl} className="mt-1 inline-flex items-center gap-1 text-xs text-brand">Abrir contenido <ExternalLink size={12} /></Link>}</td>
          <td>{({ EPISODE: 'Episodio', MOVIE: 'Pelicula', UNASSIGNED: 'Sin asignar', UPLOAD: 'Carga' })[item.contentType]}</td>
          <td className="max-w-64"><p className="truncate" title={item.originalName ?? ''}>{item.originalName ?? '-'}</p>{item.errorMessage && <details className="mt-1 text-xs text-coral"><summary>Ver error</summary><p className="max-w-sm whitespace-normal">{item.errorMessage}</p></details>}</td>
          <td><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${mediaStatusTone(item.status)}`}>{mediaStatusLabels[item.status]}</span><p className="mt-1 max-w-40 truncate text-xs text-slate-500" title={item.stage ?? ''}>{item.stage}</p></td>
          <td>{item.progress === null ? '-' : <div className="w-32"><div className="mb-1 flex justify-between text-xs"><span>{item.progress}%</span></div><div role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded bg-ink"><div className="h-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} /></div></div>}</td>
          <td><p>{item.resolution ?? '-'}</p><p className="text-xs text-slate-500">{item.qualities.map((quality) => `${quality}p`).join(', ')}</p></td>
          <td><p>{formatBytes(item.totalSize)}</p><p className="text-xs text-slate-500">HLS {formatBytes(item.hlsSize)}</p></td>
          <td><span className={item.published ? 'text-mint' : 'text-slate-400'}>{item.published ? 'Publicado' : 'Borrador'}</span></td>
          <td className="whitespace-nowrap text-slate-400">{new Date(item.createdAt).toLocaleDateString('es-PE')}</td>
          <td><div className="flex min-w-64 flex-wrap gap-2">{item.contentType === 'UNASSIGNED' && item.entity === 'JOB' && <Link to="/admin/processing" className="button-secondary min-h-9 px-3 py-1">Asignar</Link>}{item.hlsUrl && <a href={item.hlsUrl} target="_blank" rel="noreferrer" className="button-secondary min-h-9 px-3 py-1">Ver HLS</a>}{item.actions.publish && <button type="button" className="button-secondary min-h-9 border-mint/40 px-3 py-1 text-mint" disabled={busyId === item.id} onClick={() => void mutate(item, 'publish')}>Publicar</button>}{item.actions.unpublish && <button type="button" className="button-secondary min-h-9 px-3 py-1" disabled={busyId === item.id} onClick={() => void mutate(item, 'unpublish')}>Despublicar</button>}{item.actions.retry && <button type="button" className="button-secondary min-h-9 px-3 py-1" disabled={busyId === item.id} onClick={() => void mutate(item, 'retry')}><RefreshCw size={14} /> Reintentar</button>}{item.actions.cancel && <button type="button" className="button-secondary min-h-9 border-coral/40 px-3 py-1 text-coral" onClick={() => setPending({ kind: 'CANCEL', item })}>Cancelar</button>}{item.actions.deleteHls && <button type="button" className="button-secondary min-h-9 border-coral/40 px-3 py-1 text-coral" onClick={() => setPending({ kind: 'HLS', item })}><Trash2 size={14} /> HLS</button>}{item.actions.deleteOriginal && <button type="button" className="button-secondary min-h-9 border-coral/40 px-3 py-1 text-coral" onClick={() => setPending({ kind: 'ORIGINAL', item })}>Original</button>}</div></td>
        </tr>)}</tbody></table>
    </div>}
    {data && data.total > data.limit && <div className="mt-4 flex items-center justify-between text-sm"><span className="text-slate-400">{data.total} elementos</span><div className="flex gap-2"><button type="button" className="button-secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><span className="grid min-h-10 place-items-center px-3">Pagina {page}</span><button type="button" className="button-secondary" disabled={page * data.limit >= data.total} onClick={() => setPage((value) => value + 1)}>Siguiente</button></div></div>}
    <ConfirmDialog open={Boolean(pending && confirmation)} title={confirmation?.title ?? ''} itemName={pending?.item.title} description={confirmation?.description ?? ''} confirmLabel={confirmation?.confirmLabel} busy={Boolean(pending && busyId === pending.item.id)} onCancel={() => setPending(null)} onConfirm={() => { if (!pending) return; void mutate(pending.item, pending.kind === 'CANCEL' ? 'cancel' : pending.kind === 'HLS' ? 'hls' : 'original'); }} />
  </Panel>;
}
