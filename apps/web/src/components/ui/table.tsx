import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/lib/hooks';
import { EmptyState, Skeleton } from './primitives';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
  sortable?: boolean;
  /** Ocultar en pantallas medianas para ganar espacio. */
  hideBelow?: 'md' | 'lg' | 'xl';
}

/**
 * Tabla de datos. En móvil se convierte en una lista de tarjetas: la primera columna como título,
 * `mobileSubtitle` debajo y `mobileRight` a la derecha (importe o estado).
 */
export function DataTable<T extends { id?: string }>({
  columns,
  rows,
  loading,
  onRowClick,
  rowHref,
  sort,
  onSort,
  empty,
  mobileTitle,
  mobileSubtitle,
  mobileRight,
  footer,
  selectable,
  selected,
  onSelect,
  dense,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  sort?: { field: string; dir: 'asc' | 'desc' };
  onSort?: (field: string) => void;
  empty?: ReactNode;
  mobileTitle?: (row: T) => ReactNode;
  mobileSubtitle?: (row: T) => ReactNode;
  mobileRight?: (row: T) => ReactNode;
  footer?: ReactNode;
  selectable?: boolean;
  selected?: Set<string>;
  onSelect?: (id: string, on: boolean) => void;
  dense?: boolean;
}) {
  const mobile = useIsMobile();
  const click = (r: T) => {
    if (onRowClick) onRowClick(r);
  };

  if (loading)
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  if (!rows.length) return <>{empty ?? <EmptyState title="No hay resultados">Prueba a cambiar los filtros o la búsqueda.</EmptyState>}</>;

  if (mobile) {
    return (
      <ul className="divide-y divide-line">
        {rows.map((r, i) => {
          const title = mobileTitle ? mobileTitle(r) : columns[0]!.cell(r);
          const content = (
            <div className="flex items-center gap-3 px-4 py-3">
              {selectable && r.id && (
                <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={selected?.has(r.id) ?? false} onChange={(e) => onSelect?.(r.id!, e.target.checked)} onClick={(e) => e.stopPropagation()} />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-medium">{title}</div>
                {mobileSubtitle && <div className="mt-0.5 truncate text-[12.5px] text-muted">{mobileSubtitle(r)}</div>}
              </div>
              {mobileRight && <div className="shrink-0 text-right">{mobileRight(r)}</div>}
            </div>
          );
          return (
            <li key={r.id ?? i}>
              {rowHref ? (
                <a href={rowHref(r)} onClick={(e) => { if (onRowClick) { e.preventDefault(); click(r); } }} className="block active:bg-sunken">
                  {content}
                </a>
              ) : (
                <div onClick={() => click(r)} className={cn(onRowClick && 'cursor-pointer active:bg-sunken')}>
                  {content}
                </div>
              )}
            </li>
          );
        })}
        {footer && <li className="px-4 py-3">{footer}</li>}
      </ul>
    );
  }

  const hide = (c: Column<T>) => cn(c.hideBelow === 'md' && 'hidden md:table-cell', c.hideBelow === 'lg' && 'hidden lg:table-cell', c.hideBelow === 'xl' && 'hidden xl:table-cell');
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-line text-left text-[12px] uppercase tracking-wide text-muted">
            {selectable && <th className="w-10 px-3 py-2.5" />}
            {columns.map((c) => (
              <th key={c.key} className={cn('whitespace-nowrap px-3 py-2.5 font-medium', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', hide(c))} style={{ width: c.width }}>
                {c.sortable && onSort ? (
                  <button type="button" onClick={() => onSort(c.key)} className={cn('inline-flex items-center gap-1 hover:text-fg', sort?.field === c.key && 'text-fg')}>
                    {c.header}
                    {sort?.field === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id ?? i}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a,button,input,[data-no-row]')) return;
                if (rowHref && (e.metaKey || e.ctrlKey)) window.open(rowHref(r), '_blank');
                else click(r);
              }}
              className={cn('border-b border-line/70 transition last:border-0', (onRowClick || rowHref) && 'cursor-pointer hover:bg-sunken/60', selected?.has(r.id ?? '') && 'bg-primary-soft/50')}
            >
              {selectable && (
                <td className="px-3" data-no-row>
                  {r.id && <input type="checkbox" aria-label="Seleccionar" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={selected?.has(r.id) ?? false} onChange={(e) => onSelect?.(r.id!, e.target.checked)} />}
                </td>
              )}
              {columns.map((c) => (
                <td key={c.key} className={cn('px-3', dense ? 'py-1.5' : 'py-2.5', c.align === 'right' && 'tabular text-right', c.align === 'center' && 'text-center', hide(c))}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-2.5">
                {footer}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <p className="px-4 py-3 text-[12.5px] text-muted">{total} {total === 1 ? 'resultado' : 'resultados'}</p> : null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-muted">
      <span className="tabular">
        {from.toLocaleString('es-ES')}–{to.toLocaleString('es-ES')} de {total.toLocaleString('es-ES')}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg p-1.5 hover:bg-sunken disabled:opacity-30" aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular px-2">
          {page} / {pages}
        </span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg p-1.5 hover:bg-sunken disabled:opacity-30" aria-label="Página siguiente">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
