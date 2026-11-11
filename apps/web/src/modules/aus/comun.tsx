import { useState } from 'react';
import { AlertTriangle, CalendarPlus, Users } from 'lucide-react';
import { ausShared, fmtDate, fmtNumber, optionLabel } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useDebounced, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, Dialog, Field, FileChip, FileDrop, Input, ProgressBar, RefSelect, Select, Textarea, type UploadedFile } from '@/components/ui';

export const ESTADOS = ausShared.SOLICITUD_ESTADOS;
export type SaldoResumen = ausShared.SaldoResumen;

export function SaldoCard({ s }: { s: SaldoResumen }) {
  const total = s.asignados + s.arrastre + s.ajuste;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
        <p className="text-[13px] font-semibold">{s.tipo}</p>
      </div>
      <p className="tabular mt-1 font-display text-[28px] font-extrabold">
        {fmtNumber(s.disponibles, 1)} <span className="text-[14px] font-medium text-muted">días disponibles</span>
      </p>
      <ProgressBar value={s.disfrutados + s.pendientes} max={total || 1} tone="green" />
      <p className="mt-1.5 text-[12px] text-muted">
        {fmtNumber(total, 1)} en {s.anio} ({fmtNumber(s.asignados, 1)} + {fmtNumber(s.arrastre, 1)} del año anterior) · {fmtNumber(s.disfrutados, 1)} disfrutados · {fmtNumber(s.pendientes, 1)} pedidos · días {s.unidad}
      </p>
    </Card>
  );
}

export function EstadoBadge({ estado }: { estado: string }) {
  const o = optionLabel(ESTADOS, estado);
  return <Badge tone={o?.tone ?? 'gray'} dot>{o?.label ?? estado}</Badge>;
}

export function rango(desde: string, hasta: string, medio?: string | null) {
  return desde === hasta ? `${fmtDate(desde)}${medio ? ` (${medio === 'manana' ? 'mañana' : 'tarde'})` : ''}` : `${fmtDate(desde)} – ${fmtDate(hasta)}`;
}

/** Diálogo para pedir una ausencia, con vista previa de días, saldo resultante y solapes. */
export function SolicitudDialog({ open, onOpenChange, personaId }: { open: boolean; onOpenChange: (o: boolean) => void; personaId?: string }) {
  const { can } = useSession();
  const hoy = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ tipoId: null as string | null, desde: hoy, hasta: hoy, medioDia: '', motivo: '' });
  const [just, setJust] = useState<UploadedFile | null>(null);
  // se compara como texto para que el retardo no se reinicie en cada pintado
  const q = JSON.parse(useDebounced(JSON.stringify(f), 300)) as typeof f;
  const prev = useApi<any>(q.tipoId && q.desde ? `/aus/preview?tipoId=${q.tipoId}&desde=${q.desde}&hasta=${q.hasta || q.desde}${q.medioDia ? `&medioDia=${q.medioDia}` : ''}${personaId ? `&personaId=${personaId}` : ''}` : null, { retry: false });
  const enviar = useMut(() => api.post('/aus/solicitudes', { ...f, hasta: f.hasta || f.desde, medioDia: f.medioDia || null, motivo: f.motivo || null, justificanteArchivoId: just?.id ?? null, personaId: personaId ?? null }), {
    ok: personaId ? 'Ausencia registrada' : 'Solicitud enviada a tu responsable',
    invalidate: ['/aus', '/aprobaciones'],
    onSuccess: () => {
      onOpenChange(false);
      setJust(null);
    },
  });
  const p = prev.data;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={personaId ? 'Registrar ausencia' : 'Pedir vacaciones o permiso'}
      footer={
        <Button variant="primary" icon={CalendarPlus} disabled={!f.tipoId || !p || p.dias <= 0 || (p.requiereJustificante && !just && !can('aus.gestionar'))} loading={enviar.isPending} onClick={() => enviar.mutate(undefined)}>
          {personaId ? 'Registrar' : 'Enviar solicitud'}
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Tipo">
          <RefSelect target="aus.tipos" value={f.tipoId} onChange={(v) => setF({ ...f, tipoId: v })} placeholder="Vacaciones, asuntos propios…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde">
            <Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value, hasta: f.hasta < e.target.value ? e.target.value : f.hasta })} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={f.hasta} min={f.desde} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
          </Field>
        </div>
        {f.desde === f.hasta && (
          <Field label="Duración">
            <Select value={f.medioDia} onChange={(e) => setF({ ...f, medioDia: e.target.value })} options={ausShared.MEDIO_DIA} placeholder="Día completo" />
          </Field>
        )}
        <Field label="Comentario (opcional)">
          <Textarea value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} rows={2} />
        </Field>
        {p?.requiereJustificante && (
          <Field label="Justificante" help="Haz una foto con el móvil o sube un PDF">
            {just ? <FileChip f={just} onRemove={() => setJust(null)} /> : <FileDrop compact multiple={false} accept="image/*,application/pdf" capture onUploaded={(fs) => setJust(fs[0] ?? null)} label="Adjuntar justificante" />}
          </Field>
        )}
        {prev.isError && <Alert tone="red">{String((prev.error as Error)?.message)}</Alert>}
        {p && (
          <div className={cn('rounded-xl p-3 text-[13.5px]', p.dias > 0 ? 'bg-sunken' : 'bg-bad-soft')}>
            <p className="font-semibold">
              {fmtNumber(p.dias, 1)} {p.unidad === 'naturales' ? 'días naturales' : 'días laborables'}
            </p>
            {p.saldo && (
              <p className={cn(p.saldo.despues < 0 ? 'font-medium text-bad' : 'text-muted')}>
                Te quedarían {fmtNumber(p.saldo.despues, 1)} de {fmtNumber(p.saldo.disponibles, 1)} disponibles
              </p>
            )}
            {p.solapePropio && <p className="text-bad">Ya tienes una ausencia en esas fechas.</p>}
            {(Array.isArray(p.companeros) ? p.companeros.length : p.companeros) > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-warn">
                <Users className="h-4 w-4" />
                {Array.isArray(p.companeros) ? `También faltan: ${p.companeros.map((c: any) => c.nombre).join(', ')}` : `${p.companeros} compañeros de tu departamento también faltan esos días`}
              </p>
            )}
            {p.minimo && (
              <p className="mt-1 flex items-center gap-1.5 text-bad">
                <AlertTriangle className="h-4 w-4" /> {typeof p.minimo === 'string' ? p.minimo : 'Se quedaría el departamento por debajo del mínimo de personas'}
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
