import { useState } from 'react';
import { toast } from 'sonner';
import { LoadingBlock } from '../../components/Layout';
import { api, postJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, Panel, ResourceError } from '../components/AdminUi';
import { formatBytes } from '../components/admin-utils';

type StorageStats = { totalBytes: string; totalFiles: number; videos: number; images: number; originals: number; originalBytes: string; hls: number; hlsBytes: string; temporaries: number; temporaryBytes: string; processing: number; failed: number; orphaned: number; orphanedBytes: string; freeBytes: string | null; driver: 'local' | 's3' };
export function StorageAdminPage() {
  const stats = useAsync<StorageStats>(() => api('/admin/storage'), []);
  const [confirmOpen, setConfirmOpen] = useState(false);
  async function cleanup() { try { const result = await postJson<{ removed: number }>('/admin/storage/cleanup', {}); toast.success(`${result.removed} archivos eliminados`); stats.setData(await api<StorageStats>('/admin/storage')); setConfirmOpen(false); } catch (error) { toast.error((error as Error).message); } }
  const data = stats.data;
  return <Panel title="Almacenamiento" description="Consulta originales, salidas HLS, temporales y archivos que requieren mantenimiento."><ResourceError message={stats.error} />{stats.loading ? <LoadingBlock /> : data ? <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Originales', formatBytes(data.originalBytes)], ['HLS', formatBytes(data.hlsBytes)], ['Temporales estimados', formatBytes(data.temporaryBytes)], ['Uso registrado', formatBytes(data.totalBytes)], ['Espacio disponible', formatBytes(data.freeBytes)], ['Archivos sin asignar', data.orphaned], ['En proceso', data.processing], ['Fallidos', data.failed]].map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-ink p-4"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p></div>)}</div><div className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-3"><p>{data.originals} originales</p><p>{data.hls} salidas HLS</p><p>{data.temporaries} cargas temporales</p></div><p className="mt-3 text-sm text-slate-400">Controlador activo: <strong className="text-white">{data.driver === 's3' ? 'S3 compatible' : 'Disco local'}</strong></p><Button type="button" onClick={() => setConfirmOpen(true)} className="mt-6 border border-coral bg-transparent text-coral hover:bg-coral hover:text-ink">Limpiar huerfanos seguros</Button><ConfirmDialog open={confirmOpen} title="Limpiar archivos huerfanos" description="Se eliminaran solamente archivos sin referencias que superen el periodo de retencion configurado. No se eliminan HLS asociados ni originales conservados." confirmLabel="Eliminar archivos" onCancel={() => setConfirmOpen(false)} onConfirm={() => void cleanup()} /></> : null}</Panel>;
}
