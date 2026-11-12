import { useState } from 'react';
import { KeyRound, LogOut, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { relTime } from '@/lib/utils';
import { Alert, Badge, Button, Card, CardHeader, Field, Input, PageHeader } from '@/components/ui';

export default function Cuenta() {
  const { session, refresh } = useSession();
  const [pw, setPw] = useState({ actual: '', nueva: '', repetir: '' });
  const cambiar = useMut(() => api.post('/auth/password', { actual: pw.actual, nueva: pw.nueva }), { ok: 'Contraseña cambiada. Se han cerrado tus otras sesiones.', invalidate: ['/auth/sesiones'], onSuccess: () => setPw({ actual: '', nueva: '', repetir: '' }) });
  const [qr, setQr] = useState<{ qr: string; secreto: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [pwOff, setPwOff] = useState('');
  const preparar = useMut(() => api.post<{ qr: string; secreto: string }>('/auth/2fa/preparar'), { onSuccess: (r) => setQr(r) });
  const activar = useMut(() => api.post('/auth/2fa/activar', { codigo }), { ok: 'Verificación en dos pasos activada', onSuccess: () => { setQr(null); refresh(); } });
  const desactivar = useMut(() => api.post('/auth/2fa/desactivar', { password: pwOff }), { ok: 'Verificación en dos pasos desactivada', onSuccess: () => { setPwOff(''); refresh(); } });
  const sesiones = useApi<any[]>('/auth/sesiones');
  const cerrar = useMut((id: string) => api.del(`/auth/sesiones/${id}`), { ok: 'Sesión cerrada', invalidate: ['/auth/sesiones'] });
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Seguridad de la cuenta" icon={KeyRound} subtitle={session?.user.email} />
      <Card>
        <CardHeader title="Cambiar contraseña" icon={KeyRound} />
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <Field label="Actual">
            <Input type="password" autoComplete="current-password" value={pw.actual} onChange={(e) => setPw({ ...pw, actual: e.target.value })} />
          </Field>
          <Field label="Nueva" help="Mínimo 10 caracteres con letras y números">
            <Input type="password" autoComplete="new-password" value={pw.nueva} onChange={(e) => setPw({ ...pw, nueva: e.target.value })} />
          </Field>
          <Field label="Repítela" error={pw.repetir && pw.repetir !== pw.nueva ? 'No coincide' : undefined}>
            <Input type="password" autoComplete="new-password" value={pw.repetir} onChange={(e) => setPw({ ...pw, repetir: e.target.value })} />
          </Field>
          <div className="sm:col-span-3">
            <Button variant="primary" disabled={!pw.actual || pw.nueva.length < 10 || pw.nueva !== pw.repetir} loading={cambiar.isPending} onClick={() => cambiar.mutate(undefined)}>
              Cambiar contraseña
            </Button>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Verificación en dos pasos" icon={ShieldCheck} actions={session?.user.totp ? <Badge tone="green">Activada</Badge> : <Badge>Desactivada</Badge>} />
        <div className="space-y-3 p-4 text-[13.5px]">
          {!session?.user.totp && !qr && (
            <>
              <p className="text-muted">Además de la contraseña, se pedirá un código de una app como Google Authenticator o Microsoft Authenticator.</p>
              <Button icon={ShieldCheck} loading={preparar.isPending} onClick={() => preparar.mutate(undefined)}>
                Activar
              </Button>
            </>
          )}
          {qr && (
            <div className="flex flex-col gap-4 sm:flex-row">
              <img src={qr.qr} alt="Código QR para la app de autenticación" className="h-44 w-44 rounded-lg border border-line-strong/70 bg-white p-2" />
              <div className="space-y-3">
                <p>1. Escanea el código con tu app de autenticación (o escribe la clave <code className="rounded bg-sunken px-1">{qr.secreto}</code>).</p>
                <p>2. Escribe el código de 6 cifras que muestra:</p>
                <div className="flex gap-2">
                  <Input inputMode="numeric" maxLength={7} value={codigo} onChange={(e) => setCodigo(e.target.value)} className="w-32 text-center font-mono tracking-widest" />
                  <Button variant="primary" disabled={codigo.length < 6} loading={activar.isPending} onClick={() => activar.mutate(undefined)}>
                    Confirmar
                  </Button>
                </div>
              </div>
            </div>
          )}
          {session?.user.totp && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Contraseña para desactivarla">
                <Input type="password" value={pwOff} onChange={(e) => setPwOff(e.target.value)} />
              </Field>
              <Button disabled={!pwOff} loading={desactivar.isPending} onClick={() => desactivar.mutate(undefined)}>
                Desactivar
              </Button>
            </div>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Sesiones abiertas" icon={MonitorSmartphone} />
        <ul className="divide-y divide-line">
          {sesiones.data?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <div className="min-w-0 flex-1">
                <p className="truncate">{s.userAgent ?? 'Navegador'}</p>
                <p className="text-[12px] text-muted">
                  {s.ip} · último uso {relTime(s.ultimoUso)}
                </p>
              </div>
              {s.actual ? (
                <Badge tone="green">Esta sesión</Badge>
              ) : (
                <Button size="sm" variant="ghost" icon={LogOut} onClick={() => cerrar.mutate(s.id)}>
                  Cerrar
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Alert tone="gray">Si sospechas que alguien conoce tu contraseña, cámbiala: se cerrarán el resto de sesiones.</Alert>
    </div>
  );
}
