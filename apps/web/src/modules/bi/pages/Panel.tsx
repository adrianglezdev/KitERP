import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import { fmtMoney } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Card, CardHeader, EmptyState, Field, Input, PageHeader, Spinner, Stat } from '@/components/ui';
import { Chart } from '@/components/charts/Widget';
import { RefSelect } from '@/components/form/RefSelect';

/** Panel de dirección: ventas, márgenes, cobros, cartera y presupuestos. Cada bloque según tus permisos. */
export default function Panel() {
  const { can } = useSession();
  const anio = new Date().getFullYear();
  const [desde, setDesde] = useState(`${anio}-01-01`);
  const [hasta, setHasta] = useState(new Date().toLocaleDateString('sv-SE'));
  const [comercialId, setComercialId] = useState<string | null>(null);
  const { data: d, isLoading } = useApi<any>(`/bi/panel?desde=${desde}&hasta=${hasta}${comercialId ? `&comercialId=${comercialId}` : ''}`);
  const v = d?.ventas;
  return (
    <>
      <PageHeader title="Panel de dirección" icon={BarChart3} subtitle="Datos de facturas emitidas (definitivas). Se compara con el mismo periodo del año anterior." />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Desde">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>
        {can('fac.ver', 'todo') && (
          <Field label="Comercial" className="w-56">
            <RefSelect target="personas" value={comercialId} onChange={setComercialId} placeholder="Todos" />
          </Field>
        )}
      </div>
      {isLoading || !d ? (
        <Spinner />
      ) : !Object.values(d.permisos ?? {}).some(Boolean) ? (
        <Card>
          <EmptyState icon={BarChart3} title="No tienes acceso a datos de ventas ni compras" />
        </Card>
      ) : (
        <div className="space-y-5">
          {v && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Ventas"
                value={fmtMoney(v.base)}
                hint={
                  v.delta != null && (
                    <span className={cn('inline-flex items-center gap-1', v.delta >= 0 ? 'text-primary' : 'text-bad')}>
                      {v.delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {v.delta > 0 ? '+' : ''}
                      {v.delta} % vs {fmtMoney(v.anterior)}
                    </span>
                  )
                }
                tone="green"
              />
              <Stat label="Facturas" value={v.facturas} hint={`Ticket medio ${fmtMoney(v.ticketMedio)}`} tone="violet" />
              {v.margen != null && <Stat label="Margen" value={fmtMoney(v.margen)} hint={`${v.margenPct ?? 0} %`} tone="yellow" />}
              {d.cobros && <Stat label="Pendiente de cobro" value={fmtMoney(d.cobros.pendiente)} hint={d.cobros.dso != null ? `${d.cobros.dso} días medios de cobro` : undefined} tone="red" to="/tesoreria/cobros" />}
            </div>
          )}
          {d.ventasMes && (
            <Card className="p-4">
              <CardHeader title={`Ventas por mes · ${d.anio} frente a ${d.anio - 1}`} className="!px-0 !pt-0" />
              <Chart chart="bar" data={d.ventasMes} xKey="mes" series={[{ key: 'actual', label: String(d.anio), color: '#35AE29' }, { key: 'anterior', label: String(d.anio - 1), color: '#B28574' }]} format="money" height={260} />
            </Card>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
            {d.topClientes && <Top titulo="Mejores clientes" filas={d.topClientes.map((x: any) => ({ k: x.id, a: x.nombre, b: `${x.facturas} facturas`, v: x.importe, to: `/terceros/${x.id}` }))} />}
            {d.topArticulos && <Top titulo="Artículos más vendidos" filas={d.topArticulos.map((x: any) => ({ k: x.id, a: `${x.referencia} · ${x.nombre}`, b: `${x.cantidad.toLocaleString('es-ES')} uds`, v: x.importe, to: `/catalogo/${x.id}` }))} />}
            {d.topComerciales && d.topComerciales.length > 1 && <Top titulo="Por comercial" filas={d.topComerciales.map((x: any) => ({ k: x.id ?? x.nombre, a: x.nombre ?? 'Sin comercial', b: x.margen != null ? `margen ${fmtMoney(x.margen)}` : `${x.facturas} facturas`, v: x.importe }))} />}
            {d.cobros && (
              <Card className="p-4">
                <CardHeader title="Antigüedad de lo pendiente de cobro" className="!px-0 !pt-0" />
                <Chart chart="bar" data={d.cobros.tramos} xKey="tramo" series={[{ key: 'importe', label: 'Pendiente', color: '#7D2CDD' }]} format="money" height={200} />
                {d.cobros.impagado > 0 && <p className="mt-2 text-[13px] text-bad">De ello, impagado: {fmtMoney(d.cobros.impagado)}</p>}
              </Card>
            )}
            {d.presupuestos && (
              <Card className="p-4">
                <CardHeader title="Presupuestos" className="!px-0 !pt-0" />
                <div className="grid grid-cols-4 gap-2 text-center">
                  {d.presupuestos.embudo.map((e: any, i: number) => (
                    <div key={e.etapa} className="rounded-xl bg-sunken py-2" style={{ opacity: 1 - i * 0.12 }}>
                      <p className="font-display text-[20px] font-bold">{e.n}</p>
                      <p className="text-[11.5px] text-muted">{e.etapa}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[13px] text-muted">
                  {d.presupuestos.tasaAceptacion != null && `Aceptación ${d.presupuestos.tasaAceptacion} % · `}
                  aceptado {fmtMoney(d.presupuestos.importeAceptado)} · abierto {fmtMoney(d.presupuestos.importeAbierto)}
                </p>
              </Card>
            )}
            {d.cartera && (
              <Card className="p-4">
                <CardHeader title="Cartera de pedidos" className="!px-0 !pt-0" />
                <p className="font-display text-[26px] font-bold">{fmtMoney(d.cartera.importe)}</p>
                <p className="text-[13px] text-muted">{d.cartera.pedidos} pedidos pendientes de servir</p>
              </Card>
            )}
            {d.comprasProveedor && <Top titulo="Compras por proveedor" filas={d.comprasProveedor.map((x: any) => ({ k: x.id, a: x.nombre, b: `${x.facturas} facturas`, v: x.importe, to: `/terceros/${x.id}` }))} />}
          </div>
        </div>
      )}
    </>
  );
}

function Top({ titulo, filas }: { titulo: string; filas: { k: string; a: string; b: string; v: number; to?: string }[] }) {
  const max = Math.max(1, ...filas.map((f) => f.v));
  return (
    <Card className="overflow-hidden">
      <CardHeader title={titulo} />
      <ul className="divide-y divide-line">
        {filas.map((f) => {
          const inner = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{f.a}</span>
                <span className="mt-1 block h-1.5 rounded-full bg-sunken">
                  <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${(f.v / max) * 100}%` }} />
                </span>
              </span>
              <span className="text-right">
                <span className="block font-semibold tabular-nums">{fmtMoney(f.v)}</span>
                <span className="text-[11.5px] text-muted">{f.b}</span>
              </span>
            </>
          );
          return (
            <li key={f.k}>
              {f.to ? (
                <Link to={f.to} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                  {inner}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-4 py-2.5">{inner}</div>
              )}
            </li>
          );
        })}
        {!filas.length && <li className="px-4 py-4 text-center text-[13px] text-muted">Sin datos en el periodo.</li>}
      </ul>
    </Card>
  );
}
