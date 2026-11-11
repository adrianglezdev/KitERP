import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Calculator, FileSpreadsheet, Lock, LockOpen, ListOrdered, Scale, TrendingUp } from 'lucide-react';
import { fmtMoney } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Card, CardHeader, EnumBadge, PageHeader, Spinner, Stat, useConfirm } from '@/components/ui';
import { Chart } from '@/components/charts/Widget';
import { AnioSelect, EJERCICIO_ESTADOS } from '../comun';

/** Portada de contabilidad: resultado del año, evolución mensual y ejercicios. */
export default function Contabilidad() {
  const { can } = useSession();
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const { data: r } = useApi<any>(`/cnt/resumen?anio=${anio}`);
  const ej = useApi<any[]>('/cnt/ejercicios');
  const confirm = useConfirm();
  const accion = useMut(({ url, body }: { url: string; body?: unknown }) => api.post(url, body ?? {}), { ok: 'Hecho', invalidate: ['/cnt'] });
  const accesos = [
    { to: '/contabilidad/asientos', label: 'Libro diario', icon: ListOrdered },
    { to: '/contabilidad/libros?libro=mayor', label: 'Mayor', icon: BookOpen },
    { to: '/contabilidad/libros?libro=balance', label: 'Balance', icon: Scale },
    { to: '/contabilidad/libros?libro=pyg', label: 'Pérdidas y ganancias', icon: TrendingUp },
    { to: '/contabilidad/libros?libro=iva', label: 'Libros de IVA', icon: FileSpreadsheet },
    { to: '/contabilidad/modelos', label: 'Modelos (303, 111, 347…)', icon: Calculator },
  ];
  return (
    <>
      <PageHeader title="Contabilidad" icon={Calculator} subtitle="Se alimenta sola de facturas, cobros, nóminas y gastos. Aquí revisas, ajustas y presentas." actions={<AnioSelect value={anio} onChange={setAnio} />} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cifra de negocios" value={r ? fmtMoney(r.cifraNegocios) : '…'} tone="violet" />
        <Stat label="Resultado" value={r ? fmtMoney(r.resultado) : '…'} tone={r && r.resultado < 0 ? 'red' : 'green'} />
        <Stat label="Ingresos del año" value={r ? fmtMoney(r.meses.reduce((s: number, m: any) => s + m.ingresos, 0)) : '…'} tone="green" />
        <Stat label="Gastos del año" value={r ? fmtMoney(r.meses.reduce((s: number, m: any) => s + m.gastos, 0)) : '…'} tone="yellow" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card className="p-4">
            <CardHeader title="Ingresos y gastos por mes" className="!px-0 !pt-0" />
            {r ? (
              <Chart chart="bar" data={r.meses} xKey="mes" series={[{ key: 'ingresos', label: 'Ingresos', color: '#35AE29' }, { key: 'gastos', label: 'Gastos', color: '#B28574' }]} format="money" height={240} />
            ) : (
              <Spinner />
            )}
          </Card>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {accesos.map((a) => (
              <Link key={a.to} to={a.to} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-3 text-[13.5px] font-medium ring-1 ring-line hover:ring-primary">
                <a.icon className="h-4 w-4 text-primary" /> {a.label}
              </Link>
            ))}
          </div>
        </div>
        <Card className="h-fit overflow-hidden">
          <CardHeader title="Ejercicios" />
          <ul className="divide-y divide-line">
            {(ej.data ?? []).map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    {e.anio} <EnumBadge options={EJERCICIO_ESTADOS} value={e.estado} />
                  </span>
                  <span className="text-[12px] text-muted">
                    {e.asientos} asientos · resultado {fmtMoney(e.resultado)}
                  </span>
                </span>
                {can('cnt.gestionar') &&
                  (e.estado === 'cerrado' ? (
                    <Button
                      size="sm"
                      icon={LockOpen}
                      onClick={async () => {
                        const motivo = await confirm({ title: `Reabrir ${e.anio}`, message: 'Se anulan los asientos de regularización y cierre (y la apertura del año siguiente). Queda registrado.', confirm: 'Reabrir', danger: true, input: { label: 'Motivo', required: true } });
                        if (typeof motivo === 'string') accion.mutate({ url: `/cnt/ejercicios/${e.anio}/reabrir`, body: { motivo } });
                      }}
                    >
                      Reabrir
                    </Button>
                  ) : (
                    e.anio < new Date().getFullYear() + 1 && (
                      <Button
                        size="sm"
                        icon={Lock}
                        onClick={async () =>
                          (await confirm({ title: `Cerrar el ejercicio ${e.anio}`, message: 'Se generan los asientos de regularización, cierre y apertura del año siguiente. No se podrá anotar en él hasta reabrirlo.', confirm: 'Cerrar ejercicio' })) &&
                          accion.mutate({ url: `/cnt/ejercicios/${e.anio}/cerrar` })
                        }
                      >
                        Cerrar
                      </Button>
                    )
                  ))}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
