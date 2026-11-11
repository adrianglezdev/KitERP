import { useState } from 'react';
import { Mail, Phone, Send, Star } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Alert, Button, Card, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';

export interface EmpresaPublica {
  nombre: string;
  telefono: string | null;
  email: string | null;
  logoUrl: string | null;
}

/** Estados del ticket contados al cliente con palabras sencillas. */
export const ESTADO_CLIENTE: Record<string, { label: string; tone: string }> = {
  nuevo: { label: 'Recibido', tone: 'bg-sky-100 text-sky-800' },
  asignado: { label: 'Asignado a un técnico', tone: 'bg-violet-100 text-violet-800' },
  en_curso: { label: 'En curso', tone: 'bg-amber-100 text-amber-900' },
  esperando_cliente: { label: 'Pendiente de tu respuesta', tone: 'bg-orange-100 text-orange-900' },
  resuelto: { label: 'Resuelto', tone: 'bg-green-100 text-green-800' },
  cerrado: { label: 'Cerrado', tone: 'bg-gray-100 text-gray-700' },
  cancelado: { label: 'Cancelado', tone: 'bg-gray-100 text-gray-700' },
};

export function EstadoCliente({ estado }: { estado: string }) {
  const e = ESTADO_CLIENTE[estado] ?? { label: estado, tone: 'bg-gray-100 text-gray-700' };
  return <span className={cn('inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold', e.tone)}>{e.label}</span>;
}

export function ContactoEmpresa({ empresa }: { empresa?: EmpresaPublica }) {
  if (!empresa?.telefono && !empresa?.email) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {empresa.telefono && (
        <a href={`tel:${empresa.telefono.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-[13.5px] font-medium shadow-sm ring-1 ring-line">
          <Phone className="h-4 w-4 text-primary" /> {empresa.telefono}
        </a>
      )}
      {empresa.email && (
        <a href={`mailto:${empresa.email}`} className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-[13.5px] font-medium shadow-sm ring-1 ring-line">
          <Mail className="h-4 w-4 text-primary" /> {empresa.email}
        </a>
      )}
    </div>
  );
}

/** Formulario para abrir un aviso desde el portal o desde el código QR del equipo. */
export function NuevoAviso({ endpoint, equipos, onCreado }: { endpoint: string; equipos?: { id: string; nombre: string }[]; onCreado: (t: { token: string; codigo: string }) => void }) {
  const [f, setF] = useState({ asunto: '', descripcion: '', equipoId: '', urgente: false, nombre: '', contacto: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function enviar() {
    setBusy(true);
    setError('');
    try {
      onCreado(await api.post(endpoint, { ...f, equipoId: f.equipoId || null, descripcion: f.descripcion || null }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-[16px] font-bold">Abrir un aviso</h2>
      {error && <Alert tone="red">{error}</Alert>}
      {equipos && equipos.length > 0 && (
        <Field label="¿Qué equipo?">
          <Select value={f.equipoId} onChange={(e) => setF({ ...f, equipoId: e.target.value })} options={equipos.map((e) => ({ value: e.id, label: e.nombre }))} placeholder="No lo sé / otro" />
        </Field>
      )}
      <Field label="¿Qué ocurre?" required>
        <Input value={f.asunto} onChange={(e) => setF({ ...f, asunto: e.target.value })} placeholder="Ej.: El aire no enfría" />
      </Field>
      <Field label="Más detalles">
        <Textarea rows={3} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder="Desde cuándo, si hace ruido, algún código en pantalla…" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tu nombre" required>
          <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoComplete="name" />
        </Field>
        <Field label="Teléfono o email" required>
          <Input value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} autoComplete="tel" />
        </Field>
      </div>
      <Checkbox checked={f.urgente} onChange={(v) => setF({ ...f, urgente: v })} label="Es urgente" description="El equipo está parado o hay riesgo." />
      <Button variant="primary" icon={Send} className="w-full sm:w-auto" loading={busy} onClick={enviar}>
        Enviar aviso
      </Button>
    </Card>
  );
}

export function Estrellas({ value, onChange, size = 'lg' }: { value: number; onChange?: (v: number) => void; size?: 'sm' | 'lg' }) {
  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} aria-label={`${n} estrellas`} onClick={() => onChange?.(n)} className={cn('transition', onChange && 'hover:scale-110')}>
          <Star className={cn(size === 'lg' ? 'h-8 w-8' : 'h-3.5 w-3.5', n <= value ? 'fill-[#F1DE07] text-[#c9b805]' : 'text-line')} />
        </button>
      ))}
    </span>
  );
}
