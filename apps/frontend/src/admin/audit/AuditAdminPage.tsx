import { Download, Filter, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LoadingBlock } from '../../components/Layout';
import { api, apiBlob, postJson } from '../../lib/api';
import { Button, Panel, ResourceError } from '../components/AdminUi';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DateInput, FormField, FormLabel, Select } from '../components/AdminForms';

type JsonValue = unknown;
type AuditEntry = {
  id: string; action: string; entity: string; entityId?: string; ipAddress?: string; userAgent?: string;
  requestId?: string; changes?: JsonValue; before?: JsonValue; after?: JsonValue; metadata?: JsonValue;
  createdAt: string; actor?: { id: string; name: string; email: string };
};
type AuditPage = { items: AuditEntry[]; total: number; page: number; limit: number; pages: number };
type Facets = { actions: string[]; entities: string[]; actors: Array<{ id: string; name: string; email: string }> };
type Filters = { actorId: string; action: string; entity: string; from: string; to: string };
const emptyFilters: Filters = { actorId: '', action: '', entity: '', from: '', to: '' };

export function AuditAdminPage() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [facets, setFacets] = useState<Facets>({ actions: [], entities: [], actors: [] });
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const query = useMemo(() => buildQuery(applied, page), [applied, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<AuditPage>(`/admin/audit?${query}`);
      setData(result);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void Promise.all([api<Facets>('/admin/audit/facets'), api<{ days: number }>('/admin/audit/retention')])
      .then(([available, policy]) => { setFacets(available); setRetentionDays(policy.days); })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  function applyFilters() { setPage(1); setApplied(filters); }
  function clearFilters() { setFilters(emptyFilters); setApplied(emptyFilters); setPage(1); }

  async function downloadCsv() {
    try {
      const blob = await apiBlob(`/admin/audit/export.csv?${buildQuery(applied)}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) { toast.error((cause as Error).message); }
  }

  async function cleanup() {
    try {
      const result = await postJson<{ removed: number }>('/admin/audit/retention/cleanup', {});
      toast.success(`${result.removed} registros vencidos eliminados`);
      await load();
      setConfirmCleanup(false);
    } catch (cause) { toast.error((cause as Error).message); }
  }

  return (
    <Panel title="Auditoria">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-ink/70 p-4">
        <div className="flex items-center gap-3"><ShieldCheck className="text-mint" /><div><p className="font-bold text-white">Trazabilidad administrativa</p><p className="text-xs text-slate-400">Retencion automatica: {retentionDays ?? '...'} dias. Los secretos se ocultan antes de persistir.</p></div></div>
        <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void downloadCsv()} className="flex items-center gap-2"><Download size={16} /> Exportar CSV</Button><Button type="button" onClick={() => setConfirmCleanup(true)} className="flex items-center gap-2 border border-coral bg-transparent text-coral hover:bg-coral hover:text-ink"><Trash2 size={16} /> Aplicar retencion</Button></div>
      </div>

      <div className="mb-5 grid items-end gap-3 rounded-xl border border-line p-4 md:grid-cols-2 xl:grid-cols-6">
        <FormField><FormLabel htmlFor="audit-user">Usuario</FormLabel><Select id="audit-user" value={filters.actorId} onChange={(event) => setFilters({ ...filters, actorId: event.target.value })}><option value="">Todos los usuarios</option>{facets.actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name} ({actor.email})</option>)}</Select></FormField>
        <FormField><FormLabel htmlFor="audit-action">Accion</FormLabel><Select id="audit-action" value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}><option value="">Todas las acciones</option>{facets.actions.map((action) => <option key={action}>{action}</option>)}</Select></FormField>
        <FormField><FormLabel htmlFor="audit-entity">Entidad</FormLabel><Select id="audit-entity" value={filters.entity} onChange={(event) => setFilters({ ...filters, entity: event.target.value })}><option value="">Todas las entidades</option>{facets.entities.map((entity) => <option key={entity}>{entity}</option>)}</Select></FormField>
        <FormField><FormLabel htmlFor="audit-from">Desde</FormLabel><DateInput id="audit-from" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></FormField>
        <FormField><FormLabel htmlFor="audit-to">Hasta</FormLabel><DateInput id="audit-to" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></FormField>
        <div className="flex gap-2"><Button type="button" onClick={applyFilters} className="flex flex-1 items-center justify-center gap-2"><Filter size={16} /> Filtrar</Button><button type="button" onClick={clearFilters} className="rounded-lg border border-line px-3 text-sm text-slate-300 hover:text-white">Limpiar</button></div>
      </div>

      <ResourceError message={error} />
      {loading ? <LoadingBlock /> : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-ink text-slate-400"><tr><th className="p-3">Fecha</th><th>Usuario</th><th>Accion</th><th>Entidad</th><th>IP</th><th>User agent</th><th>Detalle</th></tr></thead>
              <tbody>{(data?.items ?? []).length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-slate-400">No hay eventos para estos filtros.</td></tr> : data?.items.map((entry) => <AuditRow key={entry.id} entry={entry} />)}</tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400"><span>{data?.total ?? 0} eventos · Pagina {data?.page ?? 1} de {data?.pages ?? 1}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded border border-line px-3 py-2 disabled:opacity-40">Anterior</button><button type="button" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage((current) => current + 1)} className="rounded border border-line px-3 py-2 disabled:opacity-40">Siguiente</button></div></div>
        </>
      )}
      <ConfirmDialog open={confirmCleanup} title="Aplicar politica de retencion" description={`Se eliminaran registros de auditoria con mas de ${retentionDays ?? 365} dias.`} confirmLabel="Eliminar registros" onCancel={() => setConfirmCleanup(false)} onConfirm={() => void cleanup()} />
    </Panel>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  return <tr className="border-t border-line align-top"><td className="whitespace-nowrap p-3">{new Date(entry.createdAt).toLocaleString()}</td><td><p className="font-semibold text-white">{entry.actor?.name ?? 'Sistema'}</p><p className="max-w-48 truncate text-xs text-slate-500">{entry.actor?.email ?? '-'}</p></td><td className="pr-3 font-mono text-xs text-brand">{entry.action}</td><td>{entry.entity}<p className="max-w-40 truncate text-xs text-slate-500">{entry.entityId ?? '-'}</p></td><td className="text-xs">{entry.ipAddress ?? '-'}</td><td className="max-w-52 truncate pr-3 text-xs text-slate-400" title={entry.userAgent}>{entry.userAgent ?? '-'}</td><td className="pr-3"><details><summary className="cursor-pointer text-brand">Ver cambios</summary><div className="mt-2 grid min-w-[420px] gap-2 lg:grid-cols-2"><JsonBlock title="Anterior" value={entry.before} /><JsonBlock title="Nuevo" value={entry.after ?? entry.changes} /></div>{entry.requestId && <p className="mt-2 text-xs text-slate-500">Request ID: {entry.requestId}</p>}</details></td></tr>;
}

function JsonBlock({ title, value }: { title: string; value: JsonValue }) {
  return <div><p className="mb-1 text-xs font-bold uppercase text-slate-500">{title}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-xs text-slate-300">{value === undefined || value === null ? 'Sin datos' : JSON.stringify(value, null, 2)}</pre></div>;
}

function buildQuery(filters: Filters, page = 1) {
  const query = new URLSearchParams({ page: String(page), limit: '50' });
  if (filters.actorId) query.set('actorId', filters.actorId);
  if (filters.action) query.set('action', filters.action);
  if (filters.entity) query.set('entity', filters.entity);
  if (filters.from) query.set('from', `${filters.from}T00:00:00.000Z`);
  if (filters.to) query.set('to', `${filters.to}T23:59:59.999Z`);
  return query.toString();
}
