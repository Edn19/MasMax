import { Check, ChevronDown, Search, X } from 'lucide-react';
import { KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

export type MultiSelectOption = { value: string; label: string };

type MultiSelectProps = {
  id?: string;
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
};

export function MultiSelect({ id: suppliedId, label, options, value, onChange, hint, error, disabled, placeholder = 'Buscar genero...' }: MultiSelectProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = options.filter((option) => option.label.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')));
  const selected = value.map((selectedValue) => options.find((option) => option.value === selectedValue)).filter((option): option is MultiSelectOption => Boolean(option));

  useEffect(() => {
    function outside(event: MouseEvent) { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  function toggle(option: MultiSelectOption) {
    onChange(value.includes(option.value) ? value.filter((item) => item !== option.value) : [...value, option.value]);
  }

  function keydown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, Math.max(0, filtered.length - 1))); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
    if (event.key === 'Enter' && open && filtered[activeIndex]) { event.preventDefault(); toggle(filtered[activeIndex]); }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-200">{label}</label>
      <div className={`rounded-xl border bg-ink/40 p-2 transition focus-within:ring-2 ${error ? 'border-coral focus-within:ring-coral/30' : 'border-line focus-within:border-brand focus-within:ring-brand/20'} ${disabled ? 'opacity-60' : ''}`}>
        {selected.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{selected.map((option) => <span key={option.value} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-brand/10 pl-2.5 pr-1 text-xs font-medium text-brand">{option.label}<button type="button" disabled={disabled} aria-label={`Quitar ${option.label}`} className="grid h-7 w-7 place-items-center rounded-md hover:bg-brand/10" onClick={() => toggle(option)}><X size={14} /></button></span>)}</div>}
        <div className="flex items-center gap-2"><Search size={16} className="shrink-0 text-slate-500" /><input ref={inputRef} id={id} value={query} disabled={disabled} placeholder={placeholder} role="combobox" aria-expanded={open} aria-controls={`${id}-listbox`} aria-autocomplete="list" aria-invalid={Boolean(error)} aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} className="min-h-8 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }} onKeyDown={keydown} /><button type="button" disabled={disabled} aria-label={open ? 'Cerrar opciones' : 'Abrir opciones'} onClick={() => { setOpen((current) => !current); inputRef.current?.focus(); }}><ChevronDown size={17} className={`transition ${open ? 'rotate-180' : ''}`} /></button></div>
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-400">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-coral">{error}</p>}
      {open && !disabled && <div id={`${id}-listbox`} role="listbox" aria-multiselectable="true" className="absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-2xl">{filtered.length === 0 ? <p className="px-3 py-5 text-center text-sm text-slate-400">No se encontraron generos.</p> : filtered.map((option, index) => { const checked = value.includes(option.value); return <button key={option.value} type="button" role="option" aria-selected={checked} className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm ${index === activeIndex ? 'bg-white/5 text-white' : 'text-slate-300'} hover:bg-white/5`} onMouseEnter={() => setActiveIndex(index)} onClick={() => toggle(option)}><span>{option.label}</span>{checked && <Check size={16} className="text-brand" />}</button>; })}</div>}
    </div>
  );
}
