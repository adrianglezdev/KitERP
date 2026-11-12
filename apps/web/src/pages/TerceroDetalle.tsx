import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Building2, Contact, Mail, MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { contactoResource, fmtMoney, formatIban, TERCERO_ESTADOS, terceroResource } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Alert, Badge, Button, Card, Dialog, EnumBadge, Field, IconButton, Input, PageHeader, ProgressBar, Spinner, Stat, useConfirm } from '@/components/ui';
import { ResourceDetails, ResourceFormDialog, ResourceList } from '@/components/resource';
import { EntityTabsView } from '@/components/entity/EntityPage';

function Direcciones({ id, canEdit }: { id: string; canEdit: boolean }) {
  const url = `/terceros/${id}/direcciones`;
  const { data } = useApi<any[]>(url);
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nombre: '', direccion: '', codigoPostal: '', localidad: '', provincia: '', telefono: '' });
  const add = useMut(() => api.post(url, f), { ok: 'Dirección añadida', invalidate: [url], onSuccess: () => setOpen(false) });
  const del = useMut((did: string) => api.del(`/direcciones/${did}`), { invalidate: [url] });
  return (
    <div className="space-y-3">
      {!data?.length && <p className="text-[13px] text-muted">Sin direcciones de entrega adicionales: se usa la dirección fiscal.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {data?.map((d) => (
          <li key={d.id} className="flex items-start gap-3 rounded-xl border border-line-strong/70 p-3">
            <MapPin className="mt-0.5 h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1 text-[13.5px]">
              <p className="font-medium">{d.nombre}</p>
              <p className="text-muted">{[d.direccion, d.codigoPostal, d.localidad, d.provincia].filter(Boolean).join(', ')}</p>
            </div>
            {canEdit && <IconButton icon={Trash2} label="Quitar" size="sm" onClick={async () => (await confirm({ title: 'Quitar dirección', danger: true, confirm: 'Quitar' })) && del.mutate(d.id)} />}
          </li>
        ))}
      </ul>
      {canEdit && (
        <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
          Añadir dirección de entrega
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="Nueva dirección de entrega" footer={<Button variant="primary" disabled={!f.nombre} loading={add.isPending} onClick={() => add.mutate(undefined)}>Guardar</Button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre (p. ej. Almacén norte)" className="sm:col-span-2">
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </Field>
          <Field label="Dirección" className="sm:col-span-2">
            <Input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
          </Field>
          <Field label="Código postal">
            <Input value={f.codigoPostal} onChange={(e) => setF({ ...f, codigoPostal: e.target.value })} />
          </Field>
          <Field label="Localidad">
            <Input value={f.localidad} onChange={(e) => setF({ ...f, localidad: e.target.value })} />
          </Field>
          <Field label="Provincia">
            <Input value={f.provincia} onChange={(e) => setF({ ...f, provincia: e.target.value })} />
          </Field>
          <Field label="Teléfono">
            <Input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

export default function TerceroDetalle() {
  const { id } = useParams();
  const { can } = useSession();
  const { data: t, isLoading, error } = useApi<any>(`/terceros/${id}`);
  const resumen = useApi<any>(id ? `/terceros/${id}/resumen` : null);
  const [edit, setEdit] = useState(false);
  if (isLoading) return <Spinner />;
  if (error || !t) return <Alert tone="red">No tienes acceso a esta ficha o no existe.</Alert>;
  const canEdit = !!t._puedeEditar;
  const r = resumen.data;
  const riesgoUso = r?.riesgoMax ? (r.pendienteCobro / r.riesgoMax) * 100 : 0;
  return (
    <div className="space-y-5">
      <PageHeader
        back="/terceros"
        crumbs={[{ label: 'Clientes y proveedores', to: '/terceros' }, { label: t.nombre }]}
        title={t.nombre}
        subtitle={[t.razonSocial !== t.nombre ? t.razonSocial : null, t.nif, t.localidad].filter(Boolean).join(' · ')}
        badges={
          <>
            <EnumBadge options={TERCERO_ESTADOS} value={t.estado} />
            {t.esProveedor && <Badge tone="brown">Proveedor</Badge>}
            {t.etiquetas?.map((e: string) => (
              <Badge key={e}>{e}</Badge>
            ))}
          </>
        }
        actions={
          canEdit && (
            <Button icon={Pencil} onClick={() => setEdit(true)}>
              Editar
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        {t.telefono && (
          <a href={`tel:${t.telefono.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-3.5 py-1.5 text-[13px] font-semibold shadow-card transition hover:text-primary">
            <Phone className="h-4 w-4 text-primary" /> {t.telefono}
          </a>
        )}
        {t.email && (
          <a href={`mailto:${t.email}`} className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-3.5 py-1.5 text-[13px] font-semibold shadow-card transition hover:text-primary">
            <Mail className="h-4 w-4 text-primary" /> {t.email}
          </a>
        )}
        {t.direccion && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([t.direccion, t.codigoPostal, t.localidad].filter(Boolean).join(' '))}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-3.5 py-1.5 text-[13px] font-semibold shadow-card transition hover:text-primary">
            <MapPin className="h-4 w-4 text-primary" /> {[t.direccion, t.localidad].filter(Boolean).join(', ')}
          </a>
        )}
      </div>
      {r?.visible && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={`Facturado ${new Date().getFullYear()}`} value={fmtMoney(r.facturadoAnio)} hint={`Año anterior ${fmtMoney(r.facturadoAnterior)}`} />
          <Stat label="Pendiente de cobro" value={fmtMoney(r.pendienteCobro)} tone={r.pendienteCobro > 0 ? 'orange' : 'green'} />
          {t.esProveedor && <Stat label={`Comprado ${new Date().getFullYear()}`} value={fmtMoney(r.compradoAnio)} tone="brown" />}
          {r.riesgoMax ? (
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="text-[12.5px] text-muted">Riesgo usado</p>
              <p className="tabular font-display text-[22px] font-bold">{Math.round(riesgoUso)} %</p>
              <ProgressBar value={riesgoUso} tone={riesgoUso > 90 ? 'red' : riesgoUso > 70 ? 'yellow' : 'green'} />
              <p className="mt-1 text-[12px] text-muted">Máximo {fmtMoney(r.riesgoMax)}</p>
            </div>
          ) : null}
        </div>
      )}
      <EntityTabsView
        entidad="tercero"
        id={t.id}
        record={t}
        canEdit={canEdit}
        tabs={[
          {
            id: 'datos',
            label: 'Datos',
            icon: Building2,
            content: (
              <ResourceDetails
                def={{ ...terceroResource, fields: { ...terceroResource.fields } }}
                record={{ ...t, iban: t.iban ? formatIban(t.iban) : null }}
                exclude={['nombre']}
              />
            ),
          },
          {
            id: 'contactos',
            label: 'Contactos',
            icon: Contact,
            content: <ResourceList def={contactoResource} endpoint="/contactos" createPerm={canEdit ? 'terceros.gestionar' : undefined} editPerm={canEdit ? 'terceros.gestionar' : []} fixed={{ terceroId: t.id }} embedded pageSize={20} emptyText="Sin contactos. Añade a la persona con la que tratáis." />,
          },
          { id: 'direcciones', label: 'Direcciones', icon: MapPin, content: <Direcciones id={t.id} canEdit={canEdit} /> },
        ]}
      />
      <ResourceFormDialog open={edit} onOpenChange={setEdit} def={terceroResource} endpoint="/terceros" record={t} />
      {can('cfg.gestionar') && null}
    </div>
  );
}
