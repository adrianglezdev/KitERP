import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ListOrdered, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { fmtDate, fmtMoney } from '@kite/shared';
import { api, download } from '@/lib/api';
import { useApi, useDebounced, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Card, EmptyState, EnumBadge, IconButton, Input, Menu, PageHeader, Pagination, SearchInput, Select, Spinner, useConfirm } from '@/components/ui';
import { ASIENTO_ORIGENES, AnioSelect, AsientoEditor } from '../comun';

/** Libro diario: todos los asientos, automáticos y manuales. Solo los manuales se editan aquí. */
export default function Asientos() {
  const { can } = useSession();
  const gestiona = can('cnt.gestionar');
  const confirm = useConfirm();
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [origen, setOrigen] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const dc = useDebounced(cuenta);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<any | null | undefined>(undefined);
  const params = `anio=${anio}${origen ? `&origen=${origen}` : ''}${dq ? `&q=${encodeURIComponent(dq)}` : ''}${dc ? `&cuenta=${dc}` : ''}`;
  const { data, isLoading } = useApi<any>(`/cnt/asientos?${params}&page=${page}&pageSize=25`);
  const borrar = useMut((id: string) => api.del(`/cnt/asientos/${id}`), { ok: 'Asiento borrado', invalidate: ['/cnt'] });
  const editar = async (id: string) => setEditor(await api.get(`/cnt/asientos/${id}`));
  return (
    <>
      <PageHeader
        title="Libro diario"
        icon={ListOrdered}
        subtitle="Los asientos de facturas, cobros, nóminas y gastos se generan solos y se corrigen desde su origen."
        actions={
          <>
            <Menu
              trigger={<Button icon={Download}>Exportar</Button>}
              items={[
                { label: 'Excel', onSelect: () => download(`/cnt/libros/diario?anio=${anio}&format=xlsx`, `diario-${anio}.xlsx`) },
                { label: 'CSV para la gestoría (A3)', onSelect: () => download(`/cnt/libros/diario?anio=${anio}&format=a3`, `diario-${anio}.csv`) },
              ]}
            />
            {gestiona && (
              <Button variant="primary" icon={Plus} onClick={() => setEditor(null)}>
                Asiento manual
              </Button>
            )}
          </>
        }
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <AnioSelect value={anio} onChange={(v) => { setAnio(v); setPage(1); }} />
        <Select className="sm:w-48" value={origen} onChange={(e) => { setOrigen(e.target.value); setPage(1); }} options={ASIENTO_ORIGENES} placeholder="Todos los orígenes" />
        <Input className="sm:w-40" value={cuenta} onChange={(e) => { setCuenta(e.target.value.replace(/\D/g, '')); setPage(1); }} placeholder="Cuenta (p. ej. 430)" inputMode="numeric" />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Concepto o número" className="sm:ml-auto sm:w-64" />
      </div>
      {isLoading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState icon={ListOrdered} title="Sin asientos" />
        </Card>
      ) : (
        <div className="space-y-2">
          {data.items.map((a: any) => (
            <Card key={a.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sunken/50 px-3 py-2 text-[13px]">
                <span className="font-display font-bold">{a.numero ?? '—'}</span>
                <span className="text-muted">{fmtDate(a.fecha)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{a.concepto}</span>
                <EnumBadge options={ASIENTO_ORIGENES} value={a.origen} dot={false} />
                {a.documentoId && (
                  <Link to={`/documentos/${a.documentoId}`} className="text-[12px] font-semibold text-primary">
                    Ver documento
                  </Link>
                )}
                {a.cerrado && <Lock className="h-3.5 w-3.5 text-muted" aria-label="Ejercicio cerrado" />}
                {gestiona && a.origen === 'manual' && !a.cerrado && (
                  <>
                    <IconButton icon={Pencil} label="Editar" size="sm" onClick={() => editar(a.id)} />
                    <IconButton icon={Trash2} label="Borrar" size="sm" onClick={async () => (await confirm({ title: `Borrar el asiento ${a.numero}`, danger: true, confirm: 'Borrar' })) && borrar.mutate(a.id)} />
                  </>
                )}
              </div>
              <table className="w-full text-[13px]">
                <tbody>
                  {a.lineas.map((l: any) => (
                    <tr key={l.id} className="border-b border-line/60 last:border-0">
                      <td className="w-24 px-3 py-1.5 font-mono text-[12.5px]">
                        <Link to={`/contabilidad/libros?libro=mayor&cuenta=${l.cuenta}&anio=${anio}`} className="hover:text-primary">
                          {l.cuenta}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="line-clamp-1">{l.nombre}</span>
                        {(l.concepto || l.centro) && <span className="line-clamp-1 text-[12px] text-muted">{[l.concepto, l.centro].filter(Boolean).join(' · ')}</span>}
                      </td>
                      <td className="w-28 px-3 py-1.5 text-right tabular-nums">{Number(l.debe) ? fmtMoney(l.debe) : ''}</td>
                      <td className="w-28 px-3 py-1.5 text-right tabular-nums">{Number(l.haber) ? fmtMoney(l.haber) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
          <Pagination page={page} pageSize={25} total={data.total} onPage={setPage} />
        </div>
      )}
      {editor !== undefined && <AsientoEditor asiento={editor ?? undefined} onClose={() => setEditor(undefined)} />}
    </>
  );
}
