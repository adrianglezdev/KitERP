import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, FileEdit, Plus, Receipt, Wallet } from 'lucide-react';
import { fmtDate, fmtMoney, optionLabel } from '@kite/shared';
import { useApi, useDebounced } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Card, DataTable, EnumBadge, PageHeader, Pagination, SearchInput, Segmented, Stat } from '@/components/ui';
import { GASTO_CATEGORIAS, GASTO_ESTADOS, GASTO_TIPOS, GastoDialog, GastoSheet } from '../comun';

/**
 * Mis gastos (vista por defecto) y, para quien tiene permiso, todos los gastos de su equipo o de la empresa.
 */
export default function MisGastos({ vista = 'mios' }: { vista?: 'mios' | 'todos' }) {
  const { can } = useSession();
  const [sp, setSp] = useSearchParams();
  const [nuevo, setNuevo] = useState(sp.get('nuevo') === '1');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [estado, setEstado] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useApi<any>(`/gas/gastos?vista=${vista}&page=${page}&pageSize=30${estado ? `&estado=${estado}` : ''}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`);
  const r = data?.resumen;
  const cerrarNuevo = () => {
    setNuevo(false);
    if (sp.get('nuevo')) setSp({}, { replace: true });
  };
  return (
    <>
      <PageHeader
        title={vista === 'mios' ? 'Mis gastos' : 'Gastos'}
        icon={Receipt}
        subtitle={vista === 'mios' ? 'Tickets, kilómetros y dietas. Haz la foto del ticket y envíalo: te lo pagan en la nómina o por transferencia.' : 'Todos los gastos que puedes consultar.'}
        actions={
          vista === 'mios' &&
          can('gas.crear') && (
            <Button variant="primary" icon={Plus} onClick={() => setNuevo(true)}>
              Nuevo gasto
            </Button>
          )
        }
      />
      {r && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Por cobrar" value={fmtMoney(r.porCobrar)} icon={Wallet} tone="green" />
          <Stat label="Sin enviar" value={r.borradores} icon={FileEdit} tone="yellow" />
          <Stat label="Este mes" value={fmtMoney(r.mes)} icon={Clock} tone="violet" />
        </div>
      )}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented
          value={estado}
          onChange={(v) => {
            setEstado(v);
            setPage(1);
          }}
          options={[{ value: '', label: 'Todos' }, ...GASTO_ESTADOS.map((e) => ({ value: e.value as string, label: e.label }))]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Comercio o concepto" className="sm:ml-auto sm:w-64" />
      </div>
      <Card className="overflow-hidden">
        <DataTable
          rows={data?.items ?? []}
          loading={isLoading}
          onRowClick={(g: any) => setAbierto(g.id)}
          empty={vista === 'mios' ? 'Aún no has registrado gastos.' : 'No hay gastos.'}
          columns={[
            { key: 'fecha', header: 'Fecha', cell: (g: any) => fmtDate(g.fecha), width: '110px' },
            ...(vista === 'todos' ? [{ key: 'persona', header: 'Persona', cell: (g: any) => g.persona }] : []),
            { key: 'concepto', header: 'Concepto', cell: (g: any) => <span className="line-clamp-1">{g.comercio || g.concepto || optionLabel(GASTO_TIPOS, g.tipo)?.label}</span> },
            { key: 'tipo', header: 'Tipo', cell: (g: any) => optionLabel(GASTO_CATEGORIAS, g.categoria)?.label ?? optionLabel(GASTO_TIPOS, g.tipo)?.label, hideBelow: 'md' },
            { key: 'estado', header: 'Estado', cell: (g: any) => <EnumBadge options={GASTO_ESTADOS} value={g.estado} /> },
            { key: 'total', header: 'Importe', align: 'right', cell: (g: any) => <span className="font-semibold tabular-nums">{fmtMoney(g.total)}</span> },
          ]}
          mobileTitle={(g: any) => g.comercio || g.concepto || optionLabel(GASTO_TIPOS, g.tipo)?.label}
          mobileSubtitle={(g: any) => (
            <span className="flex items-center gap-2">
              {fmtDate(g.fecha)} {vista === 'todos' && `· ${g.persona}`} <EnumBadge options={GASTO_ESTADOS} value={g.estado} />
            </span>
          )}
          mobileRight={(g: any) => <span className="font-semibold">{fmtMoney(g.total)}</span>}
          footer={
            data?.total ? (
              <div className="flex justify-between px-4 py-2 text-[13px]">
                <span className="text-muted">{data.total} gastos</span>
                <span className="font-semibold">{fmtMoney(data.suma)}</span>
              </div>
            ) : null
          }
        />
      </Card>
      {data && <Pagination page={page} pageSize={30} total={data.total} onPage={setPage} />}
      {nuevo && <GastoDialog onClose={cerrarNuevo} />}
      {abierto && <GastoSheet id={abierto} onClose={() => setAbierto(null)} />}
    </>
  );
}
