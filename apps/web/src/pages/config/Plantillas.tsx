import { useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Alert, Badge, Button, Card, DataTable, Dialog, Field, IconButton, Input, Select, Textarea, useConfirm } from '@/components/ui';

const CAMPOS = {
  persona: ['persona.nombre', 'persona.email', 'persona.puesto', 'trabajador.dni', 'trabajador.categoria', 'trabajador.fechaAlta', 'trabajador.tipoContrato'],
  tercero: ['tercero.nombre', 'tercero.razonSocial', 'tercero.nif', 'tercero.direccion'],
  ninguna: [],
} as const;

export default function Plantillas() {
  const confirm = useConfirm();
  const { data, isLoading } = useApi<any[]>('/plantillas');
  const [edit, setEdit] = useState<any | null>(null);
  const borrar = useMut((id: string) => api.del(`/plantillas/${id}`), { ok: 'Plantilla borrada', invalidate: ['/plantillas'] });
  return (
    <div className="space-y-4">
      <Alert tone="violet">Las plantillas generan documentos con los datos ya rellenos (contratos, certificados, cartas). Se pueden enviar a firmar desde Firmas.</Alert>
      <Card className="overflow-hidden">
        <div className="flex justify-end border-b border-line p-3">
          <Button variant="primary" icon={Plus} onClick={() => setEdit({ entidad: 'persona', contenido: '' })}>
            Nueva plantilla
          </Button>
        </div>
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          onRowClick={setEdit}
          columns={[
            { key: 'nombre', header: 'Nombre', cell: (r) => <span className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-primary" />{r.nombre}</span> },
            { key: 'entidad', header: 'Para', cell: (r) => <Badge>{r.entidad === 'persona' ? 'Trabajadores' : r.entidad === 'tercero' ? 'Clientes y proveedores' : 'General'}</Badge> },
            { key: 'acc', header: '', cell: (r) => <IconButton icon={Trash2} label="Borrar" size="sm" onClick={async () => (await confirm({ title: 'Borrar plantilla', danger: true, confirm: 'Borrar' })) && borrar.mutate(r.id)} /> },
          ]}
        />
      </Card>
      {edit && <PlantillaDialog p={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PlantillaDialog({ p, onClose }: { p: any; onClose: () => void }) {
  const [f, setF] = useState({ nombre: p.nombre ?? '', entidad: p.entidad ?? 'persona', contenido: p.contenido ?? '', tipo: p.tipo ?? 'documento' });
  const save = useMut(() => (p.id ? api.patch(`/plantillas/${p.id}`, f) : api.post('/plantillas', f)), { ok: 'Plantilla guardada', invalidate: ['/plantillas'], onSuccess: onClose });
  const campos = [...CAMPOS[f.entidad as keyof typeof CAMPOS], 'empresa.nombre', 'empresa.razonSocial', 'empresa.nif', 'empresa.direccion', 'hoy'];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={p.id ? 'Editar plantilla' : 'Nueva plantilla'} size="lg" footer={<Button variant="primary" disabled={!f.nombre || !f.contenido} loading={save.isPending} onClick={() => save.mutate(undefined)}>Guardar</Button>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </Field>
          <Field label="Para">
            <Select value={f.entidad} onChange={(e) => setF({ ...f, entidad: e.target.value })} options={[{ value: 'persona', label: 'Trabajadores' }, { value: 'tercero', label: 'Clientes y proveedores' }, { value: 'ninguna', label: 'General' }]} />
          </Field>
        </div>
        <Field label="Texto">
          <Textarea value={f.contenido} onChange={(e) => setF({ ...f, contenido: e.target.value })} rows={12} className="font-mono text-[13px]" />
        </Field>
        <div>
          <p className="label">Campos disponibles (pulsa para insertar)</p>
          <div className="flex flex-wrap gap-1.5">
            {campos.map((c) => (
              <button key={c} type="button" onClick={() => setF({ ...f, contenido: `${f.contenido}{{${c}}}` })} className="rounded-md bg-sunken px-2 py-0.5 font-mono text-[12px] hover:bg-primary-soft hover:text-primary">
                {`{{${c}}}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
