import { Link } from 'react-router-dom';
import { cprShared, fmtDate, fmtMoney, fmtNumber } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, Spinner } from '@/components/ui';
import { ResourceList } from '@/components/resource';

/** Pestaña "Proveedores" del artículo: a quién se compra, a qué precio y comparativa con el histórico. */
export default function ArticuloProveedoresTab({ id }: { id: string }) {
  const { can } = useSession();
  const { data, isLoading } = useApi<any>(`/cpr/comparativa/${id}`);
  return (
    <div className="space-y-5">
      <ResourceList def={cprShared.articuloProveedorResource} endpoint="/cpr/articulo-proveedor" createPerm={can('cpr.editar') ? 'cpr.editar' : undefined} fixed={{ articuloId: id }} embedded pageSize={20} emptyText="Aún no hay precios de proveedor para este artículo." />
      {isLoading ? (
        <Spinner />
      ) : (
        data?.ofertas.length > 0 && (
          <Card>
            <CardHeader title="Comparativa de precios" subtitle="Precio neto (con descuento) frente al más barato" />
            <ul className="divide-y divide-line">
              {data.ofertas.map((o: any) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                  <Link to={`/terceros/${o.proveedorId}`} className="min-w-0 flex-1 truncate hover:text-primary">
                    {o.proveedor}
                  </Link>
                  {o.preferente && <Badge tone="violet">Preferente</Badge>}
                  {o.plazoDias !== null && <span className="text-[12px] text-muted">{o.plazoDias} días</span>}
                  <span className="tabular w-24 text-right font-medium">{fmtMoney(o.precioNeto)}</span>
                  <span className="w-16 text-right text-[12px]">{o.sobreMinimoPct === 0 ? <Badge tone="green">Mejor</Badge> : `+${fmtNumber(o.sobreMinimoPct, 1)} %`}</span>
                </li>
              ))}
            </ul>
          </Card>
        )
      )}
      {data?.historico.length > 0 && (
        <Card>
          <CardHeader title="Últimas compras" />
          <ul className="divide-y divide-line">
            {data.historico.map((h: any, i: number) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                <Link to={`/documentos/${h.documentoId}`} className="w-28 shrink-0 font-medium hover:text-primary">
                  {h.codigo ?? 'Borrador'}
                </Link>
                <span className="text-muted">{fmtDate(h.fecha)}</span>
                <span className="min-w-0 flex-1 truncate">{h.proveedor}</span>
                <span className="tabular text-muted">{fmtNumber(h.cantidad, 3)} ×</span>
                <span className="tabular w-20 text-right">{fmtMoney(h.precio)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
