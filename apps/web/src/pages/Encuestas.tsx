import { useState } from 'react';
import { BarChart3, Lock, Plus, Send, Trash2, Vote } from 'lucide-react';
import { fmtDate } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, IconButton, Input, PageHeader, ProgressBar, Select, Spinner, Textarea } from '@/components/ui';

export default function Encuestas() {
  const { can } = useSession();
  const { data, isLoading } = useApi<any[]>('/encuestas');
  const [responder, setResponder] = useState<any | null>(null);
  const [resultados, setResultados] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const cerrar = useMut((id: string) => api.post(`/encuestas/${id}/cerrar`), { ok: 'Encuesta cerrada', invalidate: ['/encuestas'] });
  return (
    <>
      <PageHeader
        title="Encuestas"
        icon={Vote}
        subtitle="Encuestas de clima y consultas internas. Las anónimas no guardan quién respondió qué."
        actions={
          can('msg.encuestas') && (
            <Button variant="primary" icon={Plus} onClick={() => setNueva(true)}>
              Nueva encuesta
            </Button>
          )
        }
      />
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={Vote} title="No hay encuestas abiertas" />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((e) => (
            <Card key={e.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15.5px] font-bold">{e.titulo}</h3>
                <div className="flex shrink-0 gap-1">
                  {e.anonima && (
                    <Badge tone="purple">
                      <Lock className="h-3 w-3" /> Anónima
                    </Badge>
                  )}
                  {!e.abierta && <Badge>Cerrada</Badge>}
                </div>
              </div>
              {e.descripcion && <p className="mt-1 text-[13px] text-muted">{e.descripcion}</p>}
              <p className="mt-2 text-[12.5px] text-muted">
                {e.preguntas.length} preguntas{e.cierre ? ` · hasta el ${fmtDate(e.cierre)}` : ''}
                {e.respuestas !== undefined && can('msg.encuestas') ? ` · ${e.respuestas} respuestas` : ''}
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                {e.abierta && !e.respondida && (
                  <Button size="sm" variant="primary" icon={Send} onClick={() => setResponder(e)}>
                    Responder
                  </Button>
                )}
                {e.respondida && <Badge tone="green">Ya has respondido</Badge>}
                {can('msg.encuestas') && (
                  <>
                    <Button size="sm" icon={BarChart3} onClick={() => setResultados(e.id)}>
                      Resultados
                    </Button>
                    {e.abierta && (
                      <Button size="sm" variant="ghost" onClick={() => cerrar.mutate(e.id)}>
                        Cerrar
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {responder && <Responder e={responder} onClose={() => setResponder(null)} />}
      {resultados && <Resultados id={resultados} onClose={() => setResultados(null)} />}
      {nueva && <NuevaEncuesta onClose={() => setNueva(false)} />}
    </>
  );
}

function Responder({ e, onClose }: { e: any; onClose: () => void }) {
  const [r, setR] = useState<Record<string, string | number>>({});
  const enviar = useMut(() => api.post(`/encuestas/${e.id}/responder`, { respuestas: r }), { ok: 'Gracias por responder', invalidate: ['/encuestas'], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={e.titulo} description={e.anonima ? 'Encuesta anónima: tus respuestas no se asocian a tu nombre.' : undefined} size="lg" footer={<Button variant="primary" loading={enviar.isPending} onClick={() => enviar.mutate(undefined)}>Enviar respuestas</Button>}>
      <div className="space-y-5">
        {e.preguntas.map((p: any, i: number) => (
          <div key={p.id}>
            <p className="mb-2 text-[14px] font-medium">
              {i + 1}. {p.texto}
            </p>
            {p.tipo === 'escala' && (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setR({ ...r, [p.id]: n })} className={cn('h-10 w-10 rounded-lg border text-[14px] font-semibold transition', r[p.id] === n ? 'border-primary bg-primary text-primary-fg' : 'border-line hover:border-primary/50')}>
                    {n}
                  </button>
                ))}
                <span className="ml-2 self-center text-[12px] text-muted">1 = nada · 5 = mucho</span>
              </div>
            )}
            {p.tipo === 'opcion' && <Select value={String(r[p.id] ?? '')} onChange={(ev) => setR({ ...r, [p.id]: ev.target.value })} placeholder="Elige una opción" options={(p.opciones ?? []).map((o: string) => ({ value: o, label: o }))} />}
            {p.tipo === 'texto' && <Textarea value={String(r[p.id] ?? '')} onChange={(ev) => setR({ ...r, [p.id]: ev.target.value })} rows={2} />}
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function Resultados({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useApi<any>(`/encuestas/${id}/resultados`);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={data?.encuesta.titulo ?? 'Resultados'} description={data ? `${data.participantes} respuestas` : undefined} size="lg">
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          {data.resultados.map((p: any, i: number) => (
            <div key={p.id}>
              <p className="text-[14px] font-medium">
                {i + 1}. {p.texto}
              </p>
              {p.tipo === 'escala' && (
                <div className="mt-2">
                  <p className="font-display text-[22px] font-bold">{p.media ?? '—'} / 5</p>
                  <div className="mt-1 space-y-1">
                    {p.distribucion.map((n: number, k: number) => (
                      <div key={k} className="flex items-center gap-2 text-[12px]">
                        <span className="w-3">{k + 1}</span>
                        <ProgressBar value={n} max={Math.max(1, p.total)} />
                        <span className="w-6 text-right text-muted">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {p.tipo === 'opcion' && (
                <ul className="mt-2 space-y-1">
                  {p.conteo.map((c: any) => (
                    <li key={c.opcion} className="flex items-center gap-2 text-[13px]">
                      <span className="w-40 truncate">{c.opcion}</span>
                      <ProgressBar value={c.n} max={Math.max(1, p.total)} />
                      <span className="w-6 text-right text-muted">{c.n}</span>
                    </li>
                  ))}
                </ul>
              )}
              {p.tipo === 'texto' && (
                <ul className="mt-2 space-y-1.5">
                  {p.textos.map((t: string, k: number) => (
                    <li key={k} className="rounded-lg bg-sunken px-3 py-2 text-[13px]">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function NuevaEncuesta({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ titulo: '', descripcion: '', anonima: true, cierre: '' });
  const [preguntas, setPreguntas] = useState<{ texto: string; tipo: 'escala' | 'opcion' | 'texto'; opciones?: string }[]>([{ texto: '¿Cómo valoras el ambiente de trabajo?', tipo: 'escala' }]);
  const crear = useMut(
    () => api.post('/encuestas', { ...f, cierre: f.cierre || null, preguntas: preguntas.filter((p) => p.texto.trim()).map((p) => ({ texto: p.texto, tipo: p.tipo, opciones: p.tipo === 'opcion' ? (p.opciones ?? '').split(',').map((s) => s.trim()).filter(Boolean) : undefined })) }),
    { ok: 'Encuesta publicada', invalidate: ['/encuestas'], onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Nueva encuesta" size="lg" footer={<Button variant="primary" disabled={!f.titulo || !preguntas.some((p) => p.texto)} loading={crear.isPending} onClick={() => crear.mutate(undefined)}>Publicar</Button>}>
      <div className="space-y-3">
        <Field label="Título" required>
          <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        </Field>
        <Field label="Descripción">
          <Textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} rows={2} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cierra el (opcional)">
            <Input type="date" value={f.cierre} onChange={(e) => setF({ ...f, cierre: e.target.value })} />
          </Field>
          <div className="self-end pb-2">
            <Checkbox checked={f.anonima} onChange={(v) => setF({ ...f, anonima: v })} label="Anónima" />
          </div>
        </div>
        <p className="label">Preguntas</p>
        {preguntas.map((p, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-line p-3">
            <div className="flex gap-2">
              <Input value={p.texto} onChange={(e) => setPreguntas(preguntas.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} placeholder="Pregunta" />
              <Select className="w-36" value={p.tipo} onChange={(e) => setPreguntas(preguntas.map((x, j) => (j === i ? { ...x, tipo: e.target.value as 'escala' } : x)))} options={[{ value: 'escala', label: 'Escala 1–5' }, { value: 'opcion', label: 'Opciones' }, { value: 'texto', label: 'Texto libre' }]} />
              <IconButton icon={Trash2} label="Quitar" onClick={() => setPreguntas(preguntas.filter((_, j) => j !== i))} />
            </div>
            {p.tipo === 'opcion' && <Input value={p.opciones ?? ''} onChange={(e) => setPreguntas(preguntas.map((x, j) => (j === i ? { ...x, opciones: e.target.value } : x)))} placeholder="Opciones separadas por comas" />}
          </div>
        ))}
        <Button size="sm" icon={Plus} onClick={() => setPreguntas([...preguntas, { texto: '', tipo: 'escala' }])}>
          Añadir pregunta
        </Button>
      </div>
    </Dialog>
  );
}
