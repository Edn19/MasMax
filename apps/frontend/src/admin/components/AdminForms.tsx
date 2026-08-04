import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type FormFieldProps = {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
};

export function FormField({ children, className = '', fullWidth = false }: FormFieldProps) {
  return <div className={`min-w-0 ${fullWidth ? 'md:col-span-2' : ''} ${className}`}>{children}</div>;
}

export function FormLabel({ children, required, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return <label {...props} className={`mb-1.5 block text-sm font-medium text-slate-200 ${props.className ?? ''}`}>{children}{required && <span className="ml-1 text-coral" aria-hidden="true">*</span>}</label>;
}

export function FormHint({ id, children }: { id?: string; children: ReactNode }) {
  return <p id={id} className="mt-1.5 text-xs leading-5 text-slate-400">{children}</p>;
}

export function FormError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return <p id={id} role="alert" className="mt-1.5 text-xs font-medium text-coral">{children}</p>;
}

const controlClass = 'form-control h-10 w-full px-3 py-2 text-sm';

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${className}`} />;
}

export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <TextInput {...props} type="number" inputMode="numeric" />;
}

export function DateInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <TextInput {...props} type="date" />;
}

export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`form-control min-h-24 w-full resize-y px-3 py-2.5 text-sm ${className}`} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${className}`} />;
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  hint?: string;
};

export function Checkbox({ label, hint, className = '', ...props }: CheckboxProps) {
  return (
    <label className={`flex min-h-10 items-start gap-3 rounded-xl border border-line bg-ink/30 px-3 py-2.5 text-sm text-slate-200 ${props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-slate-600'} ${className}`}>
      <input {...props} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand focus-visible:ring-2 focus-visible:ring-brand" />
      <span><span className="block font-medium">{label}</span>{hint && <span className="mt-0.5 block text-xs leading-5 text-slate-400">{hint}</span>}</span>
    </label>
  );
}

export function FormSection({ title, description, children, className = '' }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`rounded-2xl border border-line bg-ink/25 p-4 sm:p-5 ${className}`}>
      <legend className="px-1 text-base font-semibold text-white">{title}</legend>
      {description && <p className="mb-4 mt-1 text-sm leading-6 text-slate-400">{description}</p>}
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">{children}</div>;
}

export function fieldA11y(id: string, hint?: string, error?: string) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return { 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) } as const;
}
