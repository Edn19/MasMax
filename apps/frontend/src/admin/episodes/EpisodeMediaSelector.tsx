import { FormEvent, memo, useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Button, ResourceError } from '../components/AdminUi';
import { FormField, FormLabel, TextInput } from '../components/AdminForms';
import { formatBytes } from '../components/admin-utils';
import { getMediaVersions, mediaCompatibilityMessage } from '../media/media-versions';

export type SelectableEpisodeMedia = {
  id: string;
  originalName: string;
  sizeBytes: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  mimeType: string;
  extension: string;
  status: 'ORIGINAL' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  progress: number | null;
  processingJobId: string | null;
  processingError: string | null;
  originalUrl: string | null;
  hlsUrl: string | null;
  remuxUrl: string | null;
  remuxJobId: string | null;
  remuxStatus: 'NONE' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  remuxProgress: number | null;
  remuxError: string | null;
  playbackUrl: string | null;
  directPlaybackCompatible: boolean;
  compatibilityMessage: string;
  fastStart: boolean | null;
  thumbnailUrl: string | null;
  createdAt: string;
};

export const EpisodeMediaSelector = memo(function EpisodeMediaSelector({ selectedId, revision, onSelect }: { selectedId: string; revision: number; onSelect: (media: SelectableEpisodeMedia) => void }) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const media = useAsync<SelectableEpisodeMedia[]>(() => api(`/admin/media/selectable${search ? `?search=${encodeURIComponent(search)}` : ''}`), [search, revision]);
  function submit(event: FormEvent) { event.preventDefault(); setSearch(input.trim()); }
  return <div className="grid gap-3">
    <form className="flex items-end gap-2" onSubmit={submit}><FormField fullWidth><FormLabel htmlFor="episode-media-search">Buscar video</FormLabel><TextInput id="episode-media-search" value={input} placeholder="Nombre del archivo" onChange={(event) => setInput(event.currentTarget.value)} /></FormField><Button type="submit">Buscar</Button></form>
    <ResourceError message={media.error} />
    <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
      {(media.data ?? []).map((item) => { const versions = getMediaVersions({ ...item, hlsStatus: item.status }); return <button key={item.id} type="button" className={`rounded-xl border p-3 text-left transition ${selectedId === item.id ? 'border-brand bg-brand/10' : 'border-line bg-ink/30 hover:border-slate-500'}`} onClick={() => onSelect(item)}>
        <span className="block truncate font-medium text-slate-100">{item.originalName}</span>
        <span className="mt-1 block text-xs text-slate-400">{formatBytes(item.sizeBytes)} · {item.width && item.height ? `${item.width}x${item.height}` : 'Resolucion no disponible'} · {duration(item.durationSec)} · {item.videoCodec ?? 'codec pendiente'}</span>
        <span className="mt-1 block text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString('es')}</span>
        <span className="mt-1 block text-xs text-slate-300">Versiones: {Object.values(versions).map((version) => `${version.title} ${version.format} · ${version.label}`).join(' | ')}</span>
        <span className={`mt-1 block text-xs ${item.directPlaybackCompatible || versions.REMUX.available ? 'text-mint' : 'text-warning'}`}>{mediaCompatibilityMessage({ ...item, hlsStatus: item.status })}</span>
      </button>; })}
      {!media.loading && !(media.data ?? []).length && <p className="rounded-xl border border-line p-4 text-sm text-slate-400">No hay videos que coincidan con la busqueda.</p>}
    </div>
  </div>;
});

function duration(seconds: number | null) { if (!seconds || !Number.isFinite(seconds)) return 'Duracion no disponible'; const value = Math.round(seconds); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; }
