import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Boxes, Briefcase, Check, KeyRound, Landmark, ShieldCheck, Users, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { appName, applyBrand, cachedBrand, useBrand, type Brand } from '@/lib/theme';
import { Alert, Button, Field, Input } from '@/components/ui';
import { BrandMark, BrandName } from '@/layout/Logo';

const PILARES = [
  { label: 'Personas', icon: Users },
  { label: 'Comercial', icon: Briefcase },
  { label: 'Operaciones', icon: Boxes },
  { label: 'Finanzas', icon: Landmark },
];

/** Panel ilustrado de la izquierda: lleva los colores de la empresa y unas tarjetas de ejemplo. */
function Arte() {
  const brand = useBrand();
  const propia = !!(brand?.apariencia.nombreApp || brand?.nombre);
  const pv = 'rounded-2xl bg-white p-4 text-[#1E2635] shadow-[0_20px_40px_-18px_rgb(0_0_0/0.45)]';
  return (
    <section className="relative flex min-h-[300px] flex-col justify-between gap-8 overflow-hidden rounded-[28px] bg-primary p-7 text-primary-fg sm:p-10 lg:min-h-0">
      <span className="pointer-events-none absolute -bottom-52 -right-36 h-[460px] w-[460px] rounded-full bg-white/[0.09]" aria-hidden />
      <span className="pointer-events-none absolute -top-24 right-52 h-[200px] w-[200px] rounded-full bg-earth" aria-hidden />
      <div className="relative flex min-w-0 items-center gap-3">
        <BrandMark stroke="rgb(var(--primary))" />
        <BrandName className="text-[24px]" />
      </div>

      <div className="relative hidden flex-wrap items-start gap-3 lg:flex" aria-hidden>
        <div className={`${pv} w-[230px]`}>
          <p className="text-[11.5px] font-bold text-[#7E889C]">Pendiente de tu aprobación</p>
          <div className="mt-2.5 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sun font-display text-[11px] font-semibold text-sun-fg">ET</span>
            <div>
              <p className="text-[13px] font-bold leading-tight">Vacaciones · 7 días</p>
              <p className="text-[11.5px] font-semibold text-[#7E889C]">Elena Torres Calvo</p>
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-sun px-2.5 text-[11.5px] font-bold text-sun-fg">
              <Check className="h-3 w-3" strokeWidth={3} /> Aprobar
            </span>
            <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-[#EDEFF5] px-2.5 text-[11.5px] font-bold text-[#4B566B]">
              <X className="h-3 w-3" strokeWidth={3} /> Rechazar
            </span>
          </div>
        </div>
        <div className="mt-6 w-[200px] rounded-2xl bg-sun p-4 text-sun-fg shadow-[0_20px_40px_-18px_rgb(0_0_0/0.45)]">
          <p className="text-[11.5px] font-bold opacity-70">Valor del stock</p>
          <p className="tabular font-display text-[26px] font-semibold tracking-[-0.03em]">15.631,60 €</p>
        </div>
        <div className={`${pv} w-[220px]`}>
          <p className="text-[11.5px] font-bold text-[#7E889C]">Facturado este mes</p>
          <p className="tabular font-display text-[26px] font-semibold tracking-[-0.03em]">6.378,00 €</p>
          <p className="text-[12px] font-bold text-[#3E7D2A]">▲ 12,4 % respecto a octubre</p>
        </div>
      </div>

      <div className="relative">
        <h1 className="max-w-[13ch] text-[clamp(34px,4.4vw,58px)] font-semibold leading-[1.04] tracking-[-0.04em]">
          Toda tu empresa, <em className="box-decoration-clone rounded-[14px] bg-sun px-[0.16em] not-italic text-sun-fg">{propia ? 'en un solo sitio.' : 'a vista de cometa.'}</em>
        </h1>
        <p className="mt-4 max-w-[44ch] text-[15px] opacity-85">Personas, ventas, almacén, servicio técnico y finanzas conectados. Cada persona ve lo que necesita para su trabajo.</p>
      </div>

      <div className="relative flex flex-wrap gap-2">
        {PILARES.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-2 rounded-pill bg-white/[0.14] px-3.5 py-2 text-[13px] font-bold">
            <p.icon className="h-4 w-4" /> {p.label}
          </span>
        ))}
      </div>
    </section>
  );
}

export default function Login() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const brand = useBrand();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [pide2fa, setPide2fa] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cambiar, setCambiar] = useState(false);
  const [nueva, setNueva] = useState('');

  // Marca de la empresa antes de entrar: la de la última empresa usada en este dispositivo
  // o, la primera vez, la de la instalación.
  useEffect(() => {
    const prev = cachedBrand();
    api
      .get<{ id: string | null; nombre: string | null; logoUrl: string | null; apariencia: Brand['apariencia'] }>(`/public/marca${prev?.empresaId ? `?empresa=${prev.empresaId}` : ''}`)
      .then((m) => applyBrand({ empresaId: m.id, nombre: m.nombre, logoUrl: m.logoUrl, apariencia: m.apariencia }, { persist: true }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.title = `Entrar · ${appName(brand)}`;
  }, [brand]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ requiereCodigo?: boolean; debeCambiarPassword?: boolean }>('/auth/login', { email, password, codigo: pide2fa ? codigo : undefined });
      if (r.requiereCodigo) {
        setPide2fa(true);
        return;
      }
      if (r.debeCambiarPassword) {
        setCambiar(true);
        return;
      }
      await qc.invalidateQueries({ queryKey: ['session'] });
      nav(sp.get('volver') || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cambiarPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/password', { actual: password, nueva });
      await qc.invalidateQueries({ queryKey: ['session'] });
      nav('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const titulo = 'text-[30px] font-semibold leading-tight tracking-[-0.03em]';
  return (
    <div className="grid min-h-dvh gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Arte />

      <section className="flex items-center justify-center px-3 py-8 sm:px-6">
        <div className="w-full max-w-[380px]">
          {!cambiar ? (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="pb-3">
                <h2 className={titulo}>{pide2fa ? 'Verificación en dos pasos' : 'Hola de nuevo'}</h2>
                <p className="mt-1.5 text-[14px] text-muted">{pide2fa ? 'Escribe el código de 6 cifras de tu aplicación de autenticación.' : 'Entra con el email y la contraseña de tu empresa.'}</p>
              </div>
              {error && <Alert tone="red">{error}</Alert>}
              {!pide2fa ? (
                <>
                  <Field label="Email" htmlFor="email">
                    <Input id="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required className="field-input h-[46px]" />
                  </Field>
                  <Field label="Contraseña" htmlFor="password">
                    <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="field-input h-[46px]" />
                  </Field>
                </>
              ) : (
                <Field label="Código" htmlFor="codigo">
                  <Input id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus className="field-input h-[52px] text-center font-mono text-[20px] tracking-[0.4em]" />
                </Field>
              )}
              <Button type="submit" variant="primary" size="lg" className="!mt-5 w-full" icon={pide2fa ? ShieldCheck : undefined} iconRight={pide2fa ? undefined : ArrowRight} loading={busy} disabled={!email || !password}>
                {pide2fa ? 'Verificar' : 'Entrar'}
              </Button>
              <p className="pt-1 text-center text-[12.5px] text-muted">¿Has olvidado la contraseña? Pide a un administrador que te la restablezca.</p>
            </form>
          ) : (
            <form onSubmit={cambiarPassword} className="space-y-4">
              <div className="pb-3">
                <h2 className={titulo}>Elige tu contraseña</h2>
                <p className="mt-1.5 text-[14px] text-muted">Es tu primer acceso o te la han restablecido. Usa al menos 10 caracteres con letras y números.</p>
              </div>
              {error && <Alert tone="red">{error}</Alert>}
              <Field label="Nueva contraseña" htmlFor="nueva">
                <Input id="nueva" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoFocus className="field-input h-[46px]" />
              </Field>
              <Button type="submit" variant="primary" size="lg" className="!mt-5 w-full" icon={KeyRound} loading={busy} disabled={nueva.length < 10}>
                Guardar y entrar
              </Button>
            </form>
          )}
          <p className="mt-10 text-center text-[12px] font-medium text-muted">
            {brand?.nombre ? `${brand.nombre} · ` : ''}KiteERP
          </p>
        </div>
      </section>
    </div>
  );
}
