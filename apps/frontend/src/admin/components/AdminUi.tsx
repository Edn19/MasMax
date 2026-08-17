import { ChevronDown, Plus } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from './ConfirmDialog';
import { fieldLabel, statusLabel } from './admin-utils';

const controlClass = 'form-control';

export function Panel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="surface-card p-4 sm:p-6">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div><h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} aria-label={props['aria-label'] ?? props.placeholder} className={`${controlClass} ${className}`} />;
}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} aria-label={props['aria-label'] ?? props.placeholder} className={`min-h-24 ${controlClass} ${className}`} />;
}

export function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${className}`} />;
}

export function Button({ className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`button-primary ${className}`} />;
}

export function FormDisclosure({ open, title, description, editing, heading, onToggle, children }: { open: boolean; title: string; description: string; editing?: boolean; heading?: string; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-panel/45">
      <button type="button" className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/[0.025] sm:px-5" aria-expanded={open} onClick={onToggle}>
        <span><span className="flex items-center gap-2 font-semibold text-white"><Plus size={17} className="text-brand" />{heading ?? (editing ? `Editar ${title.toLocaleLowerCase('es')}` : `Crear ${title.toLocaleLowerCase('es')}`)}</span><span className="mt-1 block text-xs text-slate-400">{description}</span></span>
        <ChevronDown size={19} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-line p-4 sm:p-5">{children}</div>}
    </section>
  );
}

export function ResourceError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div role="alert" className="mb-4 rounded-lg border border-coral/50 bg-coral/10 p-3 text-sm text-coral">{message}</div>;
}

export type AdminColumn<T> = string | { key: string; label: string; render: (row: T) => ReactNode; className?: string };

type AdminTableProps<T extends { id?: string }> = {
  rows: T[];
  columns: AdminColumn<T>[];
  onEdit?: (row: T) => void;
  onDelete?: (id: string) => Promise<void> | void;
  onApprove?: (id: string) => Promise<void> | void;
  extraAction?: (row: T) => ReactNode;
  emptyMessage?: string;
  emptyDescription?: string;
  rowLabel?: (row: T) => string;
  deleteTitle?: string;
  deleteDescription?: string;
};

export function AdminTable<T extends { id?: string }>({ rows, columns, onEdit, onDelete, onApprove, extraAction, emptyMessage = 'No hay registros para mostrar.', emptyDescription = 'Los registros que agregues apareceran en esta tabla.', rowLabel, deleteTitle = 'Eliminar registro', deleteDescription = 'El elemento dejara de estar disponible. Esta accion no se puede deshacer.' }: AdminTableProps<T>) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);

  async function run(id: string, action: (id: string) => Promise<void> | void) {
    setBusyId(id);
    try { await action(id); }
    catch (error) { toast.error((error as Error).message); }
    finally { setBusyId(null); }
  }

  async function remove() {
    const id = pendingDelete?.id;
    if (!onDelete || !id) return;
    await run(id, onDelete);
    setPendingDelete(null);
  }

  return (
    <div className="admin-table-shell" role="region" aria-label="Tabla de registros" tabIndex={0}>
      <table>
        <thead><tr>{columns.map((column) => <th key={typeof column === 'string' ? column : column.key} scope="col" className="p-3">{typeof column === 'string' ? fieldLabel(column) : column.label}</th>)}<th scope="col" className="p-3">Acciones</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={columns.length + 1} className="p-10 text-center"><p className="font-medium text-slate-200">{emptyMessage}</p><p className="mt-1 text-sm text-slate-400">{emptyDescription}</p></td></tr> : rows.map((row, index) => {
            const id = row.id;
            const disabled = Boolean(id && busyId === id);
            return <tr key={id ?? index} aria-busy={disabled}>
              {columns.map((column) => { const key = typeof column === 'string' ? column : column.key; const value = typeof column === 'string' ? (row as Record<string, unknown>)[column] : null; return <td key={key} className={`max-w-xs truncate text-slate-200 ${typeof column === 'string' ? '' : column.className ?? ''}`}>{typeof column === 'string' ? statusLabel(value) : column.render(row)}</td>; })}
              <td className="flex min-w-52 flex-wrap gap-2 p-3">
                {extraAction?.(row)}
                {onEdit && <button type="button" disabled={disabled} className="inline-flex min-h-9 items-center rounded-lg border border-brand/70 px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/10 focus-visible:ring-2 focus-visible:ring-brand" onClick={() => onEdit(row)}>Editar</button>}
                {onApprove && <button type="button" disabled={disabled} className="inline-flex min-h-9 items-center rounded-lg border border-mint px-3 py-1.5 text-sm font-medium text-mint focus-visible:ring-2 focus-visible:ring-mint" onClick={() => id && void run(id, onApprove)}>Aprobar</button>}
                {onDelete && <button type="button" disabled={disabled} className="inline-flex min-h-9 items-center rounded-lg border border-coral/70 px-3 py-1.5 text-sm font-medium text-coral hover:bg-coral/10 focus-visible:ring-2 focus-visible:ring-coral" onClick={() => id && setPendingDelete(row)}>{disabled ? 'Procesando...' : 'Eliminar'}</button>}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
      <ConfirmDialog open={Boolean(pendingDelete)} title={deleteTitle} itemName={pendingDelete ? rowLabel?.(pendingDelete) : undefined} description={deleteDescription} busy={Boolean(pendingDelete?.id && busyId === pendingDelete.id)} onCancel={() => setPendingDelete(null)} onConfirm={() => void remove()} />
    </div>
  );
}
