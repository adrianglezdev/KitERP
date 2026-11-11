import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Heading, History, Package, Plus, Save, Trash2, Type } from 'lucide-react';
import { toast } from 'sonner';
import { calcDocumento, fmtMoney, fmtNumber, IVA_TIPOS, todayISO, type DocTipo } from '@kite/shared';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Alert, Button, Card, CardHeader, Field, IconButton, Input, NumberInput, PageHeader, RefSelect, Select, Spinner, Textarea } from '@/components/ui';
import { esCompra, tipoLabel } from '@/components/docs/config';

interface Linea {
  key: string;
  id?: string;
  tipoLinea: 'articulo' | 'texto' | 'capitulo';
  articuloId?: string | null;
  referencia?: string | null;
  descripcion: string;
  cantidad: number;
  unidad?: string | null;
  precio: number;
  descuento: number;
  ivaTipo: number;
  retencion: number;
  coste: number;
  almacenId?: string | null;
  lote?: string | null;
  caducidad?: string | null;
  series?: string[] | null;
  lineaOrigenId?: string | null;
}

let seq = 0;
const nuevaLinea = (p: Partial<Linea> = {}): Linea => ({ key: `n${++seq}`, tipoLinea: 'articulo', descripcion: '', cantidad: 1, precio: 0, descuento: 0, ivaTipo: 21, retencion: 0, coste: 0, ...p });

export default function DocumentoEditar() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { can, session, has } = useSession();
  const existing = useApi<any>(id ? `/documentos/${id}` : null);
  const tipo = (existing.data?.tipo ?? sp.get('tipo') ?? 'presupuesto') as DocTipo;
  const compra = esCompra(tipo);
  const [cab, setCab] = useState<Record<string, any>>({ fecha: todayISO(), descuentoGlobal: 0, terceroId: sp.get('terceroId') ?? null, proyectoId: sp.get('proyectoId') ?? null, origenTipo: sp.get('origenTipo'), origenId: sp.get('origenId') });
  const [lineas, setLineas] = useState<Linea[]>([nuevaLinea()]);
  const [regimen, setRegimen] = useState('general');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const verCostes = compra || can(['pre.editar', 'pre.aprobar', 'fac.emitir']);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setCab({ ...d, _refs: d._refs });
    setRegimen(d.tercero?.regimenIva ?? 'general');
    setLineas(d.lineas.map((l: any) => ({ ...l, key: l.id, coste: l.coste ?? 0 })));
  }, [existing.data]);

  const tercero = useApi<any>(cab.terceroId ? `/terceros/${cab.terceroId}` : null);
  useEffect(() => {
    if (!tercero.data) return;
    setRegimen(tercero.data.regimenIva ?? 'general');
    if (!id) setCab((c) => ({ ...c, formaPagoId: c.formaPagoId ?? tercero.data.formaPagoId, descuentoGlobal: c.descuentoGlobal || 0 }));
  }, [tercero.data, id]);
  const habituales = useApi<any[]>(cab.terceroId && !compra ? `/documentos-ayuda/habituales/${cab.terceroId}` : null);

  const calc = useMemo(
    () =>
      calcDocumento(
        lineas.map((l) => ({ ...l, esTexto: l.tipoLinea !== 'articulo' })),
        { descuentoGlobal: cab.descuentoGlobal, recargoEquivalencia: regimen === 'recargo', exento: ['exento', 'intracomunitario', 'exportacion', 'isp'].includes(regimen) },
      ),
    [lineas, cab.descuentoGlobal, regimen],
  );

  const setL = (key: string, patch: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) =>
    setLineas((ls) => {
      const n = [...ls];
      const j = i + d;
      if (j < 0 || j >= n.length) return ls;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  async function elegirArticulo(key: string, articuloId: string | null) {
    if (!articuloId) return setL(key, { articuloId: null });
    try {
      const p = await api.get(`/articulos/${articuloId}/precio${cab.terceroId && !compra ? `?terceroId=${cab.terceroId}` : ''}`);
      setL(key, {
        articuloId,
        referencia: p.referencia,
        descripcion: p.descripcion,
        unidad: p.unidad,
        precio: compra ? p.coste : p.precio,
        descuento: compra ? 0 : (p.descuento ?? 0),
        ivaTipo: p.ivaTipo,
        coste: p.coste ?? 0,
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function guardar() {
    if (!cab.terceroId) {
      setErrors({ terceroId: compra ? 'Elige el proveedor' : 'Elige el cliente' });
      return toast.error(compra ? 'Elige el proveedor' : 'Elige el cliente');
    }
    const ls = lineas.filter((l) => l.tipoLinea !== 'articulo' ? l.descripcion.trim() : l.descripcion.trim() || l.articuloId);
    if (!ls.some((l) => l.tipoLinea === 'articulo')) return toast.error('Añade al menos una línea con importe');
    const body = {
      tipo,
      fecha: cab.fecha,
      terceroId: cab.terceroId,
      contactoId: cab.contactoId || null,
      comercialId: cab.comercialId || null,
      formaPagoId: cab.formaPagoId || null,
      serieId: cab.serieId || null,
      almacenId: cab.almacenId || null,
      proyectoId: cab.proyectoId || null,
      fechaValidez: cab.fechaValidez || null,
      fechaEntrega: cab.fechaEntrega || null,
      descuentoGlobal: cab.descuentoGlobal || 0,
      titulo: cab.titulo || null,
      observaciones: cab.observaciones || null,
      notasInternas: cab.notasInternas || null,
      condiciones: cab.condiciones || null,
      referenciaExterna: cab.referenciaExterna || null,
      origenTipo: cab.origenTipo || null,
      origenId: cab.origenId || null,
      lineas: ls.map(({ key: _k, ...l }) => ({ ...l, descripcion: l.descripcion || l.referencia || '' })),
    };
    setSaving(true);
    try {
      const r = id ? await api.put(`/documentos/${id}`, body) : await api.post('/documentos', body);
      toast.success(id ? 'Cambios guardados' : `${tipoLabel(tipo)} creado`);
      nav(`/documentos/${r.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.details?.fields) setErrors(e.details.fields as Record<string, string>);
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (id && existing.isLoading) return <Spinner />;
  const margenPct = calc.baseImponible ? (calc.margen / calc.baseImponible) * 100 : 0;
  const almacenes = has('stk');

  return (
    <div className="space-y-5">
      <PageHeader
        back
        title={id ? `Editar ${tipoLabel(tipo).toLowerCase()} ${existing.data?.codigo ?? ''}` : `Nuevo ${tipoLabel(tipo).toLowerCase()}`}
        actions={
          <Button variant="primary" icon={Save} loading={saving} onClick={guardar}>
            Guardar
          </Button>
        }
      />

      <Card>
        <CardHeader title="Datos generales" />
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={compra ? 'Proveedor' : 'Cliente'} required error={errors.terceroId} className="sm:col-span-2">
            <RefSelect target={compra ? 'proveedores' : 'clientes'} value={cab.terceroId} onChange={(v) => setCab({ ...cab, terceroId: v, contactoId: null })} invalid={!!errors.terceroId} label={existing.data?.tercero?.nombre} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={cab.fecha} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} />
          </Field>
          {tipo === 'presupuesto' ? (
            <Field label="Válido hasta" help="Si lo dejas vacío se calcula con la validez de los ajustes">
              <Input type="date" value={cab.fechaValidez ?? ''} onChange={(e) => setCab({ ...cab, fechaValidez: e.target.value })} />
            </Field>
          ) : ['pedido', 'pedido_compra', 'albaran'].includes(tipo) ? (
            <Field label="Fecha de entrega">
              <Input type="date" value={cab.fechaEntrega ?? ''} onChange={(e) => setCab({ ...cab, fechaEntrega: e.target.value })} />
            </Field>
          ) : (
            <Field label={tipo === 'factura_proveedor' ? 'Nº de factura del proveedor' : 'Su referencia'}>
              <Input value={cab.referenciaExterna ?? ''} onChange={(e) => setCab({ ...cab, referenciaExterna: e.target.value })} />
            </Field>
          )}
          <Field label="Concepto o título" className="sm:col-span-2">
            <Input value={cab.titulo ?? ''} onChange={(e) => setCab({ ...cab, titulo: e.target.value })} placeholder="Ej.: Climatización de la recepción" />
          </Field>
          <Field label="Contacto">
            <RefSelect target="contactos" value={cab.contactoId} onChange={(v) => setCab({ ...cab, contactoId: v })} filter={cab.terceroId ? { terceroId: cab.terceroId } : undefined} disabled={!cab.terceroId} />
          </Field>
          <Field label={compra ? 'Responsable' : 'Comercial'}>
            <RefSelect target="personas" value={cab.comercialId ?? (id ? null : session?.user.personaId)} onChange={(v) => setCab({ ...cab, comercialId: v })} />
          </Field>
          <Field label="Forma de pago">
            <RefSelect target="formas_pago" value={cab.formaPagoId} onChange={(v) => setCab({ ...cab, formaPagoId: v })} />
          </Field>
          {tipo !== 'factura_proveedor' && !['presupuesto'].includes(tipo) && (
            <Field label={tipo === 'pedido_compra' ? 'Nº de oferta del proveedor' : 'Su referencia / nº pedido'}>
              <Input value={cab.referenciaExterna ?? ''} onChange={(e) => setCab({ ...cab, referenciaExterna: e.target.value })} />
            </Field>
          )}
          {almacenes && ['pedido', 'albaran', 'pedido_compra', 'recepcion'].includes(tipo) && (
            <Field label="Almacén">
              <RefSelect target="almacenes" value={cab.almacenId} onChange={(v) => setCab({ ...cab, almacenId: v })} placeholder="Almacén principal" />
            </Field>
          )}
          {has('pry') && (
            <Field label="Proyecto">
              <RefSelect target="proyectos" value={cab.proyectoId} onChange={(v) => setCab({ ...cab, proyectoId: v })} placeholder="Sin proyecto" />
            </Field>
          )}
        </div>
        {regimen !== 'general' && (
          <div className="px-4 pb-4">
            <Alert tone="blue">Régimen de IVA del {compra ? 'proveedor' : 'cliente'}: <b>{regimen === 'recargo' ? 'recargo de equivalencia' : regimen}</b>. Los impuestos se calculan automáticamente según su ficha.</Alert>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Líneas"
          subtitle={`${lineas.filter((l) => l.tipoLinea === 'articulo').length} líneas`}
          actions={
            <>
              <Button size="sm" icon={Type} onClick={() => setLineas([...lineas, nuevaLinea({ tipoLinea: 'texto', cantidad: 0 })])}>
                <span className="hidden sm:inline">Texto</span>
              </Button>
              <Button size="sm" icon={Heading} onClick={() => setLineas([...lineas, nuevaLinea({ tipoLinea: 'capitulo', cantidad: 0 })])}>
                <span className="hidden sm:inline">Capítulo</span>
              </Button>
              <Button size="sm" variant="soft" icon={Plus} onClick={() => setLineas([...lineas, nuevaLinea()])}>
                Línea
              </Button>
            </>
          }
        />
        {!!habituales.data?.length && !id && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-sunken/40 px-4 py-2 text-[12.5px]">
            <History className="h-3.5 w-3.5 text-muted" />
            <span className="text-muted">Suele comprar:</span>
            {habituales.data.slice(0, 6).map((h) => (
              <button
                key={h.articuloId}
                type="button"
                className="rounded-full border border-line bg-surface px-2 py-0.5 hover:border-primary hover:text-primary"
                onClick={async () => {
                  const l = nuevaLinea();
                  setLineas((ls) => [...ls.filter((x) => x.descripcion || x.articuloId), l]);
                  await elegirArticulo(l.key, h.articuloId);
                }}
              >
                {h.referencia}
              </button>
            ))}
          </div>
        )}
        <div className="divide-y divide-line">
          {lineas.map((l, i) => (
            <LineaRow
              key={l.key}
              l={l}
              i={i}
              total={lineas.length}
              subtotal={calc.lineas[i]?.subtotal ?? 0}
              verCostes={verCostes}
              compra={compra}
              stock={almacenes}
              onChange={(p) => setL(l.key, p)}
              onArticulo={(a) => elegirArticulo(l.key, a)}
              onMove={(d) => move(i, d)}
              onRemove={() => setLineas(lineas.filter((x) => x.key !== l.key))}
              exento={['exento', 'intracomunitario', 'exportacion', 'isp'].includes(regimen)}
            />
          ))}
        </div>
        <button type="button" onClick={() => setLineas([...lineas, nuevaLinea()])} className="flex w-full items-center justify-center gap-2 border-t border-dashed border-line py-3 text-[13px] font-medium text-primary hover:bg-primary-soft/40">
          <Plus className="h-4 w-4" /> Añadir línea
        </button>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Notas" />
          <div className="space-y-4 p-4">
            <Field label="Observaciones (aparecen en el documento)">
              <Textarea value={cab.observaciones ?? ''} onChange={(e) => setCab({ ...cab, observaciones: e.target.value })} rows={3} />
            </Field>
            {tipo === 'presupuesto' && (
              <Field label="Condiciones">
                <Textarea value={cab.condiciones ?? ''} onChange={(e) => setCab({ ...cab, condiciones: e.target.value })} rows={3} placeholder="Si lo dejas vacío se usan las condiciones de los ajustes" />
              </Field>
            )}
            <Field label="Notas internas (no las ve el cliente)">
              <Textarea value={cab.notasInternas ?? ''} onChange={(e) => setCab({ ...cab, notasInternas: e.target.value })} rows={2} />
            </Field>
          </div>
        </Card>
        <Card className="h-fit lg:sticky lg:top-4">
          <div className="space-y-2 p-4 text-[13.5px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">Suma de líneas</span>
              <span className="tabular">{fmtMoney(calc.sumaLineas)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Descuento global</span>
              <div className="w-24">
                <NumberInput value={cab.descuentoGlobal} onChange={(v) => setCab({ ...cab, descuentoGlobal: v ?? 0 })} suffix="%" />
              </div>
            </div>
            <div className="flex items-center justify-between font-medium">
              <span>Base imponible</span>
              <span className="tabular">{fmtMoney(calc.baseImponible)}</span>
            </div>
            {calc.impuestos.map((t) => (
              <div key={t.ivaTipo} className="flex items-center justify-between text-muted">
                <span>
                  IVA {fmtNumber(t.ivaTipo)} %{t.recargoPct ? ` + R.E. ${fmtNumber(t.recargoPct)} %` : ''}
                </span>
                <span className="tabular">{fmtMoney(t.cuota + t.cuotaRecargo)}</span>
              </div>
            ))}
            {calc.totalRetencion > 0 && (
              <div className="flex items-center justify-between text-muted">
                <span>Retención IRPF</span>
                <span className="tabular">-{fmtMoney(calc.totalRetencion)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-line pt-2 font-display text-[20px] font-extrabold text-deep dark:text-fg">
              <span>Total</span>
              <span className="tabular">{fmtMoney(calc.total)}</span>
            </div>
            {verCostes && !compra && calc.coste > 0 && (
              <div className={cn('mt-2 rounded-lg px-3 py-2 text-[12.5px]', margenPct < 15 ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok')}>
                Margen {fmtMoney(calc.margen)} ({fmtNumber(margenPct, 1)} %) · coste {fmtMoney(calc.coste)}
              </div>
            )}
            <Button variant="primary" className="mt-3 w-full" icon={Save} loading={saving} onClick={guardar}>
              Guardar
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function LineaRow({
  l,
  i,
  total,
  subtotal,
  verCostes,
  compra,
  stock,
  exento,
  onChange,
  onArticulo,
  onMove,
  onRemove,
}: {
  l: Linea;
  i: number;
  total: number;
  subtotal: number;
  verCostes: boolean;
  compra: boolean;
  stock: boolean;
  exento: boolean;
  onChange: (p: Partial<Linea>) => void;
  onArticulo: (id: string | null) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const tools = (
    <div className="flex shrink-0 items-center">
      <IconButton icon={ArrowUp} label="Subir" size="sm" disabled={i === 0} onClick={() => onMove(-1)} />
      <IconButton icon={ArrowDown} label="Bajar" size="sm" disabled={i === total - 1} onClick={() => onMove(1)} />
      <IconButton icon={Trash2} label="Quitar línea" size="sm" onClick={onRemove} />
    </div>
  );
  if (l.tipoLinea !== 'articulo')
    return (
      <div className="flex items-center gap-2 px-4 py-2.5">
        {l.tipoLinea === 'capitulo' ? <Heading className="h-4 w-4 text-primary" /> : <Type className="h-4 w-4 text-muted" />}
        <Input value={l.descripcion} onChange={(e) => onChange({ descripcion: e.target.value })} placeholder={l.tipoLinea === 'capitulo' ? 'Título del capítulo' : 'Texto libre (sin importe)'} className={cn(l.tipoLinea === 'capitulo' && 'font-semibold text-primary')} />
        {tools}
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-3 md:grid-cols-[minmax(180px,1.1fr)_minmax(200px,2fr)_80px_110px_76px_92px_110px_auto] md:items-start">
      <div className="col-span-2 md:col-span-1">
        <RefSelect target="articulos" value={l.articuloId ?? null} onChange={onArticulo} placeholder="Artículo…" label={l.referencia ? `${l.referencia} · ${l.descripcion}` : undefined} />
      </div>
      <div className="col-span-2 md:col-span-1">
        <Textarea rows={1} value={l.descripcion} onChange={(e) => onChange({ descripcion: e.target.value })} placeholder="Descripción" className="min-h-[38px]" />
        {(stock && (l.lote || compra)) && (
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Input value={l.lote ?? ''} onChange={(e) => onChange({ lote: e.target.value })} placeholder="Lote" className="h-8 py-1 text-[12.5px]" />
            <Input type="date" value={l.caducidad ?? ''} onChange={(e) => onChange({ caducidad: e.target.value })} className="h-8 py-1 text-[12.5px]" aria-label="Caducidad" />
          </div>
        )}
      </div>
      <Field label={<span className="md:hidden">Cantidad</span>}>
        <NumberInput value={l.cantidad} onChange={(v) => onChange({ cantidad: v ?? 0 })} decimals={3} />
      </Field>
      <Field label={<span className="md:hidden">Precio</span>}>
        <NumberInput value={l.precio} onChange={(v) => onChange({ precio: v ?? 0 })} decimals={4} suffix="€" />
      </Field>
      <Field label={<span className="md:hidden">Dto.</span>}>
        <NumberInput value={l.descuento} onChange={(v) => onChange({ descuento: v ?? 0 })} suffix="%" />
      </Field>
      <Field label={<span className="md:hidden">IVA</span>}>
        <Select value={exento ? 0 : l.ivaTipo} disabled={exento} onChange={(e) => onChange({ ivaTipo: Number(e.target.value) })} options={IVA_TIPOS.map((t) => ({ value: t.value, label: `${t.value} %` }))} />
      </Field>
      <div className="flex items-center justify-between gap-2 md:block md:pt-2 md:text-right">
        <span className="text-[12px] text-muted md:hidden">Importe</span>
        <span className="tabular text-[14px] font-semibold">{fmtMoney(subtotal)}</span>
        {verCostes && !compra && l.coste > 0 && <span className="block text-[11px] text-muted">coste {fmtMoney(l.coste * l.cantidad)}</span>}
      </div>
      <div className="col-span-2 flex justify-end md:col-span-1">{tools}</div>
      {!l.articuloId && <Package className="hidden" />}
    </div>
  );
}
