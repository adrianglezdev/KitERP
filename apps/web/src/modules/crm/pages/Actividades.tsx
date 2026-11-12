import { Link } from 'react-router-dom';
import { CalendarClock, MessagesSquare, UserX } from 'lucide-react';
import { crmShared, fmtDate } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Card, CardHeader, PageHeader } from '@/components/ui';
import { ResourceList } from '@/components/resource';

export default function Actividades() {
  const agenda = useApi<any[]>('/crm/agenda');
  const sinContacto = useApi<any[]>('/crm/sin-contacto?dias=90');
  const hoy = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Actividad comercial" icon={MessagesSquare} subtitle="Llamadas, visitas y reuniones con clientes, y lo que queda pendiente de hacer." />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <ResourceList def={crmShared.actividadResource} endpoint="/crm/actividades" createPerm="crm.editar" initial={{ fecha: new Date().toISOString().slice(0, 16) }} />
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Agenda de seguimiento" icon={CalendarClock} subtitle="Próximos 14 días y atrasadas" />
            {!agenda.data?.length ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted">Nada pendiente.</p>
            ) : (
              <ul className="divide-y divide-line">
                {agenda.data.map((a) => (
                  <li key={a.id}>
                    <Link to={`/terceros/${a.terceroId}?tab=crm-actividad`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-sunken">
                      <span className={cn('mt-0.5 shrink-0 rounded-pill px-2 py-0.5 text-[11.5px] font-bold', a.proximaFecha < hoy ? 'bg-bad-soft text-bad' : 'bg-sunken text-muted')}>{fmtDate(a.proximaFecha).slice(0, 5)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">{a.proximaAccion ?? a.asunto}</span>
                        <span className="block truncate text-[12px] text-muted">
                          {a.tercero} · {a.responsable}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Sin contacto en 90 días" icon={UserX} subtitle="Clientes de tu cartera que conviene llamar" />
            {!sinContacto.data?.length ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted">Todos tus clientes tienen actividad reciente.</p>
            ) : (
              <ul className="divide-y divide-line">
                {sinContacto.data.slice(0, 12).map((t) => (
                  <li key={t.id}>
                    <Link to={`/terceros/${t.id}?tab=crm-actividad`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-sunken">
                      <span className="min-w-0 truncate text-[13.5px]">{t.nombre}</span>
                      <span className="shrink-0 text-[12px] text-muted">{t.ultima ? fmtDate(t.ultima) : 'Nunca'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
