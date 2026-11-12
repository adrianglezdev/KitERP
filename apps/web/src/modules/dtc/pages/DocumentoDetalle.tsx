import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Archive, BookOpenCheck, Building2, CalendarCheck, Check, CheckCheck, Download, Eye, FilePlus2, Link2, MoreHorizontal, Pencil, RotateCcw, Send, Trash2, Users, X } from 'lucide-react';
import { dtcShared, fmtDate, fmtDateTime, optionLabel } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Alert, Badge, Button, Card, CardHeader, Checkbox, Dialog, EnumBadge, Field, IconButton, KeyValue, Menu, PageHeader, Select, Spinner, Textarea, useConfirm } from '@/components/ui';
import { FileDrop, type UploadedFile } from '@/components/form/inputs';
import { RefMultiSelect, RefSelect } from '@/components/form/RefSelect';
import { ResourceFormDialog } from '@/components/resource';

const { DTC_TIPOS, DTC_ESTADOS, DTC_VERSION_ESTADOS, DTC_CONFIDENCIALIDAD, DTC_VINCULOS, DTC_VINCULO_REF, dtcDocumentoResource, siguienteVersion } = dtcShared;

/** Enlace a la ficha de lo que tiene vinculado el documento. */
const RUTA_VINCULO: Record<string, (id: string) => string> = {
  articulo: (id) => `/catalogo/${id}`,
  sat_equipo: (id) => `/sat/equipos/${id}`,
  activo: (id) => `/activos/${id}`,
  proyecto: (id) => `/proyectos/${id}`,
  tercero: (id) => `/terceros/${id}`,
};

export default function DocumentoDetalle() {
  const { id } = useParams();
  const { data: d, isLoading } = useApi<any>(`/dtc/documentos/${id}/ficha`);
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const [nueva, setNueva] = useState(false);
  const [lecturas, setLecturas] = useState(false);
  const inv = ['/dtc'];
  const accion = useMut(({ url, body }: { url: string; body?: unknown }) => api.post(url, body ?? {}), { ok: 'Hecho', invalidate: inv });
  const borrarVersion = useMut((vid: string) => api.del(`/dtc/versiones/${vid}`), { ok: 'Versión borrada', invalidate: inv });
  if (isLoading || !d) return <Spinner />;
  const p = d.permisos;
  const vigente = d.versiones.find((v: any) => v.estado === 'aprobada');
  const enCurso = d.versiones.find((v: any) => ['borrador', 'en_revision'].includes(v.estado));
  const vencida = d.proximaRevision && d.proximaRevision <= new Date().toISOString().slice(0, 10);

  const rechazar = async (vid: string) => {
    const motivo = await confirm({ title: 'Rechazar la versión', message: 'Vuelve al autor para que la corrija.', confirm: 'Rechazar', danger: true, input: { label: 'Motivo', placeholder: 'Qué hay que cambiar' } });
    if (motivo !== false) accion.mutate({ url: `/dtc/versiones/${vid}/rechazar`, body: { motivo: typeof motivo === 'string' ? motivo : null } });
  };
  const obsoleto = async () => {
    const motivo = await confirm({ title: 'Marcar como obsoleto', message: 'Dejará de mostrarse como vigente. El historial se conserva.', confirm: 'Marcar obsoleto', danger: true, input: { label: 'Motivo (opcional)' } });
    if (motivo !== false) accion.mutate({ url: `/dtc/documentos/${d.id}/obsoleto`, body: { motivo: typeof motivo === 'string' && motivo ? motivo : null } });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        back="/dtc/documentos"
        crumbs={[{ label: 'Documentación técnica', to: '/dtc/documentos' }, { label: d.codigo }]}
        title={d.titulo}
        icon={BookOpenCheck}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            {d.codigo} · <EnumBadge options={DTC_TIPOS} value={d.tipo} dot={false} />
            {d.versionVigente && ` · versión vigente ${d.versionVigente}`}
          </span>
        }
        badges={
          <>
            <EnumBadge options={DTC_ESTADOS} value={d.estado} />
            <EnumBadge options={DTC_CONFIDENCIALIDAD} value={d.confidencialidad} dot={false} />
          </>
        }
        actions={
          <>
            {vigente && (
              <a href={vigente.url} target="_blank" rel="noreferrer">
                <Button variant="primary" icon={Eye}>
                  Abrir v{vigente.numero}
                </Button>
              </a>
            )}
            {p.editar && !enCurso && d.estado !== 'obsoleto' && (
              <Button icon={FilePlus2} onClick={() => setNueva(true)}>
                Nueva versión
              </Button>
            )}
            {p.editar && (
              <Menu
                trigger={<IconButton icon={MoreHorizontal} label="Más acciones" />}
                items={[
                  { label: 'Editar datos', icon: Pencil, onSelect: () => setEdit(true) },
                  { label: 'Sigue vigente (revisado sin cambios)', icon: CalendarCheck, hidden: !vigente || d.estado === 'obsoleto', onSelect: () => accion.mutate({ url: `/dtc/documentos/${d.id}/confirmar-vigencia` }) },
                  { label: 'Informe de lecturas', icon: Users, hidden: !vigente, onSelect: () => setLecturas(true) },
                  { label: '', separator: true },
                  d.estado === 'obsoleto'
                    ? { label: 'Reactivar', icon: RotateCcw, onSelect: () => accion.mutate({ url: `/dtc/documentos/${d.id}/reactivar` }) }
                    : { label: 'Marcar obsoleto', icon: Archive, danger: true, onSelect: obsoleto },
                ]}
              />
            )}
          </>
        }
      />

      {d.lectura.debeLeer && vigente && !d.lectura.leidoEn && (
        <Alert tone="violet" icon={Eye} title={`Debes leer la versión ${vigente.numero}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span>{vigente.resumenCambios ? `Cambios: ${vigente.resumenCambios}` : 'Ábrela y confirma que la has leído.'}</span>
            <Button size="sm" variant="primary" icon={CheckCheck} loading={accion.isPending} onClick={() => accion.mutate({ url: `/dtc/documentos/${d.id}/leido` })}>
              La he leído
            </Button>
          </div>
        </Alert>
      )}
      {d.lectura.leidoEn && <p className="text-[12.5px] text-muted">Leíste la versión vigente el {fmtDateTime(d.lectura.leidoEn)}.</p>}
      {vencida && d.estado !== 'obsoleto' && (
        <Alert tone="orange" icon={CalendarCheck} title="Revisión periódica vencida">
          Tocaba revisar este documento el {fmtDate(d.proximaRevision)}. Sube una nueva versión o confirma que sigue vigente.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <CardHeader title="Versiones" />
            {!d.versiones.length ? (
              <p className="px-4 py-5 text-center text-[13px] text-muted">{p.editar ? 'Sube la primera versión del documento.' : 'Aún no hay ninguna versión publicada.'}</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.versiones.map((v: any) => (
                  <li key={v.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 w-12 shrink-0 font-display text-[16px] font-bold">{v.numero}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <EnumBadge options={DTC_VERSION_ESTADOS} value={v.estado} />
                        <span className="truncate text-[12.5px] text-muted">{v.nombreArchivo}</span>
                      </div>
                      {v.resumenCambios && <p className="mt-1 text-[13px]">{v.resumenCambios}</p>}
                      <p className="mt-0.5 text-[12px] text-muted">
                        {v.autor ? `${v.autor} · ` : ''}
                        {fmtDateTime(v.creadoEn)}
                        {v.aprobador && ` · aprobada por ${v.aprobador} el ${fmtDate(v.aprobadoEn)}`}
                      </p>
                      {v.estado === 'rechazada' && v.rechazoMotivo && <p className="mt-1 text-[12.5px] text-bad">Motivo: {v.rechazoMotivo}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      {p.editar && v.estado === 'borrador' && (
                        <Button size="sm" icon={Send} onClick={() => accion.mutate({ url: `/dtc/versiones/${v.id}/enviar` })}>
                          Enviar a revisión
                        </Button>
                      )}
                      {p.aprobar && v.estado === 'en_revision' && !v.esMia && (
                        <>
                          <Button size="sm" variant="primary" icon={Check} onClick={() => accion.mutate({ url: `/dtc/versiones/${v.id}/aprobar` })}>
                            Aprobar
                          </Button>
                          <Button size="sm" icon={X} onClick={() => rechazar(v.id)}>
                            Rechazar
                          </Button>
                        </>
                      )}
                      {p.aprobar && v.estado === 'en_revision' && v.esMia && <Badge tone="gray">La debe aprobar otra persona</Badge>}
                      <a href={v.descarga} target="_blank" rel="noreferrer">
                        <IconButton icon={Download} label="Descargar" size="sm" />
                      </a>
                      {p.editar && ['borrador', 'rechazada'].includes(v.estado) && (
                        <IconButton
                          icon={Trash2}
                          label="Borrar versión"
                          size="sm"
                          onClick={async () => (await confirm({ title: `Borrar la versión ${v.numero}`, confirm: 'Borrar', danger: true })) && borrarVersion.mutate(v.id)}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Vinculos doc={d} />
        </div>
        <div className="space-y-5">
          <Card className="p-4">
            {d.descripcion && <p className="mb-3 whitespace-pre-line text-[13.5px]">{d.descripcion}</p>}
            <KeyValue
              cols={1}
              items={[
                { label: 'Responsable', value: d.responsable },
                { label: 'Revisor', value: d.revisor },
                { label: 'Revisión', value: `Cada ${d.revisionMeses} meses${d.proximaRevision ? ` · próxima ${fmtDate(d.proximaRevision)}` : ''}` },
                { label: 'Etiquetas', value: d.etiquetas?.length ? <span className="flex flex-wrap gap-1">{d.etiquetas.map((t: string) => <Badge key={t}>{t}</Badge>)}</span> : null },
              ]}
            />
          </Card>
          <Distribucion doc={d} />
        </div>
      </div>
      <ResourceFormDialog open={edit} onOpenChange={setEdit} def={dtcDocumentoResource} endpoint="/dtc/documentos" record={d} />
      {nueva && <NuevaVersion doc={d} onClose={() => setNueva(false)} />}
      {lecturas && <Lecturas id={d.id} onClose={() => setLecturas(false)} />}
    </div>
  );
}

function NuevaVersion({ doc, onClose }: { doc: any; onClose: () => void }) {
  const ultima = doc.versiones[0]?.numero ?? null;
  const [archivo, setArchivo] = useState<UploadedFile | null>(null);
  const [mayor, setMayor] = useState(false);
  const [resumen, setResumen] = useState('');
  const crear = useMut((enviar: boolean) => api.post(`/dtc/documentos/${doc.id}/versiones`, { archivoId: archivo?.id, mayor, resumenCambios: resumen || null, enviar }), {
    ok: (r: any) => `Versión ${r.numero} creada`,
    invalidate: ['/dtc'],
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Nueva versión ${siguienteVersion(ultima, mayor)}`}
      footer={
        <>
          <Button disabled={!archivo} loading={crear.isPending && crear.variables === false} onClick={() => crear.mutate(false)}>
            Guardar borrador
          </Button>
          <Button variant="primary" icon={Send} disabled={!archivo} loading={crear.isPending && crear.variables === true} onClick={() => crear.mutate(true)}>
            Enviar a revisión
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {archivo ? (
          <div className="flex items-center justify-between rounded-xl bg-sunken px-3 py-2 text-[13.5px]">
            <span className="truncate">{archivo.nombre}</span>
            <IconButton icon={X} label="Quitar" size="sm" onClick={() => setArchivo(null)} />
          </div>
        ) : (
          <FileDrop multiple={false} onUploaded={(f) => setArchivo(f[0] ?? null)} label="Arrastra el archivo (PDF, plano, hoja…) o pulsa para elegir" />
        )}
        {ultima && <Checkbox checked={mayor} onChange={setMayor} label="Cambio importante" description={`Pasa de la ${ultima} a la ${siguienteVersion(ultima, true)} en lugar de la ${siguienteVersion(ultima, false)}.`} />}
        <Field label="Qué cambia">
          <Textarea rows={3} value={resumen} onChange={(e) => setResumen(e.target.value)} placeholder="Se lo verán quienes deben leerlo" />
        </Field>
        <p className="text-[12.5px] text-muted">La versión no será la vigente hasta que la apruebe {doc.revisor ?? 'un revisor'} (nunca quien la redacta).</p>
      </div>
    </Dialog>
  );
}

function Vinculos({ doc }: { doc: any }) {
  const [entidad, setEntidad] = useState<string>('articulo');
  const add = useMut((entidadId: string) => api.post(`/dtc/documentos/${doc.id}/vinculos`, { entidad, entidadId }), { ok: 'Vinculado', invalidate: ['/dtc'] });
  const del = useMut((vid: string) => api.del(`/dtc/vinculos/${vid}`), { invalidate: ['/dtc'] });
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Vinculado a" icon={Link2} />
      <ul className="divide-y divide-line">
        {doc.vinculos.map((v: any) => (
          <li key={v.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-32 shrink-0 text-[12px] text-muted">{optionLabel(DTC_VINCULOS, v.entidad)?.label}</span>
            <Link to={RUTA_VINCULO[v.entidad]?.(v.entidadId) ?? '#'} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:text-primary">
              {v.label ?? '(no disponible)'}
            </Link>
            {doc.permisos.editar && <IconButton icon={X} label="Quitar vínculo" size="sm" onClick={() => del.mutate(v.id)} />}
          </li>
        ))}
        {!doc.vinculos.length && <li className="px-4 py-4 text-center text-[13px] text-muted">Vincúlalo a artículos o equipos para que aparezca en sus fichas y en el parte del técnico.</li>}
      </ul>
      {doc.permisos.editar && (
        <div className="flex flex-col gap-2 border-t border-line p-3 sm:flex-row">
          <Select className="sm:w-48" value={entidad} onChange={(e) => setEntidad(e.target.value)} options={DTC_VINCULOS} />
          <RefSelect key={entidad} className="flex-1" target={DTC_VINCULO_REF[entidad as dtcShared.DtcVinculo]} value={null} onChange={(rid) => rid && add.mutate(rid)} placeholder="Buscar para vincular…" />
        </div>
      )}
    </Card>
  );
}

function Distribucion({ doc }: { doc: any }) {
  const [ids, setIds] = useState<string[]>(doc.distribucion.map((x: any) => x.id));
  const [editando, setEditando] = useState(false);
  const guardar = useMut(() => api.put(`/dtc/documentos/${doc.id}/distribucion`, { departamentoIds: ids }), { ok: 'Distribución guardada', invalidate: ['/dtc'], onSuccess: () => setEditando(false) });
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Building2 className="h-4 w-4 text-primary" /> Deben leerlo
        </p>
        {doc.permisos.editar && !editando && (
          <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>
            Cambiar
          </Button>
        )}
      </div>
      {editando ? (
        <div className="space-y-2">
          <RefMultiSelect target="departamentos" value={ids} onChange={setIds} placeholder="Departamentos" />
          <Button size="sm" variant="primary" loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>
            Guardar
          </Button>
        </div>
      ) : doc.distribucion.length ? (
        <div className="flex flex-wrap gap-1.5">
          {doc.distribucion.map((x: any) => (
            <Badge key={x.id} tone="violet">
              {x.nombre}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-muted">Nadie en concreto. Al publicar una versión se avisa a los departamentos indicados.</p>
      )}
    </Card>
  );
}

function Lecturas({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, error } = useApi<any>(`/dtc/documentos/${id}/lecturas`, { retry: false });
  const [solo, setSolo] = useState(true);
  const filas = (data?.personas ?? []).filter((p: any) => !solo || p.debeLeer);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={data?.version ? `Lecturas de la versión ${data.version}` : 'Lecturas'} size="lg">
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <Alert tone="red">No tienes acceso a este informe.</Alert>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px]">
              <b>{data.leidas}</b> de <b>{data.total}</b> personas obligadas lo han leído
            </p>
            <Checkbox checked={solo} onChange={setSolo} label="Solo quienes deben leerlo" />
          </div>
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-xl ring-1 ring-line-strong/70">
            {filas.map((p: any) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                <span className="hidden text-[12px] text-muted sm:inline">{p.departamento}</span>
                {p.leidoEn ? <Badge tone="green">{fmtDate(p.leidoEn)}</Badge> : <Badge tone={p.debeLeer ? 'orange' : 'gray'}>Sin leer</Badge>}
              </li>
            ))}
            {!filas.length && <li className="px-3 py-4 text-center text-[13px] text-muted">Nadie.</li>}
          </ul>
        </div>
      )}
    </Dialog>
  );
}

