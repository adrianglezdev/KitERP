import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Copy, Lock, Search, Send, ShieldCheck } from 'lucide-react';
import { fmtDateTime } from '@kite/shared';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Button, Card, Checkbox, Field, Input, Segmented, Select, Textarea } from '@/components/ui';
import { PublicLayout, type MarcaPublica } from './PublicLayout';

const CATEGORIAS = ['Acoso o discriminación', 'Fraude o corrupción', 'Seguridad y salud', 'Protección de datos', 'Medio ambiente', 'Otro incumplimiento'];

/** Canal interno de información (Ley 2/2023): comunicar de forma anónima y consultar el estado. */
export default function PublicCanal() {
  const { empresaId } = useParams();
  const info = useApi<{ empresa: string; marca?: MarcaPublica }>(`/public/${empresaId}/canal`, { retry: false });
  const [modo, setModo] = useState<'nueva' | 'consulta'>('nueva');
  const [f, setF] = useState({ categoria: CATEGORIAS[0]!, asunto: '', descripcion: '', anonima: true, nombre: '', email: '' });
  const [enviado, setEnviado] = useState<{ codigo: string; clave: string } | null>(null);
  const [cons, setCons] = useState({ codigo: '', clave: '', mensaje: '' });
  const [exp, setExp] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function enviar() {
    setBusy(true);
    setError('');
    try {
      setEnviado(await api.post(`/public/${empresaId}/denuncias`, { ...f, email: f.email || null, nombre: f.anonima ? null : f.nombre }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function consultar(conMensaje = false) {
    setBusy(true);
    setError('');
    try {
      setExp(await api.post('/public/denuncias/consulta', { codigo: cons.codigo, clave: cons.clave, mensaje: conMensaje ? cons.mensaje : undefined }));
      if (conMensaje) setCons({ ...cons, mensaje: '' });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicLayout empresa={info.data?.empresa} marca={info.data?.marca}>
      <div className="space-y-5">
        <div>
          <h1 className="flex items-center gap-2 text-[24px] font-semibold">
            <ShieldCheck className="h-6 w-6 text-primary" /> Canal de denuncias
          </h1>
          <p className="mt-1 text-[14px] text-muted">Puedes comunicar de forma anónima cualquier irregularidad. Solo las personas responsables del canal pueden leerla y está prohibida cualquier represalia.</p>
        </div>
        <Segmented value={modo} onChange={(v) => { setModo(v); setError(''); }} options={[{ value: 'nueva', label: 'Nueva comunicación' }, { value: 'consulta', label: 'Consultar una existente' }]} />
        {error && <Alert tone="red">{error}</Alert>}

        {modo === 'nueva' &&
          (enviado ? (
            <Card className="space-y-3 p-5">
              <Alert tone="green" title="Comunicación recibida">Guarda estos datos: son la única forma de consultar el estado y de responder. No podemos recuperarlos.</Alert>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Código', enviado.codigo],
                  ['Clave', enviado.clave],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-sunken p-3">
                    <p className="text-[12px] text-muted">{k}</p>
                    <p className="flex items-center justify-between gap-2 font-mono text-[16px] font-semibold">
                      {v}
                      <button type="button" aria-label={`Copiar ${k}`} onClick={() => navigator.clipboard.writeText(v!).catch(() => {})}>
                        <Copy className="h-4 w-4 text-muted" />
                      </button>
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="space-y-3 p-5">
              <Field label="Tipo">
                <Select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} options={CATEGORIAS.map((c) => ({ value: c, label: c }))} />
              </Field>
              <Field label="Asunto">
                <Input value={f.asunto} onChange={(e) => setF({ ...f, asunto: e.target.value })} />
              </Field>
              <Field label="Qué ha pasado" help="Cuanto más detalle (fechas, lugares, personas implicadas), mejor se podrá investigar.">
                <Textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} rows={6} />
              </Field>
              <Checkbox checked={f.anonima} onChange={(v) => setF({ ...f, anonima: v })} label={<span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Quiero que sea anónima</span>} />
              {!f.anonima && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre">
                    <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
                  </Field>
                  <Field label="Email de contacto">
                    <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
                  </Field>
                </div>
              )}
              <Button variant="primary" icon={Send} disabled={f.asunto.length < 3 || f.descripcion.length < 10} loading={busy} onClick={enviar}>
                Enviar comunicación
              </Button>
            </Card>
          ))}

        {modo === 'consulta' && (
          <Card className="space-y-3 p-5">
            {!exp ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Código">
                    <Input value={cons.codigo} onChange={(e) => setCons({ ...cons, codigo: e.target.value })} className="font-mono uppercase" />
                  </Field>
                  <Field label="Clave">
                    <Input value={cons.clave} onChange={(e) => setCons({ ...cons, clave: e.target.value })} className="font-mono" />
                  </Field>
                </div>
                <Button icon={Search} disabled={!cons.codigo || !cons.clave} loading={busy} onClick={() => consultar()}>
                  Consultar
                </Button>
              </>
            ) : (
              <>
                <p className="text-[13px] text-muted">
                  {exp.codigo} · {fmtDateTime(exp.creadoEn)} · estado: <b className="text-fg">{exp.estado.replace(/_/g, ' ')}</b>
                </p>
                <h2 className="text-[17px] font-bold">{exp.asunto}</h2>
                {exp.resolucion && <Alert tone="green" title="Resolución">{exp.resolucion}</Alert>}
                <div className="space-y-2">
                  {exp.mensajes.map((m: any) => (
                    <div key={m.id} className={cn('max-w-[85%] rounded-xl px-3 py-2 text-[13.5px]', m.autor === 'gestor' ? 'bg-primary-soft' : 'ml-auto bg-sunken')}>
                      <p className="whitespace-pre-wrap">{m.texto}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {m.autor === 'gestor' ? 'Responsable del canal' : 'Tú'} · {fmtDateTime(m.creadoEn)}
                      </p>
                    </div>
                  ))}
                </div>
                <Field label="Añadir información">
                  <Textarea value={cons.mensaje} onChange={(e) => setCons({ ...cons, mensaje: e.target.value })} rows={3} />
                </Field>
                <Button icon={Send} disabled={!cons.mensaje.trim()} loading={busy} onClick={() => consultar(true)}>
                  Enviar
                </Button>
              </>
            )}
          </Card>
        )}
      </div>
    </PublicLayout>
  );
}
