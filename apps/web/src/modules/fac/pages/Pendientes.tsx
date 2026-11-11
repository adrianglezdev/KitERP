import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileClock, Receipt } from 'lucide-react';
import { fmtDate, fmtMoney } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Button, Card, CardHeader, EmptyState, PageHeader, Spinner } from '@/components/ui';

interface Alb {
  id: string;
  codigo: string;
  fecha: string;
  total: number;
  baseImponible: number;
  terceroId: string;
  tercero: string;
  origenTipo: string | null;
  referenciaExterna: string | null;
}

/** Albaranes entregados sin facturar, agrupados por cliente. Se pueden facturar juntos en una sola factura. */
export default function Pendientes() {
  const nav = useNavigate();
  const { data, isLoading } = useApi<Alb[]>('/documentos-pendientes/facturar');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const grupos = useMemo(() => {
    const m = new Map<string, { tercero: string; items: Alb[] }>();
    for (const a of data ?? []) {
      const g = m.get(a.terceroId) ?? { tercero: a.tercero, items: [] };
      g.items.push(a);
      m.set(a.terceroId, g);
    }
    return [...m.entries()];
  }, [data]);
  const facturar = useMut((ids: string[]) => api.post<{ id: string }>('/documentos/facturar-albaranes', { ids }), {
    ok: 'Factura creada en borrador. Revísala y emítela.',
    invalidate: ['/documentos'],
    onSuccess: (r) => nav(`/documentos/${r.id}`),
  });
  const toggle = (id: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <>
      <PageHeader title="Pendiente de facturar" icon={FileClock} subtitle="Albaranes entregados (también los partes del servicio técnico) que aún no tienen factura." />
      {isLoading ? (
        <Spinner />
      ) : !grupos.length ? (
        <Card>
          <EmptyState icon={Receipt} title="Todo facturado">No hay albaranes entregados pendientes de facturar.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {grupos.map(([terceroId, g]) => {
            const ids = g.items.map((i) => i.id);
            const elegidos = ids.filter((i) => sel.has(i));
            const total = g.items.reduce((a, i) => a + i.baseImponible, 0);
            return (
              <Card key={terceroId} className="overflow-hidden">
                <CardHeader
                  title={
                    <Link to={`/terceros/${terceroId}`} className="hover:text-primary">
                      {g.tercero}
                    </Link>
                  }
                  subtitle={`${g.items.length} albaranes · ${fmtMoney(total)} de base`}
                  actions={
                    <Button size="sm" variant="primary" icon={Receipt} loading={facturar.isPending} onClick={() => facturar.mutate(elegidos.length ? elegidos : ids)}>
                      {elegidos.length ? `Facturar ${elegidos.length}` : 'Facturar todos'}
                    </Button>
                  }
                />
                <ul className="divide-y divide-line">
                  {g.items.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                      <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={sel.has(a.id)} onChange={(e) => toggle(a.id, e.target.checked)} aria-label={`Seleccionar ${a.codigo}`} />
                      <Link to={`/documentos/${a.id}`} className="min-w-0 flex-1 hover:text-primary">
                        <span className="text-[13.5px] font-medium">{a.codigo}</span>
                        <span className="ml-2 text-[12.5px] text-muted">
                          {fmtDate(a.fecha)}
                          {a.origenTipo === 'sat_orden' && ' · servicio técnico'}
                          {a.referenciaExterna && ` · su ref. ${a.referenciaExterna}`}
                        </span>
                      </Link>
                      <span className="tabular text-[13.5px] font-medium">{fmtMoney(a.baseImponible)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
