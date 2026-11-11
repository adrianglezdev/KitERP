import { useState } from 'react';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, fmtMoney, nomShared } from '@kite/shared';
import { api, errorMessage } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Badge, Button, Dialog, EmptyState, EnumBadge, Field, Input, Spinner, Textarea } from '@/components/ui';
import { NumberInput } from '@/components/form/inputs';

export const { PERIODO_ESTADOS, VARIABLE_CONCEPTOS, RECIBO_TIPOS, ANTICIPO_ESTADOS, MESES, nombrePeriodo } = nomShared;

/** Abre un recibo con un enlace temporal (y queda registrado como leído si es tuyo). */
export async function abrirRecibo(id: string) {
  const w = window.open('', '_blank');
  try {
    const r = await api.post<{ url: string }>(`/nom/recibos/${id}/abrir`, {});
    if (w) w.location.href = r.url;
    else window.location.href = r.url;
  } catch (e) {
    w?.close();
    toast.error(errorMessage(e));
  }
}

/** Lista de recibos agrupada por año. */
export function ListaRecibos({ url, onAbierto }: { url: string; onAbierto?: () => void }) {
  const { data, isLoading, refetch } = useApi<any[]>(url);
  if (isLoading) return <Spinner />;
  if (!data?.length) return <EmptyState icon={FileText} title="Aún no hay recibos" />;
  const anios = [...new Set(data.map((r) => r.anio))].sort((a, b) => b - a);
  return (
    <div className="space-y-4">
      {anios.map((a) => (
        <div key={a}>
          <p className="label mb-1">{a}</p>
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
            {data
              .filter((r) => r.anio === a)
              .map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={async () => {
                      await abrirRecibo(r.id);
                      refetch();
                      onAbierto?.();
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sunken"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{r.titulo ?? (r.mes ? nombrePeriodo(r.anio, r.mes) : 'Documento')}</span>
                      <span className="text-[12px] text-muted">
                        <EnumBadge options={RECIBO_TIPOS} value={r.tipo} dot={false} /> {r.publicadoEn && `· publicado el ${fmtDate(r.publicadoEn)}`}
                      </span>
                    </span>
                    {r.neto ? <span className="hidden text-[13px] tabular-nums sm:inline">{fmtMoney(r.neto)}</span> : null}
                    {!r.leido && <Badge tone="violet">Nuevo</Badge>}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AnticipoDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ importe: null as number | null, motivo: '', fechaDeseada: '' });
  const m = useMut(() => api.post('/nom/anticipos', { importe: f.importe, motivo: f.motivo || null, fechaDeseada: f.fechaDeseada || null }), { ok: 'Solicitud enviada', invalidate: ['/nom/anticipos'], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Pedir un anticipo" footer={<Button variant="primary" disabled={!f.importe} loading={m.isPending} onClick={() => m.mutate(undefined)}>Enviar solicitud</Button>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Importe" required>
            <NumberInput value={f.importe} onChange={(n) => setF({ ...f, importe: n })} suffix="€" />
          </Field>
          <Field label="Lo necesito el">
            <Input type="date" value={f.fechaDeseada} onChange={(e) => setF({ ...f, fechaDeseada: e.target.value })} />
          </Field>
        </div>
        <Field label="Motivo (opcional)">
          <Textarea rows={2} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />
        </Field>
        <p className="text-[12.5px] text-muted">Se descuenta de tu próxima nómina. Lo aprueba tu responsable o RRHH.</p>
      </div>
    </Dialog>
  );
}

export function AnticipoFila({ a, onAprobar, onRechazar }: { a: any; onAprobar?: () => void; onRechazar?: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[13.5px]">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          {a.persona ? `${a.persona} · ` : ''}
          {fmtMoney(a.importe)}
        </span>
        <span className="text-[12px] text-muted">
          Pedido el {fmtDate(a.creadoEn)}
          {a.fechaDeseada && ` · para el ${fmtDate(a.fechaDeseada)}`}
          {a.motivo && ` · ${a.motivo}`}
        </span>
      </span>
      <EnumBadge options={ANTICIPO_ESTADOS} value={a.estado} />
      {a.puedeAprobar && onAprobar && (
        <>
          <Button size="sm" onClick={onRechazar}>
            Rechazar
          </Button>
          <Button size="sm" variant="primary" onClick={onAprobar}>
            Aprobar
          </Button>
        </>
      )}
    </li>
  );
}
