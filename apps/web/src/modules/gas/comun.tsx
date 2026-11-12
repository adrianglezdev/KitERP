import { useEffect, useState } from 'react';
import { Camera, Check, Pencil, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, fmtMoney, gasShared, optionLabel } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Alert, Button, Dialog, EnumBadge, Field, IconButton, Input, KeyValue, Segmented, Select, Sheet, Spinner, Textarea, useConfirm } from '@/components/ui';
import { FileDrop, NumberInput, type UploadedFile } from '@/components/form/inputs';
import { RefSelect } from '@/components/form/RefSelect';

export const { GASTO_TIPOS, GASTO_CATEGORIAS, GASTO_ESTADOS, LIQUIDACION_VIAS, IVA_GASTO } = gasShared;
type Tipo = 'ticket' | 'kilometraje' | 'dieta' | 'tarjeta';

const hoy = () => new Date().toLocaleDateString('sv-SE');

/** Alta y edición de un gasto. En el móvil la foto del ticket se hace con la cámara. */
export function GastoDialog({ gasto, onClose }: { gasto?: any; onClose: () => void }) {
  const { has } = useSession();
  const tarjetas = useApi<any[]>('/gas/mis-tarjetas');
  const [tipo, setTipo] = useState<Tipo>(gasto?.tipo ?? 'ticket');
  const [f, setF] = useState<any>(() => ({
    fecha: gasto?.fecha ?? hoy(),
    comercio: gasto?.comercio ?? '',
    nifComercio: gasto?.nifComercio ?? '',
    concepto: gasto?.concepto ?? '',
    categoria: gasto?.categoria ?? '',
    total: gasto?.total ? Number(gasto.total) : null,
    ivaTipo: gasto?.ivaTipo != null ? String(Number(gasto.ivaTipo)) : '21',
    km: gasto?.km ? Number(gasto.km) : null,
    origen: gasto?.origen ?? '',
    destino: gasto?.destino ?? '',
    proyectoId: gasto?.proyectoId ?? null,
    terceroId: gasto?.terceroId ?? null,
    tarjetaId: gasto?.tarjetaId ?? null,
  }));
  const [archivo, setArchivo] = useState<{ id: string; nombre: string; url?: string } | null>(gasto?.archivo ?? null);
  const [leyendo, setLeyendo] = useState(false);
  const set = (k: string, v: unknown) => setF((p: any) => ({ ...p, [k]: v }));
  useEffect(() => {
    if (tipo === 'tarjeta' && !f.tarjetaId && tarjetas.data?.length === 1) set('tarjetaId', tarjetas.data[0].id);
  }, [tipo, tarjetas.data, f.tarjetaId]);

  async function subido(files: UploadedFile[]) {
    const a = files[0];
    if (!a) return;
    setArchivo(a);
    if (a.mime !== 'application/pdf') return;
    setLeyendo(true);
    try {
      const r = await api.post<any>('/gas/extraer', { archivoId: a.id });
      if (!r.leido) return toast.info(r.motivo);
      setF((p: any) => ({
        ...p,
        total: p.total ?? r.total ?? null,
        fecha: r.fecha ?? p.fecha,
        nifComercio: p.nifComercio || r.nif || '',
        comercio: p.comercio || r.comercio || '',
        ivaTipo: r.ivaTipo != null ? String(r.ivaTipo) : p.ivaTipo,
      }));
      toast.success('He leído el ticket: revisa los datos');
    } finally {
      setLeyendo(false);
    }
  }

  const guardar = useMut(
    (enviar: boolean) => {
      const body: any = { tipo, ...f, enviar, archivoId: archivo?.id ?? null, categoria: f.categoria || null, nifComercio: f.nifComercio || null, ivaTipo: tipo === 'ticket' || tipo === 'tarjeta' ? Number(f.ivaTipo) : null };
      if (tipo !== 'kilometraje') delete body.km;
      if (tipo !== 'tarjeta') body.tarjetaId = null;
      return gasto ? api.patch(`/gas/gastos/${gasto.id}`, body) : api.post('/gas/gastos', body);
    },
    { ok: (_r) => 'Gasto guardado', invalidate: ['/gas'], onSuccess: onClose },
  );

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={gasto ? 'Editar gasto' : 'Nuevo gasto'}
      footer={
        <>
          <Button loading={guardar.isPending && guardar.variables === false} onClick={() => guardar.mutate(false)}>
            Guardar borrador
          </Button>
          <Button variant="primary" icon={Send} loading={guardar.isPending && guardar.variables === true} onClick={() => guardar.mutate(true)}>
            Enviar a aprobar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!gasto && (
          <Segmented
            value={tipo}
            onChange={setTipo}
            options={GASTO_TIPOS.filter((t) => t.value !== 'tarjeta' || tarjetas.data?.length).map((t) => ({ value: t.value as Tipo, label: t.label }))}
          />
        )}
        {(tipo === 'ticket' || tipo === 'tarjeta') &&
          (archivo ? (
            <div className="flex items-center justify-between rounded-xl bg-sunken px-3 py-2 text-[13.5px]">
              <span className="truncate">{archivo.nombre}</span>
              {leyendo ? <Spinner className="!py-0" /> : <IconButton icon={X} label="Quitar" size="sm" onClick={() => setArchivo(null)} />}
            </div>
          ) : (
            <FileDrop multiple={false} capture accept="image/*,application/pdf" onUploaded={subido} label="Foto o PDF del ticket" compact />
          ))}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha" required>
            <Input type="date" value={f.fecha} max={hoy()} onChange={(e) => set('fecha', e.target.value)} />
          </Field>
          {tipo === 'kilometraje' ? (
            <Field label="Kilómetros" required>
              <NumberInput value={f.km} onChange={(v) => set('km', v)} decimals={1} suffix="km" />
            </Field>
          ) : (
            <Field label="Importe total" required>
              <NumberInput value={f.total} onChange={(v) => set('total', v)} decimals={2} suffix="€" />
            </Field>
          )}
        </div>
        {tipo === 'kilometraje' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Desde">
              <Input value={f.origen} onChange={(e) => set('origen', e.target.value)} />
            </Field>
            <Field label="Hasta">
              <Input value={f.destino} onChange={(e) => set('destino', e.target.value)} />
            </Field>
          </div>
        )}
        {(tipo === 'ticket' || tipo === 'tarjeta') && (
          <>
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <Field label="Comercio">
                <Input value={f.comercio} onChange={(e) => set('comercio', e.target.value)} />
              </Field>
              <Field label="IVA">
                <Select value={f.ivaTipo} onChange={(e) => set('ivaTipo', e.target.value)} options={IVA_GASTO.map((n) => ({ value: String(n), label: `${n} %` }))} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Categoría">
                <Select value={f.categoria} onChange={(e) => set('categoria', e.target.value)} options={GASTO_CATEGORIAS} placeholder="Elige…" />
              </Field>
              <Field label="NIF del comercio" help="Necesario para deducir el IVA">
                <Input value={f.nifComercio} onChange={(e) => set('nifComercio', e.target.value)} />
              </Field>
            </div>
          </>
        )}
        {tipo === 'tarjeta' && (
          <Field label="Tarjeta" required>
            <Select value={f.tarjetaId ?? ''} onChange={(e) => set('tarjetaId', e.target.value || null)} options={(tarjetas.data ?? []).map((t) => ({ value: t.id, label: `${t.nombre} ·· ${t.ultimos4}` }))} placeholder="Elige…" />
          </Field>
        )}
        <Field label="Concepto">
          <Textarea rows={2} value={f.concepto} onChange={(e) => set('concepto', e.target.value)} placeholder={tipo === 'dieta' ? 'Desplazamiento a…' : 'Para qué ha sido'} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente (si se le repercute)">
            <RefSelect target="clientes" value={f.terceroId} onChange={(v) => set('terceroId', v)} />
          </Field>
          {has('pry') && (
            <Field label="Proyecto">
              <RefSelect target="proyectos" value={f.proyectoId} onChange={(v) => set('proyectoId', v)} />
            </Field>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** Ficha lateral de un gasto con sus acciones según quién lo mira. */
export function GastoSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: g, isLoading } = useApi<any>(`/gas/gastos/${id}`);
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const accion = useMut(({ url, body }: { url: string; body?: unknown }) => api.post(url, body ?? {}), { ok: 'Hecho', invalidate: ['/gas'], onSuccess: onClose });
  const borrar = useMut(() => api.del(`/gas/gastos/${id}`), { ok: 'Gasto borrado', invalidate: ['/gas'], onSuccess: onClose });
  const rechazar = async () => {
    const motivo = await confirm({ title: 'Rechazar el gasto', message: 'Vuelve a la persona para que lo corrija.', confirm: 'Rechazar', danger: true, input: { label: 'Motivo', required: true } });
    if (typeof motivo === 'string') accion.mutate({ url: `/gas/gastos/${id}/rechazar`, body: { motivo } });
  };
  const esImagen = g?.archivo?.mime?.startsWith('image/');
  return (
    <>
      <Sheet
        open={!edit}
        onOpenChange={(o) => !o && onClose()}
        title={g ? `${optionLabel(GASTO_TIPOS, g.tipo)?.label} · ${fmtMoney(g.total)}` : 'Gasto'}
        footer={
          g && (
            <div className="flex w-full flex-wrap justify-end gap-2">
              {g.puedeEditar && (
                <>
                  <IconButton icon={Trash2} label="Borrar" onClick={async () => (await confirm({ title: 'Borrar el gasto', danger: true, confirm: 'Borrar' })) && borrar.mutate(undefined)} />
                  <Button icon={Pencil} onClick={() => setEdit(true)}>
                    Editar
                  </Button>
                  <Button variant="primary" icon={Send} loading={accion.isPending} onClick={() => accion.mutate({ url: `/gas/gastos/${id}/enviar` })}>
                    Enviar
                  </Button>
                </>
              )}
              {g.puedeAprobar && (
                <>
                  <Button icon={X} onClick={rechazar}>
                    Rechazar
                  </Button>
                  <Button variant="primary" icon={Check} loading={accion.isPending} onClick={() => accion.mutate({ url: `/gas/gastos/${id}/aprobar` })}>
                    Aprobar
                  </Button>
                </>
              )}
            </div>
          )
        }
      >
        {isLoading || !g ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            <EnumBadge options={GASTO_ESTADOS} value={g.estado} />
            {g.estado === 'rechazado' && g.motivoRechazo && <Alert tone="red" title="Rechazado">{g.motivoRechazo}</Alert>}
            {g.archivo &&
              (esImagen ? (
                <a href={g.archivo.url} target="_blank" rel="noreferrer">
                  <img src={g.archivo.url} alt="Ticket" className="max-h-72 w-full rounded-xl object-contain ring-1 ring-line-strong/70" />
                </a>
              ) : (
                <a href={g.archivo.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 text-[13.5px] text-primary">
                  <Camera className="h-4 w-4" /> {g.archivo.nombre}
                </a>
              ))}
            <KeyValue
              cols={2}
              items={[
                { label: 'Persona', value: g.persona },
                { label: 'Fecha', value: fmtDate(g.fecha) },
                { label: 'Comercio', value: g.comercio },
                { label: 'NIF', value: g.nifComercio },
                { label: 'Categoría', value: optionLabel(GASTO_CATEGORIAS, g.categoria)?.label },
                { label: 'IVA', value: Number(g.iva) ? `${fmtMoney(g.iva)} (${Number(g.ivaTipo)} %)` : null },
                { label: 'Kilómetros', value: g.km ? `${Number(g.km)} km × ${fmtMoney(g.precioKm)}` : null },
                { label: 'Recorrido', value: g.origen || g.destino ? `${g.origen ?? ''} → ${g.destino ?? ''}` : null },
                { label: 'Concepto', value: g.concepto, span: 2 },
                { label: 'Aprobado por', value: g.aprobador ? `${g.aprobador}${g.aprobadoEn ? ` · ${fmtDate(g.aprobadoEn)}` : ''}` : null },
              ]}
            />
          </div>
        )}
      </Sheet>
      {edit && g && <GastoDialog gasto={g} onClose={() => { setEdit(false); onClose(); }} />}
    </>
  );
}
