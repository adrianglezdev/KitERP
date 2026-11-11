import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Plus } from 'lucide-react';
import { fmtDate, optionLabel, stkShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Card, DataTable, Dialog, EmptyState, EnumBadge, Field, Input, PageHeader, ProgressBar, RefSelect, Segmented, type Column } from '@/components/ui';

interface Inventario {
  id: string;
  codigo: string;
  fecha: string;
  tipo: string;
  estado: string;
  almacen: string;
  lineas: number;
  contadas: number;
  notas: string | null;
}

export default function Inventarios() {
  const nav = useNavigate();
  const { can } = useSession();
  const [estado, setEstado] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const { data, isLoading } = useApi<Inventario[]>(`/stk/inventarios${estado ? `?estado=${estado}` : ''}`);
  const columns: Column<Inventario>[] = [
    { key: 'codigo', header: 'Recuento', cell: (r) => <span className="font-medium">{r.codigo}</span> },
    { key: 'fecha', header: 'Fecha', cell: (r) => fmtDate(r.fecha) },
    { key: 'almacen', header: 'Almacén', cell: (r) => r.almacen },
    { key: 'tipo', header: 'Tipo', hideBelow: 'md', cell: (r) => optionLabel(stkShared.INVENTARIO_TIPOS, r.tipo)?.label },
    {
      key: 'avance',
      header: 'Contado',
      cell: (r) => (
        <div className="flex w-40 items-center gap-2">
          <ProgressBar value={r.contadas} max={r.lineas} tone={r.contadas === r.lineas ? 'green' : 'violet'} />
          <span className="tabular shrink-0 text-[12px] text-muted">
            {r.contadas}/{r.lineas}
          </span>
        </div>
      ),
    },
    { key: 'estado', header: 'Estado', cell: (r) => <EnumBadge options={stkShared.INVENTARIO_ESTADOS} value={r.estado} /> },
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventarios"
        icon={ClipboardCheck}
        back="/stock"
        subtitle="Recuentos totales o cíclicos. Se cuenta con el móvil escaneando los códigos."
        actions={
          can('stk.mover') && (
            <Button variant="primary" icon={Plus} onClick={() => setNuevo(true)}>
              Nuevo recuento
            </Button>
          )
        }
      />
      <Segmented value={estado} onChange={setEstado} options={[{ value: '', label: 'Todos' }, ...stkShared.INVENTARIO_ESTADOS.map((e) => ({ value: e.value, label: e.label }))]} />
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={data ?? []}
          loading={isLoading}
          onRowClick={(r) => nav(`/stock/inventarios/${r.id}`)}
          mobileTitle={(r) => `${r.codigo} · ${r.almacen}`}
          mobileSubtitle={(r) => `${fmtDate(r.fecha)} · ${r.contadas} de ${r.lineas} contados`}
          mobileRight={(r) => <EnumBadge options={stkShared.INVENTARIO_ESTADOS} value={r.estado} dot={false} />}
          empty={<EmptyState icon={ClipboardCheck} title="Sin recuentos">Crea un recuento para contar un almacén o una furgoneta.</EmptyState>}
        />
      </Card>
      {nuevo && <NuevoInventario onClose={() => setNuevo(false)} onCreated={(id) => nav(`/stock/inventarios/${id}`)} />}
    </div>
  );
}

export function NuevoInventario({ onClose, onCreated, almacenId: inicial }: { onClose: () => void; onCreated: (id: string) => void; almacenId?: string | null }) {
  const { scope, session } = useSession();
  const propio = scope('stk.mover') !== 'todo';
  const [almacenId, setAlmacenId] = useState<string | null>(inicial ?? null);
  const [tipo, setTipo] = useState<'total' | 'ciclico'>('ciclico');
  const [familiaId, setFamiliaId] = useState<string | null>(null);
  const [limite, setLimite] = useState('20');
  const [notas, setNotas] = useState('');
  const crear = useMut(() => api.post<{ id: string; lineas: number }>('/stk/inventarios', { almacenId, tipo, familiaId, limite: Number(limite) || 20, notas: notas || null }), {
    ok: (r) => `Recuento creado con ${r.lineas} artículos`,
    invalidate: ['/stk/inventarios'],
    onSuccess: (r) => onCreated(r.id),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Nuevo recuento"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={crear.isPending} disabled={!almacenId} onClick={() => crear.mutate(undefined)}>
            Crear y empezar a contar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Almacén" required>
          <RefSelect target="almacenes" value={almacenId} onChange={setAlmacenId} filter={propio && session?.user.personaId ? { personaId: session.user.personaId } : undefined} />
        </Field>
        <Field label="Tipo">
          <Segmented
            value={tipo}
            onChange={setTipo}
            options={[
              { value: 'ciclico', label: 'Cíclico (unos pocos artículos)' },
              { value: 'total', label: 'Total (todo el almacén)' },
            ]}
          />
        </Field>
        {tipo === 'ciclico' ? (
          <Field label="Número de artículos" help="Se eligen los que hace más tiempo que no se cuentan">
            <Input type="number" inputMode="numeric" value={limite} onChange={(e) => setLimite(e.target.value)} min={1} max={500} />
          </Field>
        ) : (
          <Field label="Solo una familia" help="Opcional">
            <RefSelect target="familias" value={familiaId} onChange={setFamiliaId} placeholder="Todas" />
          </Field>
        )}
        <Field label="Notas">
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Por ejemplo: estantería C" />
        </Field>
      </div>
    </Dialog>
  );
}
