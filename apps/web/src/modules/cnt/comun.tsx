import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cntShared, fmtMoney, round } from '@kite/shared';
import { api } from '@/lib/api';
import { useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Dialog, Field, IconButton, Input, Select } from '@/components/ui';
import { NumberInput } from '@/components/form/inputs';
import { RefSelect } from '@/components/form/RefSelect';

export const { ASIENTO_ORIGENES, EJERCICIO_ESTADOS, PGC_GRUPOS } = cntShared;

export function anios(n = 6) {
  const a = new Date().getFullYear();
  return Array.from({ length: n }, (_, i) => ({ value: String(a - i), label: String(a - i) }));
}

export function AnioSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return <Select className={cn('w-28', className)} value={value} onChange={(e) => onChange(e.target.value)} options={anios()} />;
}

/** Importe con signo y color para los estados financieros. */
export function Importe({ v, bold }: { v: number; bold?: boolean }) {
  return <span className={cn('tabular-nums', v < 0 && 'text-bad', bold && 'font-semibold')}>{fmtMoney(v)}</span>;
}

interface Linea {
  key: string;
  cuentaId: string | null;
  cuentaLabel?: string;
  debe: number | null;
  haber: number | null;
  concepto: string;
  centroCosteId?: string | null;
}
const nuevaLinea = (): Linea => ({ key: crypto.randomUUID(), cuentaId: null, debe: null, haber: null, concepto: '' });

/** Editor de asiento manual: el asiento solo se guarda si cuadra (debe = haber). */
export function AsientoEditor({ asiento, onClose }: { asiento?: any; onClose: () => void }) {
  const [fecha, setFecha] = useState<string>(asiento?.fecha ?? new Date().toLocaleDateString('sv-SE'));
  const [concepto, setConcepto] = useState<string>(asiento?.concepto ?? '');
  const [lineas, setLineas] = useState<Linea[]>(
    asiento?.lineas?.map((l: any) => ({ key: l.id, cuentaId: l.cuentaId, cuentaLabel: `${l.cuenta} · ${l.nombre}`, debe: Number(l.debe) || null, haber: Number(l.haber) || null, concepto: l.concepto ?? '', centroCosteId: l.centroCosteId })) ?? [nuevaLinea(), nuevaLinea()],
  );
  const debe = round(lineas.reduce((s, l) => s + (l.debe ?? 0), 0));
  const haber = round(lineas.reduce((s, l) => s + (l.haber ?? 0), 0));
  const descuadre = round(debe - haber);
  const upd = (i: number, p: Partial<Linea>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const guardar = useMut(
    () => {
      const body = { fecha, concepto, lineas: lineas.filter((l) => l.cuentaId && (l.debe || l.haber)).map((l) => ({ cuentaId: l.cuentaId, debe: l.debe ?? 0, haber: l.haber ?? 0, concepto: l.concepto || null, centroCosteId: l.centroCosteId ?? null })) };
      return asiento ? api.put(`/cnt/asientos/${asiento.id}`, body) : api.post('/cnt/asientos', body);
    },
    { ok: 'Asiento guardado', invalidate: ['/cnt'], onSuccess: onClose },
  );
  return (
    <Dialog
      open
      size="xl"
      onOpenChange={(o) => !o && onClose()}
      title={asiento ? `Asiento ${asiento.numero}` : 'Nuevo asiento'}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className={cn('text-[13px]', descuadre ? 'font-semibold text-bad' : 'text-muted')}>
            Debe {fmtMoney(debe)} · Haber {fmtMoney(haber)}
            {descuadre !== 0 && ` · descuadre ${fmtMoney(descuadre)}`}
          </span>
          <Button variant="primary" disabled={descuadre !== 0 || !debe || !concepto.trim()} loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>
            Guardar asiento
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Concepto">
            <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="p. ej. Alquiler de marzo" />
          </Field>
        </div>
        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_1fr_120px_120px_32px] gap-2 text-[12px] font-semibold text-muted md:grid">
            <span>Cuenta</span>
            <span>Concepto de la línea</span>
            <span className="text-right">Debe</span>
            <span className="text-right">Haber</span>
            <span />
          </div>
          {lineas.map((l, i) => (
            <div key={l.key} className="grid gap-2 rounded-xl bg-sunken/60 p-2 md:grid-cols-[1fr_1fr_120px_120px_32px] md:bg-transparent md:p-0">
              <RefSelect target="cnt_cuentas" value={l.cuentaId} label={l.cuentaLabel} onChange={(id, o) => upd(i, { cuentaId: id, cuentaLabel: o?.label })} placeholder="Código o nombre" />
              <Input value={l.concepto} onChange={(e) => upd(i, { concepto: e.target.value })} placeholder={concepto || 'Concepto'} />
              <NumberInput value={l.debe} onChange={(n) => upd(i, { debe: n, haber: n ? null : l.haber })} placeholder="Debe" />
              <NumberInput value={l.haber} onChange={(n) => upd(i, { haber: n, debe: n ? null : l.debe })} placeholder="Haber" />
              <IconButton icon={Trash2} label="Quitar línea" size="sm" disabled={lineas.length <= 2} onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, nuevaLinea()])}>
              Línea
            </Button>
            {descuadre !== 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLineas((ls) => [...ls, { ...nuevaLinea(), debe: descuadre < 0 ? -descuadre : null, haber: descuadre > 0 ? descuadre : null }])}
              >
                Cuadrar con una línea de {fmtMoney(Math.abs(descuadre))}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
