import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarClock, KanbanSquare, List, Plus, Target } from 'lucide-react';
import { fmtDate, fmtMoney, opoShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Avatar, Button, Card, CardHeader, Dialog, Field, PageHeader, RefSelect, Segmented, Select, Spinner, Textarea } from '@/components/ui';
import { ResourceFormDialog, ResourceList } from '@/components/resource';
import { CHART, Chart } from '@/components/charts/Widget';

interface Etapa {
  id: string;
  nombre: string;
  orden: number;
  probabilidad: number;
  tipo: 'abierta' | 'ganada' | 'perdida';
  color: string;
}

export default function Tablero() {
  const nav = useNavigate();
  const { can } = useSession();
  const [sp, setSp] = useSearchParams();
  const [vista, setVista] = useState<'tablero' | 'lista' | 'prevision'>('tablero');
  const [comercial, setComercial] = useState<string | null>(null);
  const url = `/opo/tablero${comercial ? `?comercialId=${comercial}` : ''}`;
  const { data, isLoading } = useApi<{ etapas: Etapa[]; items: any[] }>(url);
  const [drag, setDrag] = useState<string | null>(null);
  const [perdida, setPerdida] = useState<{ id: string; etapaId: string } | null>(null);
  const creating = sp.get('nuevo') === '1';
  const setCreating = (v: boolean) => {
    const n = new URLSearchParams(sp);
    if (v) n.set('nuevo', '1');
    else n.delete('nuevo');
    setSp(n, { replace: true });
  };

  const mover = useMut((p: { id: string; etapaId: string; motivoPerdida?: string; comentario?: string }) => api.post(`/opo/oportunidades/${p.id}/etapa`, p), { invalidate: ['/opo'] });
  const pedirMover = (id: string, etapaId: string) => {
    const e = data?.etapas.find((x) => x.id === etapaId);
    if (e?.tipo === 'perdida') setPerdida({ id, etapaId });
    else mover.mutate({ id, etapaId });
  };

  const columnas = useMemo(() => (data?.etapas ?? []).map((e) => ({ e, items: (data?.items ?? []).filter((i) => i.etapaId === e.id) })), [data]);
  const abiertas = (data?.items ?? []).filter((i) => data?.etapas.find((e) => e.id === i.etapaId)?.tipo === 'abierta');
  const ponderado = abiertas.reduce((a, i) => a + (i.importe ?? 0) * ((i.probabilidad ?? data?.etapas.find((e) => e.id === i.etapaId)?.probabilidad ?? 0) / 100), 0);

  return (
    <>
      <PageHeader
        title="Oportunidades"
        icon={Target}
        subtitle={
          <>
            {abiertas.length} abiertas · {fmtMoney(abiertas.reduce((a, i) => a + (i.importe ?? 0), 0))} en juego · <b className="text-fg">{fmtMoney(ponderado)}</b> ponderado
          </>
        }
        actions={
          <>
            <div className="w-full sm:w-56">
              <RefSelect target="personas" value={comercial} onChange={setComercial} placeholder="Todos los comerciales" />
            </div>
            {can('opo.editar') && (
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                Nueva oportunidad
              </Button>
            )}
          </>
        }
      />
      <Segmented
        className="mb-4"
        value={vista}
        onChange={setVista}
        options={[
          { value: 'tablero', label: <span className="flex items-center gap-1.5"><KanbanSquare className="h-4 w-4" /> Tablero</span> },
          { value: 'lista', label: <span className="flex items-center gap-1.5"><List className="h-4 w-4" /> Lista</span> },
          { value: 'prevision', label: <span className="flex items-center gap-1.5"><BarChart3 className="h-4 w-4" /> Previsión</span> },
        ]}
      />

      {vista === 'tablero' &&
        (isLoading ? (
          <Spinner />
        ) : (
          <div className="scroll-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
            {columnas.map(({ e, items }) => (
              <div
                key={e.id}
                className={cn('flex w-[280px] shrink-0 flex-col rounded-xl bg-sunken/70 transition', drag && 'ring-2 ring-primary/0 hover:ring-primary/30')}
                onDragOver={(ev) => ev.preventDefault()}
                onDrop={(ev) => {
                  ev.preventDefault();
                  const id = ev.dataTransfer.getData('text/plain');
                  setDrag(null);
                  const it = data?.items.find((i) => i.id === id);
                  if (it && it.etapaId !== e.id) pedirMover(id, e.id);
                }}
              >
                <div className="flex items-center gap-2 px-3 pb-2 pt-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{e.nombre}</span>
                  <span className="text-[12px] text-muted">{items.length}</span>
                </div>
                <p className="px-3 pb-2 text-[12px] text-muted">{fmtMoney(items.reduce((a, i) => a + (i.importe ?? 0), 0))}</p>
                <div className="flex min-h-[80px] flex-1 flex-col gap-2 px-2 pb-2">
                  {items.map((o) => {
                    const tarde = e.tipo === 'abierta' && o.cierrePrevisto && o.cierrePrevisto < new Date().toISOString().slice(0, 10);
                    return (
                      <div
                        key={o.id}
                        draggable={can('opo.editar')}
                        onDragStart={(ev) => {
                          ev.dataTransfer.setData('text/plain', o.id);
                          setDrag(o.id);
                        }}
                        onDragEnd={() => setDrag(null)}
                        onClick={() => nav(`/oportunidades/${o.id}`)}
                        className={cn('cursor-pointer rounded-2xl bg-surface p-3 shadow-card transition hover:bg-sunken/60', drag === o.id && 'opacity-50')}
                      >
                        <p className="line-clamp-2 text-[13.5px] font-medium leading-snug">{o.titulo}</p>
                        <p className="mt-0.5 truncate text-[12px] text-muted">{o.tercero}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="tabular text-[13px] font-semibold">{o.importe ? fmtMoney(o.importe) : '—'}</span>
                          {o.comercial && <Avatar name={o.comercial} size={22} />}
                        </div>
                        {(o.cierrePrevisto || o.presupuesto) && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                            {o.cierrePrevisto && e.tipo === 'abierta' && (
                              <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5', tarde ? 'bg-bad-soft text-bad' : 'bg-sunken text-muted')}>
                                <CalendarClock className="h-3 w-3" />
                                {fmtDate(o.cierrePrevisto)}
                              </span>
                            )}
                            {o.presupuesto && <span className="rounded bg-primary-soft px-1.5 py-0.5 text-primary">{o.presupuesto}</span>}
                          </div>
                        )}
                        {/* En el móvil no hay arrastrar: se cambia la etapa con este selector */}
                        {can('opo.editar') && (
                          <select
                            aria-label="Cambiar etapa"
                            className="mt-2 w-full rounded-md border border-line-strong/70 bg-surface px-2 py-1 text-[12px] md:hidden"
                            value={o.etapaId}
                            onClick={(ev) => ev.stopPropagation()}
                            onChange={(ev) => pedirMover(o.id, ev.target.value)}
                          >
                            {data?.etapas.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.nombre}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}

      {vista === 'lista' && <ResourceList def={opoShared.oportunidadResource} endpoint="/opo/oportunidades" detailPath="/oportunidades" createPerm="opo.editar" fixed={comercial ? { comercialId: comercial } : undefined} />}
      {vista === 'prevision' && <Prevision />}

      <ResourceFormDialog open={creating} onOpenChange={setCreating} def={opoShared.oportunidadResource} endpoint="/opo/oportunidades" onSaved={(r) => nav(`/oportunidades/${r.id}`)} />
      <PerdidaDialog
        open={!!perdida}
        onClose={() => setPerdida(null)}
        onConfirm={(motivoPerdida, comentario) => {
          if (perdida) mover.mutate({ ...perdida, motivoPerdida, comentario });
          setPerdida(null);
        }}
      />
    </>
  );
}

export function PerdidaDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (motivo: string, comentario: string) => void }) {
  const [motivo, setMotivo] = useState('precio');
  const [comentario, setComentario] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Marcar como perdida"
      description="El motivo ayuda a entender por qué se pierden ventas."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => onConfirm(motivo, comentario)}>
            Marcar perdida
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Motivo">
          <Select value={motivo} onChange={(e) => setMotivo(e.target.value)} options={opoShared.MOTIVOS_PERDIDA} />
        </Field>
        <Field label="Comentario (opcional)">
          <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} />
        </Field>
      </div>
    </Dialog>
  );
}

function Prevision() {
  const { data } = useApi<{ porMes: { mes: string; comercial: string; total: number; ponderado: number }[]; perdidas: { motivo: string | null; n: number; importe: number }[] }>('/opo/prevision');
  const meses = useMemo(() => {
    const m = new Map<string, { mes: string; total: number; ponderado: number }>();
    for (const r of data?.porMes ?? []) {
      const x = m.get(r.mes) ?? { mes: r.mes, total: 0, ponderado: 0 };
      x.total += r.total;
      x.ponderado += r.ponderado;
      m.set(r.mes, x);
    }
    return [...m.values()].map((x) => ({ ...x, mes: new Date(x.mes + '-15').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }) }));
  }, [data]);
  const porComercial = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.porMes ?? []) m.set(r.comercial, (m.get(r.comercial) ?? 0) + r.ponderado);
    return [...m.entries()].map(([comercial, ponderado]) => ({ comercial, ponderado }));
  }, [data]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader title="Previsión por mes de cierre" subtitle="Importe total y ponderado por la probabilidad de cada oportunidad abierta" />
        <div className="p-4">
          <Chart chart="bar" data={meses} xKey="mes" series={[{ key: 'total', label: 'Total', color: CHART.soft }, { key: 'ponderado', label: 'Ponderado', color: CHART.primary }]} format="money" height={260} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Ponderado por comercial" />
        <div className="p-4">
          <Chart chart="bar" data={porComercial} xKey="comercial" series={[{ key: 'ponderado', label: 'Ponderado' }]} format="money" />
        </div>
      </Card>
      <Card>
        <CardHeader title="Motivos de pérdida" />
        <ul className="divide-y divide-line">
          {(data?.perdidas ?? []).map((p) => (
            <li key={p.motivo ?? 'x'} className="flex items-center justify-between px-4 py-2.5 text-[13.5px]">
              <span>{opoShared.MOTIVOS_PERDIDA.find((m) => m.value === p.motivo)?.label ?? 'Sin indicar'}</span>
              <span className="text-muted">
                {p.n} · {fmtMoney(p.importe)}
              </span>
            </li>
          ))}
          {!data?.perdidas.length && <li className="px-4 py-6 text-center text-[13px] text-muted">Aún no hay oportunidades perdidas.</li>}
        </ul>
      </Card>
      <Link to="/presupuestos" className="hidden" />
    </div>
  );
}
