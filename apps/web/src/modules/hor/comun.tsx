import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Coffee, Download, FileText, LogIn, LogOut, MapPin, MapPinOff, PenLine, Plus, type LucideIcon } from 'lucide-react';
import { fmtHours, horShared, nomShared, optionLabel } from '@kite/shared';
import { api, download } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, IconButton, Input, Segmented, Select, SignaturePad, Skeleton, Textarea } from '@/components/ui';

export const { FICHAJE_TIPOS, INCIDENCIA_TIPOS, CORRECCION_ESTADOS, CORRECCION_TIPOS, NOTA_LEGAL_REGISTRO, DIAS_SEMANA } = horShared;
export type DiaJornada = horShared.DiaJornada;

const TZ = 'Europe/Madrid';
export const hora = (iso: string | Date) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
export const hoyLocal = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
export const mesLocal = () => hoyLocal().slice(0, 7);
export function moverMes(mes: string, n: number) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
export const nombreMes = (mes: string) => nomShared.nombrePeriodo(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)));
export const diaCorto = (fecha: string) => {
  const d = new Date(fecha + 'T12:00:00Z');
  return { semana: DIAS_SEMANA[(d.getUTCDay() + 6) % 7]!.corto, num: d.getUTCDate() };
};
export const fechaLarga = (fecha: string) => new Date(fecha + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export const TIPO_ICONO: Record<string, LucideIcon> = { entrada: LogIn, salida: LogOut, pausa_inicio: Coffee, pausa_fin: Coffee };
export const TIPO_COLOR: Record<string, string> = { entrada: 'bg-ok-soft text-ok', salida: 'bg-primary-soft text-primary', pausa_inicio: 'bg-sun-soft text-warn', pausa_fin: 'bg-info-soft text-info' };

/** Tramos "08:02–13:30 · 14:31–17:05" de un día. */
export function tramos(d: DiaJornada) {
  const out: string[] = [];
  let ini: string | null = null;
  for (const f of d.fichajes.filter((x) => !x.anulado)) {
    if (f.tipo === 'entrada' || f.tipo === 'pausa_fin') ini = hora(f.momento);
    else if (ini) {
      out.push(`${ini}–${hora(f.momento)}`);
      ini = null;
    }
  }
  if (ini) out.push(`${ini}–…`);
  return out.join(' · ');
}

export function MonthNav({ mes, onChange, max }: { mes: string; onChange: (m: string) => void; max?: string }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton icon={ChevronLeft} label="Mes anterior" onClick={() => onChange(moverMes(mes, -1))} />
      <span className="min-w-[132px] text-center text-[14px] font-semibold capitalize">{nombreMes(mes)}</span>
      <IconButton icon={ChevronRight} label="Mes siguiente" disabled={!!max && mes >= max} onClick={() => onChange(moverMes(mes, 1))} />
    </div>
  );
}

export function IncidenciaBadge({ tipo }: { tipo: string }) {
  const o = optionLabel(INCIDENCIA_TIPOS, tipo);
  return (
    <Badge tone={o?.tone ?? 'gray'} dot>
      {o?.label ?? tipo}
    </Badge>
  );
}

/** Lista de fichajes de un día en forma de línea de tiempo. */
export function TimelineFichajes({ fichajes, compact }: { fichajes: DiaJornada['fichajes']; compact?: boolean }) {
  if (!fichajes.length) return <p className="py-3 text-center text-[13px] text-muted">Todavía no hay fichajes hoy</p>;
  return (
    <ol className="relative space-y-0">
      {fichajes.map((f, i) => {
        const Icon = TIPO_ICONO[f.tipo] ?? LogIn;
        return (
          <li key={f.id} className="relative flex items-center gap-3 py-2">
            {i < fichajes.length - 1 && <span className="absolute left-[17px] top-10 h-[calc(100%-24px)] w-px bg-line" aria-hidden />}
            <span className={cn('relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', f.anulado ? 'bg-sunken text-muted' : TIPO_COLOR[f.tipo])}>
              <Icon className="h-4 w-4" />
            </span>
            <div className={cn('min-w-0 flex-1', f.anulado && 'opacity-60')}>
              <p className={cn('text-[14px] font-medium', f.anulado && 'line-through')}>{optionLabel(FICHAJE_TIPOS, f.tipo)?.label}</p>
              {!compact && (
                <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                  {optionLabel(horShared.FICHAJE_ORIGENES, f.origen)?.label}
                  {f.dentroGeovalla === true && (
                    <span className="inline-flex items-center gap-0.5 text-ok">
                      <MapPin className="h-3 w-3" /> en el centro
                    </span>
                  )}
                  {f.dentroGeovalla === false && (
                    <span className="inline-flex items-center gap-0.5 text-warn">
                      <MapPinOff className="h-3 w-3" /> fuera del centro
                    </span>
                  )}
                  {f.anulado && <span>anulado por corrección</span>}
                </p>
              )}
            </div>
            <span className={cn('tabular font-display text-[17px] font-bold', f.anulado && 'text-muted line-through')}>{hora(f.momento)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Solicitud de corrección de un fichaje (añadir, cambiar la hora o anular). */
export function CorreccionDialog({ open, onOpenChange, fecha: fechaInicial, personaId }: { open: boolean; onOpenChange: (o: boolean) => void; fecha?: string; personaId?: string }) {
  const [tipo, setTipo] = useState<'anadir' | 'modificar' | 'anular'>('anadir');
  const [fecha, setFecha] = useState(fechaInicial ?? hoyLocal());
  const [nuevoTipo, setNuevoTipo] = useState('salida');
  const [hora_, setHora] = useState('');
  const [fichajeId, setFichajeId] = useState('');
  const [motivo, setMotivo] = useState('');
  const fichajes = useApi<any[]>(open && tipo !== 'anadir' ? `/hor/fichajes?desde=${fecha}&hasta=${fecha}${personaId ? `&personaId=${personaId}` : ''}` : null);
  const validos = (fichajes.data ?? []).filter((f) => !f.anulado && f.fecha === fecha);
  const enviar = useMut(() => api.post('/hor/correcciones', { personaId, fecha, tipo, nuevoTipo: tipo === 'anadir' ? nuevoTipo : undefined, hora: tipo === 'anular' ? undefined : hora_, fichajeId: tipo === 'anadir' ? undefined : fichajeId, motivo }), {
    ok: 'Corrección enviada a tu responsable',
    invalidate: ['/hor'],
    onSuccess: () => {
      onOpenChange(false);
      setMotivo('');
      setHora('');
      setFichajeId('');
    },
  });
  const listo = motivo.trim().length >= 3 && (tipo === 'anular' ? !!fichajeId : !!hora_ && (tipo === 'anadir' || !!fichajeId));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pedir una corrección"
      description="El fichaje original no se borra: queda anulado y se guarda junto a la corrección aprobada."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!listo} loading={enviar.isPending} onClick={() => enviar.mutate(undefined)}>
            Enviar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={tipo}
          onChange={setTipo}
          options={[
            { value: 'anadir', label: 'Me olvidé de fichar' },
            { value: 'modificar', label: 'Hora incorrecta' },
            { value: 'anular', label: 'Fichaje erróneo' },
          ]}
          className="w-full"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día">
            <Input type="date" value={fecha} max={hoyLocal()} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          {tipo !== 'anular' && (
            <Field label={tipo === 'anadir' ? 'Hora real' : 'Hora correcta'}>
              <Input type="time" value={hora_} onChange={(e) => setHora(e.target.value)} />
            </Field>
          )}
        </div>
        {tipo === 'anadir' ? (
          <Field label="¿Qué fichaje falta?">
            <Select value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} options={FICHAJE_TIPOS} />
          </Field>
        ) : (
          <Field label="Fichaje">
            {fichajes.isLoading ? (
              <Skeleton className="h-9" />
            ) : validos.length ? (
              <Select value={fichajeId} onChange={(e) => setFichajeId(e.target.value)} placeholder="Elige el fichaje" options={validos.map((f) => ({ value: f.id, label: `${optionLabel(FICHAJE_TIPOS, f.tipo)?.label} · ${f.hora}` }))} />
            ) : (
              <p className="text-[13px] text-muted">No hay fichajes ese día.</p>
            )}
          </Field>
        )}
        <Field label="Motivo" required help="Tu responsable lo verá al aprobarla">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: salí de la obra sin cobertura y no pude fichar" />
        </Field>
      </div>
    </Dialog>
  );
}

/** Resumen mensual de jornada: días, horas, incidencias, firma y descarga del registro oficial. */
export function MesJornada({ personaId, propio, mes: mesInicial }: { personaId?: string; propio?: boolean; mes?: string }) {
  const [mes, setMes] = useState(mesInicial ?? mesLocal());
  const url = `/hor/mes?mes=${mes}${personaId ? `&personaId=${personaId}` : ''}`;
  const { data, isLoading } = useApi<any>(url);
  const [correccion, setCorreccion] = useState<string | null>(null);
  const [firmar, setFirmar] = useState(false);
  const [firma, setFirma] = useState<string | null>(null);
  const firmarMut = useMut(() => api.post('/hor/mes/firmar', { mes, firma, hash: data.hash }), { ok: 'Registro del mes firmado', invalidate: ['/hor/mes'], onSuccess: () => setFirmar(false) });
  const dias: DiaJornada[] = data?.dias ?? [];
  const hoy = hoyLocal();
  const visibles = useMemo(() => dias.filter((d) => d.fecha <= hoy).reverse(), [dias, hoy]);
  const t = data?.totales;
  const descarga = (format: string) => download(`/hor/registro?mes=${mes}&format=${format}&personaId=${personaId ?? data?.persona?.id ?? ''}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav mes={mes} onChange={setMes} max={mesLocal()} />
        <div className="flex gap-2">
          <Button size="sm" icon={Download} onClick={() => descarga('xlsx')}>
            Excel
          </Button>
          <Button size="sm" icon={FileText} onClick={() => descarga('pdf')}>
            PDF
          </Button>
        </div>
      </div>
      {isLoading || !t ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Trabajadas" value={fmtHours(t.trabajadas)} hint={`de ${fmtHours(t.previstas)}`} />
          <MiniStat label="Diferencia" value={fmtHours(t.diferencia)} tone={t.diferencia < -0.5 ? 'text-bad' : t.diferencia > 0.5 ? 'text-ok' : undefined} hint={`Bolsa: ${fmtHours(data.saldoBolsa)}`} />
          <MiniStat label="Extra / nocturnas" value={fmtHours(t.extra)} hint={`${fmtHours(t.nocturnas)} nocturnas`} />
          <MiniStat label="Incidencias" value={String(t.incidencias)} tone={t.incidencias ? 'text-warn' : 'text-ok'} hint={`${t.diasTrabajados} días trabajados`} />
        </div>
      )}
      {data?.firma ? (
        <Alert tone={data.firma.vigente ? 'green' : 'yellow'} icon={data.firma.vigente ? CheckCircle2 : AlertTriangle} title={data.firma.vigente ? 'Registro firmado' : 'Firmado, pero ha cambiado después'}>
          Firmado el {new Date(data.firma.firmadoEn).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}.{!data.firma.vigente && ' Se aprobó alguna corrección después de la firma.'}
        </Alert>
      ) : data?.puedeFirmar ? (
        <Alert tone="violet" icon={PenLine} title="Revisa y firma tu registro del mes">
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span>Si algo no cuadra, pide una corrección antes de firmar.</span>
            <Button size="sm" variant="primary" onClick={() => setFirmar(true)}>
              Firmar el mes
            </Button>
          </div>
        </Alert>
      ) : null}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !visibles.length ? (
          <EmptyState icon={CalendarClock} title="Sin días en este mes" />
        ) : (
          <ul className="divide-y divide-line">
            {visibles.map((d) => {
              const dc = diaCorto(d.fecha);
              const libre = !d.previstas && !d.trabajadas;
              return (
                <li key={d.fecha} className={cn('flex items-center gap-3 px-3 py-2.5 sm:px-4', libre && 'bg-sunken/40')}>
                  <div className={cn('flex w-10 shrink-0 flex-col items-center rounded-lg py-1', d.fecha === hoy ? 'bg-primary text-primary-fg' : 'bg-sunken')}>
                    <span className="text-[10.5px] font-semibold uppercase">{dc.semana}</span>
                    <span className="tabular text-[15px] font-bold leading-none">{dc.num}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="tabular truncate text-[13.5px] font-medium">{tramos(d) || (d.festivo ? d.festivo : d.ausencia ? d.ausencia.tipo : libre ? 'Libre' : 'Sin fichajes')}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {d.turno && <span className="text-[11.5px] text-muted">{d.turno.nombre} {d.turno.horaInicio}–{d.turno.horaFin}</span>}
                      {d.ausencia && (
                        <Badge tone="green" className="!py-0 text-[11px]">
                          {d.ausencia.tipo}
                        </Badge>
                      )}
                      {d.festivo && (
                        <Badge tone="brown" className="!py-0 text-[11px]">
                          Festivo
                        </Badge>
                      )}
                      {d.incidencias.map((i) => (
                        <IncidenciaBadge key={i.tipo} tipo={i.tipo} />
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[14px] font-semibold">{d.trabajadas ? fmtHours(d.trabajadas) : '—'}</p>
                    {d.extra > 0 && <p className="tabular text-[11.5px] text-ok">+{fmtHours(d.extra)}</p>}
                  </div>
                  {propio && <IconButton icon={Plus} label="Pedir corrección de este día" size="sm" onClick={() => setCorreccion(d.fecha)} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-[11.5px] leading-relaxed text-muted">{NOTA_LEGAL_REGISTRO}</p>
      {correccion && <CorreccionDialog open={!!correccion} onOpenChange={(o) => !o && setCorreccion(null)} fecha={correccion} />}
      <Dialog
        open={firmar}
        onOpenChange={setFirmar}
        title={`Firmar el registro de ${nombreMes(mes).toLowerCase()}`}
        description="Con tu firma confirmas que el registro de jornada del mes es correcto."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFirmar(false)}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!firma} loading={firmarMut.isPending} onClick={() => firmarMut.mutate(undefined)}>
              Firmar
            </Button>
          </>
        }
      >
        {t && (
          <p className="mb-3 text-[13.5px]">
            {t.diasTrabajados} días trabajados · {fmtHours(t.trabajadas)} en total · {fmtHours(t.extra)} por encima de la jornada.
          </p>
        )}
        <SignaturePad onChange={setFirma} />
      </Dialog>
    </div>
  );
}

export function MiniStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line-strong/70 bg-surface px-3 py-2.5">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className={cn('tabular font-display text-[18px] font-bold leading-tight', tone)}>{value}</p>
      {hint && <p className="tabular truncate text-[11.5px] text-muted">{hint}</p>}
    </div>
  );
}

export function EstadoCorreccion({ c }: { c: any }) {
  const tipoNuevo = optionLabel(FICHAJE_TIPOS, c.nuevoTipo)?.label?.toLowerCase();
  const que = c.tipo === 'anadir' ? `Añadir ${tipoNuevo} a las ${c.nuevaHora}` : c.tipo === 'anular' ? `Anular ${optionLabel(FICHAJE_TIPOS, c.original?.tipo)?.label?.toLowerCase() ?? 'fichaje'} de las ${c.original?.hora ?? '?'}` : `Cambiar ${optionLabel(FICHAJE_TIPOS, c.original?.tipo)?.label?.toLowerCase() ?? 'fichaje'} de ${c.original?.hora ?? '?'} a ${c.nuevaHora}`;
  return <span>{que}</span>;
}
