import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  itemName?: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ open, title, itemName, description, confirmLabel = 'Eliminar', busy = false, onCancel, onConfirm }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [busy, onCancel, open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-coral/10 text-coral"><AlertTriangle size={22} /></span>
          <div className="min-w-0 flex-1"><h2 id="confirm-title" className="text-lg font-semibold text-white">{title}</h2>{itemName && <p className="mt-1 break-words text-sm font-medium text-slate-200">{itemName}</p>}</div>
          <button type="button" className="icon-button" aria-label="Cerrar dialogo" disabled={busy} onClick={onCancel}><X size={18} /></button>
        </div>
        <p id="confirm-description" className="mt-4 text-sm leading-6 text-slate-400">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" className="button-secondary" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-coral disabled:opacity-60" disabled={busy} onClick={onConfirm}>{busy ? 'Procesando...' : confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
