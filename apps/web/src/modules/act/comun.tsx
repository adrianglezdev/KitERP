import { useState } from 'react';
import { Check } from 'lucide-react';
import { actShared, fmtDate } from '@kite/shared';
import { api } from '@/lib/api';
import { useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Badge, Button, Dialog, Field, Input, Textarea } from '@/components/ui';
import { FileDrop, NumberInput } from '@/components/form/inputs';
import { RefSelect } from '@/components/form/RefSelect';

export const { ACTIVO_TIPOS, ACTIVO_ESTADOS, VENCIMIENTO_TIPOS, VENCIMIENTO_ESTADOS, REGISTRO_TIPOS, activoResource, vencimientoResource, registroResource } = actShared;

export function DiasBadge({ v }: { v: { dias: number; vencido: boolean; enAviso: boolean; estado: string } }) {
  if (v.estado !== 'pendiente') return null;
  if (v.vencido) return <Badge tone="red">Vencido hace {-v.dias} d</Badge>;
  if (v.enAviso) return <Badge tone="orange">{v.dias === 0 ? 'Hoy' : `En ${v.dias} d`}</Badge>;
  return <span className="text-[12px] text-muted">En {v.dias} d</span>;
}

/** Marcar un vencimiento (ITV, seguro, revisión…) como hecho; si se repite se crea el siguiente. */
export function CompletarDialog({ v, onClose }: { v: any; onClose: () => void }) {
  const [f, setF] = useState({ fecha: new Date().toLocaleDateString('sv-SE'), coste: null as number | null, proveedorId: null as string | null, km: null as number | null, notas: '', archivoId: null as string | null });
  const m = useMut(() => api.post(`/act/vencimientos/${v.id}/completar`, { ...f, notas: f.notas || null }), { ok: v.periodicidadMeses ? 'Hecho. Se ha creado el siguiente vencimiento.' : 'Marcado como hecho', invalidate: ['/act'], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${v.descripcion || 'Vencimiento'} · ${v.activo ?? ''}`} footer={<Button variant="primary" icon={Check} loading={m.isPending} onClick={() => m.mutate(undefined)}>Marcar como hecho</Button>}>
      <div className="space-y-3">
        <p className="text-[13px] text-muted">Vencía el {fmtDate(v.fecha)}. Se guarda como un registro de mantenimiento del activo.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha">
            <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </Field>
          <Field label="Coste (sin IVA)">
            <NumberInput value={f.coste} onChange={(n) => setF({ ...f, coste: n })} suffix="€" />
          </Field>
          <Field label="Proveedor / taller">
            <RefSelect target="proveedores" value={f.proveedorId} onChange={(id) => setF({ ...f, proveedorId: id })} />
          </Field>
          <Field label="Kilómetros">
            <NumberInput value={f.km} onChange={(n) => setF({ ...f, km: n })} decimals={0} />
          </Field>
        </div>
        <Field label="Notas">
          <Textarea rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
        </Field>
        <FileDrop multiple={false} compact label={f.archivoId ? 'Factura adjuntada' : 'Factura o certificado (opcional)'} onUploaded={(x) => setF({ ...f, archivoId: x[0]?.id ?? null })} />
      </div>
    </Dialog>
  );
}

export const tono = (v: any) => cn(v.vencido && 'text-bad font-semibold', !v.vencido && v.enAviso && 'text-warn');
