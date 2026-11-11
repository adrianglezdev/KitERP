import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Archive, Clock, FileText, KanbanSquare, Package, Pencil, Plus, Receipt, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, fmtMoney, optionLabel, pryShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, CardHeader, DataTable, EnumBadge, IconButton, KeyValue, PageHeader, ProgressBar, Select, Spinner, Stat, Tabs, useConfirm, useTab } from '@/components/ui';
import { ResourceFormDialog } from '@/components/resource';
import { EntityTabsView } from '@/components/entity/EntityPage';
import type { ResourceDef } from '@kite/shared';

const { PROYECTO_ESTADOS, TAREA_ESTADOS, PARTIDA_TIPOS, HITO_ESTADOS, FACTURACION_TIPOS, proyectoResource, tareaResource, faseResource, partidaResource, hitoResource } = pryShared;

export default function ProyectoDetalle() {
  const { id } = useParams();
  const { data: p, isLoading } = useApi<any>(`/pry/proyectos/${id}`);
  const tab = useTab('tareas');
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const archivar = useMut(() => api.del(`/pry/proyectos/${id}`), { ok: 'Proyecto archivado', invalidate: ['/pry'] });
  const restaurar = useMut(() => api.post(`/pry/proyectos/${id}/restaurar`, {}), { ok: 'Proyecto restaurado', invalidate: ['/pry'] });
  if (isLoading || !p) return <Spinner />;
  const ed = p._puedeEditar;
  const refs = p._refs ?? {};
  return (
    <div className="space-y-5">
      <PageHeader
        back="/proyectos"
        crumbs={[{ label: 'Proyectos', to: '/proyectos' }, { label: p.codigo }]}
        title={p.nombre}
        icon={KanbanSquare}
        subtitle={
          <span>
            {p.codigo}
            {p.clienteId && (
              <>
                {' · '}
                <Link to={`/terceros/${p.clienteId}`} className="font-medium text-fg hover:text-primary">
                  {refs.clientes?.[p.clienteId] ?? 'Cliente'}
                </Link>
              </>
            )}
          </span>
        }
        badges={<EnumBadge options={PROYECTO_ESTADOS} value={p.estado} />}
        actions={
          ed && (
            <>
              <Button icon={Pencil} onClick={() => setEdit(true)}>
                Editar
              </Button>
              {p.archivadoEn ? (
                <Button icon={RotateCcw} onClick={() => restaurar.mutate(undefined)}>
                  Restaurar
                </Button>
              ) : (
                <IconButton icon={Archive} label="Archivar" onClick={async () => (await confirm({ title: 'Archivar el proyecto', message: 'Deja de aparecer en las listas. Sus horas y costes se conservan.', confirm: 'Archivar', danger: true })) && archivar.mutate(undefined)} />
              )}
            </>
          )
        }
      />
      <Tabs
        tabs={[
          { id: 'tareas', label: 'Tareas' },
          { id: 'plan', label: 'Fases y partidas' },
          { id: 'horas', label: 'Horas' },
          { id: 'material', label: 'Material' },
          { id: 'hitos', label: 'Facturación' },
          { id: 'rentabilidad', label: 'Rentabilidad' },
          { id: 'info', label: 'Datos y archivos' },
        ]}
      />
      {tab === 'tareas' && <Tareas p={p} />}
      {tab === 'plan' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Hijos p={p} path="fases" def={faseResource} titulo="Fases" />
          <Hijos p={p} path="partidas" def={partidaResource} titulo="Partidas" />
        </div>
      )}
      {tab === 'horas' && <Horas p={p} />}
      {tab === 'material' && <Material p={p} />}
      {tab === 'hitos' && <Hitos p={p} />}
      {tab === 'rentabilidad' && <Rentabilidad p={p} />}
      {tab === 'info' && (
        <div className="space-y-5">
          <Card className="p-4">
            <KeyValue
              items={[
                { label: 'Responsable', value: refs.personas?.[p.responsableId] },
                { label: 'Facturación', value: optionLabel(FACTURACION_TIPOS, p.tipoFacturacion)?.label },
                { label: 'Inicio', value: p.fechaInicio ? fmtDate(p.fechaInicio) : null },
                { label: 'Fin previsto', value: p.fechaFin ? fmtDate(p.fechaFin) : null },
                { label: 'Venta prevista', value: p.presupuestoVenta ? fmtMoney(p.presupuestoVenta) : null },
                { label: 'Coste previsto', value: p.presupuestoCoste ? fmtMoney(p.presupuestoCoste) : null },
                { label: 'Presupuesto', value: p.presupuestoId ? <Link to={`/documentos/${p.presupuestoId}`} className="text-primary hover:underline">{refs.documentos?.[p.presupuestoId] ?? 'Ver'}</Link> : null },
                { label: 'Equipo', value: (p.miembros ?? []).map((m: string) => refs.personas?.[m]).filter(Boolean).join(', ') || null },
                { label: 'Descripción', value: p.descripcion, span: 2 },
              ]}
            />
          </Card>
          <EntityTabsView entidad="proyecto" id={p.id} record={p} tabs={[]} common={['adjuntos', 'comentarios', 'actividad']} />
        </div>
      )}
      <ResourceFormDialog open={edit} onOpenChange={setEdit} def={proyectoResource} endpoint="/pry/proyectos" record={p} />
    </div>
  );
}

/** Lista genérica de elementos hijos (fases, partidas, hitos) con alta y edición. */
function Hijos({ p, path, def, titulo, extra }: { p: any; path: string; def: ResourceDef; titulo: string; extra?: (r: any) => React.ReactNode }) {
  const url = `/pry/proyectos/${p.id}/${path}`;
  const { data } = useApi<{ items: any[] }>(url);
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const confirm = useConfirm();
  const del = useMut((sid: string) => api.del(`${url}/${sid}`), { ok: 'Borrado', invalidate: ['/pry'] });
  return (
    <Card className="overflow-hidden">
      <CardHeader title={titulo} actions={p._puedeEditar && <Button size="sm" icon={Plus} onClick={() => setEdit(null)}>Añadir</Button>} />
      <ul className="divide-y divide-line">
        {(data?.items ?? []).map((r) => (
          <li key={r.id} className="flex items-center gap-2 px-4 py-2.5 text-[13.5px]">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r[def.titleField]}</span>
              <span className="text-[12px] text-muted">
                {path === 'partidas' && `${optionLabel(PARTIDA_TIPOS, r.tipo)?.label} · ${Number(r.horasPrevistas || 0)} h · coste ${fmtMoney(r.costePrevisto ?? 0)} · venta ${fmtMoney(r.ventaPrevista ?? 0)}`}
                {path === 'fases' && [r.fechaInicio && fmtDate(r.fechaInicio), r.fechaFin && fmtDate(r.fechaFin)].filter(Boolean).join(' → ')}
                {path === 'hitos' && `${r.fecha ? fmtDate(r.fecha) : 'Sin fecha'} · ${fmtMoney(r.importe)}${r.porcentaje ? ` (${Number(r.porcentaje)} %)` : ''}`}
              </span>
            </span>
            {extra?.(r)}
            {p._puedeEditar && !(path === 'hitos' && r.estado === 'facturado') && (
              <>
                <IconButton icon={Pencil} label="Editar" size="sm" onClick={() => setEdit(r)} />
                <IconButton icon={Trash2} label="Borrar" size="sm" onClick={async () => (await confirm({ title: `Borrar "${r[def.titleField]}"`, danger: true, confirm: 'Borrar' })) && del.mutate(r.id)} />
              </>
            )}
          </li>
        ))}
        {!data?.items.length && <li className="px-4 py-4 text-center text-[13px] text-muted">Nada todavía.</li>}
      </ul>
      <ResourceFormDialog open={edit !== undefined} onOpenChange={(o) => !o && setEdit(undefined)} def={def} endpoint={url} record={edit ?? undefined} onSaved={(r: any) => r?._aviso && toast.warning(r._aviso)} />
    </Card>
  );
}

function Tareas({ p }: { p: any }) {
  const url = `/pry/proyectos/${p.id}/tareas`;
  const { data } = useApi<{ items: any[]; refs: any }>(url);
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const mover = useMut(({ sid, estado }: { sid: string; estado: string }) => api.patch<any>(`${url}/${sid}`, { estado }), { invalidate: [url], onSuccess: (r) => r?._aviso && toast.warning(r._aviso) });
  const items = data?.items ?? [];
  const refs = data?.refs ?? {};
  const def = useMemo(() => {
    const f = { ...tareaResource.fields } as Record<string, any>;
    for (const k of ['faseId', 'dependeDeId', 'partidaId']) f[k] = { ...f[k], refFilter: { proyectoId: p.id } };
    return { ...tareaResource, fields: f } as ResourceDef;
  }, [p.id]);
  return (
    <>
      {p._puedeEditar && (
        <div className="mb-3 flex justify-end">
          <Button icon={Plus} onClick={() => setEdit(null)}>
            Tarea
          </Button>
        </div>
      )}
      <div className="scroll-thin -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {TAREA_ESTADOS.map((col) => {
          const ts = items.filter((t) => t.estado === col.value);
          return (
            <div key={col.value} className="w-72 shrink-0 snap-start rounded-2xl bg-sunken/60 p-2 lg:w-auto">
              <p className="mb-2 flex items-center justify-between px-1 text-[13px] font-semibold">
                <EnumBadge options={TAREA_ESTADOS} value={col.value} /> <span className="text-muted">{ts.length}</span>
              </p>
              <div className="space-y-2">
                {ts.map((t) => (
                  <Card key={t.id} className="cursor-pointer p-3 hover:shadow-pop" onClick={() => setEdit(t)}>
                    <p className="text-[13.5px] font-medium">{t.titulo}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                      {t.prioridad === 'alta' && <Badge tone="red">Alta</Badge>}
                      {t.asignadoId && <span>{refs.personas?.[t.asignadoId]}</span>}
                      {t.fechaFin && <span className={cn(t.fechaFin < new Date().toISOString().slice(0, 10) && t.estado !== 'hecha' && 'font-semibold text-bad')}>· {fmtDate(t.fechaFin)}</span>}
                      {t.estimacionHoras && <span>· {Number(t.estimacionHoras)} h</span>}
                    </p>
                    <Select
                      className="mt-2 h-8 text-[12.5px]"
                      value={t.estado}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => mover.mutate({ sid: t.id, estado: e.target.value })}
                      options={TAREA_ESTADOS}
                    />
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <ResourceFormDialog
        open={edit !== undefined}
        onOpenChange={(o) => !o && setEdit(undefined)}
        def={def}
        endpoint={url}
        record={edit ?? undefined}
        onSaved={(r: any) => r?._aviso && toast.warning(r._aviso)}
      />
    </>
  );
}

function Horas({ p }: { p: any }) {
  const { data, isLoading } = useApi<any[]>(`/pry/imputaciones?proyectoId=${p.id}`);
  const del = useMut((iid: string) => api.del(`/pry/imputaciones/${iid}`), { ok: 'Imputación borrada', invalidate: ['/pry'] });
  const total = (data ?? []).reduce((s, i) => s + Number(i.horas), 0);
  return (
    <Card className="overflow-hidden">
      <CardHeader title={`Horas imputadas · ${total.toLocaleString('es-ES')} h`} icon={Clock} actions={<Link to="/mis-horas" className="text-[12.5px] font-semibold text-primary">Imputar mis horas</Link>} />
      <DataTable
        dense
        loading={isLoading}
        rows={data ?? []}
        empty="Aún no hay horas imputadas."
        columns={[
          { key: 'fecha', header: 'Fecha', cell: (i: any) => fmtDate(i.fecha), width: '100px' },
          { key: 'persona', header: 'Persona', cell: (i: any) => i.persona },
          { key: 'tarea', header: 'Tarea / partida', cell: (i: any) => i.tarea ?? i.partida ?? '—', hideBelow: 'md' },
          { key: 'desc', header: 'Descripción', cell: (i: any) => <span className="line-clamp-1 text-muted">{i.descripcion}</span>, hideBelow: 'lg' },
          { key: 'horas', header: 'Horas', align: 'right', cell: (i: any) => Number(i.horas).toLocaleString('es-ES') },
          ...(data?.[0]?.costeHora != null ? [{ key: 'coste', header: 'Coste', align: 'right' as const, cell: (i: any) => fmtMoney(Number(i.horas) * Number(i.costeHora ?? 0)) }] : []),
          { key: 'x', header: '', cell: (i: any) => (p._puedeEditar ? <IconButton icon={Trash2} label="Borrar" size="sm" onClick={() => del.mutate(i.id)} /> : null), width: '40px' },
        ]}
        mobileTitle={(i: any) => `${i.persona} · ${Number(i.horas)} h`}
        mobileSubtitle={(i: any) => `${fmtDate(i.fecha)} · ${i.tarea ?? i.descripcion ?? ''}`}
      />
    </Card>
  );
}

function Material({ p }: { p: any }) {
  const { data, isLoading } = useApi<any[]>(`/pry/proyectos/${p.id}/material`);
  const devolver = useMut((cid: string) => api.post(`/pry/material/${cid}/devolver`, {}), { ok: 'Material devuelto al almacén', invalidate: ['/pry', '/stk'] });
  const total = (data ?? []).reduce((s, c) => s + c.importe, 0);
  return (
    <Card className="overflow-hidden">
      <CardHeader title={`Material consumido · ${fmtMoney(total)}`} icon={Package} subtitle="Se descuenta del almacén o la furgoneta y suma al coste del proyecto." />
      <DataTable
        dense
        loading={isLoading}
        rows={data ?? []}
        empty="No se ha consumido material."
        columns={[
          { key: 'fecha', header: 'Fecha', cell: (c: any) => fmtDate(c.fecha), width: '100px' },
          { key: 'art', header: 'Material', cell: (c: any) => <span className="line-clamp-1">{c.referencia ? `${c.referencia} · ` : ''}{c.descripcion}</span> },
          { key: 'alm', header: 'Desde', cell: (c: any) => c.almacen ?? '—', hideBelow: 'lg' },
          { key: 'cant', header: 'Cantidad', align: 'right', cell: (c: any) => Number(c.cantidad).toLocaleString('es-ES') },
          { key: 'imp', header: 'Coste', align: 'right', cell: (c: any) => fmtMoney(c.importe) },
          { key: 'x', header: '', width: '40px', cell: (c: any) => (c.cantidad > 0 && !c.devueltoDeId ? <IconButton icon={Undo2} label="Devolver" size="sm" onClick={() => devolver.mutate(c.id)} /> : null) },
        ]}
        mobileTitle={(c: any) => c.descripcion}
        mobileRight={(c: any) => fmtMoney(c.importe)}
      />
    </Card>
  );
}

function Hitos({ p }: { p: any }) {
  const nav = useNavigate();
  const facturar = useMut((sid: string) => api.post<any>(`/pry/proyectos/${p.id}/hitos/${sid}/facturar`, {}), { ok: 'Factura en borrador creada', invalidate: ['/pry'], onSuccess: (r) => nav(`/documentos/${r.documentoId}`) });
  const docs = useApi<any[]>(`/pry/proyectos/${p.id}/documentos-resumen`);
  return (
    <div className="space-y-5">
      <Hijos
        p={p}
        path="hitos"
        def={hitoResource}
        titulo="Hitos de facturación"
        extra={(h) => (
          <>
            <EnumBadge options={HITO_ESTADOS} value={h.estado} />
            {h.estado !== 'facturado' && p._puedeFacturar && (
              <Button size="sm" icon={Receipt} loading={facturar.isPending} onClick={() => facturar.mutate(h.id)}>
                Facturar
              </Button>
            )}
            {h.documentoId && (
              <Link to={`/documentos/${h.documentoId}`}>
                <IconButton icon={FileText} label="Ver factura" size="sm" />
              </Link>
            )}
          </>
        )}
      />
      {!!docs.data?.length && (
        <Card className="p-4">
          <p className="label mb-2">Documentos vinculados al proyecto</p>
          <div className="flex flex-wrap gap-2 text-[13px]">
            {docs.data.map((d) => (
              <Badge key={d.tipo} tone="violet">
                {d.n} {d.tipo.replace(/_/g, ' ')} · {fmtMoney(d.base)}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Rentabilidad({ p }: { p: any }) {
  const { data: r, isLoading } = useApi<pryShared.Rentabilidad>(`/pry/proyectos/${p.id}/rentabilidad`);
  if (isLoading || !r) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Facturado" value={fmtMoney(r.real.facturado)} hint={`Previsto ${fmtMoney(r.prevista.venta)}`} tone="green" />
        <Stat label="Coste real" value={fmtMoney(r.real.coste)} hint={`Previsto ${fmtMoney(r.prevista.coste)}`} tone="yellow" />
        <Stat label="Margen" value={fmtMoney(r.real.margen)} hint={`${r.real.margenPct} %`} tone={r.real.margen < 0 ? 'red' : 'violet'} />
        <Stat label="Horas" value={`${r.real.horas.toLocaleString('es-ES')} h`} hint={`Previstas ${r.prevista.horas} h`} tone="violet" />
      </div>
      <Card className="p-4">
        <p className="mb-1 flex justify-between text-[13px]">
          <span>Avance</span>
          <b>{r.avance}%</b>
        </p>
        <ProgressBar value={r.avance} />
        <p className="mt-3 text-[13px] text-muted">
          Coste de horas {fmtMoney(r.real.costeHoras)} · material {fmtMoney(r.real.material)} · compras {fmtMoney(r.real.compras)}
          {r.comprometido > 0 && ` · pedidos pendientes de recibir ${fmtMoney(r.comprometido)}`}
          {r.pendienteFacturar > 0 && ` · pendiente de facturar ${fmtMoney(r.pendienteFacturar)}`}
        </p>
      </Card>
      {r.partidas.some((x) => x.alerta) && (
        <Alert tone="red" icon={AlertTriangle}>
          Hay partidas que superan lo previsto en más de un {r.umbralDesviacion} %.
        </Alert>
      )}
      <Card className="overflow-hidden">
        <CardHeader title="Por partidas" />
        <DataTable
          dense
          rows={r.partidas}
          empty="Sin partidas."
          columns={[
            { key: 'nombre', header: 'Partida', cell: (x: any) => <span className={cn('font-medium', x.alerta && 'text-bad')}>{x.nombre}</span> },
            { key: 'tipo', header: 'Tipo', cell: (x: any) => optionLabel(PARTIDA_TIPOS, x.tipo)?.label, hideBelow: 'md' },
            { key: 'horas', header: 'Horas', align: 'right', cell: (x: any) => `${x.horas} / ${x.horasPrevistas}`, hideBelow: 'md' },
            { key: 'coste', header: 'Coste real / previsto', align: 'right', cell: (x: any) => `${fmtMoney(x.costeReal)} / ${fmtMoney(x.costePrevisto)}` },
            { key: 'desv', header: 'Desviación', align: 'right', cell: (x: any) => (x.desviacionPct == null ? '—' : <span className={cn(x.alerta && 'font-bold text-bad')}>{x.desviacionPct > 0 ? '+' : ''}{x.desviacionPct} %</span>) },
          ]}
          mobileTitle={(x: any) => x.nombre}
          mobileRight={(x: any) => fmtMoney(x.costeReal)}
        />
      </Card>
    </div>
  );
}
