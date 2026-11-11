import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, Mail, Pencil, Phone, User } from 'lucide-react';
import { personaResource } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Avatar, Badge, Button, Card, Dialog, FileDrop, PageHeader, Spinner } from '@/components/ui';
import { ResourceDetails, ResourceFormDialog } from '@/components/resource';
import { EntityTabsView } from '@/components/entity/EntityPage';

export default function PersonaDetalle() {
  const { id } = useParams();
  const { can, session } = useSession();
  const { data: p, isLoading } = useApi<any>(`/personas/${id}`);
  const [edit, setEdit] = useState(false);
  const [foto, setFoto] = useState(false);
  const setPhoto = useMut((archivoId: string) => api.post(`/personas/${id}/foto`, { archivoId }), { ok: 'Foto actualizada', invalidate: ['/personas', 'session'], onSuccess: () => setFoto(false) });
  if (isLoading || !p) return <Spinner />;
  const nombre = `${p.nombre} ${p.apellidos ?? ''}`.trim();
  const esYo = session?.user.personaId === p.id;
  const gestiona = can('personas.gestionar');
  return (
    <div className="space-y-5">
      <PageHeader back="/personas" crumbs={[{ label: 'Directorio', to: '/personas' }, { label: nombre }]} title={nombre} actions={gestiona && <Button icon={Pencil} onClick={() => setEdit(true)}>Editar</Button>} />
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <button type="button" className="group relative self-start" onClick={() => (esYo || gestiona) && setFoto(true)} aria-label="Cambiar foto">
          <Avatar name={nombre} src={p.fotoUrl} size={76} />
          {(esYo || gestiona) && (
            <span className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 text-white group-hover:flex">
              <Camera className="h-5 w-5" />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold">{p.puesto ?? 'Sin puesto'}</p>
          <p className="text-[13.5px] text-muted">
            {p._refs?.departamentos?.[p.departamentoId] ?? 'Sin departamento'} · {p._refs?.centros?.[p.centroId] ?? 'Sin centro'}
          </p>
          {p.responsableId && (
            <p className="mt-1 text-[13px] text-muted">
              Responsable:{' '}
              <Link to={`/personas/${p.responsableId}`} className="text-primary hover:underline">
                {p._refs?.personas?.[p.responsableId]}
              </Link>
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {p.email && (
              <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-sunken px-2.5 py-1 text-[12.5px] hover:text-primary">
                <Mail className="h-3.5 w-3.5" /> {p.email}
              </a>
            )}
            {p.telefono && (
              <a href={`tel:${p.telefono.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 rounded-lg bg-sunken px-2.5 py-1 text-[12.5px] hover:text-primary">
                <Phone className="h-3.5 w-3.5" /> {p.telefono}
              </a>
            )}
            {!p.activo && <Badge tone="red">Baja</Badge>}
          </div>
        </div>
      </Card>
      <EntityTabsView
        entidad="persona"
        id={p.id}
        record={p}
        canEdit={gestiona || esYo}
        tabs={[{ id: 'resumen', label: 'Resumen', icon: User, content: <ResourceDetails def={personaResource} record={p} exclude={['nombre', 'apellidos']} /> }]}
      />
      <ResourceFormDialog open={edit} onOpenChange={setEdit} def={personaResource} endpoint="/personas" record={p} />
      <Dialog open={foto} onOpenChange={setFoto} title="Cambiar foto" size="sm">
        <FileDrop multiple={false} accept="image/*" onUploaded={(fs) => fs[0] && setPhoto.mutate(fs[0].id)} label="Elige una foto (JPG o PNG)" />
      </Dialog>
    </div>
  );
}
