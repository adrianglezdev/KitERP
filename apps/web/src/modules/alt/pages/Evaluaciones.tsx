import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PenLine, Plus, Save, Send, Star, Trash2 } from 'lucide-react';
import { altShared, fmtDate } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Alert, Button, Card, DataTable, Dialog, EnumBadge, Field, IconButton, Input, PageHeader, Segmented, Spinner, Textarea } from '@/components/ui';
import { NumberInput, SignaturePad } from '@/components/form/inputs';
import { RefSelect } from '@/components/form/RefSelect';

const { EVALUACION_ESTADOS, PUNTUACION_MAX, puntuacionGlobal } = altShared;

/** Evaluaciones del desempeño: el responsable las prepara, las comparte y la persona las firma. */
export default function Evaluaciones() {
  const { can } = useSession();
  const nav = useNavigate();
  const evalua = can('alt.evaluar');
  const [vista, setVista] = useState<'equipo' | 'mias'>(evalua ? 'equipo' : 'mias');
  const { data, isLoading } = useApi<any[]>(`/alt/evaluaciones${vista === 'mias' ? '?mias=1' : ''}`);
  const [nueva, setNueva] = useState(false);
  return (
    <>
      <PageHeader title="Evaluaciones" icon={Star} actions={evalua && <Button variant="primary" icon={Plus} onClick={() => setNueva(true)}>Nueva evaluación</Button>} />
      {evalua && <Segmented className="mb-3" value={vista} onChange={setVista} options={[{ value: 'equipo', label: 'De mi equipo' }, { value: 'mias', label: 'Las mías' }]} />}
      <Card className="overflow-hidden">
        <DataTable
          rows={data ?? []}
          loading={isLoading}
          onRowClick={(e: any) => nav(`/rrhh/evaluaciones/${e.id}`)}
          empty="No hay evaluaciones."
          columns={[
            { key: 'persona', header: 'Persona', cell: (e: any) => <span className="font-medium">{e.persona}</span> },
            { key: 'periodo', header: 'Periodo', cell: (e: any) => e.periodo },
            { key: 'evaluador', header: 'Evalúa', cell: (e: any) => e.evaluador, hideBelow: 'md' },
            { key: 'fecha', header: 'Fecha', cell: (e: any) => fmtDate(e.fecha), hideBelow: 'md' },
            { key: 'nota', header: 'Global', align: 'right', cell: (e: any) => (e.puntuacion ?? puntuacionGlobal(e.objetivos ?? [])) ?? '—' },
            { key: 'estado', header: 'Estado', cell: (e: any) => <EnumBadge options={EVALUACION_ESTADOS} value={e.estado} /> },
          ]}
          mobileTitle={(e: any) => `${e.persona} · ${e.periodo}`}
          mobileRight={(e: any) => <EnumBadge options={EVALUACION_ESTADOS} value={e.estado} />}
        />
      </Card>
      {nueva && <NuevaDialog onClose={() => setNueva(false)} />}
    </>
  );
}

function NuevaDialog({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [f, setF] = useState({ personaId: null as string | null, periodo: String(new Date().getFullYear()), fecha: new Date().toLocaleDateString('sv-SE') });
  const m = useMut(() => api.post<any>('/alt/evaluaciones', { ...f, objetivos: [] }), { ok: 'Evaluación creada', invalidate: ['/alt/evaluaciones'], onSuccess: (r) => nav(`/rrhh/evaluaciones/${r.id}`) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Nueva evaluación" footer={<Button variant="primary" disabled={!f.personaId} loading={m.isPending} onClick={() => m.mutate(undefined)}>Crear</Button>}>
      <div className="space-y-3">
        <Field label="Persona" required>
          <RefSelect target="personas" value={f.personaId} onChange={(v) => setF({ ...f, personaId: v })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Periodo">
            <Input value={f.periodo} onChange={(e) => setF({ ...f, periodo: e.target.value })} placeholder="2026, 1.er semestre…" />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

export function EvaluacionDetalle() {
  const { id } = useParams();
  const { data: e, isLoading } = useApi<any>(`/alt/evaluaciones/${id}`);
  if (isLoading || !e) return <Spinner />;
  return <Editor key={e.id + e.estado} e={e} />;
}

function Editor({ e }: { e: any }) {
  const [objs, setObjs] = useState<altShared.ObjetivoEvaluacion[]>(e.objetivos ?? []);
  const [txt, setTxt] = useState({ fortalezas: e.fortalezas ?? '', mejoras: e.mejoras ?? '', comentarios: e.comentarios ?? '' });
  const [firmar, setFirmar] = useState(false);
  const ed = e.puedeEditar;
  const inv = ['/alt/evaluaciones'];
  const guardar = useMut(() => api.patch(`/alt/evaluaciones/${e.id}`, { objetivos: objs, ...txt }), { ok: 'Guardado', invalidate: inv });
  const compartir = useMut(async () => {
    await api.patch(`/alt/evaluaciones/${e.id}`, { objetivos: objs, ...txt });
    return api.post(`/alt/evaluaciones/${e.id}/compartir`, {});
  }, { ok: 'Compartida: le llega para que la lea y firme', invalidate: inv });
  const upd = (i: number, p: Partial<altShared.ObjetivoEvaluacion>) => setObjs((o) => o.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const global = puntuacionGlobal(objs);
  const pesoTotal = objs.reduce((s, o) => s + (o.peso || 0), 0);
  return (
    <div className="space-y-5">
      <PageHeader
        back="/rrhh/evaluaciones"
        title={`${e.persona} · ${e.periodo}`}
        icon={Star}
        subtitle={`Evalúa ${e.evaluador} · ${fmtDate(e.fecha)}`}
        badges={<EnumBadge options={EVALUACION_ESTADOS} value={e.estado} />}
        actions={
          <>
            {ed && (
              <Button icon={Save} loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>
                Guardar
              </Button>
            )}
            {ed && e.estado === 'borrador' && (
              <Button variant="primary" icon={Send} loading={compartir.isPending} onClick={() => compartir.mutate(undefined)}>
                Compartir
              </Button>
            )}
            {e.puedeFirmar && (
              <Button variant="primary" icon={PenLine} onClick={() => setFirmar(true)}>
                Leer y firmar
              </Button>
            )}
          </>
        }
      />
      {e.estado === 'firmada' && <Alert tone="green">Firmada el {fmtDate(e.firmadaEn)}. Ya no se puede modificar.</Alert>}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="font-semibold">Objetivos y competencias</p>
          <p className="text-[13px]">
            Global <b className="font-display text-[18px]">{global ?? '—'}</b> / {PUNTUACION_MAX}
          </p>
        </div>
        <ul className="divide-y divide-line">
          {objs.map((o, i) => (
            <li key={i} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input className="min-w-0 flex-1" value={o.titulo} disabled={!ed} onChange={(ev) => upd(i, { titulo: ev.target.value })} placeholder="Objetivo o competencia" />
                <div className="w-28">
                  <NumberInput value={o.peso} disabled={!ed} onChange={(n) => upd(i, { peso: n ?? 0 })} decimals={0} suffix="% peso" />
                </div>
                {ed && <IconButton icon={Trash2} label="Quitar" size="sm" onClick={() => setObjs(objs.filter((_, j) => j !== i))} />}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {Array.from({ length: PUNTUACION_MAX + 1 }, (_, n) => (
                  <button key={n} type="button" disabled={!ed} onClick={() => upd(i, { puntuacion: n })} className={cn('h-8 w-8 rounded-lg text-[13px] font-semibold ring-1 ring-line', o.puntuacion === n ? 'bg-primary text-white ring-primary' : 'hover:bg-sunken')}>
                    {n}
                  </button>
                ))}
              </div>
              <Textarea rows={2} value={o.comentario ?? ''} disabled={!ed} onChange={(ev) => upd(i, { comentario: ev.target.value })} placeholder="Comentario" />
            </li>
          ))}
        </ul>
        {ed && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
            <Button size="sm" icon={Plus} onClick={() => setObjs([...objs, { titulo: '', peso: objs.length ? 0 : 100, puntuacion: null }])}>
              Objetivo
            </Button>
            <span className={cn('text-[12.5px]', pesoTotal !== 100 ? 'text-warn' : 'text-muted')}>Pesos: {pesoTotal} %</span>
          </div>
        )}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Puntos fuertes">
          <Textarea rows={4} value={txt.fortalezas} disabled={!ed} onChange={(ev) => setTxt({ ...txt, fortalezas: ev.target.value })} />
        </Field>
        <Field label="A mejorar">
          <Textarea rows={4} value={txt.mejoras} disabled={!ed} onChange={(ev) => setTxt({ ...txt, mejoras: ev.target.value })} />
        </Field>
      </div>
      {(e.comentariosEvaluado || e.estado === 'firmada') && (
        <Card className="p-4">
          <p className="label mb-1">Comentarios de la persona evaluada</p>
          <p className="whitespace-pre-line text-[13.5px]">{e.comentariosEvaluado || 'Sin comentarios.'}</p>
        </Card>
      )}
      {firmar && <FirmarDialog id={e.id} onClose={() => setFirmar(false)} />}
    </div>
  );
}

function FirmarDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [firma, setFirma] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState('');
  const m = useMut(() => api.post(`/alt/evaluaciones/${id}/firmar`, { firma, comentarios: comentarios || null }), { ok: 'Evaluación firmada', invalidate: ['/alt/evaluaciones'], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Firmar la evaluación" footer={<Button variant="primary" disabled={!firma} loading={m.isPending} onClick={() => m.mutate(undefined)}>Firmar</Button>}>
      <div className="space-y-3">
        <p className="text-[13px] text-muted">Firmar indica que la has leído, no necesariamente que estés de acuerdo. Puedes dejar tus comentarios.</p>
        <Field label="Mis comentarios">
          <Textarea rows={3} value={comentarios} onChange={(e) => setComentarios(e.target.value)} />
        </Field>
        <SignaturePad onChange={setFirma} />
      </div>
    </Dialog>
  );
}
