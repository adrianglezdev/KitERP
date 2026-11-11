import { useState } from 'react';
import { Copy, FileSignature, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDateTime } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Badge, Button, Card, DataTable, Dialog, Field, FileChip, FileDrop, Input, PageHeader, RefSelect, Segmented, Select, type UploadedFile } from '@/components/ui';

const ESTADO: Record<string, { label: string; tone: 'yellow' | 'green' | 'red' | 'gray' }> = {
  pendiente: { label: 'Pendiente', tone: 'yellow' },
  firmado: { label: 'Firmado', tone: 'green' },
  rechazado: { label: 'Rechazado', tone: 'red' },
};

export default function Firmas() {
  const { data, isLoading } = useApi<any[]>('/firmas');
  const [nueva, setNueva] = useState(false);
  return (
    <>
      <PageHeader
        title="Firmas"
        icon={FileSignature}
        subtitle="Documentos enviados a firmar (contratos, entregas de EPIs, conformidades…) con evidencias de firma electrónica."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setNueva(true)}>
            Enviar a firmar
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          onRowClick={(r) => r.url && window.open(r.url, '_blank')}
          columns={[
            { key: 'titulo', header: 'Documento', cell: (r) => <span className="font-medium">{r.titulo}</span> },
            { key: 'firmante', header: 'Firmante', cell: (r) => r.firmanteNombre },
            { key: 'estado', header: 'Estado', cell: (r) => <Badge tone={ESTADO[r.estado]?.tone ?? 'gray'} dot>{ESTADO[r.estado]?.label ?? r.estado}</Badge> },
            { key: 'creado', header: 'Enviado', hideBelow: 'lg', cell: (r) => fmtDateTime(r.creadoEn) },
            { key: 'firmado', header: 'Firmado', cell: (r) => (r.firmadoEn ? fmtDateTime(r.firmadoEn) : '—') },
          ]}
          mobileSubtitle={(r) => r.firmanteNombre}
          mobileRight={(r) => <Badge tone={ESTADO[r.estado]?.tone ?? 'gray'}>{ESTADO[r.estado]?.label ?? r.estado}</Badge>}
        />
      </Card>
      {nueva && <NuevaFirma onClose={() => setNueva(false)} />}
    </>
  );
}

function NuevaFirma({ onClose }: { onClose: () => void }) {
  const plantillas = useApi<any[]>('/plantillas');
  const [origen, setOrigen] = useState<'archivo' | 'plantilla'>('archivo');
  const [archivo, setArchivo] = useState<UploadedFile | null>(null);
  const [plantillaId, setPlantillaId] = useState('');
  const [persona, setPersona] = useState<string | null>(null);
  const [f, setF] = useState({ titulo: '', firmanteNombre: '', firmanteEmail: '' });
  const [enlace, setEnlace] = useState<string | null>(null);
  const enviar = useMut(
    () =>
      api.post<{ url: string }>('/firmas', {
        ...f,
        firmanteEmail: f.firmanteEmail || null,
        archivoId: origen === 'archivo' ? archivo?.id : null,
        plantillaId: origen === 'plantilla' ? plantillaId : null,
        personaId: persona,
        entidad: persona ? 'persona' : null,
        entidadId: persona,
      }),
    { ok: 'Enviado a firmar', invalidate: ['/firmas'], onSuccess: (r) => setEnlace(r.url) },
  );
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Enviar a firmar"
      size="lg"
      footer={
        enlace ? (
          <Button variant="primary" onClick={onClose}>
            Cerrar
          </Button>
        ) : (
          <Button variant="primary" disabled={!f.titulo || !f.firmanteNombre || (origen === 'archivo' ? !archivo : !plantillaId)} loading={enviar.isPending} onClick={() => enviar.mutate(undefined)}>
            Enviar
          </Button>
        )
      }
    >
      {enlace ? (
        <div className="space-y-3">
          <p className="text-[14px]">Listo. El firmante recibirá un email (si lo has indicado) y un aviso si es un trabajador. También puedes compartir este enlace:</p>
          <div className="flex gap-2">
            <Input readOnly value={enlace} onFocus={(e) => e.target.select()} />
            <Button icon={Copy} onClick={() => navigator.clipboard.writeText(enlace).then(() => toast.success('Enlace copiado')).catch(() => toast.info('Selecciona el enlace y cópialo'))}>
              Copiar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Segmented value={origen} onChange={setOrigen} options={[{ value: 'archivo', label: 'Subir un PDF' }, { value: 'plantilla', label: 'Desde una plantilla' }]} />
          {origen === 'archivo' ? (
            archivo ? <FileChip f={archivo} onRemove={() => setArchivo(null)} /> : <FileDrop multiple={false} accept="application/pdf" onUploaded={(fs) => setArchivo(fs[0] ?? null)} label="Sube el PDF que hay que firmar" />
          ) : (
            <Select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)} placeholder="Elige la plantilla" options={(plantillas.data ?? []).map((p) => ({ value: p.id, label: p.nombre }))} />
          )}
          <Field label="Título" required>
            <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ej.: Entrega de EPIs" />
          </Field>
          <Field label="Trabajador (opcional)" help="Si firma un trabajador, sus datos se rellenan y el documento queda en su ficha.">
            <RefSelect target="personas" value={persona} onChange={(v, o) => { setPersona(v); if (o && !f.firmanteNombre) setF({ ...f, firmanteNombre: o.label }); }} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre del firmante" required>
              <Input value={f.firmanteNombre} onChange={(e) => setF({ ...f, firmanteNombre: e.target.value })} />
            </Field>
            <Field label="Email del firmante">
              <Input type="email" value={f.firmanteEmail} onChange={(e) => setF({ ...f, firmanteEmail: e.target.value })} />
            </Field>
          </div>
        </div>
      )}
    </Dialog>
  );
}
