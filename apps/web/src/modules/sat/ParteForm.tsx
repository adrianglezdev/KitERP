import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, CircleDashed, CloudOff, Minus, PackagePlus, Plus, Save, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { invalidatePrefix } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Button, Card, CardHeader, Field, Input, NumberInput, RefSelect, SignaturePad, Switch, Textarea, useConfirm } from '@/components/ui';
import { minutosTexto, useOnline } from './lib';
import { enviarParte, guardarParte, leerParte, nuevoUid, type ParteBorrador } from './parte';

/** Borrador del parte de una orden: se carga del móvil o se prepara con los datos de la orden. */
export function useParte(orden: any | null) {
  const [p, setP] = useState<ParteBorrador | null>(null);
  useEffect(() => {
    if (!orden || orden.estado === 'finalizada' || orden.estado === 'cancelada') return setP(null);
    const guardado = leerParte(orden.id);
    if (guardado) return setP(guardado);
    setP({
      uid: nuevoUid(),
      ordenId: orden.id,
      codigo: orden.codigo,
      trabajoRealizado: '',
      checklist: Object.fromEntries((orden.checklist ?? []).map((i: any) => [i.id, { hecho: !!i.hecho, nota: i.nota ?? null }])),
      materiales: (orden.materiales ?? []).map((m: any) => ({ articuloId: m.articuloId, label: `${m.referencia} · ${m.descripcion}`, cantidad: Number(m.cantidad), almacenId: m.almacenId })),
      tiempos: [],
      cronoLocal: null,
      horas: null,
      desplazamiento: true,
      facturable: !!orden.facturable,
      firma: null,
      firmaNombre: orden.contacto ? `${orden.contacto.nombre} ${orden.contacto.apellidos ?? ''}`.trim() : '',
      pendienteEnvio: false,
      error: null,
      actualizado: new Date().toISOString(),
    });
  }, [orden?.id, orden?.estado]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (fn: (p: ParteBorrador) => ParteBorrador) =>
    setP((prev) => {
      if (!prev) return prev;
      const next = { ...fn(prev), actualizado: new Date().toISOString() };
      guardarParte(next);
      return next;
    });
  return [p, update] as const;
}

export function ParteForm({ orden, parte, update }: { orden: any; parte: ParteBorrador; update: (fn: (p: ParteBorrador) => ParteBorrador) => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const online = useOnline();
  const [enviando, setEnviando] = useState(false);
  const [refirmar, setRefirmar] = useState(!parte.firma);
  const [nuevoMat, setNuevoMat] = useState<{ id: string | null; label?: string }>({ id: null });
  const textRef = useRef<HTMLTextAreaElement>(null);

  const checklist = (orden.checklist ?? []) as { id: string; texto: string; obligatorio?: boolean }[];
  const faltan = checklist.filter((i) => i.obligatorio && !parte.checklist[i.id]?.hecho);
  const minutosLocales = parte.tiempos.reduce((s, t) => s + Math.max(0, (Date.parse(t.fin) - Date.parse(t.inicio)) / 60000), 0) + (parte.cronoLocal ? (Date.now() - Date.parse(parte.cronoLocal)) / 60000 : 0);
  const minutos = Math.round((orden.minutosTotales ?? 0) + minutosLocales);
  const listo = parte.trabajoRealizado.trim().length >= 3 && !faltan.length;
  const guardadoHora = useMemo(() => new Date(parte.actualizado).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), [parte.actualizado]);

  const setMat = (i: number, cantidad: number) => update((p) => ({ ...p, materiales: p.materiales.map((m, j) => (j === i ? { ...m, cantidad: Math.max(0, Math.round(cantidad * 100) / 100) } : m)) }));

  async function enviar() {
    if (!listo) {
      if (parte.trabajoRealizado.trim().length < 3) {
        toast.error('Describe el trabajo realizado');
        textRef.current?.focus();
      } else toast.error(`Faltan puntos obligatorios: ${faltan.map((f) => f.texto).join(', ')}`);
      return;
    }
    const ok = await confirm({
      title: 'Finalizar la orden',
      message: (
        <div className="space-y-1">
          <p>Se enviará el parte y la orden quedará cerrada.</p>
          {(parte.materiales.length > 0 || parte.facturable) && orden.modulos?.ped && <p className="text-muted">Se generará el albarán {parte.facturable ? 'con el material y la mano de obra' : 'del material, sin cargo'}.</p>}
          {!parte.firma && <p className="font-medium text-warn">El cliente no ha firmado.</p>}
        </div>
      ),
      confirm: 'Finalizar y enviar',
    });
    if (!ok) return;
    setEnviando(true);
    const r = await enviarParte(parte);
    setEnviando(false);
    if (r.ok) {
      toast.success('Parte enviado. Orden finalizada.');
      invalidatePrefix(qc, '/sat');
      nav('/sat/hoy');
    } else if (r.red) {
      update((p) => ({ ...p, pendienteEnvio: true }));
      toast.warning('Sin conexión: el parte queda guardado en el móvil y se enviará en cuanto haya cobertura.', { duration: 8000 });
    } else {
      update((p) => ({ ...p, error: r.mensaje }));
      toast.error(r.mensaje);
    }
  }

  return (
    <Card id="parte" className="scroll-mt-20">
      <CardHeader
        title="Parte de trabajo"
        icon={Save}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            {!online && <CloudOff className="h-3.5 w-3.5 text-warn" />}
            Guardado en este móvil a las {guardadoHora}
          </span>
        }
      />
      <div className="space-y-5 p-4">
        {parte.pendienteEnvio && (
          <Alert tone="orange" icon={CloudOff} title="Pendiente de enviar">
            El parte está guardado en el móvil. Se enviará automáticamente al recuperar la conexión, o pulsa de nuevo “Finalizar y enviar”.
          </Alert>
        )}
        {parte.error && !parte.pendienteEnvio && (
          <Alert tone="red" title="No se ha podido enviar">
            {parte.error}
          </Alert>
        )}

        <Field label="Trabajo realizado" required htmlFor="parte-trabajo">
          <Textarea
            ref={textRef}
            id="parte-trabajo"
            rows={5}
            className="text-[15px]"
            placeholder="Qué has encontrado y qué has hecho"
            value={parte.trabajoRealizado}
            onChange={(e) => update((p) => ({ ...p, trabajoRealizado: e.target.value, error: null }))}
          />
        </Field>

        {checklist.length > 0 && (
          <div>
            <p className="label mb-2">Checklist</p>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {checklist.map((i) => {
                const hecho = !!parte.checklist[i.id]?.hecho;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => update((p) => ({ ...p, checklist: { ...p.checklist, [i.id]: { ...p.checklist[i.id], hecho: !hecho } } }))}
                      className={cn('flex min-h-[52px] w-full items-center gap-3 px-3 py-2.5 text-left text-[14.5px] transition active:bg-sunken', hecho && 'bg-ok-soft/40')}
                      aria-pressed={hecho}
                    >
                      {hecho ? <CheckCircle2 className="h-6 w-6 shrink-0 text-ok" /> : <CircleDashed className="h-6 w-6 shrink-0 text-muted" />}
                      <span className="flex-1">{i.texto}</span>
                      {i.obligatorio && !hecho && <span className="shrink-0 text-[11.5px] font-medium text-bad">Obligatorio</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <p className="label mb-2">Material utilizado</p>
          {parte.materiales.length > 0 && (
            <ul className="mb-2 divide-y divide-line rounded-xl border border-line">
              {parte.materiales.map((m, i) => (
                <li key={`${m.articuloId}-${i}`} className="space-y-2 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[14px] font-medium">{m.label}</span>
                    <button type="button" aria-label="Quitar" className="rounded-lg p-2 text-muted hover:text-bad" onClick={() => update((p) => ({ ...p, materiales: p.materiales.filter((_, j) => j !== i) }))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-xl border border-line">
                      <button type="button" className="flex h-11 w-11 items-center justify-center text-fg active:bg-sunken" aria-label="Menos" onClick={() => setMat(i, m.cantidad - 1)}>
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className="w-20">
                        <NumberInput value={m.cantidad} onChange={(v) => setMat(i, v ?? 0)} decimals={2} min={0} align="left" className="h-11 border-0 text-center text-[16px]" />
                      </div>
                      <button type="button" className="flex h-11 w-11 items-center justify-center text-fg active:bg-sunken" aria-label="Más" onClick={() => setMat(i, m.cantidad + 1)}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {orden.modulos?.stk && (
                      <div className="min-w-[180px] flex-1">
                        <RefSelect target="almacenes" value={m.almacenId ?? orden.almacenDefecto ?? null} onChange={(v) => update((p) => ({ ...p, materiales: p.materiales.map((x, j) => (j === i ? { ...x, almacenId: v } : x)) }))} placeholder="Almacén (mi furgoneta)" />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <RefSelect target="articulos" value={nuevoMat.id} label={nuevoMat.label} onChange={(id, opt) => setNuevoMat({ id, label: opt?.label })} placeholder="Buscar artículo o referencia…" filter={{ tipo: 'producto' }} />
            </div>
            <Button
              icon={PackagePlus}
              size="lg"
              disabled={!nuevoMat.id}
              onClick={() => {
                update((p) => ({ ...p, materiales: [...p.materiales, { articuloId: nuevoMat.id!, label: nuevoMat.label ?? 'Artículo', cantidad: 1, almacenId: orden.almacenDefecto ?? null }] }));
                setNuevoMat({ id: null });
              }}
            >
              Añadir
            </Button>
          </div>
          {!online && <p className="mt-1 text-[12px] text-muted">Sin conexión el buscador no funciona: añade el material cuando tengas cobertura, antes de enviar.</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tiempo registrado" help={minutos > 0 ? 'Con el cronómetro de la orden' : 'Si no usaste el cronómetro, indica las horas'}>
            <div className="flex h-11 items-center rounded-lg bg-sunken px-3 text-[15px] font-semibold">{minutosTexto(minutos)}</div>
          </Field>
          <Field label="Horas a facturar" help="Déjalo vacío para usar el tiempo registrado">
            <NumberInput value={parte.horas} onChange={(v) => update((p) => ({ ...p, horas: v }))} decimals={2} min={0} suffix="h" className="h-11 text-[15px]" />
          </Field>
        </div>
        <div className="space-y-3 rounded-xl border border-line p-3">
          <Switch checked={parte.desplazamiento} onChange={(v) => update((p) => ({ ...p, desplazamiento: v }))} label="Cobrar desplazamiento" />
          <Switch
            checked={parte.facturable}
            onChange={(v) => update((p) => ({ ...p, facturable: v }))}
            label="Trabajo facturable"
            description={parte.facturable ? 'El material y las horas se incluirán en el albarán con su precio' : 'Garantía o contrato: el albarán se hace a precio cero'}
          />
        </div>

        <div className="space-y-2">
          <p className="label">Firma del cliente</p>
          {parte.firma && !refirmar ? (
            <div className="space-y-2">
              <img src={parte.firma} alt="Firma del cliente" className="h-32 w-full rounded-xl border border-line bg-white object-contain" />
              <Button size="sm" variant="ghost" onClick={() => setRefirmar(true)}>
                Volver a firmar
              </Button>
            </div>
          ) : (
            <SignaturePad height={170} onChange={(d) => update((p) => ({ ...p, firma: d }))} />
          )}
          <Input placeholder="Nombre de quien firma" value={parte.firmaNombre} onChange={(e) => update((p) => ({ ...p, firmaNombre: e.target.value }))} className="h-11 text-[15px]" autoComplete="off" />
        </div>

        <Button variant="success" size="lg" icon={Send} className="h-14 w-full text-[16px]" loading={enviando} onClick={enviar}>
          Finalizar y enviar parte
        </Button>
        {faltan.length > 0 && <p className="text-center text-[12.5px] text-bad">Faltan {faltan.length} punto{faltan.length === 1 ? '' : 's'} obligatorio{faltan.length === 1 ? '' : 's'} del checklist</p>}
      </div>
    </Card>
  );
}
