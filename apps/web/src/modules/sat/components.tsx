import { Link } from 'react-router-dom';
import { BookOpenCheck, Camera, ExternalLink, ImageOff, Trash2 } from 'lucide-react';
import { dtcShared, optionLabel } from '@kite/shared';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn, TONES, type Tone } from '@/lib/utils';
import { Badge, Card, CardHeader, FileDrop, IconButton, Skeleton, useConfirm } from '@/components/ui';
import { restanteTexto } from './lib';

/** "Manuales de este equipo": documentación técnica vinculada (DTC) al equipo o a su artículo. */
export function ManualesVinculados({ entidad, id, articuloId, titulo = 'Manuales de este equipo' }: { entidad: string; id: string; articuloId?: string | null; titulo?: string }) {
  const { has, can } = useSession();
  const activo = has('dtc') && can('dtc.ver');
  const { data, isLoading } = useApi<any[]>(activo ? `/dtc/vinculados?entidad=${entidad}&id=${id}${articuloId ? `&articuloId=${articuloId}` : ''}` : null);
  if (!activo) return null;
  return (
    <Card>
      <CardHeader title={titulo} icon={BookOpenCheck} />
      {isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : !data?.length ? (
        <p className="px-4 py-5 text-center text-[13px] text-muted">No hay documentación técnica vinculada.</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <Link to={`/dtc/documentos/${d.id}`} className="block truncate text-[13.5px] font-medium hover:text-primary">
                  {d.titulo}
                </Link>
                <p className="text-[12px] text-muted">
                  {d.codigo} · {optionLabel(dtcShared.DTC_TIPOS, d.tipo)?.label}
                  {d.version ? ` · v${d.version}` : ' · sin versión vigente'}
                </p>
              </div>
              {d.url && (
                <a href={d.url} target="_blank" rel="noreferrer" className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-primary hover:bg-primary-soft">
                  <ExternalLink className="h-4 w-4" /> Abrir
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Fotos de una orden: se hacen con la cámara del móvil y se guardan como adjuntos de la orden. */
export function FotosOrden({ ordenId, puedeEditar }: { ordenId: string; puedeEditar: boolean }) {
  const url = `/adjuntos/sat_orden/${ordenId}`;
  const confirm = useConfirm();
  const { data, isLoading } = useApi<any[]>(url);
  const add = useMut((archivoIds: string[]) => api.post(url, { archivoIds, carpeta: 'Fotos' }), { ok: 'Fotos guardadas', invalidate: [url] });
  const del = useMut((id: string) => api.del(`/adjuntos/${id}`), { ok: 'Foto quitada', invalidate: [url] });
  const fotos = data ?? [];
  return (
    <Card>
      <CardHeader title="Fotos y documentos" icon={Camera} subtitle={fotos.length ? `${fotos.length} archivo${fotos.length === 1 ? '' : 's'}` : undefined} />
      <div className="space-y-3 p-4">
        {puedeEditar && (
          <FileDrop
            capture
            accept="image/*,application/pdf"
            label="Hacer foto o elegir archivo"
            compact
            onUploaded={(fs) => {
              if (!navigator.onLine) return toast.error('Sin conexión: haz la foto de nuevo cuando tengas cobertura');
              add.mutate(fs.map((f) => f.id));
            }}
          />
        )}
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !fotos.length ? (
          <p className="flex items-center justify-center gap-2 py-3 text-[13px] text-muted">
            <ImageOff className="h-4 w-4" /> Sin fotos todavía
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {fotos.map((f) => (
              <li key={f.id} className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-sunken">
                <a href={f.url} target="_blank" rel="noreferrer" className="block h-full w-full">
                  {String(f.mime).startsWith('image/') ? <img src={f.url} alt={f.nombre} loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center p-2 text-center text-[11px] text-muted">{f.nombre}</span>}
                </a>
                {puedeEditar && (
                  <IconButton
                    icon={Trash2}
                    label="Quitar"
                    size="sm"
                    className="absolute right-1 top-1 bg-surface/90 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={async () => (await confirm({ title: 'Quitar foto', message: 'Se quitará de la orden.', danger: true, confirm: 'Quitar' })) && del.mutate(f.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/** Insignia con la cuenta atrás del SLA de un ticket. */
export function SlaBadge({ sla, estado }: { sla: any; estado?: string }) {
  if (!sla) return null;
  if (estado && ['resuelto', 'cerrado'].includes(estado)) return sla.incumplido ? <Badge tone="red">SLA incumplido</Badge> : <Badge tone="green">En plazo</Badge>;
  const tone: Tone = sla.incumplido ? 'red' : sla.enRiesgo ? 'orange' : 'gray';
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset', TONES[tone])} title={`Objetivo de ${sla.objetivo === 'respuesta' ? 'primera respuesta' : 'resolución'}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {sla.incumplido ? 'Fuera de plazo' : `${sla.objetivo === 'respuesta' ? 'Responder' : 'Resolver'}: ${restanteTexto(sla.restanteMin)}`}
    </span>
  );
}
