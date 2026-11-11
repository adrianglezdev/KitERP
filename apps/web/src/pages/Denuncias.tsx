import { useState } from 'react';
import { Copy, Lock, Send, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDateTime } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, DataTable, Dialog, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui';

const ESTADOS = [
  { value: 'recibida', label: 'Recibida', tone: 'yellow' as const },
  { value: 'en_investigacion', label: 'En investigación', tone: 'blue' as const },
  { value: 'resuelta', label: 'Resuelta', tone: 'green' as const },
  { value: 'archivada', label: 'Archivada', tone: 'gray' as const },
];

export default function Denuncias() {
  const { session } = useSession();
  const { data, isLoading } = useApi<any[]>('/denuncias');
  const [abierta, setAbierta] = useState<string | null>(null);
  const enlace = `${location.origin}/canal/${session?.empresa.id}`;
  return (
    <>
      <PageHeader title="Canal de denuncias" icon={ShieldAlert} subtitle="Sistema interno de información (Ley 2/2023). Solo lo ven las personas responsables del canal y cada consulta queda registrada." />
      <Alert tone="violet" icon={Lock} className="mb-4" title="Enlace del canal para la plantilla">
        <span className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-surface px-2 py-0.5 text-[12.5px]">{enlace}</code>
          <button type="button" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary" onClick={() => navigator.clipboard.writeText(enlace).then(() => toast.success('Enlace copiado')).catch(() => {})}>
            <Copy className="h-3.5 w-3.5" /> Copiar
          </button>
        </span>
        Cualquiera puede comunicar de forma anónima. Debes acusar recibo en 7 días y responder en un máximo de 3 meses.
      </Alert>
      <Card className="overflow-hidden">
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          onRowClick={(r) => setAbierta(r.id)}
          columns={[
            { key: 'codigo', header: 'Código', cell: (r) => <span className="font-mono text-[13px] font-medium">{r.codigo}</span> },
            { key: 'asunto', header: 'Asunto', cell: (r) => r.asunto },
            { key: 'categoria', header: 'Categoría', hideBelow: 'lg', cell: (r) => r.categoria },
            { key: 'estado', header: 'Estado', cell: (r) => { const e = ESTADOS.find((x) => x.value === r.estado); return <Badge tone={e?.tone} dot>{e?.label ?? r.estado}</Badge>; } },
            { key: 'acuse', header: 'Acuse', hideBelow: 'md', cell: (r) => (r.acuseEn ? fmtDateTime(r.acuseEn) : <Badge tone="red">Pendiente</Badge>) },
            { key: 'creado', header: 'Recibida', cell: (r) => fmtDateTime(r.creadoEn) },
          ]}
          mobileTitle={(r) => r.asunto}
          mobileSubtitle={(r) => `${r.codigo} · ${fmtDateTime(r.creadoEn)}`}
        />
      </Card>
      {abierta && <Expediente id={abierta} onClose={() => setAbierta(null)} />}
    </>
  );
}

function Expediente({ id, onClose }: { id: string; onClose: () => void }) {
  const url = `/denuncias/${id}`;
  const { data: d } = useApi<any>(url);
  const [mensaje, setMensaje] = useState('');
  const [estado, setEstado] = useState('');
  const [resolucion, setResolucion] = useState<string | null>(null);
  const guardar = useMut(() => api.post(url, { mensaje: mensaje || undefined, estado: estado || undefined, resolucion: resolucion ?? undefined }), {
    ok: 'Expediente actualizado',
    invalidate: ['/denuncias'],
    onSuccess: () => setMensaje(''),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={d ? `${d.codigo} · ${d.asunto}` : 'Expediente'} size="lg" footer={<Button variant="primary" icon={Send} loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>Guardar</Button>}>
      {!d ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <p className="text-[12.5px] text-muted">
            {d.categoria} · {d.anonima ? 'Anónima' : `${d.nombre ?? ''} ${d.email ? `(${d.email})` : ''}`} · {fmtDateTime(d.creadoEn)}
          </p>
          <p className="whitespace-pre-wrap rounded-xl bg-sunken p-3 text-[14px]">{d.descripcion}</p>
          <div className="space-y-2">
            {d.mensajes.map((m: any) => (
              <div key={m.id} className={cn('max-w-[85%] rounded-xl px-3 py-2 text-[13.5px]', m.autor === 'gestor' ? 'ml-auto bg-primary-soft' : 'bg-sunken')}>
                <p className="whitespace-pre-wrap">{m.texto}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {m.autor === 'gestor' ? 'Gestor del canal' : 'Informante'} · {fmtDateTime(m.creadoEn)}
                </p>
              </div>
            ))}
          </div>
          <Field label="Responder al informante">
            <Textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={3} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Estado">
              <Select value={estado || d.estado} onChange={(e) => setEstado(e.target.value)} options={ESTADOS} />
            </Field>
          </div>
          <Field label="Resolución">
            <Textarea value={resolucion ?? d.resolucion ?? ''} onChange={(e) => setResolucion(e.target.value)} rows={2} />
          </Field>
          <Input type="hidden" />
        </div>
      )}
    </Dialog>
  );
}
