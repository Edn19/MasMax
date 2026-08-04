import { useState } from 'react';
import { toast } from 'sonner';
import { LoadingBlock } from '../../components/Layout';
import { api, postJson } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, Panel, ResourceError } from '../components/AdminUi';
import { formatBytes } from '../components/admin-utils';

type StorageStats = { totalBytes: string; totalFiles: number; videos: number; images: number; processing: number; failed: number; orphaned: number; orphanedBytes: string; freeBytes: string | null; driver: 'local' | 's3' };
export function StorageAdminPage() {
  const stats = useAsync<StorageStats>(() => api('/admin/storage'), []);
  const [confirmOpen, setConfirmOpen] = useState(false);
  async function cleanup() { try { const result = await postJson<{ removed: number }>('/admin/storage/cleanup', {}); toast.success(`${result.removed} archivos eliminados`); stats.setData(await api<StorageStats>('/admin/storage')); setConfirmOpen(false); } catch (error) { toast.error((error as Error).message); } }
  const data = stats.data;
  return <Panel title="Almacenamiento" description="Consulta uso, capacidad y archivos que requieren mantenimiento."><ResourceError message={stats.error} />{stats.loading ? <LoadingBlock /> : data ? <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Uso total', formatBytes(data.totalBytes)], ['Espacio disponible', formatBytes(data.freeBytes)], ['Archivos', data.totalFiles], ['Huerfanos', data.orphaned], ['Videos', data.videos], ['Imagenes', data.images], ['En proceso', data.processing], ['Fallidos', data.failed]].map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-ink p-4"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p></div>)}</div><p className="mt-4 text-sm text-slate-400">Controlador activo: <strong className="text-white">{data.driver === 's3' ? 'S3 compatible' : 'Disco local'}</strong></p><Button type="button" onClick={() => setConfirmOpen(true)} className="mt-6 border border-coral bg-transparent text-coral hover:bg-coral hover:text-ink">Limpiar huerfanos seguros</Button><ConfirmDialog open={confirmOpen} title="Limpiar archivos huerfanos" description="Se eliminaran solamente archivos huerfanos que superen el periodo de retencion configurado." confirmLabel="Eliminar archivos" onCancel={() => setConfirmOpen(false)} onConfirm={() => void cleanup()} /></> : null}</Panel>;
}
