import { useState } from 'react';
import { TrendingDown, Zap } from 'lucide-react';
import { fmtMoney } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Card, DataTable, Field, Input, PageHeader } from '@/components/ui';

/** Cuotas de amortización mensuales (lineales). Al generarlas se contabilizan solas. */
export default function Amortizaciones() {
  const { can } = useSession();
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const [periodo, setPeriodo] = useState(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  const { data, isLoading } = useApi<any>(`/act/amortizaciones?periodo=${periodo}`);
  const generar = useMut(() => api.post<any>('/act/amortizaciones/generar', { periodo }), { ok: (r) => `${r.generadas ?? r.n ?? 0} cuotas generadas`, invalidate: ['/act', '/cnt'] });
  return (
    <>
      <PageHeader
        title="Amortizaciones"
        icon={TrendingDown}
        subtitle="Se calculan con el valor de compra, el residual y la vida útil de cada activo."
        actions={
          can('act.gestionar') && (
            <Button variant="primary" icon={Zap} loading={generar.isPending} onClick={() => generar.mutate(undefined)}>
              Generar {periodo}
            </Button>
          )
        }
      />
      <Field label="Mes" className="mb-3 w-44">
        <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
      </Field>
      <Card className="overflow-hidden">
        <DataTable
          rows={data?.items ?? []}
          loading={isLoading}
          empty="No hay cuotas generadas en este mes."
          columns={[
            { key: 'codigo', header: 'Activo', cell: (r: any) => <span className="font-medium">{r.codigo} · {r.nombre}</span> },
            { key: 'cuentas', header: 'Cuentas', cell: (r: any) => `${r.cuentaGasto} / ${r.cuentaAmortizacion}`, hideBelow: 'md' },
            { key: 'importe', header: 'Cuota', align: 'right', cell: (r: any) => fmtMoney(r.importe) },
          ]}
          mobileTitle={(r: any) => r.nombre}
          mobileRight={(r: any) => fmtMoney(r.importe)}
          footer={data?.items.length ? <div className="flex justify-end px-4 py-2 text-[13px] font-semibold">Total {fmtMoney(data.total)}</div> : null}
        />
      </Card>
    </>
  );
}
