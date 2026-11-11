import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Copy, Mail, Pencil, Phone, Plus, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDateTime, satShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Alert, Button, Card, CardHeader, Dialog, EnumBadge, Field, Input, KeyValue, PageHeader, RefSelect, Select, Spinner, Textarea } from '@/components/ui';
import { ResourceFormDialog } from '@/components/resource';
import { EntityTabsView } from '@/components/entity/EntityPage';
import { SlaBadge } from '../components';
import { ORDEN_ESTADOS, ORDEN_TIPOS, PRIORIDADES, TICKET_ESTADOS, telHref } from '../lib';

export default function TicketDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const url = `/sat/tickets/${id}/ficha`;
  const { data: t, isLoading } = useApi<any>(url);
  const [edit, setEdit] = useState(false);
  const [orden, setOrden] = useState(false);
  const estado = useMut((e: string) => api.post(`/sat/tickets/${id}/estado`, { estado: e }), { ok: 'Estado actualizado', invalidate: ['/sat'] });
  if (isLoading || !t) return <Spinner />;
  return (
    <div className="space-y-5">
      <PageHeader
        back="/sat/tickets"
        crumbs={[{ label: 'Tickets', to: '/sat/tickets' }, { label: t.codigo }]}
        title={t.asunto}
        subtitle={
          <span>
            {t.codigo} ·{' '}
            {t.cliente && (
              <Link to={`/terceros/${t.cliente.id}?tab=sat-sat`} className="font-medium text-fg hover:text-primary">
                {t.cliente.nombre}
              </Link>
            )}{' '}
            · {fmtDateTime(t.creadoEn)}
          </span>
        }
        badges={
          <>
            <EnumBadge options={TICKET_ESTADOS} value={t.estado} />
            <EnumBadge options={PRIORIDADES} value={t.prioridad} dot={false} />
            <SlaBadge sla={t.sla} estado={t.estado} />
          </>
        }
        actions={
          t.puedeEditar && (
            <>
              {t.estado !== 'cerrado' && (
                <Button variant="primary" icon={Plus} onClick={() => setOrden(true)}>
                  Crear orden de trabajo
                </Button>
              )}
              <Select className="w-48" value={t.estado} onChange={(e) => estado.mutate(e.target.value)} options={TICKET_ESTADOS} aria-label="Cambiar estado" />
              <Button icon={Pencil} onClick={() => setEdit(true)}>
                Editar
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          {t.descripcion && <Card className="whitespace-pre-wrap p-4 text-[14px]">{t.descripcion}</Card>}
          <Card className="overflow-hidden">
            <CardHeader title="Órdenes de trabajo" icon={Wrench} />
            {!t.ordenes.length ? (
              <p className="px-4 py-5 text-center text-[13px] text-muted">Aún no hay órdenes. Crea una para mandar a un técnico.</p>
            ) : (
              <ul className="divide-y divide-line">
                {t.ordenes.map((o: any, i: number) => (
                  <li key={o.id ?? i}>
                    {o.id ? (
                      <Link to={`/sat/ordenes/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                        <span className="w-24 font-medium">{o.codigo}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                          {o.tecnico ?? 'Sin técnico'} {o.planificadaInicio ? `· ${fmtDateTime(o.planificadaInicio)}` : ''}
                        </span>
                        <EnumBadge options={ORDEN_ESTADOS} value={o.estado} />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-2.5 text-muted">
                        <span className="w-24">{o.codigo}</span>
                        <span className="flex-1 text-[13px]">Asignada a otro técnico</span>
                        <EnumBadge options={ORDEN_ESTADOS} value={o.estado} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <EntityTabsView entidad="sat_ticket" id={t.id} record={t} tabs={[]} common={['comentarios', 'adjuntos', 'actividad']} />
        </div>
        <div className="space-y-5">
          <Card className="p-4">
            <KeyValue
              cols={1}
              items={[
                { label: 'Canal', value: satShared.CANALES.find((c) => c.value === t.canal)?.label ?? t.canal },
                { label: 'Comunicado por', value: [t.reportadoPor, t.reportadoContacto].filter(Boolean).join(' · ') || null },
                { label: 'Contacto', value: t.contacto?.nombre },
                { label: 'Responsable', value: t.responsable },
                { label: 'Equipo', value: t.equipo ? <Link to={`/sat/equipos/${t.equipo.id}`} className="text-primary hover:underline">{t.equipo.nombre}</Link> : null },
                { label: 'Contrato', value: t.contrato ? <Link to={`/sat/contratos/${t.contrato.id}`} className="text-primary hover:underline">{t.contrato.codigo}</Link> : null },
                { label: 'Respuesta antes de', value: t.venceRespuesta ? fmtDateTime(t.venceRespuesta) : null },
                { label: 'Resolución antes de', value: t.venceResolucion ? fmtDateTime(t.venceResolucion) : null },
                ...(t.valoracion ? [{ label: 'Valoración del cliente', value: `${'★'.repeat(t.valoracion)}${'☆'.repeat(5 - t.valoracion)}${t.valoracionComentario ? ` · ${t.valoracionComentario}` : ''}` }] : []),
              ]}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {t.cliente?.telefono && (
                <a href={telHref(t.cliente.telefono)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12.5px] hover:border-primary/40">
                  <Phone className="h-3.5 w-3.5 text-primary" /> {t.cliente.telefono}
                </a>
              )}
              {t.cliente?.email && (
                <a href={`mailto:${t.cliente.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12.5px] hover:border-primary/40">
                  <Mail className="h-3.5 w-3.5 text-primary" /> Email
                </a>
              )}
            </div>
          </Card>
          <Card className="p-4 text-[13px]">
            <p className="mb-2 font-semibold">Enlace de seguimiento para el cliente</p>
            <p className="mb-2 text-muted">Con él ve el estado del aviso y, al terminar, puede valorar la asistencia.</p>
            <Button size="sm" icon={Copy} onClick={() => navigator.clipboard.writeText(t.enlaceSeguimiento).then(() => toast.success('Enlace copiado')).catch(() => toast.info(t.enlaceSeguimiento))}>
              Copiar enlace
            </Button>
          </Card>
        </div>
      </div>
      <ResourceFormDialog open={edit} onOpenChange={setEdit} def={satShared.ticketResource} endpoint="/sat/tickets" record={t} />
      {orden && <NuevaOrden ticketId={t.id} onClose={() => setOrden(false)} onCreated={(oid) => nav(`/sat/ordenes/${oid}`)} />}
    </div>
  );
}

function NuevaOrden({ ticketId, onClose, onCreated }: { ticketId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ tecnicoId: null as string | null, tipo: 'correctivo', planificadaInicio: '', checklistId: null as string | null, descripcion: '' });
  const crear = useMut(() => api.post<{ id: string }>(`/sat/tickets/${ticketId}/orden`, { ...f, planificadaInicio: f.planificadaInicio || null, descripcion: f.descripcion || null }), {
    ok: 'Orden creada',
    invalidate: ['/sat'],
    onSuccess: (r) => onCreated(r.id),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Nueva orden de trabajo" footer={<Button variant="primary" icon={Wrench} loading={crear.isPending} onClick={() => crear.mutate(undefined)}>Crear orden</Button>}>
      <div className="space-y-3">
        <Field label="Técnico">
          <RefSelect target="sat_tecnicos" value={f.tecnicoId} onChange={(v) => setF({ ...f, tecnicoId: v })} placeholder="Sin asignar todavía" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <Select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} options={ORDEN_TIPOS} />
          </Field>
          <Field label="Cuándo">
            <Input type="datetime-local" value={f.planificadaInicio} onChange={(e) => setF({ ...f, planificadaInicio: e.target.value })} />
          </Field>
        </div>
        <Field label="Lista de comprobación">
          <RefSelect target="sat_checklists" value={f.checklistId} onChange={(v) => setF({ ...f, checklistId: v })} placeholder="Ninguna" />
        </Field>
        <Field label="Instrucciones para el técnico" help="Si lo dejas vacío se copia la descripción del ticket">
          <Textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} rows={3} />
        </Field>
      </div>
      <Alert tone="gray" className="mt-3">El técnico recibe un aviso en su móvil.</Alert>
    </Dialog>
  );
}

