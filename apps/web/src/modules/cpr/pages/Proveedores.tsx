import { useNavigate } from 'react-router-dom';
import { Star, Users } from 'lucide-react';
import { fmtMoney, fmtNumber } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Badge, Card, DataTable, PageHeader } from '@/components/ui';

export interface ValoracionProveedor {
  id: string;
  nombre: string;
  nif: string | null;
  localidad: string | null;
  pedidos: number;
  compradoAnio: number;
  recepciones: number;
  puntualidadPct: number | null;
  retrasoMedioDias: number | null;
  plazoMedioDias: number | null;
  incidencias: number;
  incidenciasAbiertas: number;
  pendienteRecibir: number;
  indicePrecio: number | null;
  nota: number | null;
}

export function Nota({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted">—</span>;
  const tone = v >= 7.5 ? 'text-ok' : v >= 5 ? 'text-warn' : 'text-bad';
  return (
    <span className={cn('inline-flex items-center gap-1 font-semibold', tone)}>
      <Star className="h-3.5 w-3.5 fill-current" /> {fmtNumber(v, 1)}
    </span>
  );
}

/** Proveedores con su valoración: puntualidad real frente a la prometida, incidencias y precio frente al más barato. */
export default function Proveedores() {
  const nav = useNavigate();
  const { data, isLoading } = useApi<ValoracionProveedor[]>('/cpr/proveedores');
  return (
    <>
      <PageHeader title="Proveedores" icon={Users} subtitle="Valoración automática con los pedidos, recepciones e incidencias registrados." />
      <Card className="overflow-hidden">
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          onRowClick={(r) => nav(`/terceros/${r.id}?tab=cpr-compras`)}
          columns={[
            { key: 'nombre', header: 'Proveedor', cell: (r) => <span className="font-medium">{r.nombre}</span> },
            { key: 'comprado', header: 'Comprado este año', align: 'right', cell: (r) => fmtMoney(r.compradoAnio) },
            { key: 'pedidos', header: 'Pedidos', align: 'right', hideBelow: 'lg', cell: (r) => r.pedidos },
            { key: 'puntualidad', header: 'Puntualidad', align: 'right', cell: (r) => (r.puntualidadPct === null ? '—' : `${fmtNumber(r.puntualidadPct, 0)} %`) },
            { key: 'retraso', header: 'Retraso medio', align: 'right', hideBelow: 'xl', cell: (r) => (r.retrasoMedioDias === null ? '—' : `${fmtNumber(r.retrasoMedioDias, 1)} d`) },
            { key: 'incidencias', header: 'Incidencias', align: 'right', cell: (r) => (r.incidenciasAbiertas ? <Badge tone="red">{r.incidenciasAbiertas} abiertas</Badge> : r.incidencias) },
            { key: 'precio', header: 'Precio', align: 'right', hideBelow: 'lg', cell: (r) => (r.indicePrecio === null ? '—' : r.indicePrecio <= 1.02 ? <Badge tone="green">El mejor</Badge> : `+${fmtNumber((r.indicePrecio - 1) * 100, 0)} %`) },
            { key: 'nota', header: 'Nota', align: 'right', cell: (r) => <Nota v={r.nota} /> },
          ]}
          mobileSubtitle={(r) => `${fmtMoney(r.compradoAnio)} este año · ${r.puntualidadPct === null ? 'sin entregas' : `${fmtNumber(r.puntualidadPct, 0)} % puntual`}`}
          mobileRight={(r) => <Nota v={r.nota} />}
        />
      </Card>
    </>
  );
}
