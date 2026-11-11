import { Link } from 'react-router-dom';
import { ArrowRight, Inbox, Megaphone, Pin } from 'lucide-react';
import type { ApprovalItem, DashboardWidget } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { relTime } from '@/lib/utils';
import { WidgetCard } from '@/components/charts/Widget';
import { Card, CardHeader, Skeleton } from '@/components/ui';
import { moduleWebs } from '@/modules/registry';

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

export default function Inicio() {
  const { session, has, can } = useSession();
  const widgets = useApi<DashboardWidget[]>('/panel');
  const aprob = useApi<ApprovalItem[]>('/aprobaciones');
  const anuncios = useApi<any[]>('/anuncios');
  const tiles = moduleWebs.filter((m) => has(m.code)).flatMap((m) => (m.portal ?? []).filter((p) => !p.perm || can(p.perm)));
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const sinLeer = (anuncios.data ?? []).filter((a) => !a.leido).slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] capitalize text-muted">{fecha}</p>
        <h1 className="text-[26px] font-extrabold">
          {saludo()}, {session?.user.nombre.split(' ')[0]}
        </h1>
      </div>

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.slice(0, 6).map((t) => (
            <Link key={t.to} to={t.to} className="group flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5 shadow-card transition hover:-translate-y-0.5 hover:border-primary/40">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <t.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[13.5px] font-semibold leading-tight">{t.label}</span>
              {t.description && <span className="-mt-1 text-[12px] leading-tight text-muted">{t.description}</span>}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {(aprob.data?.length ?? 0) > 0 && (
          <Card className="lg:col-span-1">
            <CardHeader
              title="Pendiente de tu aprobación"
              icon={Inbox}
              actions={
                <Link to="/bandeja" className="text-[12.5px] font-medium text-primary">
                  Ver todo
                </Link>
              }
            />
            <ul className="divide-y divide-line">
              {aprob.data!.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <Link to="/bandeja" className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{a.titulo}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {a.solicitante} · {relTime(a.fecha)}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {sinLeer.length > 0 && (
          <Card className="lg:col-span-1">
            <CardHeader
              title="Tablón"
              icon={Megaphone}
              actions={
                <Link to="/tablon" className="text-[12.5px] font-medium text-primary">
                  Abrir
                </Link>
              }
            />
            <ul className="divide-y divide-line">
              {sinLeer.map((a) => (
                <li key={a.id} className="px-4 py-2.5">
                  <Link to="/tablon" className="block">
                    <span className="flex items-center gap-1.5 text-[13.5px] font-medium">
                      {a.fijado && <Pin className="h-3.5 w-3.5 text-primary" />}
                      {a.titulo}
                    </span>
                    <span className="line-clamp-2 text-[12.5px] text-muted">{a.cuerpo}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="grid auto-rows-auto grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {widgets.isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
          : widgets.data?.map((w) => <WidgetCard key={w.id} w={w} />)}
      </div>
    </div>
  );
}
