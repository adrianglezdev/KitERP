import { useState } from 'react';
import { CalendarRange, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Badge, Button, Card, DataTable, Dialog, EnumBadge, Field, PageHeader, Select } from '@/components/ui';
import { MESES, PERIODO_ESTADOS } from '../comun';

/** Meses de nómina: variables para la gestoría, reparto de recibos y cierre. */
export default function Periodos() {
  const nav = useNavigate();
  const { data, isLoading } = useApi<any[]>('/nom/periodos');
  const [nuevo, setNuevo] = useState(false);
  return (
    <>
      <PageHeader
        title="Nóminas"
        icon={CalendarRange}
        subtitle="Cada mes: revisa las variables, envía el Excel a la gestoría, sube los recibos y se reparten solos."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setNuevo(true)}>
            Nuevo mes
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <DataTable
          rows={data ?? []}
          loading={isLoading}
          onRowClick={(p: any) => nav(`/nominas/periodos/${p.id}`)}
          empty="Crea el primer mes de nómina."
          columns={[
            { key: 'nombre', header: 'Mes', cell: (p: any) => <span className="font-semibold">{p.nombre}</span> },
            { key: 'estado', header: 'Estado', cell: (p: any) => <EnumBadge options={PERIODO_ESTADOS} value={p.estado} /> },
            { key: 'variables', header: 'Variables', align: 'right', cell: (p: any) => p.variables, hideBelow: 'md' },
            { key: 'recibos', header: 'Recibos', align: 'right', cell: (p: any) => (
                <span className="inline-flex items-center gap-1.5">
                  {p.recibos}
                  {p.sinAsignar > 0 && <Badge tone="orange">{p.sinAsignar} sin asignar</Badge>}
                </span>
              ) },
            { key: 'leidos', header: 'Leídos', align: 'right', cell: (p: any) => (p.recibos ? `${p.leidos}/${p.recibos}` : '—'), hideBelow: 'md' },
          ]}
          mobileTitle={(p: any) => p.nombre}
          mobileSubtitle={(p: any) => `${p.recibos} recibos · ${p.variables} variables`}
          mobileRight={(p: any) => <EnumBadge options={PERIODO_ESTADOS} value={p.estado} />}
        />
      </Card>
      {nuevo && <NuevoPeriodo onClose={() => setNuevo(false)} onCreado={(id) => nav(`/nominas/periodos/${id}`)} />}
    </>
  );
}

function NuevoPeriodo({ onClose, onCreado }: { onClose: () => void; onCreado: (id: string) => void }) {
  const d = new Date();
  const [anio, setAnio] = useState(String(d.getFullYear()));
  const [mes, setMes] = useState(String(d.getMonth() + 1));
  const m = useMut(() => api.post<any>('/nom/periodos', { anio: Number(anio), mes: Number(mes) }), { ok: 'Mes creado', invalidate: ['/nom/periodos'], onSuccess: (r) => onCreado(r.id) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Nuevo mes de nómina" size="sm" footer={<Button variant="primary" loading={m.isPending} onClick={() => m.mutate(undefined)}>Crear</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mes">
          <Select value={mes} onChange={(e) => setMes(e.target.value)} options={MESES.map((n, i) => ({ value: String(i + 1), label: n }))} />
        </Field>
        <Field label="Año">
          <Select value={anio} onChange={(e) => setAnio(e.target.value)} options={[d.getFullYear() + 1, d.getFullYear(), d.getFullYear() - 1].map((a) => ({ value: String(a), label: String(a) }))} />
        </Field>
      </div>
    </Dialog>
  );
}
