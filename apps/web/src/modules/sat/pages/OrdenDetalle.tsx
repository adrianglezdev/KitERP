import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, Car, CheckCircle2, Clock, ClipboardList, Copy, FileSignature, MapPin, MoreHorizontal, Navigation, Pause, Pencil, Phone, Play, Plus, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { invalidatePrefix, useApi, useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, CardHeader, Dialog, EnumBadge, Field, Input, KeyValue, Menu, NumberInput, PageHeader, RefSelect, Spinner, useConfirm } from '@/components/ui';
import { ResourceFormDialog } from '@/components/resource';
import { EntityTabsView } from '@/components/entity/EntityPage';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, satShared } from '@kite/shared';
import { estadoOpt } from '@/components/docs/config';
import { FotosOrden, ManualesVinculados } from '../components';
import { ParteForm, useParte } from '../ParteForm';
import { aLocal, encolarEstado, esErrorDeRed, guardarLocal, hora, leerLocal, minutosTexto, ORDEN_ESTADOS, ORDEN_TIPOS, PRIORIDADES, telHref, useOnline, vaciarColaEstados } from '../lib';
import { reenviarPartes } from '../parte';

export default function OrdenDetalle() {
  const { id } = useParams();
  const qc = useQueryClient();
  const online = useOnline();
  const confirm = useConfirm();
  const url = `/sat/ordenes/${id}/ficha`;
  const cacheKey = `sat:ficha:${id}`;
  const q = useApi<any>(url, { retry: 1 });
  const o = q.data ?? (q.isError ? leerLocal<any>(cacheKey) : null);
  const deCache = !q.data && !!o;
  const [estadoLocal, setEstadoLocal] = useState<string | null>(null);
  const [editar, setEditar] = useState(false);
  const [presu, setPresu] = useState(false);
  const [, tick] = useState(0);
  const [parte, update] = useParte(o ? { ...o, estado: estadoLocal ?? o.estado } : null);

  useEffect(() => {
    if (q.data) guardarLocal(cacheKey, q.data);
  }, [q.data, cacheKey]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    const sync = async () => {
      const n = (await vaciarColaEstados()) + (await reenviarPartes());
      if (n) invalidatePrefix(qc, '/sat');
    };
    sync();
    window.addEventListener('online', sync);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', sync);
    };
  }, [qc]);

  const recargar = () => invalidatePrefix(qc, '/sat');
  const cancelar = useMut((motivo: string | null) => api.post(`/sat/ordenes/${id}/estado`, { estado: 'cancelada', motivo }), { ok: 'Orden cancelada', invalidate: ['/sat'] });
  const borrar = useMut(() => api.del(`/sat/ordenes/${id}`), { ok: 'Orden archivada', invalidate: ['/sat'], onSuccess: () => history.back() });

  if (q.isLoading) return <Spinner />;
  if (!o) return <Alert tone="red">{errorMessage(q.error) || 'Orden no encontrada'}</Alert>;

  const estado = estadoLocal ?? o.estado;
  const abierta = !['finalizada', 'cancelada'].includes(estado);
  const dir = o.direccion ?? {};
  const telefono = o.contacto?.movil ?? o.contacto?.telefono ?? dir.telefono ?? o.cliente?.telefono;
  const cronoInicio: string | null = o.cronometro?.inicio ?? parte?.cronoLocal ?? null;
  const corriendo = estado === 'en_curso' && !!cronoInicio;

  async function cambiarEstado(nuevo: string) {
    try {
      await api.post(`/sat/ordenes/${id}/estado`, { estado: nuevo });
      setEstadoLocal(null);
      recargar();
      toast.success(nuevo === 'en_ruta' ? 'En ruta' : nuevo === 'en_curso' ? 'Trabajo empezado: el cronómetro está en marcha' : 'Hecho');
    } catch (e) {
      if (!esErrorDeRed(e)) return toast.error(errorMessage(e));
      encolarEstado(id!, nuevo);
      setEstadoLocal(nuevo);
      if (nuevo === 'en_curso') update((p) => ({ ...p, cronoLocal: p.cronoLocal ?? new Date().toISOString() }));
      toast.warning('Sin conexión: se guardará y se enviará al recuperar la cobertura');
    }
  }

  async function crono(accion: 'iniciar' | 'parar') {
    // cronómetro local (se empezó sin cobertura)
    if (parte?.cronoLocal && accion === 'parar') {
      update((p) => ({ ...p, tiempos: [...p.tiempos, { inicio: p.cronoLocal!, fin: new Date().toISOString() }], cronoLocal: null }));
      return;
    }
    try {
      await api.post(`/sat/ordenes/${id}/tiempo/${accion}`);
      recargar();
    } catch (e) {
      if (!esErrorDeRed(e)) return toast.error(errorMessage(e));
      if (accion === 'iniciar') update((p) => ({ ...p, cronoLocal: new Date().toISOString() }));
      else toast.info('Sin conexión: el cronómetro se cerrará al enviar el parte. Puedes ajustar las horas a facturar.');
    }
  }

  const menu = [
    { label: 'Editar y planificar', icon: Pencil, onSelect: () => setEditar(true), hidden: !o.puedeEditar || !abierta || deCache },
    { label: 'Presupuesto de reparación', icon: FileSignature, onSelect: () => setPresu(true), hidden: !o.puedeEditar || !abierta || !o.modulos?.pre || deCache || (o.presupuesto && !['rechazado', 'caducado'].includes(o.presupuesto.estado)) },
    {
      label: 'Cancelar orden',
      icon: Ban,
      danger: true,
      hidden: !o.puedePlanificar || !abierta,
      onSelect: async () => {
        const m = await confirm({ title: 'Cancelar orden', message: 'La orden no se realizará. El ticket seguirá abierto si no tiene otras órdenes.', input: { label: 'Motivo' }, danger: true, confirm: 'Cancelar orden' });
        if (m !== false) cancelar.mutate(m === true ? null : m);
      },
    },
    { label: 'Archivar', icon: Trash2, danger: true, hidden: !o.puedePlanificar || estado === 'finalizada', onSelect: async () => (await confirm({ title: 'Archivar orden', danger: true, confirm: 'Archivar' })) && borrar.mutate(undefined) },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-24 md:pb-6">
      <PageHeader
        back
        crumbs={[{ label: 'Órdenes de trabajo', to: '/sat/ordenes' }, { label: o.codigo }]}
        title={o.cliente?.nombre ?? o.codigo}
        subtitle={
          <span>
            {o.codigo} · {ORDEN_TIPOS.find((t) => t.value === o.tipo)?.label}
            {o.planificadaInicio && ` · ${fmtDate(o.planificadaInicio)} ${hora(o.planificadaInicio)}–${hora(o.planificadaFin)}`}
          </span>
        }
        badges={
          <>
            <EnumBadge options={ORDEN_ESTADOS} value={estado} />
            {o.prioridad !== 'normal' && <EnumBadge options={PRIORIDADES} value={o.prioridad} />}
            {!o.facturable && <Badge tone="green">Sin cargo</Badge>}
          </>
        }
        actions={
          menu.some((m) => !m.hidden) ? (
            <Menu
              trigger={
                <Button icon={MoreHorizontal} aria-label="Más acciones">
                  <span className="sm:hidden">Más</span>
                </Button>
              }
              items={menu}
            />
          ) : undefined
        }
      />

      {(!online || deCache) && (
        <Alert tone="orange" title="Sin conexión">
          {deCache ? 'Estás viendo la última copia guardada de la orden. ' : ''}Lo que hagas se guarda en el móvil y se enviará al recuperar la cobertura.
        </Alert>
      )}
      {estadoLocal && <Alert tone="blue">Cambio de estado pendiente de enviar.</Alert>}

      {/* Acciones principales, grandes para el móvil */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {telefono && (
          <a href={telHref(telefono)} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-surface text-[15px] font-semibold shadow-card active:bg-sunken">
            <Phone className="h-5 w-5 text-primary" /> Llamar
          </a>
        )}
        {o.mapsUrl && (
          <a href={o.mapsUrl} target="_blank" rel="noreferrer" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-surface text-[15px] font-semibold shadow-card active:bg-sunken">
            <Navigation className="h-5 w-5 text-primary" /> Cómo llegar
          </a>
        )}
        {o.puedeEditar && ['pendiente', 'planificada'].includes(estado) && (
          <Button size="lg" className="h-14 text-[15px]" icon={Car} onClick={() => cambiarEstado('en_ruta')}>
            En ruta
          </Button>
        )}
        {o.puedeEditar && ['pendiente', 'planificada', 'en_ruta'].includes(estado) && (
          <Button size="lg" variant="primary" className="h-14 text-[15px]" icon={Play} onClick={() => cambiarEstado('en_curso')}>
            Empezar
          </Button>
        )}
        {o.puedeEditar && estado === 'en_curso' && (
          <>
            <Button size="lg" className="h-14 text-[15px]" icon={corriendo ? Pause : Play} onClick={() => crono(corriendo ? 'parar' : 'iniciar')}>
              {corriendo ? 'Pausar' : 'Reanudar'}
            </Button>
            <Button size="lg" variant="success" className="h-14 text-[15px]" icon={CheckCircle2} onClick={() => document.getElementById('parte')?.scrollIntoView({ behavior: 'smooth' })}>
              Finalizar
            </Button>
          </>
        )}
      </div>
      {estado === 'en_curso' && (
        <div className={cn('flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-medium', corriendo ? 'bg-sun-soft text-warn' : 'bg-sunken text-muted')}>
          <Clock className={cn('h-4 w-4', corriendo && 'animate-pulse')} />
          {corriendo ? `Cronómetro en marcha desde las ${hora(cronoInicio)}` : 'Cronómetro en pausa'} · total {minutosTexto(Math.round((o.minutosTotales ?? 0) + (parte?.tiempos ?? []).reduce((s, t) => s + (Date.parse(t.fin) - Date.parse(t.inicio)) / 60000, 0) + (parte?.cronoLocal ? (Date.now() - Date.parse(parte.cronoLocal)) / 60000 : 0)))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Visita" icon={MapPin} />
            <div className="space-y-3 p-4">
              <div>
                <p className="text-[15px] font-medium">{[dir.direccion, dir.codigoPostal, dir.localidad].filter(Boolean).join(', ') || 'Sin dirección'}</p>
                {dir.nombre && dir.nombre !== o.cliente?.nombre && <p className="text-[13px] text-muted">{dir.nombre}</p>}
              </div>
              {o.descripcion && <p className="whitespace-pre-wrap rounded-lg bg-sunken px-3 py-2 text-[14px]">{o.descripcion}</p>}
              <KeyValue
                items={[
                  { label: 'Contacto', value: o.contacto ? `${o.contacto.nombre} ${o.contacto.apellidos ?? ''}`.trim() : null },
                  { label: 'Teléfono', value: telefono ? <a href={telHref(telefono)} className="text-primary">{telefono}</a> : null },
                  { label: 'Técnico', value: o.tecnico?.nombre },
                  { label: 'Ticket', value: o.ticket ? <Link to={`/sat/tickets/${o.ticket.id}`} className="text-primary hover:underline">{o.ticket.codigo} · {o.ticket.asunto}</Link> : null },
                  { label: 'Contrato', value: o.contrato ? (o.puedePlanificar ? <Link to={`/sat/contratos/${o.contrato.id}`} className="text-primary hover:underline">{o.contrato.codigo} · {o.contrato.nombre}</Link> : `${o.contrato.codigo} · ${o.contrato.nombre}`) : null },
                ]}
              />
            </div>
          </Card>

          {o.equipo && (
            <Card>
              <CardHeader title="Equipo" icon={Wrench} actions={<Link to={`/sat/equipos/${o.equipo.id}`} className="text-[12.5px] font-medium text-primary">Historial</Link>} />
              <div className="p-4">
                <KeyValue
                  items={[
                    { label: 'Equipo', value: o.equipo.nombre },
                    { label: 'Marca y modelo', value: [o.equipo.marca, o.equipo.modelo].filter(Boolean).join(' ') },
                    { label: 'N.º de serie', value: o.equipo.numeroSerie ? <span className="font-mono text-[13px]">{o.equipo.numeroSerie}</span> : null },
                    { label: 'Ubicación', value: o.equipo.ubicacion },
                    {
                      label: 'Garantía',
                      value: o.equipo.garantiaHasta ? (
                        <span className="inline-flex items-center gap-1.5">
                          {o.equipo.garantiaHasta >= new Date().toISOString().slice(0, 10) ? <ShieldCheck className="h-4 w-4 text-ok" /> : null}
                          {o.equipo.garantiaHasta >= new Date().toISOString().slice(0, 10) ? 'En garantía hasta ' : 'Vencida el '}
                          {fmtDate(o.equipo.garantiaHasta)}
                        </span>
                      ) : null,
                    },
                  ]}
                />
              </div>
            </Card>
          )}

          {abierta && o.puedeEditar && parte && <ParteForm orden={{ ...o, estado }} parte={parte} update={update} />}

          {estado === 'finalizada' && <ParteCerrado o={o} />}
          {estado === 'cancelada' && <Alert tone="red" title="Orden cancelada">{o.canceladaMotivo ?? 'Sin motivo indicado.'}</Alert>}
        </div>

        <div className="space-y-4">
          {(o.presupuesto || o.albaran) && (
            <Card>
              <CardHeader title="Documentos" icon={ClipboardList} />
              <ul className="divide-y divide-line">
                {o.presupuesto && <DocFila label="Presupuesto de reparación" d={o.presupuesto} tipo="presupuesto" />}
                {o.albaran && <DocFila label="Albarán" d={o.albaran} tipo="albaran" />}
              </ul>
            </Card>
          )}
          {!deCache && <FotosOrden ordenId={o.id} puedeEditar={o.puedeEditar} />}
          {o.equipo && !deCache && <ManualesVinculados entidad="sat_equipo" id={o.equipo.id} articuloId={o.equipo.articuloId} />}
        </div>
      </div>

      {!deCache && <EntityTabsView entidad="sat_orden" id={o.id} record={o} tabs={[]} common={['comentarios', 'tareas', 'actividad']} canEdit={o.puedeEditar} />}

      <ResourceFormDialog
        open={editar}
        onOpenChange={setEditar}
        def={satShared.ordenResource}
        endpoint="/sat/ordenes"
        record={editar ? { ...o, planificadaInicio: aLocal(o.planificadaInicio), planificadaFin: aLocal(o.planificadaFin), _refs: { clientes: { [o.terceroId]: o.cliente?.nombre }, sat_tecnicos: o.tecnico ? { [o.tecnico.id]: o.tecnico.nombre } : {} } } : null}
        hide={['terceroId', ...(o.puedePlanificar ? [] : ['tecnicoId'])]}
        onSaved={recargar}
      />
      <PresupuestoDialog open={presu} onOpenChange={setPresu} orden={o} onDone={recargar} />
    </div>
  );
}

function DocFila({ label, d, tipo }: { label: string; d: any; tipo: string }) {
  const copiar = () => navigator.clipboard?.writeText(d.enlace).then(() => toast.success('Enlace copiado'), () => toast.info(d.enlace));
  const compartir = async () => {
    try {
      if (navigator.share) await navigator.share({ title: label, url: d.enlace });
      else copiar();
    } catch {
      /* cancelado */
    }
  };
  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-muted">{label}</span>
        <Badge tone={estadoOpt(tipo, d.estado)?.tone ?? 'gray'} dot>
          {estadoOpt(tipo, d.estado)?.label ?? d.estado}
        </Badge>
      </div>
      <p className="text-[14px] font-medium">
        {d.codigo ?? 'Borrador'} · {fmtMoney(d.total)}
      </p>
      {d.enlace && tipo === 'presupuesto' && ['enviado', 'visto'].includes(d.estado) && (
        <div className="flex gap-2">
          <Button size="sm" icon={Copy} onClick={compartir}>
            Enviar enlace al cliente
          </Button>
        </div>
      )}
    </li>
  );
}

function ParteCerrado({ o }: { o: any }) {
  return (
    <Card>
      <CardHeader title="Parte de trabajo" icon={CheckCircle2} subtitle={`Finalizada el ${fmtDateTime(o.finalizadaEn)}`} />
      <div className="space-y-4 p-4 text-[14px]">
        <p className="whitespace-pre-wrap">{o.trabajoRealizado}</p>
        {o.checklist?.length > 0 && (
          <ul className="space-y-1">
            {o.checklist.map((i: any) => (
              <li key={i.id} className="flex items-center gap-2">
                <CheckCircle2 className={cn('h-4 w-4', i.hecho ? 'text-ok' : 'text-muted/40')} />
                <span className={cn(!i.hecho && 'text-muted line-through')}>{i.texto}</span>
              </li>
            ))}
          </ul>
        )}
        {o.materiales?.length > 0 && (
          <div>
            <p className="label mb-1">Material</p>
            <ul className="divide-y divide-line rounded-lg border border-line-strong/70">
              {o.materiales.map((m: any) => (
                <li key={m.id} className="flex justify-between gap-3 px-3 py-2">
                  <span>
                    <span className="mr-2 font-mono text-[12px] text-muted">{m.referencia}</span>
                    {m.descripcion}
                  </span>
                  <span className="tabular shrink-0">
                    {fmtNumber(m.cantidad, 2)} {m.unidad}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <KeyValue
          items={[
            { label: 'Tiempo', value: minutosTexto(o.minutosTotales) },
            { label: 'Firmado por', value: o.firmaNombre },
          ]}
        />
        {o.firmaUrl && <img src={o.firmaUrl} alt="Firma del cliente" className="h-28 rounded-lg border border-line-strong/70 bg-white object-contain p-2" />}
      </div>
    </Card>
  );
}

/** Presupuesto de reparación: el cliente lo acepta desde el enlace público. */
function PresupuestoDialog({ open, onOpenChange, orden, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; orden: any; onDone: () => void }) {
  const [lineas, setLineas] = useState<{ articuloId: string | null; label?: string; descripcion: string; cantidad: number; precio: number | null }[]>([{ articuloId: null, descripcion: '', cantidad: 1, precio: null }]);
  const [obs, setObs] = useState('');
  const [hecho, setHecho] = useState<any>(null);
  const crear = useMut(() => api.post(`/sat/ordenes/${orden.id}/presupuesto`, { lineas: lineas.filter((l) => l.articuloId || l.descripcion.trim()).map((l) => ({ articuloId: l.articuloId, descripcion: l.descripcion || null, cantidad: l.cantidad, precio: l.precio })), observaciones: obs || null, enviar: true }), {
    onSuccess: (r: any) => {
      setHecho(r);
      if (r.aviso) toast.warning(r.aviso);
      onDone();
    },
  });
  const set = (i: number, v: Partial<(typeof lineas)[number]>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...v } : l)));
  const cerrar = () => {
    onOpenChange(false);
    setHecho(null);
    setLineas([{ articuloId: null, descripcion: '', cantidad: 1, precio: null }]);
    setObs('');
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : cerrar())}
      title="Presupuesto de reparación"
      description="El cliente recibe un enlace para revisarlo y aceptarlo con su firma."
      footer={
        hecho ? (
          <Button variant="primary" onClick={cerrar}>
            Hecho
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
            <Button variant="primary" loading={crear.isPending} onClick={() => crear.mutate(undefined)} disabled={!lineas.some((l) => l.articuloId || l.descripcion.trim())}>
              Crear y enviar
            </Button>
          </>
        )
      }
    >
      {hecho ? (
        <div className="space-y-3">
          <Alert tone={hecho.estado === 'pendiente_aprobacion' ? 'orange' : 'green'} title={`Presupuesto ${hecho.codigo} · ${fmtMoney(hecho.total)}`}>
            {hecho.estado === 'pendiente_aprobacion' ? 'El margen es bajo: dirección debe aprobarlo antes de que llegue al cliente.' : 'Listo para el cliente. Comparte el enlace por WhatsApp o email.'}
          </Alert>
          {hecho.enlace && (
            <div className="flex gap-2">
              <Input readOnly value={hecho.enlace} onFocus={(e) => e.target.select()} />
              <Button icon={Copy} onClick={() => navigator.clipboard?.writeText(hecho.enlace).then(() => toast.success('Enlace copiado'))}>
                Copiar
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {lineas.map((l, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-line-strong/70 p-3">
              <RefSelect target="articulos" value={l.articuloId} label={l.label} onChange={(id, opt) => set(i, { articuloId: id, label: opt?.label })} placeholder="Artículo del catálogo (opcional)" />
              <Input placeholder={l.articuloId ? 'Descripción (opcional)' : 'Descripción del trabajo o pieza'} value={l.descripcion} onChange={(e) => set(i, { descripcion: e.target.value })} />
              <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <Field label="Cantidad">
                  <NumberInput value={l.cantidad} onChange={(v) => set(i, { cantidad: v ?? 1 })} decimals={2} />
                </Field>
                <Field label="Precio" help={l.articuloId ? 'Vacío: el de tarifa' : undefined}>
                  <NumberInput value={l.precio} onChange={(v) => set(i, { precio: v })} suffix="€" />
                </Field>
                <Button variant="ghost" icon={Trash2} aria-label="Quitar línea" onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))} />
              </div>
            </div>
          ))}
          <Button size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, { articuloId: null, descripcion: '', cantidad: 1, precio: null }])}>
            Añadir línea
          </Button>
          <Field label="Observaciones para el cliente">
            <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Plazo de la reparación, garantía…" />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
