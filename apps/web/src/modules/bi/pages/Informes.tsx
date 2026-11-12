import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileBarChart, Play, Plus, Save, Share2, Trash2 } from 'lucide-react';
import { biShared, fmtDate, fmtMoney, fmtNumber } from '@kite/shared';
import { api, download } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, Checkbox, DataTable, Dialog, EmptyState, Field, IconButton, Input, Menu, PageHeader, Select, Spinner, Switch, useConfirm } from '@/components/ui';
import { TagsInput } from '@/components/form/inputs';

type Def = { dataset: string; filtros: biShared.BiFiltros; columnas: string[]; agruparPor: string | null; orden: string | null };
const vacia = (dataset = ''): Def => ({ dataset, filtros: { periodo: 'anio_actual', campos: {} }, columnas: [], agruparPor: null, orden: null });

/** Informes a medida sobre un catálogo cerrado de datos, con agrupación, exportación y envío programado. */
export default function Informes() {
  const [sp] = useSearchParams();
  const datasets = useApi<biShared.BiDataset[]>('/bi/datasets');
  const guardados = useApi<any[]>('/bi/informes');
  const [actual, setActual] = useState<any | null>(null);
  const [def, setDef] = useState<Def>(vacia());
  const [res, setRes] = useState<any | null>(null);
  const [guardar, setGuardar] = useState(false);
  const confirm = useConfirm();
  const ds = datasets.data?.find((d) => d.key === def.dataset);
  useEffect(() => {
    if (!def.dataset && datasets.data?.length) setDef(vacia(datasets.data[0]!.key));
  }, [datasets.data, def.dataset]);
  useEffect(() => {
    const id = sp.get('id');
    const g = id && guardados.data?.find((x) => x.id === id);
    if (g) abrir(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardados.data]);
  const ejecutar = useMut(() => api.post<any>('/bi/ejecutar', def), { onSuccess: setRes });
  const borrar = useMut((id: string) => api.del(`/bi/informes/${id}`), { ok: 'Informe borrado', invalidate: ['/bi/informes'], onSuccess: () => { setActual(null); setDef(vacia(def.dataset)); } });
  function abrir(g: any) {
    setActual(g);
    setDef({ dataset: g.dataset, filtros: g.filtros, columnas: g.columnas, agruparPor: g.agruparPor, orden: g.orden });
    setRes(null);
  }
  const exportar = (formato: 'xlsx' | 'pdf') => {
    const nombre = actual?.nombre ?? ds?.label ?? 'Informe';
    download(actual ? `/bi/informes/${actual.id}/exportar?formato=${formato}` : `/bi/exportar?formato=${formato}&nombre=${encodeURIComponent(nombre)}&def=${encodeURIComponent(JSON.stringify(def))}`, `${nombre}.${formato}`);
  };
  const cols = ds?.columns ?? [];
  const elegidas = def.columnas.length ? def.columnas : cols.map((c) => c.key);
  const toggleCol = (k: string, on: boolean) => setDef({ ...def, columnas: on ? [...new Set([...elegidas, k])] : elegidas.filter((x) => x !== k) });
  const setCampo = (k: string, v: string) => setDef({ ...def, filtros: { ...def.filtros, campos: { ...(def.filtros.campos ?? {}), [k]: v } } });
  if (datasets.isLoading) return <Spinner />;
  if (!datasets.data?.length)
    return (
      <Card>
        <EmptyState icon={FileBarChart} title="No tienes acceso a ningún conjunto de datos" />
      </Card>
    );
  return (
    <>
      <PageHeader title={actual?.nombre ?? 'Informes'} icon={FileBarChart} subtitle={actual?.descripcion ?? 'Elige los datos, el periodo y las columnas. Solo verás lo que tus permisos permiten.'} />
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <p className="text-[13px] font-semibold">Guardados</p>
              <IconButton icon={Plus} label="Nuevo" size="sm" onClick={() => { setActual(null); setDef(vacia(def.dataset)); setRes(null); }} />
            </div>
            <ul className="divide-y divide-line">
              {(guardados.data ?? []).map((g) => (
                <li key={g.id}>
                  <button type="button" onClick={() => abrir(g)} className={cn('w-full px-4 py-2.5 text-left hover:bg-sunken', actual?.id === g.id && 'bg-primary-soft')}>
                    <span className="block truncate text-[13.5px] font-medium">{g.nombre}</span>
                    <span className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted">
                      {g.datasetLabel}
                      {g.compartido && <Badge tone="blue">Compartido</Badge>}
                      {g.programacion !== 'ninguna' && <Badge tone="violet">Se envía</Badge>}
                    </span>
                  </button>
                </li>
              ))}
              {!guardados.data?.length && <li className="px-4 py-3 text-[12.5px] text-muted">Aún no has guardado informes.</li>}
            </ul>
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Card className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Datos">
                <Select value={def.dataset} onChange={(e) => { setDef(vacia(e.target.value)); setRes(null); }} options={datasets.data.map((d) => ({ value: d.key, label: d.label }))} />
              </Field>
              <Field label="Periodo">
                <Select value={def.filtros.periodo} onChange={(e) => setDef({ ...def, filtros: { ...def.filtros, periodo: e.target.value as biShared.BiFiltros['periodo'] } })} options={biShared.BI_PERIODOS} />
              </Field>
              <Field label="Agrupar por">
                <Select value={def.agruparPor ?? ''} onChange={(e) => setDef({ ...def, agruparPor: e.target.value || null })} options={cols.filter((c) => c.group).map((c) => ({ value: c.key, label: c.label }))} placeholder="Sin agrupar (detalle)" />
              </Field>
            </div>
            {ds && <p className="text-[12.5px] text-muted">{ds.description}</p>}
            {def.filtros.periodo === 'personalizado' && (
              <div className="grid grid-cols-2 gap-3 sm:w-96">
                <Field label="Desde">
                  <Input type="date" value={def.filtros.desde ?? ''} onChange={(e) => setDef({ ...def, filtros: { ...def.filtros, desde: e.target.value } })} />
                </Field>
                <Field label="Hasta">
                  <Input type="date" value={def.filtros.hasta ?? ''} onChange={(e) => setDef({ ...def, filtros: { ...def.filtros, hasta: e.target.value } })} />
                </Field>
              </div>
            )}
            {cols.some((c) => c.filter) && (
              <div className="grid gap-3 sm:grid-cols-3">
                {cols
                  .filter((c) => c.filter)
                  .map((c) => (
                    <Field key={c.key} label={c.label}>
                      {c.options ? (
                        <Select value={def.filtros.campos?.[c.key] ?? ''} onChange={(e) => setCampo(c.key, e.target.value)} options={c.options} placeholder="Todos" />
                      ) : (
                        <Input value={def.filtros.campos?.[c.key] ?? ''} onChange={(e) => setCampo(c.key, e.target.value)} placeholder="Contiene…" />
                      )}
                    </Field>
                  ))}
              </div>
            )}
            <details>
              <summary className="cursor-pointer text-[13px] font-semibold text-primary">Columnas ({elegidas.length} de {cols.length})</summary>
              <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
                {cols.map((c) => (
                  <Checkbox key={c.key} checked={elegidas.includes(c.key)} onChange={(on) => toggleCol(c.key, on)} label={c.label} />
                ))}
              </div>
            </details>
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <Button variant="primary" icon={Play} loading={ejecutar.isPending} onClick={() => ejecutar.mutate(undefined)}>
                Ver resultado
              </Button>
              <Menu
                trigger={<Button icon={Download}>Exportar</Button>}
                items={[
                  { label: 'Excel', onSelect: () => exportar('xlsx') },
                  { label: 'PDF', onSelect: () => exportar('pdf') },
                ]}
              />
              {(!actual || actual.mio) && (
                <Button icon={Save} onClick={() => setGuardar(true)}>
                  {actual ? 'Guardar cambios' : 'Guardar'}
                </Button>
              )}
              {actual?.mio && <IconButton icon={Trash2} label="Borrar" onClick={async () => (await confirm({ title: `Borrar "${actual.nombre}"`, danger: true, confirm: 'Borrar' })) && borrar.mutate(actual.id)} />}
            </div>
          </Card>
          {res && <Resultado r={res} />}
        </div>
      </div>
      {guardar && <GuardarDialog def={def} actual={actual} onClose={() => setGuardar(false)} onGuardado={(g) => { setActual({ ...g, mio: true }); setGuardar(false); }} />}
    </>
  );
}

function Resultado({ r }: { r: any }) {
  const fmt = (c: biShared.BiColumn, v: any) => (v == null ? '' : c.type === 'money' ? fmtMoney(v) : c.type === 'number' ? fmtNumber(v) : c.type === 'date' ? fmtDate(v) : String(v));
  const columnas: biShared.BiColumn[] = r.columnas;
  const rows = useMemo(() => r.filas.map((f: any, i: number) => ({ ...f, id: String(i) })), [r]);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-2 pt-4 text-[13px]">
        <span>
          <b>{r.filas.length}</b> filas · {fmtDate(r.desde)} a {fmtDate(r.hasta)}
        </span>
      </div>
      {r.truncado && <Alert tone="orange" className="m-3">Hay demasiados datos: se muestran los primeros. Acota el periodo o agrupa.</Alert>}
      <DataTable
        dense
        rows={rows}
        empty="Sin datos en el periodo."
        columns={columnas.map((c, i) => ({ key: c.key, header: c.label, align: c.type === 'money' || c.type === 'number' ? ('right' as const) : undefined, cell: (f: any) => fmt(c, f[c.key]), hideBelow: i > 3 ? ('md' as const) : undefined }))}
        mobileTitle={(f: any) => fmt(columnas[0]!, f[columnas[0]!.key])}
        mobileSubtitle={(f: any) => (columnas[1] ? fmt(columnas[1], f[columnas[1].key]) : '')}
        mobileRight={(f: any) => {
          const m = columnas.find((c) => c.type === 'money');
          return m ? <b>{fmt(m, f[m.key])}</b> : null;
        }}
        footer={
          Object.keys(r.totales).length ? (
            <div className="flex flex-wrap justify-end gap-x-6 px-4 py-2 text-[13px] font-semibold">
              {columnas
                .filter((c) => r.totales[c.key] != null)
                .map((c) => (
                  <span key={c.key}>
                    {c.label}: {fmt(c, r.totales[c.key])}
                  </span>
                ))}
            </div>
          ) : null
        }
      />
    </Card>
  );
}

function GuardarDialog({ def, actual, onClose, onGuardado }: { def: Def; actual: any | null; onClose: () => void; onGuardado: (g: any) => void }) {
  const [f, setF] = useState({ nombre: actual?.nombre ?? '', descripcion: actual?.descripcion ?? '', compartido: actual?.compartido ?? false, programacion: actual?.programacion ?? 'ninguna', destinatarios: (actual?.destinatarios ?? []) as string[] });
  const m = useMut(() => (actual ? api.patch(`/bi/informes/${actual.id}`, { ...def, ...f, descripcion: f.descripcion || null }) : api.post('/bi/informes', { ...def, ...f, descripcion: f.descripcion || null })), { ok: 'Informe guardado', invalidate: ['/bi/informes'], onSuccess: onGuardado });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={actual ? 'Guardar cambios' : 'Guardar informe'} footer={<Button variant="primary" disabled={!f.nombre.trim()} loading={m.isPending} onClick={() => m.mutate(undefined)}>Guardar</Button>}>
      <div className="space-y-3">
        <Field label="Nombre" required>
          <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ventas por cliente del trimestre" />
        </Field>
        <Field label="Descripción">
          <Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        </Field>
        <Switch checked={f.compartido} onChange={(v) => setF({ ...f, compartido: v })} label={<span className="inline-flex items-center gap-1.5"><Share2 className="h-4 w-4" /> Compartir con mis compañeros</span>} description="Cada persona lo verá con sus propios permisos." />
        <Field label="Envío automático por email">
          <Select value={f.programacion} onChange={(e) => setF({ ...f, programacion: e.target.value })} options={biShared.BI_PROGRAMACION} />
        </Field>
        {f.programacion !== 'ninguna' && (
          <Field label="Enviar a" help="Se adjunta en Excel con los datos que tú puedes ver.">
            <TagsInput value={f.destinatarios} onChange={(v) => setF({ ...f, destinatarios: v })} placeholder="email@empresa.es y pulsa Intro" />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
