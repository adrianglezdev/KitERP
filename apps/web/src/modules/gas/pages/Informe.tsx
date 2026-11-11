import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { fmtMoney } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Card, DataTable, Field, Input, PageHeader, Segmented } from '@/components/ui';
import { Chart } from '@/components/charts/Widget';

type Agrupar = 'persona' | 'mes' | 'categoria' | 'tipo' | 'proyecto';

export default function Informe() {
  const { has } = useSession();
  const anio = new Date().getFullYear();
  const [agrupar, setAgrupar] = useState<Agrupar>('persona');
  const [desde, setDesde] = useState(`${anio}-01-01`);
  const [hasta, setHasta] = useState(`${anio}-12-31`);
  const { data, isLoading } = useApi<any>(`/gas/informe?agrupar=${agrupar}&desde=${desde}&hasta=${hasta}`);
  const filas: any[] = data?.filas ?? [];
  const tot = filas.reduce((s, f) => ({ total: s.total + f.total, iva: s.iva + f.iva, km: s.km + f.km, gastos: s.gastos + f.gastos }), { total: 0, iva: 0, km: 0, gastos: 0 });
  return (
    <>
      <PageHeader title="Informe de gastos" icon={BarChart3} subtitle="Gastos enviados, aprobados y pagados del periodo." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Segmented
          value={agrupar}
          onChange={setAgrupar}
          options={[
            { value: 'persona', label: 'Por persona' },
            { value: 'mes', label: 'Por mes' },
            { value: 'categoria', label: 'Por categoría' },
            { value: 'tipo', label: 'Por tipo' },
            ...(has('pry') ? [{ value: 'proyecto' as const, label: 'Por proyecto' }] : []),
          ]}
        />
        <div className="flex gap-2 sm:ml-auto">
          <Field label="Desde">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Field>
        </div>
      </div>
      {filas.length > 0 && (
        <Card className="mb-4 p-4">
          <Chart chart="bar" data={filas.slice(0, 20)} xKey="etiqueta" series={[{ key: 'total', label: 'Total' }]} format="money" height={240} />
        </Card>
      )}
      <Card className="overflow-hidden">
        <DataTable
          rows={filas.map((f) => ({ ...f, id: f.clave || f.etiqueta }))}
          loading={isLoading}
          empty="Sin gastos en el periodo."
          columns={[
            { key: 'etiqueta', header: agrupar === 'mes' ? 'Mes' : 'Grupo', cell: (f: any) => <span className="font-medium">{f.etiqueta}</span> },
            { key: 'gastos', header: 'Gastos', align: 'right', cell: (f: any) => f.gastos },
            { key: 'km', header: 'Km', align: 'right', cell: (f: any) => (f.km ? f.km.toLocaleString('es-ES') : '—'), hideBelow: 'md' },
            { key: 'iva', header: 'IVA', align: 'right', cell: (f: any) => fmtMoney(f.iva), hideBelow: 'md' },
            { key: 'liquidado', header: 'Pagado', align: 'right', cell: (f: any) => fmtMoney(f.liquidado), hideBelow: 'lg' },
            { key: 'total', header: 'Total', align: 'right', cell: (f: any) => <b>{fmtMoney(f.total)}</b> },
          ]}
          mobileTitle={(f: any) => f.etiqueta}
          mobileSubtitle={(f: any) => `${f.gastos} gastos`}
          mobileRight={(f: any) => <b>{fmtMoney(f.total)}</b>}
          footer={
            filas.length > 0 && (
              <div className="flex justify-between px-4 py-2 text-[13px] font-semibold">
                <span>{tot.gastos} gastos</span>
                <span>{fmtMoney(tot.total)}</span>
              </div>
            )
          }
        />
      </Card>
    </>
  );
}
