import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCheck, Inbox, X } from 'lucide-react';
import { moduleInfo, PILLARS, type ApprovalItem, type Pillar } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn, PILLAR_CLASSES, relTime } from '@/lib/utils';
import { Button, Card, CardHeader, EmptyState, PageHeader, Segmented, Spinner, useConfirm } from '@/components/ui';

const pilarDe = (modulo: string): Pillar => moduleInfo(modulo)?.pillar ?? 'plataforma';

/** Todo lo que espera una decisión del usuario, venga del módulo que venga, y sus avisos. */
export default function Bandeja() {
  const confirm = useConfirm();
  const aprob = useApi<ApprovalItem[]>('/aprobaciones');
  const notif = useApi<{ items: any[]; sinLeer: number }>('/notificaciones');
  const [filtro, setFiltro] = useState<'todo' | Pillar>('todo');
  const decidir = useMut((p: { url: string; motivo?: string }) => api.post(p.url.replace(/^\/api/, ''), p.motivo ? { motivo: p.motivo } : {}), {
    ok: 'Hecho',
    invalidate: ['/aprobaciones', '/panel', '/notificaciones', '/documentos'],
  });
  const leer = useMut(() => api.post('/notificaciones/leer', {}), { invalidate: ['/notificaciones'] });

  // Filtro por pilar: solo aparecen los que tienen algo pendiente
  const pilares = useMemo(() => {
    const n = new Map<Pillar, number>();
    for (const a of aprob.data ?? []) n.set(pilarDe(a.modulo), (n.get(pilarDe(a.modulo)) ?? 0) + 1);
    return (Object.keys(PILLARS) as Pillar[]).filter((p) => n.has(p)).map((p) => ({ value: p, label: PILLARS[p].label, count: n.get(p)! }));
  }, [aprob.data]);
  const lista = (aprob.data ?? []).filter((a) => filtro === 'todo' || pilarDe(a.modulo) === filtro);

  return (
    <>
      <PageHeader title="Bandeja" icon={Inbox} subtitle="Aprobaciones pendientes y avisos para ti." />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Pendiente de tu aprobación {!!aprob.data?.length && <span className="tag">{aprob.data.length}</span>}
              </span>
            }
          />
          {pilares.length > 1 && (
            <div className="px-5 pb-1 pt-1">
              <Segmented value={filtro} onChange={(v) => setFiltro(v as 'todo' | Pillar)} options={[{ value: 'todo' as const, label: 'Todo' }, ...pilares]} />
            </div>
          )}
          {aprob.isLoading ? (
            <Spinner />
          ) : !lista.length ? (
            <EmptyState icon={CheckCheck} title={aprob.data?.length ? 'Todo al día' : 'Nada pendiente'}>
              {aprob.data?.length ? 'No tienes nada pendiente en esta categoría.' : 'Cuando alguien de tu equipo pida vacaciones, un gasto, una compra o una corrección de fichaje, aparecerá aquí.'}
            </EmptyState>
          ) : (
            <ul className="px-2 pb-3 pt-1">
              {lista.map((a) => (
                <li key={`${a.modulo}-${a.id}`} className="flex flex-col gap-3 rounded-2xl px-3 py-3 transition hover:bg-sunken/60 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className={cn('mt-[7px] h-2 w-2 shrink-0 rounded-full', PILLAR_CLASSES[pilarDe(a.modulo)]!.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] font-bold text-primary">
                        {a.tipo} · {relTime(a.fecha)}
                      </p>
                      {a.enlace ? (
                        <Link to={a.enlace} className="block text-[14px] font-bold hover:text-primary">
                          {a.titulo}
                        </Link>
                      ) : (
                        <p className="text-[14px] font-bold">{a.titulo}</p>
                      )}
                      <p className="text-[12.5px] text-muted">{[a.solicitante, a.detalle].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 pl-5 sm:pl-0">
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
              ))}
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
            <ul className="px-2 pb-3 pt-1">
              {notif.data.items.map((n) => {
                const cuerpo = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-bold">{n.titulo}</span>
                      {n.cuerpo && <span className="block text-[12.5px] text-muted">{n.cuerpo}</span>}
                      <span className="block text-[11.5px] text-muted">{relTime(n.creadoEn)}</span>
                    </span>
                    {!n.leidaEn && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-earth" aria-label="Sin leer" />}
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.enlace ? (
                      <Link to={n.enlace} className="flex items-start gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-sunken/60">
                        {cuerpo}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3 rounded-2xl px-3 py-2.5">{cuerpo}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
