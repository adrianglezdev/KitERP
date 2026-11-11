import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Landmark, TrendingUp } from 'lucide-react';
import { fmtDate, fmtMoney } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { Alert, Card, CardHeader, PageHeader, Spinner, Stat } from '@/components/ui';
import { Chart } from '@/components/charts/Widget';

/** Resumen de tesorería: saldos, lo que hay que cobrar y pagar, y previsión de 13 semanas. */
export default function Tesoreria() {
  const saldos = useApi<any[]>('/tes/saldos');
  const res = useApi<any>('/tes/vencimientos/resumen');
  const prev = useApi<any>('/tes/prevision?semanas=13');
  const r = res.data;
  const p = prev.data;
  return (
    <>
      <PageHeader title="Tesorería" icon={Landmark} subtitle="Dinero en bancos y caja, cobros y pagos pendientes y previsión." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saldo total" value={p ? fmtMoney(p.saldoActual) : '…'} icon={Landmark} tone="violet" />
        <Stat label="Por cobrar" value={r ? fmtMoney(r.cobro.pendiente) : '…'} hint={r?.cobro.vencido ? `${fmtMoney(r.cobro.vencido)} vencido` : undefined} icon={ArrowDownLeft} tone="green" to="/tesoreria/cobros" />
        <Stat label="Por pagar" value={r ? fmtMoney(r.pago.pendiente) : '…'} hint={r?.pago.proximos30 ? `${fmtMoney(r.pago.proximos30)} en 30 días` : undefined} icon={ArrowUpRight} tone="yellow" to="/tesoreria/pagos" />
        <Stat label="Impagados" value={r ? fmtMoney(r.cobro.impagado) : '…'} icon={AlertTriangle} tone="red" to="/tesoreria/cobros?vista=impagados" />
      </div>
      {p && p.minimo.saldo < 0 && (
        <Alert tone="red" icon={AlertTriangle} title="Previsión de saldo negativo" className="mb-5">
          Si todo se cobra y se paga en fecha, la semana {p.minimo.semana} el saldo bajaría a {fmtMoney(p.minimo.saldo)}.
        </Alert>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="p-4">
          <CardHeader title="Previsión de 13 semanas" icon={TrendingUp} className="!px-0 !pt-0" />
          {!p ? (
            <Spinner />
          ) : (
            <Chart
              chart="bar"
              data={p.semanas}
              xKey="etiqueta"
              series={[
                { key: 'cobros', label: 'Cobros', color: '#35AE29' },
                { key: 'pagos', label: 'Pagos', color: '#B28574' },
                { key: 'saldo', label: 'Saldo', color: '#7D2CDD' },
              ]}
              format="money"
              height={260}
            />
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Bancos y cajas" actions={<Link to="/tesoreria/cuentas" className="text-[12.5px] font-semibold text-primary">Gestionar</Link>} />
          <ul className="divide-y divide-line">
            {(saldos.data ?? []).filter((c) => c.activo).map((c) => (
              <li key={c.id}>
                <Link to={`/tesoreria/banco?cuenta=${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{c.nombre}</span>
                    <span className="text-[12px] text-muted">{c.sinConciliar ? `${c.sinConciliar} movimientos sin conciliar` : c.iban ? `···· ${String(c.iban).slice(-4)}` : 'Caja'}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{fmtMoney(c.saldo)}</span>
                    {c.saldoExtracto !== null && Math.abs(c.saldoExtracto - c.saldo) > 0.01 && <span className="text-[11.5px] text-warn">Banco: {fmtMoney(c.saldoExtracto)}</span>}
                  </span>
                </Link>
              </li>
            ))}
            {!saldos.data?.length && (
              <li className="px-4 py-4 text-center text-[13px] text-muted">
                <Link to="/tesoreria/cuentas?nuevo=1" className="font-semibold text-primary">
                  Añade tu primera cuenta bancaria
                </Link>
              </li>
            )}
          </ul>
          {p?.cuentas?.[0]?.fechaSaldo && <p className="px-4 pb-3 text-[11.5px] text-muted">Saldo inicial a {fmtDate(p.cuentas[0].fechaSaldo)}</p>}
        </Card>
      </div>
    </>
  );
}
