import { useState } from 'react';
import { Clock, History, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { ficShared, fmtDate, optionLabel, type ResourceDef } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Alert, Badge, Button, Dialog, EmptyState, IconButton, Spinner, useConfirm } from '@/components/ui';
import { ResourceDetails, ResourceForm } from '@/components/resource';

const { trabajadorResource, historialResource, CAMPOS_EMPLEADO, HISTORIAL_TIPOS } = ficShared;

/** Formulario de propuesta del propio trabajador: sus datos personales, sin la marca de "sensible" (son suyos). */
const propuestaDef: ResourceDef = {
  ...trabajadorResource,
  fields: Object.fromEntries(CAMPOS_EMPLEADO.map((k) => [k, { ...trabajadorResource.fields[k]!, sensitive: undefined }])),
  sections: [{ title: '', fields: [...CAMPOS_EMPLEADO] }],
};

/** Pestaña "Ficha laboral" en la ficha de persona. */
export default function FichaLaboral({ id }: { id: string }) {
  const url = `/fic/fichas/${id}`;
  const { data, isLoading } = useApi<any>(url);
  const { can } = useSession();
  const confirm = useConfirm();
  const [editar, setEditar] = useState(false);
  const [proponer, setProponer] = useState(false);
  const [nuevoHist, setNuevoHist] = useState(false);
  const hist = useApi<any[]>(`/fic/historial?personaId=${id}`);
  const borrarHist = useMut((hid: string) => api.del(`/fic/historial/${hid}`), { invalidate: ['/fic/historial'] });
  if (isLoading || !data) return <Spinner />;
  const f = data.ficha;
  const record = f ? { ...f, id: f.id } : null;
  return (
    <div className="space-y-6">
      {data.cambioPendiente && <Alert tone="violet" icon={Clock}>Hay cambios de datos personales pendientes de validar por RRHH (enviados el {fmtDate(data.cambioPendiente.creadoEn)}).</Alert>}
      {data.ultimoRechazo && <Alert tone="red" title="RRHH no validó tus últimos cambios">{data.ultimoRechazo.motivo}</Alert>}
      {f && !f.validado && <Alert tone="yellow">Datos pendientes de validar por RRHH.</Alert>}

      <div className="flex flex-wrap justify-end gap-2">
        {data.propia && !data.puedeEditar && (
          <Button icon={Send} onClick={() => setProponer(true)}>
            Actualizar mis datos
          </Button>
        )}
        {data.puedeEditar && (
          <Button icon={Pencil} onClick={() => setEditar(true)}>
            {f ? 'Editar ficha' : 'Crear ficha laboral'}
          </Button>
        )}
      </div>

      {!f ? (
        <EmptyState title="Aún no hay ficha laboral">{data.puedeEditar ? 'Créala con los datos del contrato.' : 'RRHH la completará con los datos de tu contrato.'}</EmptyState>
      ) : (
        <ResourceDetails def={trabajadorResource} record={{ ...f, _refs: {} }} exclude={['personaId', ...(data.puedeVerSensible ? [] : ['salarioBruto', 'iban', 'discapacidad', 'datosSalud'])]} />
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[12.5px] font-bold text-muted">
            <History className="h-4 w-4" /> Historial laboral
          </h3>
          {can('fic.editar') && data.puedeEditar && (
            <Button size="sm" icon={Plus} onClick={() => setNuevoHist(true)}>
              Añadir
            </Button>
          )}
        </div>
        {!hist.data?.length ? (
          <p className="text-[13px] text-muted">Los cambios de contrato, categoría, jornada, salario o centro se anotan aquí automáticamente.</p>
        ) : (
          <ol className="space-y-2 border-l border-line pl-4">
            {hist.data.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-surface" />
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">
                      {optionLabel(HISTORIAL_TIPOS, h.tipo)?.label ?? h.tipo}
                      {h.descripcion ? ` · ${h.descripcion}` : ''}
                    </p>
                    <p className="text-[12.5px] text-muted">
                      {fmtDate(h.fecha)}
                      {h.valorAnterior || h.valorNuevo ? ` · ${h.valorAnterior ?? '—'} → ${h.valorNuevo ?? '—'}` : ''}
                      {h.origen === 'automatico' && <Badge className="ml-2">automático</Badge>}
                    </p>
                  </div>
                  {h.origen === 'manual' && data.puedeEditar && (
                    <IconButton icon={Trash2} label="Quitar" size="sm" onClick={async () => (await confirm({ title: 'Quitar del historial', danger: true, confirm: 'Quitar' })) && borrarHist.mutate(h.id)} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Dialog open={editar} onOpenChange={setEditar} title="Ficha laboral" size="lg">
        {editar && (
          <ResourceForm
            def={trabajadorResource}
            endpoint="/fic/fichas"
            record={record}
            initial={{ personaId: id }}
            hide={['personaId']}
            onSubmitData={(d) => api.put(url, d)}
            onCancel={() => setEditar(false)}
            onSaved={() => setEditar(false)}
          />
        )}
      </Dialog>
      <Dialog open={proponer} onOpenChange={setProponer} title="Actualizar mis datos" description="RRHH revisará los cambios antes de aplicarlos." size="lg">
        {proponer && (
          <ResourceForm
            def={propuestaDef}
            endpoint={url}
            record={record}
            onSubmitData={(d) => api.post(`${url}/proponer`, d)}
            submitLabel="Enviar a RRHH"
            onCancel={() => setProponer(false)}
            onSaved={() => setProponer(false)}
          />
        )}
      </Dialog>
      <Dialog open={nuevoHist} onOpenChange={setNuevoHist} title="Añadir al historial laboral">
        {nuevoHist && <ResourceForm def={historialResource} endpoint="/fic/historial" initial={{ personaId: id }} hide={['personaId']} onCancel={() => setNuevoHist(false)} onSaved={() => setNuevoHist(false)} />}
      </Dialog>
    </div>
  );
}
