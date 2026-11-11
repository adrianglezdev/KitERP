import { useState } from 'react';
import { CheckCheck, ClipboardCheck } from 'lucide-react';
import { fmtDate, fmtMoney, optionLabel } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Button, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { GASTO_CATEGORIAS, GASTO_TIPOS, GastoSheet } from '../comun';

/** Gastos de mi equipo pendientes de aprobar. Nadie aprueba los suyos. */
export default function Aprobar() {
  const { data, isLoading } = useApi<any>('/gas/gastos?vista=aprobar&pageSize=200');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState<string | null>(null);
  const lote = useMut(() => api.post('/gas/gastos/aprobar-lote', { ids: [...sel] }), { ok: (r: any) => `${r.aprobados} gastos aprobados`, invalidate: ['/gas'], onSuccess: () => setSel(new Set()) });
  const items: any[] = data?.items ?? [];
  const sumaSel = items.filter((g) => sel.has(g.id)).reduce((s, g) => s + Number(g.total), 0);
  return (
    <>
      <PageHeader
        title="Gastos por aprobar"
        icon={ClipboardCheck}
        subtitle="Revisa el ticket y apruébalo o recházalo con un motivo."
        actions={
          sel.size > 0 && (
            <Button variant="primary" icon={CheckCheck} loading={lote.isPending} onClick={() => lote.mutate(undefined)}>
              Aprobar {sel.size} ({fmtMoney(sumaSel)})
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        {!isLoading && !items.length ? (
          <EmptyState icon={CheckCheck} title="Nada pendiente">
            No tienes gastos por aprobar.
          </EmptyState>
        ) : (
          <DataTable
            rows={items}
            loading={isLoading}
            selectable
            selected={sel}
            onSelect={(id, on) => setSel((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; })}
            onRowClick={(g: any) => setAbierto(g.id)}
            columns={[
              { key: 'persona', header: 'Persona', cell: (g: any) => <span className="font-medium">{g.persona}</span> },
              { key: 'fecha', header: 'Fecha', cell: (g: any) => fmtDate(g.fecha), width: '110px' },
              { key: 'concepto', header: 'Concepto', cell: (g: any) => <span className="line-clamp-1">{g.comercio || g.concepto}</span> },
              { key: 'tipo', header: 'Tipo', cell: (g: any) => optionLabel(GASTO_CATEGORIAS, g.categoria)?.label ?? optionLabel(GASTO_TIPOS, g.tipo)?.label, hideBelow: 'md' },
              { key: 'ticket', header: 'Ticket', cell: (g: any) => (g.archivoId ? 'Sí' : <span className="text-warn">Sin ticket</span>), hideBelow: 'lg' },
              { key: 'total', header: 'Importe', align: 'right', cell: (g: any) => <span className="font-semibold tabular-nums">{fmtMoney(g.total)}</span> },
            ]}
            mobileTitle={(g: any) => `${g.persona} · ${g.comercio || g.concepto}`}
            mobileSubtitle={(g: any) => fmtDate(g.fecha)}
            mobileRight={(g: any) => <span className="font-semibold">{fmtMoney(g.total)}</span>}
          />
        )}
      </Card>
      {abierto && <GastoSheet id={abierto} onClose={() => setAbierto(null)} />}
    </>
  );
}
