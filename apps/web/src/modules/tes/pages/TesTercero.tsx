import { useState } from 'react';
import { fmtDate, fmtMoney, optionLabel } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { DataTable, EnumBadge, Spinner, Stat } from '@/components/ui';
import { MEDIOS_PAGO, VENC_ESTADOS, VencimientoSheet } from '../comun';

/** Pestaña "Cobros y pagos" en la ficha del cliente o proveedor. */
export default function TesTercero({ id }: { id: string }) {
  const { data, isLoading } = useApi<any>(`/tes/terceros/${id}`);
  const [abierto, setAbierto] = useState<string | null>(null);
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Nos debe" value={fmtMoney(data.cobro.pendiente)} tone="green" />
        <Stat label="Vencido" value={fmtMoney(data.cobro.vencido)} tone="red" />
        <Stat label="Le debemos" value={fmtMoney(data.pago.pendiente)} tone="yellow" />
        <Stat label="Días medios de cobro" value={data.diasMedioCobro ?? '—'} tone="violet" />
      </div>
      <DataTable
        dense
        rows={data.vencimientos}
        onRowClick={(v: any) => setAbierto(v.id)}
        empty="Sin vencimientos."
        columns={[
          { key: 'fecha', header: 'Vence', cell: (v: any) => fmtDate(v.fecha), width: '100px' },
          { key: 'circuito', header: 'Tipo', cell: (v: any) => (v.circuito === 'cobro' ? 'Cobro' : 'Pago'), hideBelow: 'md' },
          { key: 'doc', header: 'Concepto', cell: (v: any) => v.documento ?? v.concepto },
          { key: 'estado', header: 'Estado', cell: (v: any) => <EnumBadge options={VENC_ESTADOS} value={v.estado} /> },
          { key: 'importe', header: 'Importe', align: 'right', cell: (v: any) => fmtMoney(v.importe) },
          { key: 'pend', header: 'Pendiente', align: 'right', cell: (v: any) => <b>{fmtMoney(v.pendiente)}</b> },
        ]}
        mobileTitle={(v: any) => v.documento ?? v.concepto}
        mobileSubtitle={(v: any) => fmtDate(v.fecha)}
        mobileRight={(v: any) => <b>{fmtMoney(v.pendiente)}</b>}
      />
      {data.pagos.length > 0 && (
        <div>
          <p className="label mb-1">Últimos cobros y pagos</p>
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line-strong/70">
            {data.pagos.slice(0, 15).map((p: any) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">
                  {fmtDate(p.fecha)} · {optionLabel(MEDIOS_PAGO, p.medio)?.label} · <span className="text-muted">{p.vencimiento}</span>
                </span>
                <span className="tabular-nums">{fmtMoney(p.importe)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {abierto && <VencimientoSheet id={abierto} onClose={() => setAbierto(null)} />}
    </div>
  );
}
