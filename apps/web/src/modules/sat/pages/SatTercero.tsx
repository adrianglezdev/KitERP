import { Link } from 'react-router-dom';
import { Copy, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, fmtDateTime } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Button, Card, CardHeader, EnumBadge, Spinner } from '@/components/ui';
import { CONTRATO_ESTADOS, ORDEN_ESTADOS, TICKET_ESTADOS } from '../lib';

/** Pestaña "Servicio técnico" en la ficha del cliente (solo para quien tiene permisos del SAT). */
export default function SatTercero({ id }: { id: string }) {
  const { data, isLoading } = useApi<any>(`/sat/terceros/${id}/resumen`);
  const portal = useMut(() => api.post<{ url: string }>(`/sat/terceros/${id}/portal`, {}), {
    invalidate: [`/sat/terceros/${id}`],
    onSuccess: (r) => navigator.clipboard.writeText(r.url).then(() => toast.success('Enlace del portal copiado')).catch(() => toast.info(r.url)),
  });
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-5">
      {data.puedeGestionar && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sunken px-4 py-3 text-[13px]">
          <span className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Portal de asistencia del cliente: ve sus equipos y abre avisos sin llamar.
          </span>
          <Button size="sm" icon={Copy} loading={portal.isPending} onClick={() => portal.mutate(undefined)}>
            {data.enlacePortal ? 'Copiar enlace' : 'Crear enlace'}
          </Button>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title={`Equipos (${data.equipos.length})`} />
          <ul className="divide-y divide-line">
            {data.equipos.map((e: any) => (
              <li key={e.id}>
                <Link to={`/sat/equipos/${e.id}`} className="block px-4 py-2.5 hover:bg-sunken">
                  <span className="block text-[13.5px] font-medium">{e.nombre}</span>
                  <span className="text-[12px] text-muted">
                    {[e.marca, e.modelo, e.ubicacion].filter(Boolean).join(' · ')}
                    {e.garantiaHasta && ` · garantía hasta ${fmtDate(e.garantiaHasta)}`}
                  </span>
                </Link>
              </li>
            ))}
            {!data.equipos.length && <li className="px-4 py-5 text-center text-[13px] text-muted">Sin equipos registrados.</li>}
          </ul>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Tickets" />
          <ul className="divide-y divide-line">
            {data.tickets.map((t: any) => (
              <li key={t.id}>
                <Link to={`/sat/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{t.asunto}</span>
                    <span className="text-[12px] text-muted">
                      {t.codigo} · {fmtDateTime(t.creadoEn)}
                      {t.valoracion ? ` · ${'★'.repeat(t.valoracion)}` : ''}
                    </span>
                  </span>
                  <EnumBadge options={TICKET_ESTADOS} value={t.estado} />
                </Link>
              </li>
            ))}
            {!data.tickets.length && <li className="px-4 py-5 text-center text-[13px] text-muted">Sin tickets.</li>}
          </ul>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Órdenes de trabajo" />
          <ul className="divide-y divide-line">
            {data.ordenes.map((o: any) => (
              <li key={o.id}>
                <Link to={`/sat/ordenes/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                  <span className="w-24 font-medium">{o.codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{o.tecnico ?? 'Sin técnico'}</span>
                  <EnumBadge options={ORDEN_ESTADOS} value={o.estado} />
                </Link>
              </li>
            ))}
            {!data.ordenes.length && <li className="px-4 py-5 text-center text-[13px] text-muted">Sin órdenes.</li>}
          </ul>
        </Card>
        {data.contratos && (
          <Card className="overflow-hidden">
            <CardHeader title="Contratos" />
            <ul className="divide-y divide-line">
              {data.contratos.map((c: any) => (
                <li key={c.id}>
                  <Link to={`/sat/contratos/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{c.nombre}</span>
                      <span className="text-[12px] text-muted">{c.proximaVisita ? `Próxima visita ${fmtDate(c.proximaVisita)}` : c.codigo}</span>
                    </span>
                    <EnumBadge options={CONTRATO_ESTADOS} value={c.estado} />
                  </Link>
                </li>
              ))}
              {!data.contratos.length && <li className="px-4 py-5 text-center text-[13px] text-muted">Sin contratos.</li>}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
