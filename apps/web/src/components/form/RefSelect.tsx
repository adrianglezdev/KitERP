import { useEffect, useState } from 'react';
import * as P from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';

export interface RefOption {
  id: string;
  label: string;
  sub?: string | null;
}

function filterParams(filter?: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter ?? {})) out[`f.${k}`] = v;
  return out;
}

/** Etiqueta de un id (cuando el listado no la trae ya resuelta). */
export function useRefLabel(target: string, id: string | null | undefined, known?: string) {
  const q = useQuery({
    queryKey: [`/refs/${target}?ids=${id}`],
    queryFn: () => api.get<RefOption[]>(`/refs/${target}?ids=${id}`),
    enabled: !!id && !known,
    staleTime: 300_000,
  });
  return known ?? q.data?.[0]?.label ?? null;
}

/**
 * Selector con búsqueda contra /api/refs/:target. Respeta los permisos del usuario:
 * solo aparecen los registros que puede ver.
 */
export function RefSelect({
  target,
  value,
  onChange,
  placeholder = 'Buscar…',
  filter,
  label: knownLabel,
  disabled,
  invalid,
  clearable = true,
  id,
  className,
}: {
  target: string;
  value: string | null | undefined;
  onChange: (id: string | null, opt?: RefOption) => void;
  placeholder?: string;
  filter?: Record<string, unknown>;
  label?: string;
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const [picked, setPicked] = useState<RefOption | null>(null);
  useEffect(() => {
    if (!value) setPicked(null);
  }, [value]);
  const label = useRefLabel(target, value, picked && picked.id === value ? picked.label : knownLabel);
  const list = useQuery({
    queryKey: [`/refs/${target}${qs({ q: dq, ...filterParams(filter) })}`],
    queryFn: () => api.get<RefOption[]>(`/refs/${target}${qs({ q: dq, ...filterParams(filter) })}`),
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          className={cn('field-input flex items-center gap-2 text-left', !value && 'text-muted/80', invalid && 'border-bad', className)}
          aria-haspopup="listbox"
        >
          <span className="min-w-0 flex-1 truncate">{value ? (label ?? '…') : placeholder}</span>
          {value && clearable && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Quitar"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 text-muted hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" />
          )}
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content align="start" sideOffset={4} className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-[260px] rounded-xl border border-line bg-surface p-1 shadow-pop">
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b border-line px-2">
              <Command.Input autoFocus value={q} onValueChange={setQ} placeholder={placeholder} className="h-10 w-full bg-transparent text-[14px] outline-none placeholder:text-muted" />
              {list.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
            </div>
            <Command.List className="scroll-thin max-h-72 overflow-y-auto py-1">
              {!list.isFetching && <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted">Sin resultados</Command.Empty>}
              {list.data?.map((o) => (
                <Command.Item
                  key={o.id}
                  value={o.id}
                  onSelect={() => {
                    setPicked(o);
                    onChange(o.id, o);
                    setOpen(false);
                    setQ('');
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] data-[selected=true]:bg-sunken"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.label}</div>
                    {o.sub && <div className="truncate text-[12px] text-muted">{o.sub}</div>}
                  </div>
                  {o.id === value && <Check className="h-4 w-4 text-primary" />}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

/** Selección múltiple de referencias (se muestran como fichas). */
export function RefMultiSelect({ target, value, onChange, placeholder, filter }: { target: string; value: string[]; onChange: (ids: string[]) => void; placeholder?: string; filter?: Record<string, unknown> }) {
  const labels = useQuery({
    queryKey: [`/refs/${target}?ids=${value.join(',')}`],
    queryFn: () => api.get<RefOption[]>(`/refs/${target}?ids=${value.join(',')}`),
    enabled: value.length > 0,
    staleTime: 300_000,
  });
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[12.5px] text-primary">
              {labels.data?.find((l) => l.id === id)?.label ?? '…'}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} aria-label="Quitar" className="hover:text-fg">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <RefSelect target={target} value={null} onChange={(id) => id && !value.includes(id) && onChange([...value, id])} placeholder={placeholder ?? 'Añadir…'} filter={filter} />
    </div>
  );
}
