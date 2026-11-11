import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Alert, Button, Field, Input } from '@/components/ui';
import { Logo, LogoLockup } from '@/layout/Logo';

export default function Login() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [pide2fa, setPide2fa] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cambiar, setCambiar] = useState(false);
  const [nueva, setNueva] = useState('');

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

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-deep p-12 text-deep-fg lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <Logo className="h-10 w-10" stroke="#5E2A78" />
          <span className="font-display text-[26px] font-extrabold">kite</span>
        </div>
        <div className="mt-auto max-w-md">
          <h1 className="text-[38px] font-extrabold leading-[1.1]">Toda tu empresa, a vista de cometa.</h1>
          <p className="mt-4 text-[15px] text-white/75">Personas, ventas, almacén, servicio técnico y finanzas conectados en un solo sitio. Cada persona ve lo que necesita para su trabajo.</p>
          <div className="mt-8 grid grid-cols-2 gap-3 text-[13px]">
            {[
              ['#F1DE07', 'Personas'],
              ['#7D2CDD', 'Comercial'],
              ['#35AE29', 'Operaciones'],
              ['#B28574', 'Finanzas'],
            ].map(([c, l]) => (
              <span key={l} className="flex items-center gap-2 rounded-lg bg-white/8 bg-white/10 px-3 py-2">
                <span className="h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ background: c }} />
                {l}
              </span>
            ))}
          </div>
        </div>
        <Logo className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] opacity-10" stroke="#5E2A78" />
      </div>

      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <LogoLockup />
          </div>
          {!cambiar ? (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <h2 className="text-[24px] font-extrabold">{pide2fa ? 'Verificación en dos pasos' : 'Entrar'}</h2>
                <p className="mt-1 text-[13.5px] text-muted">{pide2fa ? 'Escribe el código de 6 cifras de tu aplicación de autenticación.' : 'Usa el email y la contraseña de tu empresa.'}</p>
              </div>
              {error && <Alert tone="red">{error}</Alert>}
              {!pide2fa ? (
                <>
                  <Field label="Email" htmlFor="email">
                    <Input id="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
                  </Field>
                  <Field label="Contraseña" htmlFor="password">
                    <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </Field>
                </>
              ) : (
                <Field label="Código" htmlFor="codigo">
                  <Input id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus className="text-center font-mono text-[20px] tracking-[0.4em]" />
                </Field>
              )}
              <Button type="submit" variant="primary" size="lg" className="w-full" icon={pide2fa ? ShieldCheck : LogIn} loading={busy} disabled={!email || !password}>
                {pide2fa ? 'Verificar' : 'Entrar'}
              </Button>
              <p className="text-center text-[12.5px] text-muted">¿Has olvidado la contraseña? Pide a un administrador que te la restablezca.</p>
            </form>
          ) : (
            <form onSubmit={cambiarPassword} className="space-y-4">
              <div>
                <h2 className="text-[24px] font-extrabold">Elige tu contraseña</h2>
                <p className="mt-1 text-[13.5px] text-muted">Es tu primer acceso o te la han restablecido. Usa al menos 10 caracteres con letras y números.</p>
              </div>
              {error && <Alert tone="red">{error}</Alert>}
              <Field label="Nueva contraseña" htmlFor="nueva">
                <Input id="nueva" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoFocus />
              </Field>
              <Button type="submit" variant="primary" size="lg" className="w-full" icon={KeyRound} loading={busy} disabled={nueva.length < 10}>
                Guardar y entrar
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
