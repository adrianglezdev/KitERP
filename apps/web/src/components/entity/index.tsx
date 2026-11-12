import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Download, FileText, MessageSquare, Paperclip, Plus, Send, Trash2 } from 'lucide-react';
import { fmtDate, type TimelineEntry } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn, fileSize, iconByName, relTime, TONES, type Tone } from '@/lib/utils';
import { Avatar, Badge, Button, EmptyState, FileDrop, IconButton, Input, RefSelect, Spinner, Textarea, useConfirm } from '@/components/ui';

/* ── Adjuntos de cualquier ficha ── */
export function Attachments({ entidad, id, canEdit = true, carpetas }: { entidad: string; id: string; canEdit?: boolean; carpetas?: string[] }) {
  const url = `/adjuntos/${entidad}/${id}`;
  const { data, isLoading } = useApi<any[]>(url);
  const confirm = useConfirm();
  const [carpeta, setCarpeta] = useState('');
  const [caduca, setCaduca] = useState('');
  const add = useMut((archivoIds: string[]) => api.post(url, { archivoIds, carpeta: carpeta || null, caduca: caduca || null }), { ok: 'Archivos añadidos', invalidate: [url] });
  const del = useMut((aid: string) => api.del(`/adjuntos/${aid}`), { ok: 'Archivo quitado', invalidate: [url] });
  if (isLoading) return <Spinner />;
  const groups = new Map<string, any[]>();
  for (const a of data ?? []) groups.set(a.carpeta ?? 'General', [...(groups.get(a.carpeta ?? 'General') ?? []), a]);
  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input list={`carpetas-${entidad}`} placeholder="Carpeta (opcional)" value={carpeta} onChange={(e) => setCarpeta(e.target.value)} />
            <datalist id={`carpetas-${entidad}`}>
              {[...new Set([...(carpetas ?? []), ...groups.keys()])].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Input type="date" value={caduca} onChange={(e) => setCaduca(e.target.value)} aria-label="Fecha de caducidad" title="Caduca el (opcional)" />
          </div>
          <FileDrop compact onUploaded={(fs) => add.mutate(fs.map((f) => f.id))} capture={false} />
        </div>
      )}
      {!data?.length ? (
        <EmptyState icon={Paperclip} title="Sin documentos adjuntos" />
      ) : (
        [...groups.entries()].map(([g, items]) => (
          <div key={g}>
            <p className="mb-1.5 text-[12px] font-bold text-muted">{g}</p>
            <ul className="divide-y divide-line rounded-xl border border-line-strong/70">
              {items.map((a) => {
                const vencido = a.caduca && a.caduca < new Date().toISOString().slice(0, 10);
                return (
                  <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <a href={a.url} target="_blank" rel="noreferrer" className="block truncate text-[13.5px] font-medium hover:text-primary">
                        {a.nombre}
                      </a>
                      <p className="text-[12px] text-muted">
                        {fileSize(a.tamano)} · {relTime(a.creadoEn)}
                        {a.version > 1 && ` · v${a.version}`}
                        {a.caduca && <span className={cn('ml-1', vencido && 'font-medium text-bad')}>· caduca {fmtDate(a.caduca)}</span>}
                      </p>
                    </div>
                    <a href={`${a.url}&descargar=1`} className="rounded-pill p-1.5 text-muted hover:bg-sunken hover:text-fg" aria-label="Descargar">
                      <Download className="h-4 w-4" />
                    </a>
                    {canEdit && (
                      <IconButton icon={Trash2} label="Quitar" size="sm" onClick={async () => (await confirm({ title: 'Quitar archivo', message: `Se quitará ${a.nombre} de esta ficha. Queda guardado en el historial.`, danger: true, confirm: 'Quitar' })) && del.mutate(a.id)} />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

/* ── Comentarios con menciones ── */
export function Comments({ entidad, id }: { entidad: string; id: string }) {
  const url = `/comentarios/${entidad}/${id}`;
  const { session } = useSession();
  const { data, isLoading } = useApi<any[]>(url);
  const [texto, setTexto] = useState('');
  const [menciones, setMenciones] = useState<string[]>([]);
  const [mencionar, setMencionar] = useState(false);
  const send = useMut(() => api.post(url, { texto, menciones }), {
    invalidate: [url],
    onSuccess: () => {
      setTexto('');
      setMenciones([]);
      setMencionar(false);
    },
  });
  const del = useMut((cid: string) => api.del(`/comentarios/${cid}`), { invalidate: [url] });
  return (
    <div className="space-y-4">
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <p className="py-4 text-center text-[13px] text-muted">Aún no hay comentarios. Usa este espacio para coordinaros sin salir de la ficha.</p>
      ) : (
        <ul className="space-y-3">
          {data.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.autor ?? 'Usuario'} size={30} />
              <div className="min-w-0 flex-1 rounded-xl bg-sunken px-3 py-2">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="font-semibold">{c.autor ?? 'Usuario'}</span>
                  <span className="text-muted">{relTime(c.creadoEn)}</span>
                  {c.usuarioId === session?.user.id && (
                    <button type="button" className="ml-auto text-muted hover:text-bad" onClick={() => del.mutate(c.id)} aria-label="Borrar comentario">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px]">{c.texto}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2 rounded-xl border border-line-strong/70 p-3">
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe un comentario…" rows={2} className="border-0 p-0 focus:ring-0" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim()) send.mutate(undefined); }} />
        {mencionar && (
          <div className="space-y-1">
            <RefSelect target="personas" value={null} onChange={(v) => v && !menciones.includes(v) && setMenciones([...menciones, v])} placeholder="Mencionar a…" />
            {menciones.length > 0 && <p className="text-[12px] text-muted">{menciones.length} persona(s) recibirán un aviso</p>}
          </div>
        )}
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setMencionar(!mencionar)} className="text-[12.5px] font-medium text-primary hover:underline">
            @ Mencionar
          </button>
          <Button size="sm" variant="primary" icon={Send} disabled={!texto.trim()} loading={send.isPending} onClick={() => send.mutate(undefined)}>
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Línea de tiempo unificada ── */
export function Timeline({ entidad, id }: { entidad: string; id: string }) {
  const { data, isLoading } = useApi<TimelineEntry[]>(`/timeline/${entidad}/${id}`);
  if (isLoading) return <Spinner />;
  if (!data?.length) return <EmptyState icon={MessageSquare} title="Sin actividad todavía" />;
  return (
    <ol className="relative space-y-4 border-l border-line pl-6">
      {data.map((e) => {
        const Icon = iconByName(e.icono);
        const body = (
          <>
            <p className="text-[13.5px] font-medium">{e.titulo}</p>
            {e.detalle && <p className="text-[12.5px] text-muted">{e.detalle}</p>}
            <p className="mt-0.5 text-[12px] text-muted">
              {relTime(e.fecha)}
              {e.autor && ` · ${e.autor}`}
            </p>
          </>
        );
        return (
          <li key={e.id} className="relative">
            <span className={cn('absolute -left-[35px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-surface', TONES[(e.tone as Tone) ?? 'violet'] ?? TONES.violet)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            {e.enlace ? (
              <Link to={e.enlace} className="block rounded-lg hover:bg-sunken/60">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Tareas ligadas a una ficha ── */
export function EntityTasks({ entidad, id }: { entidad: string; id: string }) {
  const url = `/tareas?ver=entidad&entidad=${entidad}&entidadId=${id}`;
  const { data } = useApi<any[]>(url);
  const [titulo, setTitulo] = useState('');
  const [asignado, setAsignado] = useState<string | null>(null);
  const [vence, setVence] = useState('');
  const add = useMut(() => api.post('/tareas', { titulo, asignadoA: asignado, vence: vence || null, entidad, entidadId: id }), {
    ok: 'Tarea creada',
    invalidate: ['/tareas'],
    onSuccess: () => {
      setTitulo('');
      setVence('');
    },
  });
  const toggle = useMut((t: any) => api.patch(`/tareas/${t.id}`, { estado: t.estado === 'hecha' ? 'pendiente' : 'hecha' }), { invalidate: ['/tareas'] });
  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {data?.map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sunken">
            <button type="button" onClick={() => toggle.mutate(t)} aria-label={t.estado === 'hecha' ? 'Marcar pendiente' : 'Marcar hecha'}>
              {t.estado === 'hecha' ? <CheckCircle2 className="h-5 w-5 text-ok" /> : <Circle className="h-5 w-5 text-muted" />}
            </button>
            <span className={cn('min-w-0 flex-1 truncate text-[13.5px]', t.estado === 'hecha' && 'text-muted line-through')}>{t.titulo}</span>
            {t.asignado && <span className="hidden text-[12px] text-muted sm:inline">{t.asignado}</span>}
            {t.vence && <Badge tone={t.vence < new Date().toISOString().slice(0, 10) && t.estado !== 'hecha' ? 'red' : 'gray'}>{fmtDate(t.vence)}</Badge>}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px_150px_auto]">
        <Input placeholder="Nueva tarea…" value={titulo} onChange={(e) => setTitulo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && titulo.trim() && add.mutate(undefined)} />
        <RefSelect target="personas" value={asignado} onChange={setAsignado} placeholder="Para mí" />
        <Input type="date" value={vence} onChange={(e) => setVence(e.target.value)} aria-label="Vence" />
        <Button icon={Plus} disabled={!titulo.trim()} onClick={() => add.mutate(undefined)} loading={add.isPending}>
          Añadir
        </Button>
      </div>
    </div>
  );
}
