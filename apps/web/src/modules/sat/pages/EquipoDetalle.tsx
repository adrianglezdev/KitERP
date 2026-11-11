import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Copy, HardDrive, Pencil, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, fmtDateTime, satShared } from '@kite/shared';
import { download } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Badge, Button, Card, CardHeader, EnumBadge, KeyValue, PageHeader, Spinner } from '@/components/ui';
import { ResourceFormDialog } from '@/components/resource';
import { EntityTabsView } from '@/components/entity/EntityPage';
import { ManualesVinculados } from '../components';
import { ORDEN_ESTADOS, ORDEN_TIPOS, TICKET_ESTADOS } from '../lib';

export default function EquipoDetalle() {
  const { id } = useParams();
  const { data: e, isLoading } = useApi<any>(`/sat/equipos/${id}/ficha`);
  const [edit, setEdit] = useState(false);
  if (isLoading || !e) return <Spinner />;
  return (
    <div className="space-y-5">
      <PageHeader
        back="/sat/equipos"
        crumbs={[{ label: 'Equipos instalados', to: '/sat/equipos' }, { label: e.nombre }]}
        title={e.nombre}
        icon={HardDrive}
        subtitle={e.cliente && <Link to={`/terceros/${e.cliente.id}?tab=sat-sat`} className="font-medium text-fg hover:text-primary">{e.cliente.nombre}</Link>}
        badges={e.garantiaHasta && <Badge tone={e.enGarantia ? 'green' : 'gray'}>{e.enGarantia ? `En garantía hasta ${fmtDate(e.garantiaHasta)}` : 'Fuera de garantía'}</Badge>}
        actions={
          <>
            <Button icon={QrCode} onClick={() => download(`/sat/equipos/${e.id}/etiqueta`, 'etiqueta.pdf')}>
              Etiqueta QR
            </Button>
            {e.puedeEditar && (
              <Button icon={Pencil} onClick={() => setEdit(true)}>
                Editar
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <CardHeader title="Historial de intervenciones" />
            {!e.historial.length ? (
              <p className="px-4 py-5 text-center text-[13px] text-muted">Sin intervenciones todavía.</p>
            ) : (
              <ul className="divide-y divide-line">
                {e.historial.map((o: any) => (
                  <li key={o.id}>
                    <Link to={`/sat/ordenes/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                      <span className="w-24 font-medium">{o.codigo}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                        {fmtDateTime(o.fecha)} · <EnumBadge options={ORDEN_TIPOS} value={o.tipo} dot={false} /> {o.tecnico ? `· ${o.tecnico}` : ''}
                      </span>
                      <EnumBadge options={ORDEN_ESTADOS} value={o.estado} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {e.tickets.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title="Tickets" />
              <ul className="divide-y divide-line">
                {e.tickets.map((t: any) => (
                  <li key={t.id}>
                    <Link to={`/sat/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                      <span className="w-24 font-medium">{t.codigo}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">{t.asunto}</span>
                      <EnumBadge options={TICKET_ESTADOS} value={t.estado} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <ManualesVinculados entidad="sat_equipo" id={e.id} articuloId={e.articuloId} />
          <EntityTabsView entidad="sat_equipo" id={e.id} record={e} tabs={[]} common={['adjuntos', 'comentarios']} />
        </div>
        <Card className="h-fit p-4">
          <KeyValue
            cols={1}
            items={[
              { label: 'Marca y modelo', value: [e.marca, e.modelo].filter(Boolean).join(' ') || null },
              { label: 'Número de serie', value: e.numeroSerie && <span className="font-mono">{e.numeroSerie}</span> },
              { label: 'Ubicación', value: e.ubicacion },
              { label: 'Instalado', value: e.fechaInstalacion ? fmtDate(e.fechaInstalacion) : null },
              { label: 'Artículo', value: e.articulo ? <Link to={`/catalogo/${e.articulo.id}`} className="text-primary hover:underline">{e.articulo.referencia}</Link> : null },
              { label: 'Contrato', value: e.contrato ? <Link to={`/sat/contratos/${e.contrato.id}`} className="text-primary hover:underline">{e.contrato.codigo} · {e.contrato.nombre}</Link> : null },
              { label: 'Notas', value: e.notas },
            ]}
          />
          {e.enlacePublico && (
            <Button size="sm" className="mt-3" icon={Copy} onClick={() => navigator.clipboard.writeText(e.enlacePublico).then(() => toast.success('Enlace copiado')).catch(() => toast.info(e.enlacePublico))}>
              Copiar enlace del QR
            </Button>
          )}
        </Card>
      </div>
      <ResourceFormDialog open={edit} onOpenChange={setEdit} def={satShared.equipoResource} endpoint="/sat/equipos" record={e} />
    </div>
  );
}
