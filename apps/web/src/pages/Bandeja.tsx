import { Link } from 'react-router-dom';
import { Check, CheckCheck, Inbox, X } from 'lucide-react';
import { moduleInfo, PILLARS, type ApprovalItem } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn, relTime } from '@/lib/utils';
import { Button, Card, CardHeader, EmptyState, PageHeader, Spinner, useConfirm } from '@/components/ui';

/** Todo lo que espera una decisión del usuario, venga del módulo que venga, y sus avisos. */
export default function Bandeja() {
  const confirm = useConfirm();
  const aprob = useApi<ApprovalItem[]>('/aprobaciones');
  const notif = useApi<{ items: any[]; sinLeer: number }>('/notificaciones');
  const decidir = useMut((p: { url: string; motivo?: string }) => api.post(p.url.replace(/^\/api/, ''), p.motivo ? { motivo: p.motivo } : {}), {
    ok: 'Hecho',
    invalidate: ['/aprobaciones', '/panel', '/notificaciones', '/documentos'],
  });
  const leer = useMut(() => api.post('/notificaciones/leer', {}), { invalidate: ['/notificaciones'] });

  return (
    <>
      <PageHeader title="Bandeja" icon={Inbox} subtitle="Aprobaciones pendientes y avisos para ti." />
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader title="Pendiente de tu aprobación" subtitle={aprob.data ? `${aprob.data.length} pendientes` : undefined} />
          {aprob.isLoading ? (
            <Spinner />
          ) : !aprob.data?.length ? (
            <EmptyState icon={CheckCheck} title="Nada pendiente">Cuando alguien de tu equipo pida vacaciones, un gasto, una compra o una corrección de fichaje, aparecerá aquí.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {aprob.data.map((a) => {
                const info = moduleInfo(a.modulo);
                return (
                  <li key={`${a.modulo}-${a.id}`} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[12px] text-muted">
                        <span className="h-2 w-2 rotate-45 rounded-[2px]" style={{ background: info ? PILLARS[info.pillar].color : '#7D2CDD' }} />
                        {a.tipo}
                        <span>· {relTime(a.fecha)}</span>
                      </p>
                      {a.enlace ? (
                        <Link to={a.enlace} className="block truncate text-[14px] font-semibold hover:text-primary">
                          {a.titulo}
                        </Link>
                      ) : (
                        <p className="truncate text-[14px] font-semibold">{a.titulo}</p>
                      )}
                      <p className="truncate text-[12.5px] text-muted">{[a.solicitante, a.detalle].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        icon={X}
                        onClick={async () => {
                          const m = await confirm({ title: 'Rechazar', input: { label: 'Motivo (lo verá quien lo pidió)', required: true }, danger: true, confirm: 'Rechazar' });
                          if (typeof m === 'string') decidir.mutate({ url: a.rechazarUrl, motivo: m });
                        }}
                      >
                        Rechazar
                      </Button>
                      <Button size="sm" variant="success" icon={Check} onClick={() => decidir.mutate({ url: a.aprobarUrl })}>
                        Aprobar
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Avisos"
            actions={
              !!notif.data?.sinLeer && (
                <Button size="sm" variant="ghost" icon={CheckCheck} onClick={() => leer.mutate(undefined)}>
                  Marcar leídos
                </Button>
              )
            }
          />
          {!notif.data?.items.length ? (
            <EmptyState title="Sin avisos" />
          ) : (
            <ul className="divide-y divide-line">
              {notif.data.items.map((n) => (
                <li key={n.id} className={cn('px-4 py-2.5', !n.leidaEn && 'bg-primary-soft/40')}>
                  {n.enlace ? (
                    <Link to={n.enlace} className="block hover:text-primary">
                      <p className="text-[13.5px] font-medium">{n.titulo}</p>
                    </Link>
                  ) : (
                    <p className="text-[13.5px] font-medium">{n.titulo}</p>
                  )}
                  {n.cuerpo && <p className="truncate text-[12.5px] text-muted">{n.cuerpo}</p>}
                  <p className="text-[11.5px] text-muted">{relTime(n.creadoEn)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
