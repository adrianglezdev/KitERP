import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DOC_TIPOS, optionLabel } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Alert, Badge, Button, Card, Checkbox, DataTable, Dialog, Field, Input, Select, Switch } from '@/components/ui';

export default function Series() {
  const { data, isLoading } = useApi<any[]>('/series');
  const [nueva, setNueva] = useState(false);
  const [f, setF] = useState({ tipo: 'factura', codigo: '', nombre: '', anio: new Date().getFullYear(), porDefecto: false });
  const crear = useMut(() => api.post('/series', f), { ok: 'Serie creada', invalidate: ['/series'], onSuccess: () => setNueva(false) });
  const cambiar = useMut((p: { id: string; data: Record<string, unknown> }) => api.patch(`/series/${p.id}`, p.data), { invalidate: ['/series'] });
  return (
    <div className="space-y-4">
      <Alert tone="violet">La numeración es correlativa y sin huecos dentro de cada serie y año: el número se asigna en el momento de emitir. Puedes crear series separadas (p. ej. por centro o para abonos).</Alert>
      <Card className="overflow-hidden">
        <div className="flex justify-end border-b border-line p-3">
          <Button variant="primary" icon={Plus} onClick={() => setNueva(true)}>
            Nueva serie
          </Button>
        </div>
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          columns={[
            { key: 'tipo', header: 'Documento', cell: (r) => optionLabel(DOC_TIPOS, r.tipo)?.label ?? r.tipo },
            { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre },
            { key: 'codigo', header: 'Prefijo', cell: (r) => <code className="font-mono">{r.codigo}{String(r.anio).slice(2)}-</code> },
            { key: 'anio', header: 'Año', cell: (r) => r.anio },
            { key: 'siguiente', header: 'Próximo nº', align: 'right', cell: (r) => r.siguiente },
            { key: 'def', header: 'Por defecto', cell: (r) => (r.porDefecto ? <Badge tone="violet">Sí</Badge> : <button type="button" className="text-[12.5px] text-primary hover:underline" onClick={() => cambiar.mutate({ id: r.id, data: { porDefecto: true } })}>Usar por defecto</button>) },
            { key: 'activo', header: 'Activa', cell: (r) => <Switch checked={r.activo} onChange={(v) => cambiar.mutate({ id: r.id, data: { activo: v } })} /> },
          ]}
        />
      </Card>
      <Dialog open={nueva} onOpenChange={setNueva} title="Nueva serie" size="sm" footer={<Button variant="primary" disabled={!f.codigo || !f.nombre} loading={crear.isPending} onClick={() => crear.mutate(undefined)}>Crear</Button>}>
        <div className="space-y-3">
          <Field label="Documento">
            <Select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} options={DOC_TIPOS} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prefijo" help="Letras, p. ej. FB">
              <Input value={f.codigo} maxLength={6} onChange={(e) => setF({ ...f, codigo: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Año">
              <Input type="number" value={f.anio} onChange={(e) => setF({ ...f, anio: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Nombre">
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Facturas de Barcelona" />
          </Field>
          <Checkbox checked={f.porDefecto} onChange={(v) => setF({ ...f, porDefecto: v })} label="Usar por defecto para este documento" />
        </div>
      </Dialog>
    </div>
  );
}
