import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRightLeft,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileText,
  Link2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
  Stamp,
  Trash2,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { DOC_ESTADOS, ESTADO_PAGO, fmtDate, fmtDateTime, fmtMoney, fmtNumber, type DocTipo } from '@kite/shared';
import { api, download, errorMessage } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, CardHeader, Dialog, EnumBadge, Field, Input, KeyValue, Menu, NumberInput, PageHeader, SignaturePad, Spinner, Textarea, useConfirm, type MenuItem } from '@/components/ui';
import { EntityTabsView } from '@/components/entity/EntityPage';
import { DOC_LIST_PATH, esCompra, tipoLabel } from '@/components/docs/config';

interface Accion {
  id: string;
  label: string;
  icon: LucideIcon;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  run: () => void;
  menu?: boolean;
}

export default function DocumentoVista() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useSession();
  const confirm = useConfirm();
  const url = `/documentos/${id}`;
  const { data: d, isLoading, error } = useApi<any>(url);
  const [enviar, setEnviar] = useState(false);
  const [entregar, setEntregar] = useState(false);
  const [convertir, setConvertir] = useState<string | null>(null);

  const accion = useMut((p: { accion: string; datos?: any }) => api.post(`${url}/accion/${p.accion}`, p.datos ?? {}), {
    invalidate: ['/documentos', '/aprobaciones', '/panel'],
    onSuccess: (r: any) => {
      if (r?.aviso) toast.warning(r.aviso, { duration: 8000 });
      else toast.success('Hecho');
      if (r?.id) nav(`/documentos/${r.id}`);
    },
  });
  const borrar = useMut(() => api.del(url), { ok: 'Documento borrado', invalidate: ['/documentos'], onSuccess: () => nav(DOC_LIST_PATH[d.tipo as DocTipo]) });

  if (isLoading) return <Spinner />;
  if (error || !d) return <Alert tone="red">{errorMessage(error) || 'Documento no encontrado'}</Alert>;

  const tipo = d.tipo as DocTipo;
  const compra = esCompra(tipo);
  const est = d.estado as string;
  const editable = d.puedeEditar && !d.bloqueado;
  const run = (a: string, datos?: any) => accion.mutate({ accion: a, datos });
  const pdfUrl = `/api/documentos/${id}/pdf`;

  const acciones: Accion[] = [];
  const add = (cond: boolean, a: Accion) => cond && acciones.push(a);
  const esFac = ['factura', 'factura_simplificada', 'factura_rectificativa'].includes(tipo);

  // Edición
  add(editable && ['borrador', 'pendiente_aprobacion', 'confirmado', 'aprobado', 'discrepancia', 'enviada'].includes(est), { id: 'editar', label: 'Editar', icon: Pencil, run: () => nav(`${url}/editar`) });

  if (tipo === 'presupuesto') {
    add(d.puedeEditar && ['borrador', 'enviado', 'visto'].includes(est), { id: 'enviar', label: 'Enviar al cliente', icon: Send, variant: 'primary', run: () => setEnviar(true) });
    add(can('pre.aprobar') && est === 'pendiente_aprobacion', { id: 'aprobar', label: 'Aprobar', icon: Check, variant: 'success', run: () => run('aprobar') });
    add(d.puedeEditar && ['borrador', 'enviado', 'visto', 'rechazado', 'caducado'].includes(est), { id: 'aceptar', label: 'Marcar aceptado', icon: CheckCircle2, run: () => run('aceptar'), menu: est === 'borrador' });
    add(d.puedeEditar && ['borrador', 'enviado', 'visto', 'pendiente_aprobacion'].includes(est), {
      id: 'rechazar',
      label: 'Marcar rechazado',
      icon: X,
      menu: true,
      run: async () => {
        const m = await confirm({ title: 'Rechazar presupuesto', input: { label: 'Motivo (ayuda a analizar las ventas perdidas)', required: false }, confirm: 'Rechazar' });
        if (m !== false) run('rechazar', { motivo: m === true ? null : m });
      },
    });
    add(d.puedeEditar && !['aceptado'].includes(est), { id: 'version', label: 'Nueva versión', icon: Copy, menu: true, run: () => run('nueva_version') });
    add(d.puedeEditar && ['rechazado', 'caducado', 'enviado', 'visto'].includes(est), { id: 'reabrir', label: 'Volver a borrador', icon: RotateCcw, menu: true, run: () => run('reabrir') });
  }
  if (tipo === 'pedido') {
    add(d.puedeEditar && est === 'borrador', { id: 'confirmar', label: 'Confirmar pedido', icon: CheckCircle2, variant: 'primary', run: () => run('confirmar') });
    add(can(['ped.preparar', 'ped.editar']) && ['confirmado', 'parcial'].includes(est), { id: 'preparar', label: 'Empezar preparación', icon: Truck, run: () => run('preparar') });
    add(d.puedeEditar && ['borrador', 'confirmado', 'en_preparacion', 'parcial'].includes(est), {
      id: 'cancelar',
      label: 'Cancelar pedido',
      icon: Ban,
      menu: true,
      run: async () => (await confirm({ title: 'Cancelar pedido', message: 'Se liberará el stock reservado.', danger: true, confirm: 'Cancelar pedido' })) && run('cancelar'),
    });
  }
  if (tipo === 'albaran') add(can(['ped.preparar', 'ped.editar']) && est === 'borrador', { id: 'entregar', label: 'Registrar entrega', icon: Truck, variant: 'primary', run: () => setEntregar(true) });
  if (esFac) {
    add(can('fac.emitir') && est === 'borrador', {
      id: 'emitir',
      label: 'Emitir factura',
      icon: Stamp,
      variant: 'primary',
      run: async () =>
        (await confirm({ title: 'Emitir factura', message: 'Recibirá su número definitivo y se generará el registro Verifactu. Después no se podrá modificar: cualquier corrección se hará con una factura rectificativa.', confirm: 'Emitir' })) && run('emitir'),
    });
    add(est === 'emitida', { id: 'enviar', label: 'Enviar por email', icon: Send, variant: 'primary', run: () => setEnviar(true) });
    add(can('fac.emitir') && est === 'emitida' && tipo !== 'factura_rectificativa', {
      id: 'rectificar',
      label: 'Rectificar',
      icon: RotateCcw,
      menu: true,
      run: async () => {
        const m = await confirm({ title: 'Crear factura rectificativa', message: 'Se creará un borrador que anula esta factura en negativo. Podrás ajustar las líneas antes de emitirla.', input: { label: 'Motivo de la rectificación', required: true }, confirm: 'Crear rectificativa' });
        if (typeof m === 'string') run('rectificar', { motivo: m, modo: 'total' });
      },
    });
    add(d.bloqueado, { id: 'facturae', label: 'Descargar Facturae (XML)', icon: FileCode2, menu: true, run: () => download(`/documentos/${id}/facturae`, `${d.codigo}.xml`) });
  }
  if (tipo === 'proforma') add(d.puedeEditar, { id: 'enviar', label: 'Enviar', icon: Send, variant: 'primary', run: () => setEnviar(true) });
  if (tipo === 'pedido_compra') {
    add(d.puedeEditar && est === 'borrador', { id: 'confirmar', label: 'Confirmar pedido', icon: CheckCircle2, variant: 'primary', run: () => run('confirmar') });
    add(can('cpr.aprobar') && est === 'pendiente_aprobacion', { id: 'aprobar', label: 'Aprobar', icon: Check, variant: 'success', run: () => run('aprobar') });
    add(can('cpr.aprobar') && est === 'pendiente_aprobacion', {
      id: 'rechazar',
      label: 'Rechazar',
      icon: X,
      variant: 'danger',
      run: async () => {
        const m = await confirm({ title: 'Rechazar pedido de compra', input: { label: 'Motivo', required: true }, danger: true, confirm: 'Rechazar' });
        if (typeof m === 'string') run('rechazar', { motivo: m });
      },
    });
    add(d.puedeEditar && est === 'aprobado', { id: 'enviar', label: 'Enviar al proveedor', icon: Send, variant: 'primary', run: () => setEnviar(true) });
    add(d.puedeEditar && est === 'aprobado', { id: 'marcar', label: 'Marcar como enviado', icon: Check, menu: true, run: () => run('marcar_enviado') });
    add(d.puedeEditar && ['borrador', 'pendiente_aprobacion', 'aprobado', 'enviado'].includes(est), { id: 'cancelar', label: 'Cancelar pedido', icon: Ban, menu: true, run: async () => (await confirm({ title: 'Cancelar pedido de compra', danger: true, confirm: 'Cancelar pedido' })) && run('cancelar') });
  }
  if (tipo === 'recepcion') add(can(['cpr.recibir', 'cpr.editar']) && est === 'borrador', { id: 'confirmar', label: 'Confirmar recepción', icon: CheckCircle2, variant: 'primary', run: () => run('confirmar') });
  if (tipo === 'factura_proveedor') {
    add(can('cpr.editar') && ['borrador', 'discrepancia'].includes(est), {
      id: 'registrar',
      label: est === 'discrepancia' ? 'Registrar igualmente' : 'Registrar factura',
      icon: Stamp,
      variant: 'primary',
      run: () => run('registrar', { forzar: est === 'discrepancia' }),
    });
  }
  // Conversiones
  for (const t of d.destinos as string[]) {
    if (t === 'factura_rectificativa') continue;
    const ok =
      (tipo === 'presupuesto' && ['borrador', 'enviado', 'visto', 'aceptado'].includes(est)) ||
      (tipo === 'pedido' && ['confirmado', 'en_preparacion', 'parcial'].includes(est)) ||
      (tipo === 'albaran' && est === 'entregado') ||
      (tipo === 'proforma') ||
      (tipo === 'pedido_compra' && ['aprobado', 'enviado', 'parcial'].includes(est)) ||
      (tipo === 'recepcion' && est === 'confirmada');
    add(ok, { id: `conv-${t}`, label: `Crear ${tipoLabel(t).toLowerCase()}`, icon: ArrowRightLeft, run: () => setConvertir(t), variant: acciones.some((a) => a.variant === 'primary') ? undefined : 'primary' });
  }
  add(d.puedeEditar && est === 'borrador' && !d.bloqueado, { id: 'borrar', label: 'Borrar borrador', icon: Trash2, menu: true, run: async () => (await confirm({ title: 'Borrar borrador', message: d.codigo ? 'El número quedará anulado (no se reutiliza para no dejar huecos).' : undefined, danger: true, confirm: 'Borrar' })) && borrar.mutate(undefined) });

  const visibles = acciones.filter((a) => !a.menu);
  const enMenu: MenuItem[] = [
    { label: 'Ver PDF', icon: Eye, onSelect: () => window.open(pdfUrl, '_blank') },
    { label: 'Descargar PDF', icon: Download, onSelect: () => download(`/documentos/${id}/pdf?descargar=1`) },
    ...(d.enlacePublico ? [{ label: 'Copiar enlace para el cliente', icon: Link2, onSelect: () => navigator.clipboard.writeText(d.enlacePublico).then(() => toast.success('Enlace copiado')).catch(() => toast.info(d.enlacePublico)) }] : []),
    ...(acciones.some((a) => a.menu) ? [{ separator: true, label: '' }] : []),
    ...acciones.filter((a) => a.menu).map((a) => ({ label: a.label, icon: a.icon, onSelect: a.run, danger: a.id === 'borrar' || a.id === 'cancelar' })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        back={DOC_LIST_PATH[tipo]}
        crumbs={[{ label: tipoLabel(tipo) + 's', to: DOC_LIST_PATH[tipo] }, { label: d.codigo ?? 'Borrador' }]}
        title={`${tipoLabel(tipo)} ${d.codigo ?? '(borrador)'}`}
        subtitle={
          <span>
            <Link to={`/terceros/${d.terceroId}`} className="font-medium text-fg hover:text-primary">
              {d.tercero?.nombre}
            </Link>
            {d.titulo && ` · ${d.titulo}`}
          </span>
        }
        badges={
          <>
            <EnumBadge options={DOC_ESTADOS[tipo]} value={est} />
            {d.estadoPago && d.bloqueado && <EnumBadge options={ESTADO_PAGO} value={d.estadoPago} />}
            {d.version > 1 && <Badge tone="purple">v{d.version}</Badge>}
          </>
        }
        actions={
          <>
            {visibles.slice(0, 4).map((a) => (
              <Button key={a.id} variant={a.variant ?? 'secondary'} icon={a.icon} onClick={a.run} loading={accion.isPending && accion.variables?.accion === a.id}>
                {a.label}
              </Button>
            ))}
            <Menu
              trigger={
                <Button icon={MoreHorizontal} aria-label="Más acciones">
                  <span className="sm:hidden">Más</span>
                </Button>
              }
              items={[...visibles.slice(4).map((a) => ({ label: a.label, icon: a.icon, onSelect: a.run })), ...enMenu]}
            />
          </>
        }
      />

      {est === 'pendiente_aprobacion' && <Alert tone="orange" icon={ShieldCheck} title="Pendiente de aprobación">{tipo === 'presupuesto' ? 'El margen está por debajo del mínimo de la empresa. Dirección debe aprobarlo antes de enviarlo.' : 'El importe supera el límite: un responsable debe aprobarlo.'}</Alert>}
      {d.rechazoMotivo && ['rechazado', 'cancelado'].includes(est) && <Alert tone="red" title="Motivo">{d.rechazoMotivo}</Alert>}
      {d.aceptadoEn && tipo === 'presupuesto' && <Alert tone="green" icon={CheckCircle2}>Aceptado por {d.aceptadoPor} el {fmtDateTime(d.aceptadoEn)}{d.firmaImagen ? ' con firma' : ''}.</Alert>}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <CardHeader title="Líneas" icon={FileText} />
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 font-medium">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium">Cant.</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Precio</th>
                    <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Dto.</th>
                    <th className="hidden px-3 py-2 text-right font-medium md:table-cell">IVA</th>
                    <th className="px-4 py-2 text-right font-medium">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lineas.map((l: any) =>
                    l.tipoLinea !== 'articulo' ? (
                      <tr key={l.id} className="border-b border-line/60">
                        <td colSpan={6} className={cn('px-4 py-2', l.tipoLinea === 'capitulo' ? 'font-semibold text-primary' : 'text-muted')}>
                          {l.descripcion}
                        </td>
                      </tr>
                    ) : (
                      <tr key={l.id} className="border-b border-line/60 last:border-0">
                        <td className="px-4 py-2.5">
                          {l.referencia && <span className="mr-2 font-mono text-[12px] text-muted">{l.referencia}</span>}
                          <span className="whitespace-pre-wrap">{l.descripcion}</span>
                          {l.lote && <span className="ml-2 text-[12px] text-muted">Lote {l.lote}</span>}
                          {d.pendientes?.[l.id] && d.pendientes[l.id].hecho > 0 && (
                            <span className="ml-2 text-[12px] text-muted">
                              · {fmtNumber(d.pendientes[l.id].hecho, 3)} hecho, {fmtNumber(d.pendientes[l.id].pendiente, 3)} pendiente
                            </span>
                          )}
                        </td>
                        <td className="tabular px-3 py-2.5 text-right">
                          {fmtNumber(l.cantidad, 3)} <span className="text-[11.5px] text-muted">{l.unidad}</span>
                        </td>
                        <td className="tabular hidden px-3 py-2.5 text-right sm:table-cell">{fmtMoney(l.precio)}</td>
                        <td className="tabular hidden px-3 py-2.5 text-right md:table-cell">{l.descuento ? `${fmtNumber(l.descuento)} %` : ''}</td>
                        <td className="tabular hidden px-3 py-2.5 text-right md:table-cell">{fmtNumber(l.ivaTipo)} %</td>
                        <td className="tabular px-4 py-2.5 text-right font-medium">{fmtMoney(l.subtotal)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            {(d.observaciones || d.notasInternas) && (
              <div className="space-y-2 border-t border-line px-4 py-3 text-[13px]">
                {d.observaciones && <p className="whitespace-pre-wrap">{d.observaciones}</p>}
                {d.notasInternas && <p className="whitespace-pre-wrap rounded-lg bg-sun-soft px-3 py-2 text-warn">Nota interna: {d.notasInternas}</p>}
              </div>
            )}
          </Card>
          <EntityTabsView entidad="documento" id={d.id} record={d} tabs={[]} common={['comentarios', 'adjuntos', 'tareas', 'actividad']} />
        </div>

        <div className="space-y-5">
          <Card>
            <div className="space-y-1.5 p-4 text-[13.5px]">
              {d.descuentoGlobal > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Descuento {fmtNumber(d.descuentoGlobal)} %</span>
                  <span className="tabular">-{fmtMoney(d.sumaLineas - d.baseImponible)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted">Base imponible</span>
                <span className="tabular">{fmtMoney(d.baseImponible)}</span>
              </div>
              {d.impuestos.map((i: any) => (
                <div key={i.id} className="flex justify-between text-muted">
                  <span>IVA {fmtNumber(i.ivaTipo)} %{i.recargoPct ? ` + R.E.` : ''}</span>
                  <span className="tabular">{fmtMoney(i.cuota + i.cuotaRecargo)}</span>
                </div>
              ))}
              {d.totalRetencion > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Retención</span>
                  <span className="tabular">-{fmtMoney(d.totalRetencion)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-2 font-display text-[22px] font-extrabold">
                <span>Total</span>
                <span className="tabular">{fmtMoney(d.total)}</span>
              </div>
              {d.margen !== null && d.coste > 0 && !compra && (
                <p className="text-[12.5px] text-muted">
                  Margen {fmtMoney(d.margen)} ({d.baseImponible ? fmtNumber((d.margen / d.baseImponible) * 100, 1) : 0} %)
                </p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Detalles" />
            <div className="p-4">
              <KeyValue
                cols={1}
                items={[
                  { label: 'Fecha', value: fmtDate(d.fecha) },
                  ...(d.fechaValidez ? [{ label: 'Válido hasta', value: fmtDate(d.fechaValidez) }] : []),
                  ...(d.fechaEntrega ? [{ label: 'Entrega', value: fmtDate(d.fechaEntrega) }] : []),
                  { label: compra ? 'Responsable' : 'Comercial', value: d._refs?.personas?.[d.comercialId] },
                  { label: 'Contacto', value: d._refs?.contactos?.[d.contactoId] },
                  { label: 'Forma de pago', value: d._refs?.formas_pago?.[d.formaPagoId] },
                  ...(d.referenciaExterna ? [{ label: compra ? 'Nº del proveedor' : 'Su referencia', value: d.referenciaExterna }] : []),
                  ...(d.enviadoEn ? [{ label: 'Enviado', value: fmtDateTime(d.enviadoEn) }] : []),
                  ...(d.vistoEn ? [{ label: 'Visto por el cliente', value: fmtDateTime(d.vistoEn) }] : []),
                  ...(d.emitidoEn ? [{ label: 'Emitido', value: fmtDateTime(d.emitidoEn) }] : []),
                ]}
              />
            </div>
          </Card>
          {(d.relacionados.anteriores.length > 0 || d.relacionados.posteriores.length > 0 || d.relacionados.versiones.length > 0) && (
            <Card>
              <CardHeader title="Documentos relacionados" icon={ArrowRightLeft} />
              <ul className="divide-y divide-line">
                {[...d.relacionados.anteriores.map((x: any) => ({ ...x, dir: 'Origen' })), ...d.relacionados.posteriores.map((x: any) => ({ ...x, dir: 'Generado' }))].map((x: any) => (
                  <li key={x.id}>
                    <Link to={`/documentos/${x.id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-sunken">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">
                          {tipoLabel(x.tipo)} {x.codigo ?? '(borrador)'}
                        </span>
                        <span className="text-[12px] text-muted">
                          {x.dir} · {fmtDate(x.fecha)} · {fmtMoney(x.total)}
                        </span>
                      </span>
                      <EnumBadge options={DOC_ESTADOS[x.tipo as DocTipo]} value={x.estado} dot={false} />
                    </Link>
                  </li>
                ))}
                {d.relacionados.versiones.map((v: any) => (
                  <li key={v.id}>
                    <Link to={`/documentos/${v.id}`} className={cn('flex items-center justify-between px-4 py-2 text-[13px] hover:bg-sunken', v.id === d.id && 'font-semibold')}>
                      <span>Versión {v.version}</span>
                      <EnumBadge options={DOC_ESTADOS.presupuesto} value={v.estado} dot={false} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {d.verifactu && (
            <Card>
              <CardHeader title="Verifactu" icon={ShieldCheck} subtitle={`Registro nº ${d.verifactu.secuencia}`} />
              <div className="space-y-2 p-4 text-[12.5px]">
                <p className="break-all font-mono text-muted">{d.verifactu.huella}</p>
                <p>
                  Estado del envío: <Badge tone={d.verifactu.estadoEnvio === 'aceptado' ? 'green' : 'yellow'}>{d.verifactu.estadoEnvio === 'sin_certificado' ? 'pendiente de certificado' : d.verifactu.estadoEnvio}</Badge>
                </p>
                <a href={d.verifactu.urlQr} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  Comprobar en la AEAT
                </a>
              </div>
            </Card>
          )}
        </div>
      </div>

      <EnviarDialog open={enviar} onOpenChange={setEnviar} doc={d} />
      <EntregarDialog open={entregar} onOpenChange={setEntregar} onConfirm={(datos) => { setEntregar(false); run('entregar', datos); }} />
      {convertir && <ConvertirDialog doc={d} destino={convertir} onClose={() => setConvertir(null)} />}
    </div>
  );
}

function EnviarDialog({ open, onOpenChange, doc }: { open: boolean; onOpenChange: (o: boolean) => void; doc: any }) {
  const [para, setPara] = useState(doc.tercero?.email ?? '');
  const [asunto, setAsunto] = useState(`${tipoLabel(doc.tipo)} ${doc.codigo ?? ''}${doc.titulo ? ` · ${doc.titulo}` : ''}`);
  const [mensaje, setMensaje] = useState(doc.tipo === 'presupuesto' ? 'Le adjuntamos el presupuesto solicitado. Puede revisarlo y aceptarlo desde el enlace.' : 'Le adjuntamos el documento. Quedamos a su disposición.');
  const send = useMut(() => api.post(`/documentos/${doc.id}/enviar`, { para, asunto, mensaje }), {
    invalidate: ['/documentos'],
    onSuccess: (r: any) => {
      onOpenChange(false);
      if (r.ok === false) toast.warning(r.aviso);
      else toast.success('Enviado. El email sale en unos segundos.');
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Enviar por email"
      description="Se adjunta el PDF y un enlace para verlo en línea."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Send} loading={send.isPending} disabled={!para} onClick={() => send.mutate(undefined)}>
            Enviar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Para">
          <Input type="email" value={para} onChange={(e) => setPara(e.target.value)} />
        </Field>
        <Field label="Asunto">
          <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
        </Field>
        <Field label="Mensaje">
          <Textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={4} />
        </Field>
      </div>
    </Dialog>
  );
}

function EntregarDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (d: { receptor: string; firma: string | null }) => void }) {
  const [receptor, setReceptor] = useState('');
  const [firma, setFirma] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar entrega"
      description="Quien recibe la mercancía puede firmar en la pantalla. Al confirmar se descuenta el stock."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Truck} onClick={() => onConfirm({ receptor, firma })}>
            Confirmar entrega
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nombre de quien recibe">
          <Input value={receptor} onChange={(e) => setReceptor(e.target.value)} />
        </Field>
        <SignaturePad onChange={setFirma} />
      </div>
    </Dialog>
  );
}

function ConvertirDialog({ doc, destino, onClose }: { doc: any; destino: string; onClose: () => void }) {
  const nav = useNavigate();
  const articulos = doc.lineas.filter((l: any) => l.tipoLinea === 'articulo');
  const [cant, setCant] = useState<Record<string, number>>(() =>
    Object.fromEntries(articulos.map((l: any) => [l.id, doc.pendientes?.[l.id]?.pendiente ?? l.cantidad])),
  );
  const conv = useMut(() => api.post(`/documentos/${doc.id}/convertir`, { tipo: destino, lineas: articulos.map((l: any) => ({ lineaId: l.id, cantidad: cant[l.id] ?? 0 })) }), {
    ok: `${tipoLabel(destino)} creado`,
    invalidate: ['/documentos'],
    onSuccess: (r: any) => nav(`/documentos/${r.id}`),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Crear ${tipoLabel(destino).toLowerCase()}`}
      description="Ajusta las cantidades si es una entrega o facturación parcial. Lo que quede pendiente podrás convertirlo después."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon={ArrowRightLeft} loading={conv.isPending} onClick={() => conv.mutate(undefined)} disabled={!Object.values(cant).some((v) => v > 0)}>
            Crear
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-line">
        {articulos.map((l: any) => {
          const pend = doc.pendientes?.[l.id]?.pendiente ?? l.cantidad;
          return (
            <li key={l.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px]">{l.descripcion}</p>
                <p className="text-[12px] text-muted">
                  Pendiente {fmtNumber(pend, 3)} de {fmtNumber(l.cantidad, 3)}
                </p>
              </div>
              <div className="w-28">
                <NumberInput value={cant[l.id] ?? 0} onChange={(v) => setCant({ ...cant, [l.id]: Math.min(pend, Math.max(0, v ?? 0)) })} decimals={3} />
              </div>
            </li>
          );
        })}
      </ul>
      {!!errorMessage && null}
    </Dialog>
  );
}
