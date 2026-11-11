import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Delete, LogIn, LogOut } from 'lucide-react';
import { fmtHours } from '@kite/shared';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Avatar, Spinner } from '@/components/ui';
import { Logo } from '@/layout/Logo';

interface Datos {
  empresa: string;
  kiosco: string;
  centro: string;
  servidor: string;
  personas: { id: string; nombre: string; estado: 'trabajando' | 'pausa' | 'fuera' }[];
}

/** Quiosco de fichaje en una tableta: la persona se busca, escribe su PIN y queda fichada con la hora del servidor. */
export default function Kiosco() {
  const { token } = useParams();
  const url = `/hor/public/kiosco/${token}`;
  const { data, isLoading, error, refetch } = useApi<Datos>(url, { refetchInterval: 60_000, retry: false });
  const [persona, setPersona] = useState<Datos['personas'][number] | null>(null);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => {
      setMsg(null);
      setPersona(null);
      setPin('');
    }, msg.ok ? 3500 : 2500);
    return () => clearTimeout(t);
  }, [msg]);

  const fichar = async (tipo?: string) => {
    if (!persona || pin.length < 4) return;
    setBusy(true);
    try {
      const r = await api.post<{ nombre: string; tipo: string; estado: string; horasHoy: number }>(`${url}/fichar`, { personaId: persona.id, pin, tipo });
      const accion = { entrada: 'Entrada registrada', salida: 'Salida registrada', pausa_inicio: 'Pausa iniciada', pausa_fin: 'Pausa terminada' }[r.tipo] ?? 'Fichaje registrado';
      setMsg({ ok: true, texto: `${accion}, ${r.nombre}. Hoy llevas ${fmtHours(r.horasHoy)}.` });
      refetch();
    } catch (e) {
      setMsg({ ok: false, texto: errorMessage(e) });
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Spinner className="h-dvh" />;
  if (error || !data)
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <Alert tone="red">Este quiosco no existe o está desactivado. Pide al responsable un enlace nuevo.</Alert>
      </div>
    );

  return (
    <div className="flex min-h-dvh flex-col bg-deep text-deep-fg">
      <header className="flex items-center gap-3 px-6 py-4">
        <Logo className="h-8 w-8" stroke="#5E2A78" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[18px] font-bold">{data.empresa}</p>
          <p className="text-[13px] text-white/70">
            {data.kiosco} · {data.centro}
          </p>
        </div>
        <p className="tabular font-display text-[34px] font-extrabold">{ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}</p>
      </header>
      <main className="flex flex-1 flex-col rounded-t-3xl bg-bg p-5 text-fg">
        {msg ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            {msg.ok ? <CheckCircle2 className="h-24 w-24 text-ok" /> : <Delete className="h-20 w-20 text-bad" />}
            <p className={cn('max-w-lg text-[24px] font-bold', !msg.ok && 'text-bad')}>{msg.texto}</p>
          </div>
        ) : !persona ? (
          <>
            <h1 className="mb-4 text-[22px] font-extrabold">Pulsa tu nombre</h1>
            {!data.personas.length && <Alert tone="yellow">Nadie de este centro tiene PIN todavía. Cada persona lo elige en la app, en Fichar.</Alert>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.personas.map((p) => (
                <button key={p.id} type="button" onClick={() => setPersona(p)} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-4 shadow-card active:scale-[0.98]">
                  <Avatar name={p.nombre} size={56} />
                  <span className="text-center text-[15px] font-semibold leading-tight">{p.nombre}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', p.estado === 'trabajando' ? 'bg-ok-soft text-ok' : p.estado === 'pausa' ? 'bg-sun-soft text-warn' : 'bg-sunken text-muted')}>
                    {p.estado === 'trabajando' ? 'Dentro' : p.estado === 'pausa' ? 'En pausa' : 'Fuera'}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center gap-5">
            <button type="button" className="self-start text-[14px] text-primary" onClick={() => { setPersona(null); setPin(''); }}>
              ← Volver
            </button>
            <Avatar name={persona.nombre} size={72} />
            <p className="text-[22px] font-bold">{persona.nombre}</p>
            <div className="flex gap-3" aria-label="PIN">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className={cn('h-4 w-4 rounded-full', i < pin.length ? 'bg-primary' : 'bg-line', i >= 4 && i >= pin.length && 'opacity-40')} />
              ))}
            </div>
            <div className="grid w-full grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '←'].map((k, i) =>
                k === '' ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => (k === '←' ? setPin(pin.slice(0, -1)) : pin.length < 6 && setPin(pin + k))}
                    className="h-16 rounded-2xl bg-surface text-[26px] font-bold shadow-card active:bg-sunken"
                  >
                    {k}
                  </button>
                ),
              )}
            </div>
            <div className="grid w-full grid-cols-2 gap-3">
              <button type="button" disabled={pin.length < 4 || busy} onClick={() => fichar(persona.estado === 'fuera' ? 'entrada' : 'salida')} className={cn('flex h-16 items-center justify-center gap-2 rounded-2xl text-[18px] font-bold text-white disabled:opacity-40', persona.estado === 'fuera' ? 'bg-ok' : 'bg-bad')}>
                {persona.estado === 'fuera' ? <LogIn className="h-6 w-6" /> : <LogOut className="h-6 w-6" />}
                {persona.estado === 'fuera' ? 'Entrar' : 'Salir'}
              </button>
              {persona.estado !== 'fuera' ? (
                <button type="button" disabled={pin.length < 4 || busy} onClick={() => fichar(persona.estado === 'pausa' ? 'pausa_fin' : 'pausa_inicio')} className="h-16 rounded-2xl bg-sun text-[18px] font-bold text-fg disabled:opacity-40 dark:text-bg">
                  {persona.estado === 'pausa' ? 'Volver de la pausa' : 'Pausa'}
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
