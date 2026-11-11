import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ShoppingCart } from 'lucide-react';
import { cprShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Alert, Button, Dialog, Field, PageHeader, RefSelect, Segmented } from '@/components/ui';
import { ResourceList } from '@/components/resource';

/**
 * Solicitudes internas de compra: cualquier persona pide material; su responsable la aprueba
 * y compras agrupa las aprobadas en pedidos a proveedor.
 */
export default function Solicitudes() {
  const nav = useNavigate();
  const { can } = useSession();
  const [estado, setEstado] = useState<string>('');
  const [pedir, setPedir] = useState(false);
  return (
    <>
      <PageHeader
        title="Solicitudes de compra"
        icon={ClipboardList}
        subtitle="Pide lo que necesites. Tu responsable la aprueba y compras la convierte en un pedido al proveedor."
        actions={
          can('cpr.editar') && (
            <Button icon={ShoppingCart} onClick={() => setPedir(true)}>
              Pedir las aprobadas
            </Button>
          )
        }
      />
      <Segmented
        className="mb-4"
        value={estado}
        onChange={setEstado}
        options={[{ value: '', label: 'Todas' }, ...cprShared.SOLICITUD_ESTADOS.map((e) => ({ value: e.value, label: e.label }))]}
      />
      <ResourceList key={estado} def={cprShared.solicitudResource} endpoint="/cpr/solicitudes" createPerm="cpr.solicitar" editPerm={[]} fixed={estado ? { estado } : undefined} />
      {pedir && <PedirDialog onClose={() => setPedir(false)} onDone={(id) => nav(`/documentos/${id}`)} />}
    </>
  );
}

function PedirDialog({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const aprobadas = useApi<{ items: { id: string }[] }>('/cpr/solicitudes?f.estado=aprobada&pageSize=200');
  const ids = (aprobadas.data?.items ?? []).map((i) => i.id);
  const cargado = !!aprobadas.data;
  const pedir = useMut(() => api.post<{ pedidos: { id: string }[] }>('/cpr/solicitudes/pedir', { ids, proveedorId }), {
    ok: (r) => `${r.pedidos.length} pedido(s) a proveedor creados en borrador`,
    invalidate: ['/cpr', '/documentos'],
    onSuccess: (r) => {
      onClose();
      if (r.pedidos.length === 1) onDone(r.pedidos[0]!.id);
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Pedir las solicitudes aprobadas"
      footer={
        <Button variant="primary" icon={ShoppingCart} disabled={!ids.length} loading={pedir.isPending} onClick={() => pedir.mutate(undefined)}>
          Crear pedidos
        </Button>
      }
    >
      <div className="space-y-3">
        {cargado && !ids.length ? <Alert tone="gray">No hay solicitudes aprobadas pendientes de pedir.</Alert> : <Alert tone="violet">Se crearán pedidos en borrador agrupados por proveedor ({ids.length} solicitudes). Si el artículo tiene proveedor habitual se usa ese.</Alert>}
        <Field label="Proveedor para todas (opcional)" help="Si lo indicas, todas las solicitudes se piden a este proveedor">
          <RefSelect target="proveedores" value={proveedorId} onChange={setProveedorId} placeholder="El habitual de cada artículo" />
        </Field>
      </div>
    </Dialog>
  );
}
