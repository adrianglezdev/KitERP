import { forwardRef, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Field({ label, error, help, children, className, htmlFor, required }: { label?: ReactNode; error?: string; help?: ReactNode; children: ReactNode; className?: string; htmlFor?: string; required?: boolean }) {
  // si no se indica a qué control pertenece la etiqueta, se enlaza con el primero que haya dentro
  // (así la etiqueta se lee en los lectores de pantalla y al pulsarla se enfoca el campo)
  const auto = useId();
  const labelId = `${auto}-label`;
  const box = useRef<HTMLDivElement>(null);
  const [forId, setForId] = useState(htmlFor);
  useLayoutEffect(() => {
    if (htmlFor || !label) return;
    const el = box.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button[aria-haspopup]');
    if (!el) return;
    if (!el.id) el.id = auto;
    if (el.tagName === 'BUTTON') {
      // selector desplegable: se lee la etiqueta y el valor elegido ("Artículo, AC-SPLIT-35…")
      if (!el.getAttribute('aria-labelledby')) el.setAttribute('aria-labelledby', `${labelId} ${el.id}`);
      return;
    }
    setForId(el.id);
  });
  return (
    <div ref={box} className={cn('min-w-0', className)}>
      {label && (
        <label className="label" id={labelId} htmlFor={forId}>
          {label}
          {required && <span className="text-bad"> *</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-[12px] text-bad">{error}</p> : help ? <p className="mt-1 text-[12px] text-muted">{help}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; suffix?: ReactNode; prefix?: ReactNode }>(function Input({ className, invalid, suffix, prefix, ...rest }, ref) {
  if (suffix || prefix)
    return (
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">{prefix}</span>}
        <input ref={ref} className={cn('field-input', prefix && 'pl-8', suffix && 'pr-10', invalid && 'border-bad focus:border-bad focus:ring-bad/20', className)} {...rest} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-muted">{suffix}</span>}
      </div>
    );
  return <input ref={ref} className={cn('field-input', invalid && 'border-bad focus:border-bad focus:ring-bad/20', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn('field-input resize-y', invalid && 'border-bad', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { options?: readonly { value: string | number; label: string }[]; placeholder?: string; invalid?: boolean }>(function Select(
  { className, options, placeholder, children, invalid, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn('field-input appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9', invalid && 'border-bad', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23707A8E' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options?.map((o) => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  );
});

export function Checkbox({ checked, onChange, label, disabled, id, description }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; id?: string; description?: ReactNode }) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className={cn('flex cursor-pointer items-start gap-2.5', disabled && 'cursor-not-allowed opacity-60')}>
      <input id={cid} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-[rgb(var(--primary))]" />
      {label && (
        <span className="text-[14px]">
          {label}
          {description && <span className="block text-[12.5px] text-muted">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; description?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-center justify-between gap-3', disabled && 'cursor-not-allowed opacity-60')}>
      {label && (
        <span className="min-w-0 text-[14px]">
          {label}
          {description && <span className="block text-[12.5px] text-muted">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition', checked ? 'bg-primary' : 'bg-line-strong')}
      >
        <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field-input !rounded-pill pl-10 pr-9 [&::-webkit-search-cancel-button]:hidden"
        aria-label={placeholder}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-pill p-1 text-muted hover:text-fg" aria-label="Borrar búsqueda">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Segmentos tipo pestaña compacta (filtros rápidos). */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={cn('scroll-thin inline-flex max-w-full gap-0.5 overflow-x-auto rounded-pill bg-sunken p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 text-[13px] font-semibold transition', value === o.value ? 'bg-fg text-bg' : 'text-fg/65 hover:text-fg')}
        >
          {o.label}
          {o.count !== undefined && <span className={cn('rounded-full px-1.5 text-[11px] font-bold', value === o.value ? 'bg-bg/20' : 'bg-line-strong/60')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
