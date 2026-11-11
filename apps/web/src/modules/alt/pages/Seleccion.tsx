import { useState } from 'react';
import { Briefcase, FileUp, Pencil, Plus, UserCheck, UserSearch } from 'lucide-react';
import { altShared, fmtDate, fmtMoney } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, Dialog, EmptyState, EnumBadge, Field, Input, KeyValue, PageHeader, Select, Sheet, Spinner } from '@/components/ui';
import { FileDrop } from '@/components/form/inputs';
import { RefSelect } from '@/components/form/RefSelect';
import { ResourceFormDialog } from '@/components/resource';

const { OFERTA_ESTADOS, CANDIDATO_ESTADOS, CANDIDATO_FUENTES, ofertaResource, candidatoResource } = altShared;
const FASES = CANDIDATO_ESTADOS.filter((e) => e.value !== 'contratado');

/** Selección de personal: ofertas abiertas y sus candidatos por fases. Al contratar se crea la persona y su incorporación. */
export default function Seleccion() {
  const { can } = useSession();
  const gestiona = can('alt.gestionar');
  const ofertas = useApi<any[]>('/alt/ofertas-resumen');
  const [sel, setSel] = useState<string | null>(null);
  const [oferta, setOferta] = useState<any | null | undefined>(undefined);
  const actual = (ofertas.data ?? []).find((o) => o.id === sel) ?? ofertas.data?.[0];
  return (
    <>
      <PageHeader
        title="Selección"
        icon={UserSearch}
        subtitle="Ofertas de empleo y candidatos. Al contratar se crea la ficha y arranca la incorporación."
        actions={
          gestiona && (
            <Button variant="primary" icon={Plus} onClick={() => setOferta(null)}>
              Nueva oferta
            </Button>
          )
        }
      />
      {ofertas.isLoading ? (
        <Spinner />
      ) : !ofertas.data?.length ? (
        <Card>
          <EmptyState icon={Briefcase} title="No hay ofertas de empleo" />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <Card className="h-fit overflow-hidden">
            <ul className="divide-y divide-line">
              {ofertas.data.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setSel(o.id)} className={cn('w-full px-4 py-3 text-left hover:bg-sunken', actual?.id === o.id && 'bg-primary-soft')}>
                    <span className="block truncate text-[13.5px] font-semibold">{o.titulo}</span>
                    <span className="flex items-center gap-1.5 text-[12px] text-muted">
                      <EnumBadge options={OFERTA_ESTADOS} value={o.estado} /> {o.activos} en proceso · {o.candidatos} total
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {actual && <Tablero oferta={actual} gestiona={gestiona} onEditar={() => setOferta(actual)} />}
        </div>
      )}
      <ResourceFormDialog open={oferta !== undefined} onOpenChange={(o) => !o && setOferta(undefined)} def={ofertaResource} endpoint="/alt/ofertas" record={oferta ?? undefined} onSaved={(r: any) => setSel(r.id)} />
    </>
  );
}

function Tablero({ oferta, gestiona, onEditar }: { oferta: any; gestiona: boolean; onEditar: () => void }) {
  const url = `/alt/candidatos?f.ofertaId=${oferta.id}&pageSize=200`;
  const { data } = useApi<{ items: any[] }>(url);
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<any | null>(null);
  const mover = useMut(({ id, estado }: { id: string; estado: string }) => api.post(`/alt/candidatos/${id}/mover`, { estado }), { invalidate: ['/alt'] });
  const items = data?.items ?? [];
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-display text-[18px] font-bold">{oferta.titulo}</h2>
        {gestiona && (
          <>
            <Button size="sm" icon={Pencil} onClick={onEditar}>
              Oferta
            </Button>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setNuevo(true)}>
              Candidato
            </Button>
          </>
        )}
      </div>
      <div className="scroll-thin -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
        {FASES.map((f) => {
          const cs = items.filter((c) => c.estado === f.value);
          return (
            <div key={f.value} className="w-64 shrink-0 snap-start rounded-2xl bg-sunken/60 p-2">
              <p className="mb-2 flex items-center justify-between px-1 text-[13px]">
                <EnumBadge options={CANDIDATO_ESTADOS} value={f.value} />
                <span className="text-muted">{cs.length}</span>
              </p>
              <div className="space-y-2">
                {cs.map((c) => (
                  <Card key={c.id} className="cursor-pointer p-3 hover:shadow-pop" onClick={() => setAbierto(c)}>
                    <p className="truncate text-[13.5px] font-medium">
                      {c.nombre} {c.apellidos}
                    </p>
                    <p className="text-[12px] text-muted">
                      {c.valoracion ? '★'.repeat(c.valoracion) : ''} {c.localidad}
                    </p>
                    {gestiona && (
                      <Select className="mt-2 h-8 text-[12.5px]" value={c.estado} onClick={(e) => e.stopPropagation()} onChange={(e) => mover.mutate({ id: c.id, estado: e.target.value })} options={FASES} />
                    )}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {items.some((c) => c.estado === 'contratado') && (
        <p className="text-[13px] text-muted">
          Contratados:{' '}
          {items
            .filter((c) => c.estado === 'contratado')
            .map((c) => `${c.nombre} ${c.apellidos ?? ''}`)
            .join(', ')}
        </p>
      )}
      <ResourceFormDialog open={nuevo} onOpenChange={setNuevo} def={candidatoResource} endpoint="/alt/candidatos" initial={{ ofertaId: oferta.id }} hide={['ofertaId']} />
      {abierto && <CandidatoSheet c={abierto} oferta={oferta} gestiona={gestiona} onClose={() => setAbierto(null)} />}
    </div>
  );
}

function CandidatoSheet({ c, oferta, gestiona, onClose }: { c: any; oferta: any; gestiona: boolean; onClose: () => void }) {
  const [edit, setEdit] = useState(false);
  const [contratar, setContratar] = useState(false);
  const cv = useMut((archivoId: string) => api.patch(`/alt/candidatos/${c.id}`, { cvArchivoId: archivoId }), { ok: 'Currículum guardado', invalidate: ['/alt'], onSuccess: onClose });
  return (
    <>
      <Sheet
        open={!edit && !contratar}
        onOpenChange={(o) => !o && onClose()}
        title={`${c.nombre} ${c.apellidos ?? ''}`}
        footer={
          gestiona &&
          c.estado !== 'contratado' && (
            <div className="flex w-full justify-end gap-2">
              <Button icon={Pencil} onClick={() => setEdit(true)}>
                Editar
              </Button>
              <Button variant="primary" icon={UserCheck} onClick={() => setContratar(true)}>
                Contratar
              </Button>
            </div>
          )
        }
      >
        <div className="space-y-4">
          <EnumBadge options={CANDIDATO_ESTADOS} value={c.estado} />
          <KeyValue
            items={[
              { label: 'Email', value: c.email && <a href={`mailto:${c.email}`} className="text-primary">{c.email}</a> },
              { label: 'Teléfono', value: c.telefono && <a href={`tel:${c.telefono}`} className="text-primary">{c.telefono}</a> },
              { label: 'Localidad', value: c.localidad },
              { label: 'Fuente', value: CANDIDATO_FUENTES.find((f) => f.value === c.fuente)?.label },
              { label: 'Pretensión', value: c.pretension ? fmtMoney(c.pretension) : null },
              { label: 'Disponibilidad', value: c.disponibilidad },
              { label: 'Valoración', value: c.valoracion ? '★'.repeat(c.valoracion) : null },
              { label: 'Alta', value: fmtDate(c.creadoEn) },
              { label: 'Notas', value: c.notas, span: 2 },
            ]}
          />
          {c.cvUrl ? (
            <a href={c.cvUrl} target="_blank" rel="noreferrer">
              <Badge tone="violet">
                <FileUp className="mr-1 inline h-3 w-3" /> Ver currículum
              </Badge>
            </a>
          ) : (
            gestiona && <FileDrop multiple={false} compact accept="application/pdf,.doc,.docx" label="Subir currículum" onUploaded={(f) => f[0] && cv.mutate(f[0].id)} />
          )}
          <p className="text-[12px] text-muted">Los datos de candidatos se borran solos pasado el plazo de conservación configurado (RGPD).</p>
        </div>
      </Sheet>
      <ResourceFormDialog open={edit} onOpenChange={(o) => { setEdit(o); if (!o) onClose(); }} def={candidatoResource} endpoint="/alt/candidatos" record={c} hide={['ofertaId']} />
      {contratar && <ContratarDialog c={c} oferta={oferta} onClose={() => { setContratar(false); onClose(); }} />}
    </>
  );
}

function ContratarDialog({ c, oferta, onClose }: { c: any; oferta: any; onClose: () => void }) {
  const plantillas = useApi<any[]>('/alt/plantillas?tipo=alta');
  const [f, setF] = useState({ nombre: c.nombre, apellidos: c.apellidos ?? '', email: c.email ?? '', telefono: c.telefono ?? '', puesto: oferta.titulo, departamentoId: oferta.departamentoId, centroId: oferta.centroId, responsableId: oferta.responsableId, fechaAlta: new Date().toLocaleDateString('sv-SE'), plantillaId: '' });
  const m = useMut(() => api.post<any>(`/alt/candidatos/${c.id}/contratar`, { ...f, plantillaId: f.plantillaId || null }), { ok: 'Contratado: ficha creada e incorporación en marcha', invalidate: ['/alt', '/personas'], onSuccess: onClose });
  return (
    <Dialog open size="lg" onOpenChange={(o) => !o && onClose()} title={`Contratar a ${c.nombre}`} footer={<Button variant="primary" icon={UserCheck} loading={m.isPending} onClick={() => m.mutate(undefined)}>Crear ficha y empezar incorporación</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </Field>
        <Field label="Apellidos">
          <Input value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <Input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        </Field>
        <Field label="Puesto">
          <Input value={f.puesto} onChange={(e) => setF({ ...f, puesto: e.target.value })} />
        </Field>
        <Field label="Fecha de alta">
          <Input type="date" value={f.fechaAlta} onChange={(e) => setF({ ...f, fechaAlta: e.target.value })} />
        </Field>
        <Field label="Departamento">
          <RefSelect target="departamentos" value={f.departamentoId} onChange={(v) => setF({ ...f, departamentoId: v })} />
        </Field>
        <Field label="Responsable">
          <RefSelect target="personas" value={f.responsableId} onChange={(v) => setF({ ...f, responsableId: v })} />
        </Field>
        <Field label="Plan de incorporación" className="sm:col-span-2">
          <Select value={f.plantillaId} onChange={(e) => setF({ ...f, plantillaId: e.target.value })} options={(plantillas.data ?? []).map((p) => ({ value: p.id, label: p.nombre }))} placeholder="Sin plantilla" />
        </Field>
      </div>
    </Dialog>
  );
}
