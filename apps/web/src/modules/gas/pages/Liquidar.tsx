import { useMemo, useState } from 'react';
import { Banknote, HandCoins } from 'lucide-react';
import { fmtDate, fmtMoney, optionLabel } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { LIQUIDACION_VIAS, GastoSheet } from '../comun';

/** Administración paga los gastos aprobados: en la nómina o por transferencia (genera el asiento y el vencimiento). */
export default function Liquidar() {
  const { data, isLoading } = useApi<any>('/gas/gastos?vista=liquidar&pageSize=200');
  const hist = useApi<any[]>('/gas/liquidaciones');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [via, setVia] = useState('nomina');
  const [fecha, setFecha] = useState(new Date().toLocaleDateString('sv-SE'));
  const [abierto, setAbierto] = useState<string | null>(null);
  const items: any[] = data?.items ?? [];
  // los gastos con tarjeta de empresa no se pagan a la persona: solo se contabilizan
  const grupos = useMemo(() => {
    const m = new Map<string, { persona: string; items: any[] }>();
    for (const g of items) {
      const k = g.personaId;
      if (!m.has(k)) m.set(k, { persona: g.persona, items: [] });
      m.get(k)!.items.push(g);
    }
    return [...m.entries()];
  }, [items]);
  const toggle = (ids: string[], on: boolean) => setSel((s) => { const n = new Set(s); for (const id of ids) on ? n.add(id) : n.delete(id); return n; });
  const total = items.filter((g) => sel.has(g.id)).reduce((s, g) => s + Number(g.total), 0);
  const liquidar = useMut(() => api.post('/gas/liquidaciones', { ids: [...sel], via, fecha }), { ok: 'Liquidación registrada', invalidate: ['/gas'], onSuccess: () => setSel(new Set()) });
  return (
    <>
      <PageHeader title="Pagar gastos" icon={HandCoins} subtitle="Gastos aprobados pendientes de pagar a cada persona." />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {isLoading ? (
            <Spinner />
          ) : !grupos.length ? (
            <Card>
              <EmptyState icon={Banknote} title="No hay gastos aprobados pendientes de pagar" />
            </Card>
          ) : (
            grupos.map(([pid, g]) => {
              const ids = g.items.map((x) => x.id);
              const todos = ids.every((id) => sel.has(id));
              return (
                <Card key={pid} className="overflow-hidden">
                  <div className="flex items-center justify-between px-5 pb-2 pt-4">
                    <Checkbox checked={todos} onChange={(v) => toggle(ids, v)} label={<b>{g.persona}</b>} />
                    <span className="font-semibold">{fmtMoney(g.items.reduce((s, x) => s + Number(x.total), 0))}</span>
                  </div>
                  <ul className="divide-y divide-line">
                    {g.items.map((x) => (
                      <li key={x.id} className="flex items-center gap-3 px-4 py-2 text-[13.5px]">
                        <Checkbox checked={sel.has(x.id)} onChange={(v) => toggle([x.id], v)} />
                        <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-primary" onClick={() => setAbierto(x.id)}>
                          {fmtDate(x.fecha)} · {x.comercio || x.concepto}
                          {x.tipo === 'tarjeta' && <span className="text-muted"> · tarjeta de empresa</span>}
                        </button>
                        <span className="tabular-nums">{fmtMoney(x.total)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })
          )}
        </div>
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <p className="text-[13px] text-muted">Seleccionado</p>
            <p className="font-display text-[26px] font-bold">{fmtMoney(total)}</p>
            <Field label="Cómo se paga">
              <Select value={via} onChange={(e) => setVia(e.target.value)} options={LIQUIDACION_VIAS} />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Button variant="primary" className="w-full" disabled={!sel.size} loading={liquidar.isPending} onClick={() => liquidar.mutate(undefined)}>
              Registrar pago
            </Button>
            <p className="text-[12px] text-muted">{via === 'nomina' ? 'Se sumará a la próxima nómina de cada persona.' : 'Se crea un pago pendiente en tesorería para cada persona.'}</p>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Últimas liquidaciones" />
            <ul className="divide-y divide-line">
              {(hist.data ?? []).slice(0, 10).map((l) => (
                <li key={l.id} className="flex justify-between px-4 py-2 text-[13px]">
                  <span>
                    {fmtDate(l.fecha)} · {optionLabel(LIQUIDACION_VIAS, l.via)?.label}
                  </span>
                  <span className="font-medium">{fmtMoney(l.total)}</span>
                </li>
              ))}
              {!hist.data?.length && <li className="px-4 py-3 text-center text-[13px] text-muted">Ninguna todavía.</li>}
            </ul>
          </Card>
        </div>
      </div>
      {abierto && <GastoSheet id={abierto} onClose={() => setAbierto(null)} />}
    </>
  );
}
