import { Link } from 'react-router-dom';
import { fmtDateTime, fmtMoney, fmtNumber } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { Badge, Card, KeyValue, Spinner } from '@/components/ui';
import { DocumentList } from '@/components/docs/DocumentList';
import { Nota } from './Proveedores';

/** Pestaña "Compras" en la ficha de un proveedor: valoración, artículos que suministra y sus pedidos. */
export default function ProveedorTab({ id, record }: { id: string; record: any }) {
  const { data, isLoading } = useApi<any>(record?.esProveedor ? `/cpr/proveedores/${id}` : null);
  if (!record?.esProveedor) return <p className="text-[13.5px] text-muted">Esta ficha no está marcada como proveedor. Edítala y marca «Es proveedor» para poder comprarle.</p>;
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-5">
      <KeyValue
        cols={3}
        items={[
          { label: 'Nota', value: <Nota v={data.nota} /> },
          { label: 'Comprado este año', value: fmtMoney(data.compradoAnio) },
          { label: 'Puntualidad', value: data.puntualidadPct === null ? 'Sin entregas aún' : `${fmtNumber(data.puntualidadPct, 0)} % (${data.recepciones} entregas)` },
          { label: 'Plazo medio real', value: data.plazoMedioDias === null ? '—' : `${fmtNumber(data.plazoMedioDias, 1)} días` },
          { label: 'Pendiente de recibir', value: fmtMoney(data.pendienteRecibir) },
          { label: 'Incidencias', value: data.incidenciasAbiertas ? <Badge tone="red">{data.incidenciasAbiertas} abiertas de {data.incidencias}</Badge> : data.incidencias },
        ]}
      />
      {data.articulos.length > 0 && (
        <div>
          <p className="mb-2 text-[12.5px] font-bold text-muted">Artículos que suministra</p>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {data.articulos.map((a: any) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2 text-[13.5px]">
                  <Link to={`/catalogo/${a.articuloId}`} className="min-w-0 flex-1 truncate hover:text-primary">
                    <span className="font-mono text-[12px] text-muted">{a.referencia}</span> {a.nombre}
                  </Link>
                  {a.preferente && <Badge tone="violet">Preferente</Badge>}
                  <span className="tabular">{fmtMoney(a.precio)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      {data.incidencias.length > 0 && (
        <div>
          <p className="mb-2 text-[12.5px] font-bold text-muted">Últimas incidencias</p>
          <ul className="space-y-1.5 text-[13px]">
            {data.incidencias.slice(0, 6).map((i: any) => (
              <li key={i.id} className="flex items-center gap-2">
                <Badge tone={i.estado === 'abierta' ? 'red' : 'gray'}>{i.estado}</Badge>
                <span className="min-w-0 flex-1 truncate">{i.descripcion}</span>
                <span className="text-muted">{fmtDateTime(i.creadoEn)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <DocumentList tipos={['pedido_compra', 'recepcion', 'factura_proveedor']} fixed={{ terceroId: id }} embedded showPago />
    </div>
  );
}
