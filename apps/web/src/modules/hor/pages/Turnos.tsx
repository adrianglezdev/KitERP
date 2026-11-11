import { useState } from 'react';
import { Copy, MonitorSmartphone, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDateTime, horShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Alert, Badge, Button, Card, CardHeader, DataTable, Dialog, Field, Input, PageHeader, RefSelect, Switch, useConfirm } from '@/components/ui';
import { ResourceList } from '@/components/resource';

/** Configuración del control horario: turnos, asignaciones de turno a personas y quioscos de fichaje. */
export default function Turnos() {
  return (
    <div className="space-y-6">
      <PageHeader title="Turnos y quioscos" icon={MonitorSmartphone} subtitle="Los turnos definen la jornada prevista; las asignaciones dicen quién tiene cada turno y desde cuándo." />
      <ResourceList def={horShared.turnoResource} endpoint="/hor/turnos" createPerm="hor.gestionar" title={<h2 className="text-[16px] font-bold">Turnos</h2>} />
      <ResourceList def={horShared.asignacionResource} endpoint="/hor/asignaciones" createPerm="hor.gestionar" title={<h2 className="text-[16px] font-bold">Asignaciones</h2>} />
      <Quioscos />
    </div>
  );
}

function Quioscos() {
  const confirm = useConfirm();
  const { data, isLoading } = useApi<any[]>('/hor/kioscos');
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ nombre: '', centroId: null as string | null });
  const [enlace, setEnlace] = useState<string | null>(null);
  const crear = useMut(() => api.post<{ url: string }>('/hor/kioscos', f), { invalidate: ['/hor/kioscos'], onSuccess: (r) => { setNuevo(false); setEnlace(r.url); } });
  const regenerar = useMut((id: string) => api.post<{ url: string }>(`/hor/kioscos/${id}/token`), { invalidate: ['/hor/kioscos'], onSuccess: (r) => setEnlace(r.url) });
  const activar = useMut((p: { id: string; activo: boolean }) => api.patch(`/hor/kioscos/${p.id}`, { activo: p.activo }), { invalidate: ['/hor/kioscos'] });
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Quioscos de fichaje"
        subtitle="Una tableta en la entrada del centro donde cada persona ficha con su PIN"
        actions={
          <Button size="sm" icon={Plus} onClick={() => setNuevo(true)}>
            Nuevo quiosco
          </Button>
        }
      />
      <DataTable
        loading={isLoading}
        rows={data ?? []}
        columns={[
          { key: 'nombre', header: 'Quiosco', cell: (r) => <span className="font-medium">{r.nombre}</span> },
          { key: 'centro', header: 'Centro', cell: (r) => r.centro },
          { key: 'uso', header: 'Último uso', hideBelow: 'md', cell: (r) => (r.ultimoUso ? fmtDateTime(r.ultimoUso) : 'Nunca') },
          { key: 'activo', header: 'Activo', cell: (r) => <Switch checked={r.activo} onChange={(v) => activar.mutate({ id: r.id, activo: v })} /> },
          {
            key: 'acc',
            header: '',
            cell: (r) => (
              <Button size="sm" variant="ghost" icon={RefreshCw} onClick={async () => (await confirm({ title: 'Nuevo enlace del quiosco', message: 'El enlace actual dejará de funcionar. Tendrás que abrir el nuevo en la tableta.', confirm: 'Generar' })) && regenerar.mutate(r.id)}>
                Nuevo enlace
              </Button>
            ),
          },
        ]}
        empty={<p className="px-4 py-6 text-center text-[13px] text-muted">No hay quioscos. Cada trabajador debe elegir su PIN en la pantalla Fichar.</p>}
      />
      <Dialog open={nuevo} onOpenChange={setNuevo} title="Nuevo quiosco" size="sm" footer={<Button variant="primary" disabled={!f.nombre || !f.centroId} loading={crear.isPending} onClick={() => crear.mutate(undefined)}>Crear</Button>}>
        <div className="space-y-3">
          <Field label="Nombre">
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Tableta de la entrada" />
          </Field>
          <Field label="Centro">
            <RefSelect target="centros" value={f.centroId} onChange={(v) => setF({ ...f, centroId: v })} />
          </Field>
        </div>
      </Dialog>
      <Dialog open={!!enlace} onOpenChange={(o) => !o && setEnlace(null)} title="Abre este enlace en la tableta" size="sm">
        <Alert tone="yellow" className="mb-3">
          Guárdalo como acceso directo en la tableta. Por seguridad no se vuelve a mostrar; si lo pierdes, genera uno nuevo.
        </Alert>
        <div className="flex gap-2">
          <Input readOnly value={enlace ?? ''} onFocus={(e) => e.target.select()} className="text-[12px]" />
          <Button icon={Copy} onClick={() => navigator.clipboard.writeText(enlace ?? '').then(() => toast.success('Copiado')).catch(() => {})}>
            Copiar
          </Button>
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Solo aparecen las personas de ese centro que ya han elegido su PIN. <Badge>PIN de 4 a 6 cifras</Badge>
        </p>
      </Dialog>
    </Card>
  );
}
