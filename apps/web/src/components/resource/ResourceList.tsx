import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Plus, SlidersHorizontal } from 'lucide-react';
import { type Paginated, type ResourceDef } from '@kite/shared';
import { download, qs } from '@/lib/api';
import { useApi, useDebounced, useLocalState } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Card, DataTable, Field, IconButton, Pagination, RefSelect, SearchInput, Select, Sheet, type Column } from '@/components/ui';
import { FieldValue } from './ResourceField';
import { ResourceFormDialog } from './ResourceForm';

export interface ResourceListProps {
  def: ResourceDef;
  endpoint: string;
  /** Ruta de detalle: si se indica, al pulsar una fila se navega a `${detailPath}/${id}`. Si no, se abre el formulario. */
  detailPath?: string;
  /** Permiso para crear (si no se tiene, el botón no aparece). */
  createPerm?: string | string[];
  editPerm?: string | string[];
  /** Filtros fijos (p. ej. { terceroId }). */
  fixed?: Record<string, string>;
  /** Columnas extra o personalizadas. */
  columns?: Column<any>[];
  /** Valores iniciales al crear. */
  initial?: Record<string, unknown>;
  hideInForm?: string[];
  title?: ReactNode;
  toolbar?: ReactNode;
  embedded?: boolean;
  pageSize?: number;
  emptyText?: string;
  /** Avisos dentro del formulario según lo que se va escribiendo. */
  formExtra?: (values: Record<string, any>, record: any | null) => ReactNode;
}

/**
 * Listado genérico: búsqueda, filtros, orden, paginación en servidor, exportación a Excel y alta/edición.
 * En móvil la tabla se convierte en lista de tarjetas.
 */
export function ResourceList({ def, endpoint, detailPath, createPerm, editPerm, fixed, columns, initial, hideInForm, title, toolbar, embedded, pageSize = 25, emptyText, formExtra }: ResourceListProps) {
  const nav = useNavigate();
  const { can } = useSession();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useLocalState<{ field: string; dir: 'asc' | 'desc' } | undefined>(`sort:${def.key}`, def.defaultSort);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [sp, setSp] = useSearchParams();
  const [creating, setCreatingRaw] = useState(() => sp.get('nuevo') === '1' && !embedded);
  const setCreating = (v: boolean) => {
    setCreatingRaw(v);
    if (!v && sp.get('nuevo')) {
      const n = new URLSearchParams(sp);
      n.delete('nuevo');
      setSp(n, { replace: true });
    }
  };

  const params = useMemo(() => {
    const p: Record<string, unknown> = { page, pageSize, q: dq, sort: sort?.field, dir: sort?.dir };
    for (const [k, v] of Object.entries({ ...filters, ...(fixed ?? {}) })) p[`f.${k}`] = v;
    return p;
  }, [page, pageSize, dq, sort, filters, fixed]);
  const { data, isLoading } = useApi<Paginated<any>>(`${endpoint}${qs(params)}`, { placeholderData: (prev) => prev });

  const cols: Column<any>[] = useMemo(() => {
    const base: Column<any>[] = def.list.map((k, i) => {
      const f = def.fields[k]!;
      return {
        key: k,
        header: f.label,
        sortable: true,
        align: ['money', 'number', 'percent', 'int'].includes(f.type) ? 'right' : undefined,
        hideBelow: i > 3 ? 'lg' : undefined,
        cell: (r: any) => (i === 0 ? <span className="font-medium">{<FieldValue def={f} value={r[k]} refs={data?.refs} />}</span> : <FieldValue def={f} value={r[k]} refs={data?.refs} />),
      };
    });
    if (!columns) return base;
    const byKey = new Map(columns.map((c) => [c.key, c]));
    const merged = base.map((c) => byKey.get(c.key) ?? c);
    for (const c of columns) if (!merged.some((m) => m.key === c.key)) merged.push(c);
    return merged;
  }, [def, columns, data?.refs]);

  const filterKeys = (def.filters ?? []).filter((k) => !fixed?.[k]);
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const canCreate = createPerm ? can(createPerm) : false;
  const canEdit = editPerm ? can(editPerm) : canCreate;

  const filterControls = filterKeys.map((k) => {
    const f = def.fields[k]!;
    const val = filters[k] ?? '';
    const set = (v: string) => {
      setPage(1);
      setFilters((s) => ({ ...s, [k]: v }));
    };
    let ctl: ReactNode;
    if (f.type === 'enum') ctl = <Select value={val} onChange={(e) => set(e.target.value)} options={f.options ?? []} placeholder="Todos" />;
    else if (f.type === 'bool')
      ctl = (
        <Select value={val} onChange={(e) => set(e.target.value)} placeholder="Todos">
          <option value="true">Sí</option>
          <option value="false">No</option>
        </Select>
      );
    else if (f.type === 'ref') ctl = <RefSelect target={f.ref!} value={val || null} onChange={(v) => set(v ?? '')} placeholder="Todos" />;
    else return null;
    return (
      <Field key={k} label={f.label}>
        {ctl}
      </Field>
    );
  });

  const tituloSub = (r: any) => {
    const sub = def.subtitleField ? r[def.subtitleField] : null;
    const f = def.subtitleField ? def.fields[def.subtitleField] : null;
    return sub && f ? <FieldValue def={f} value={sub} refs={data?.refs} /> : null;
  };
  const statusKey = def.list.find((k) => def.fields[k]?.type === 'enum' && def.fields[k]?.options?.some((o) => o.tone));

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={`Buscar en ${def.plural.toLowerCase()}…`} className="min-w-[200px] flex-1" />
        {filterKeys.length > 0 && (
          <>
            <div className="hidden flex-wrap items-end gap-2 xl:flex">{filterControls.map((c, i) => <div key={i} className="w-44">{c}</div>)}</div>
            <Button className="xl:hidden" icon={SlidersHorizontal} onClick={() => setShowFilters(true)}>
              Filtros{activeFilters ? ` (${activeFilters})` : ''}
            </Button>
          </>
        )}
        {toolbar}
        <IconButton icon={Download} label="Exportar a Excel" variant="secondary" onClick={() => download(`${endpoint}${qs({ ...params, format: 'xlsx', page: undefined, pageSize: undefined })}`, `${def.key}.xlsx`)} />
        {canCreate && (
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            <span className="hidden sm:inline">Nuevo</span>
          </Button>
        )}
      </div>
      <DataTable
        columns={cols}
        rows={data?.items ?? []}
        loading={isLoading}
        sort={sort}
        onSort={(field) => setSort((s) => ({ field, dir: s?.field === field && s.dir === 'asc' ? 'desc' : 'asc' }))}
        onRowClick={(r) => (detailPath ? nav(`${detailPath}/${r.id}`) : canEdit ? setEditing(r) : undefined)}
        rowHref={detailPath ? (r) => `${detailPath}/${r.id}` : undefined}
        mobileSubtitle={tituloSub}
        mobileRight={statusKey ? (r) => <FieldValue def={def.fields[statusKey]!} value={r[statusKey]} /> : undefined}
        empty={emptyText ? <p className="px-4 py-10 text-center text-muted">{emptyText}</p> : undefined}
      />
      {data && <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} />}
    </>
  );

  return (
    <>
      {title && <div className="mb-3">{title}</div>}
      {embedded ? <div className="overflow-hidden rounded-xl border border-line bg-surface">{body}</div> : <Card className="overflow-hidden">{body}</Card>}
      <Sheet open={showFilters} onOpenChange={setShowFilters} title="Filtros" side="bottom">
        <div className="space-y-3 p-5">
          {filterControls}
          <Button className="w-full" onClick={() => { setFilters({}); setShowFilters(false); }}>
            Quitar filtros
          </Button>
        </div>
      </Sheet>
      <ResourceFormDialog open={creating} onOpenChange={setCreating} def={def} endpoint={endpoint} initial={{ ...initial, ...fixed }} hide={[...(hideInForm ?? []), ...Object.keys(fixed ?? {})]} onSaved={(r) => detailPath && nav(`${detailPath}/${r.id}`)} renderExtra={formExtra ? (v) => formExtra(v, null) : undefined} />
      <ResourceFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} def={def} endpoint={endpoint} record={editing ? { ...editing, _refs: data?.refs } : null} hide={[...(hideInForm ?? []), ...Object.keys(fixed ?? {})]} renderExtra={formExtra ? (v) => formExtra(v, editing) : undefined} />
    </>
  );
}
