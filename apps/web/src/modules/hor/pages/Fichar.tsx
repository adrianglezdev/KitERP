import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Coffee, History, KeyRound, Loader2, LogIn, LogOut, MapPin, MapPinOff, Navigation, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { fmtHours, optionLabel } from '@kite/shared';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, PageHeader, ProgressBar, Skeleton, Spinner, Tabs, useConfirm, useTab } from '@/components/ui';
import { CORRECCION_ESTADOS, CorreccionDialog, EstadoCorreccion, FICHAJE_TIPOS, MesJornada, NOTA_LEGAL_REGISTRO, TimelineFichajes, fechaLarga, hora, hoyLocal } from '../comun';

type Geo = 'desconocido' | 'concedido' | 'pendiente' | 'denegado' | 'no_disponible';

function useReloj(offsetMs: number) {
  const [now, setNow] = useState(() => new Date(Date.now() + offsetMs));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date(Date.now() + offsetMs)), 1000);
    return () => clearInterval(t);
  }, [offsetMs]);
  return now;
}

function useGeoPermiso(): [Geo, () => void] {
  const [estado, setEstado] = useState<Geo>('desconocido');
  const check = () => {
    if (!('geolocation' in navigator)) return setEstado('no_disponible');
    if (!navigator.permissions?.query) return setEstado('pendiente');
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        const map = (s: PermissionState): Geo => (s === 'granted' ? 'concedido' : s === 'denied' ? 'denegado' : 'pendiente');
        setEstado(map(p.state));
        p.onchange = () => setEstado(map(p.state));
      })
      .catch(() => setEstado('pendiente'));
  };
  useEffect(check, []);
  return [estado, check];
}

function posicion(): Promise<GeolocationPosition | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

const fmtDuracion = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export default function Fichar() {
  const tab = useTab('hoy');
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Fichar" subtitle="Registro de jornada" />
      <Tabs
        tabs={[
          { id: 'hoy', label: 'Hoy', icon: CalendarClock },
          { id: 'mes', label: 'Mi mes', icon: History },
          { id: 'correcciones', label: 'Correcciones', icon: Plus },
        ]}
      />
      {tab === 'hoy' && <Hoy />}
      {tab === 'mes' && <MesJornada propio />}
      {tab === 'correcciones' && <MisCorrecciones />}
    </div>
  );
}

function Hoy() {
  const { data, isLoading, error, refetch } = useApi<any>('/hor/estado', { refetchInterval: 60_000, refetchOnWindowFocus: true });
  const confirm = useConfirm();
  const [geo, recheckGeo] = useGeoPermiso();
  const [busy, setBusy] = useState<string | null>(null);
  const [pin, setPin] = useState(false);
  const [correccion, setCorreccion] = useState(false);
  const offset = useRef(0);
  if (data?.servidor && !offset.current) offset.current = new Date(data.servidor).getTime() - Date.now();
  const now = useReloj(offset.current);

  if (isLoading) return <Spinner />;
  if (error || !data) return <Alert tone="red">{errorMessage(error) || 'No se ha podido cargar tu jornada'}</Alert>;

  const estado: 'fuera' | 'trabajando' | 'pausa' = data.estado;
  // horas de hoy en vivo: lo calculado por el servidor más lo transcurrido desde la última consulta
  const base = data.hoy?.trabajadas ?? 0;
  const vivo = estado === 'trabajando' ? (now.getTime() - new Date(data.servidor).getTime()) / 3600000 : 0;
  const horasHoy = base + Math.max(0, vivo);
  const previstas = data.hoy?.previstas ?? 0;
  const semana = data.semana;

  const fichar = async (tipo: string) => {
    if (tipo === 'salida') {
      const ok = await confirm({ title: '¿Fichar la salida?', message: `Llevas ${fmtHours(horasHoy)} trabajadas hoy.`, confirm: 'Fichar salida' });
      if (!ok) return;
    }
    setBusy(tipo);
    try {
      const pos = geo === 'no_disponible' ? null : await posicion();
      recheckGeo();
      const r = await api.post<any>('/hor/fichar', {
        tipo,
        origen: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'movil' : 'web',
        lat: pos?.coords.latitude ?? null,
        lng: pos?.coords.longitude ?? null,
        precision: pos?.coords.accuracy ?? null,
      });
      navigator.vibrate?.(60);
      const label = optionLabel(FICHAJE_TIPOS, r.fichaje.tipo)?.label ?? 'Fichaje';
      toast.success(`${label} registrada a las ${hora(r.fichaje.momento)}`, { description: r.fichaje.dentroGeovalla === false ? 'Estás fuera del centro de trabajo: tu responsable lo verá.' : !pos ? 'Sin ubicación.' : undefined });
      await refetch();
    } catch (e) {
      toast.error(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) refetch();
    } finally {
      setBusy(null);
    }
  };

  const principal =
    estado === 'fuera'
      ? { tipo: 'entrada', label: 'Fichar entrada', icon: LogIn, cls: 'bg-ok text-white shadow-[0_12px_32px_-8px_rgb(53_174_41/0.55)]' }
      : estado === 'trabajando'
        ? { tipo: 'salida', label: 'Fichar salida', icon: LogOut, cls: 'bg-primary text-primary-fg shadow-[0_12px_32px_-8px_rgb(125_44_221/0.55)]' }
        : { tipo: 'pausa_fin', label: 'Volver de la pausa', icon: Coffee, cls: 'bg-info text-white shadow-[0_12px_32px_-8px_rgb(52_102_214/0.5)]' };
  const secundario = estado === 'trabajando' ? { tipo: 'pausa_inicio', label: 'Iniciar pausa', icon: Coffee } : estado === 'pausa' ? { tipo: 'salida', label: 'Fichar salida', icon: LogOut } : null;
  const Icon = principal.icon;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-col items-center px-4 pb-6 pt-5 text-center">
          <p className="text-[13px] capitalize text-muted">{fechaLarga(hoyLocal())}</p>
          <p className="tabular font-display text-[44px] font-extrabold leading-none tracking-tight" aria-live="off">
            {now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' })}
          </p>
          <div className="mt-3">
            {estado === 'trabajando' && (
              <Badge tone="green" dot className="text-[13px]">
                Trabajando desde las {data.desde ? hora(data.desde) : hora(data.ultimo.momento)}
              </Badge>
            )}
            {estado === 'pausa' && (
              <Badge tone="yellow" dot className="text-[13px]">
                En pausa desde las {hora(data.ultimo.momento)}
              </Badge>
            )}
            {estado === 'fuera' && (
              <Badge tone="gray" dot className="text-[13px]">
                {data.ultimo ? `Fuera · última salida a las ${hora(data.ultimo.momento)}` : 'Fuera de la jornada'}
              </Badge>
            )}
          </div>

          <button
            type="button"
            onClick={() => fichar(principal.tipo)}
            disabled={!!busy}
            className={cn('mt-6 flex h-44 w-44 select-none flex-col items-center justify-center gap-2 rounded-full text-[17px] font-bold transition active:scale-95 disabled:opacity-80 sm:h-48 sm:w-48', principal.cls)}
            aria-label={principal.label}
          >
            {busy === principal.tipo ? <Loader2 className="h-10 w-10 animate-spin" /> : <Icon className="h-10 w-10" />}
            <span className="px-4 leading-tight">{principal.label}</span>
          </button>
          {secundario && (
            <Button className="mt-4" size="lg" icon={secundario.icon} loading={busy === secundario.tipo} disabled={!!busy} onClick={() => fichar(secundario.tipo)}>
              {secundario.label}
            </Button>
          )}

          <div className="mt-5 flex items-center gap-1.5 text-[12.5px]">
            {geo === 'concedido' && (
              <span className="inline-flex items-center gap-1 text-ok">
                <MapPin className="h-3.5 w-3.5" /> Ubicación activada
              </span>
            )}
            {geo === 'pendiente' && (
              <span className="inline-flex items-center gap-1 text-muted">
                <Navigation className="h-3.5 w-3.5" /> Te pediremos la ubicación al fichar
              </span>
            )}
            {geo === 'denegado' && (
              <span className="inline-flex items-center gap-1 text-warn">
                <MapPinOff className="h-3.5 w-3.5" /> Ubicación bloqueada: fichas igualmente, sin ubicación
              </span>
            )}
            {geo === 'no_disponible' && <span className="text-muted">Este dispositivo no da la ubicación</span>}
          </div>
        </div>
        {geo === 'denegado' && (
          <div className="border-t border-line px-4 py-3 text-[12.5px] text-muted">
            Para activarla, abre los ajustes del navegador (icono del candado junto a la dirección) y permite la ubicación para esta web. Solo se guarda en el momento de fichar, nunca en segundo plano.
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-[12.5px] text-muted">Hoy</p>
          <p className="tabular font-display text-[24px] font-bold leading-tight">{estado === 'trabajando' ? fmtDuracion(horasHoy * 3600000) : fmtHours(horasHoy)}</p>
          <div className="mt-2">
            <ProgressBar value={horasHoy} max={previstas || 8} tone={previstas && horasHoy > previstas ? 'yellow' : 'green'} />
          </div>
          <p className="mt-1 text-[12px] text-muted">{previstas ? `de ${fmtHours(previstas)} previstas` : 'Hoy no tienes jornada prevista'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[12.5px] text-muted">Esta semana</p>
          <p className="tabular font-display text-[24px] font-bold leading-tight">{fmtHours(semana.trabajadas + Math.max(0, vivo))}</p>
          <div className="mt-2">
            <ProgressBar value={semana.trabajadas} max={semana.previstas || 40} tone="violet" />
          </div>
          <p className="mt-1 text-[12px] text-muted">de {fmtHours(semana.previstas)} previstas</p>
        </Card>
      </div>

      {data.hoy?.incidencias?.length > 0 && (
        <Alert tone="yellow" title="Revisa tu jornada de hoy">
          {data.hoy.incidencias.map((i: any) => i.detalle).join(' · ')}
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Fichajes de hoy"
          subtitle={data.hoy?.turno ? `Turno ${data.hoy.turno.nombre}: ${data.hoy.turno.horaInicio}–${data.hoy.turno.horaFin}` : data.hoy?.festivo ? `Festivo: ${data.hoy.festivo}` : data.hoy?.ausencia ? data.hoy.ausencia.tipo : undefined}
          actions={
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setCorreccion(true)}>
              Corregir
            </Button>
          }
        />
        <div className="px-4 py-2">
          <TimelineFichajes fichajes={data.hoy?.fichajes ?? []} />
        </div>
        {data.proximoTurno && (
          <div className="border-t border-line px-4 py-3 text-[13px] text-muted">
            Mañana: {data.proximoTurno.nombre}, de {data.proximoTurno.horaInicio} a {data.proximoTurno.horaFin}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <button type="button" onClick={() => setPin(true)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary">
          <KeyRound className="h-4 w-4" /> {data.tienePin ? 'Cambiar mi PIN del quiosco' : 'Crear mi PIN para el quiosco'}
        </button>
      </div>
      <p className="px-1 text-[11.5px] leading-relaxed text-muted">{NOTA_LEGAL_REGISTRO} La hora la pone el servidor, no tu dispositivo.</p>
      <PinDialog open={pin} onOpenChange={setPin} />
      <CorreccionDialog open={correccion} onOpenChange={setCorreccion} />
    </div>
  );
}

function PinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const m = useMut(() => api.post('/hor/pin', { pin }), {
    ok: 'PIN guardado',
    invalidate: ['/hor/estado'],
    onSuccess: () => {
      onOpenChange(false);
      setPin('');
      setPin2('');
    },
  });
  const valido = /^\d{4,6}$/.test(pin) && pin === pin2;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="PIN del quiosco"
      description="Con este PIN fichas en la tableta de la entrada. No lo compartas."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valido} loading={m.isPending} onClick={() => m.mutate(undefined)}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nuevo PIN" help="De 4 a 6 números">
          <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className="tabular tracking-[0.3em]" />
        </Field>
        <Field label="Repítelo" error={pin2 && pin !== pin2 ? 'No coincide' : undefined}>
          <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} className="tabular tracking-[0.3em]" />
        </Field>
      </div>
    </Dialog>
  );
}

function MisCorrecciones() {
  const { data, isLoading } = useApi<any[]>('/hor/correcciones?mias=1');
  const lista = data ?? [];
  const [nueva, setNueva] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="primary" icon={Plus} onClick={() => setNueva(true)}>
          Pedir corrección
        </Button>
      </div>
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : !lista.length ? (
          <EmptyState icon={History} title="No has pedido ninguna corrección">
            Si te olvidas de fichar o te equivocas, pide aquí la corrección. Tu responsable la aprobará.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">
                    {new Date(c.fecha + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} · <EstadoCorreccion c={c} />
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted">{c.motivo}</p>
                  {c.motivoRechazo && <p className="mt-0.5 text-[12.5px] text-bad">Respuesta: {c.motivoRechazo}</p>}
                </div>
                <Badge tone={optionLabel(CORRECCION_ESTADOS, c.estado)?.tone} dot>
                  {optionLabel(CORRECCION_ESTADOS, c.estado)?.label}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CorreccionDialog open={nueva} onOpenChange={setNueva} />
    </div>
  );
}
