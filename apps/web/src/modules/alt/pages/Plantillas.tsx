import { useEffect, useState } from 'react';
import { ListChecks, Plus, Save, Trash2 } from 'lucide-react';
import { altShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Card, EmptyState, Field, IconButton, Input, PageHeader, Segmented, Select } from '@/components/ui';
import { NumberInput } from '@/components/form/inputs';
import { RefSelect } from '@/components/form/RefSelect';

type Tarea = altShared.PlantillaTarea;
interface Plantilla {
  id?: string;
  nombre: string;
  tipo: 'alta' | 'baja';
  tareas: Tarea[];
}

/** Plantillas de tareas para incorporaciones y salidas: quién hace qué y cuántos días antes o después. */
export default function Plantillas() {
  const { data } = useApi<any[]>('/alt/plantillas');
  const [sel, setSel] = useState<Plantilla | null>(null);
  useEffect(() => {
    if (!sel && data?.length) setSel(data[0]);
  }, [data, sel]);
  const guardar = useMut(() => (sel!.id ? api.patch(`/alt/plantillas/${sel!.id}`, { nombre: sel!.nombre, tipo: sel!.tipo, tareas: sel!.tareas }) : api.post('/alt/plantillas', sel)), { ok: 'Plantilla guardada', invalidate: ['/alt/plantillas'], onSuccess: (r: any) => setSel(r) });
  const upd = (i: number, p: Partial<Tarea>) => setSel((s) => s && { ...s, tareas: s.tareas.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  return (
    <>
      <PageHeader title="Plantillas de altas y bajas" icon={ListChecks} actions={<Button icon={Plus} onClick={() => setSel({ nombre: '', tipo: 'alta', tareas: [] })}>Nueva plantilla</Button>} />
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit overflow-hidden">
          <ul className="divide-y divide-line">
            {(data ?? []).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setSel(p)} className={cn('w-full px-4 py-3 text-left hover:bg-sunken', sel?.id === p.id && 'bg-primary-soft')}>
                  <span className="block text-[13.5px] font-medium">{p.nombre}</span>
                  <span className="text-[12px] text-muted">
                    {p.tipo === 'alta' ? 'Incorporación' : 'Salida'} · {p.tareas.length} tareas
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {!sel ? (
          <Card>
            <EmptyState icon={ListChecks} title="Crea tu primera plantilla" />
          </Card>
        ) : (
          <Card className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="Nombre">
                <Input value={sel.nombre} onChange={(e) => setSel({ ...sel, nombre: e.target.value })} placeholder="Incorporación de técnico" />
              </Field>
              <Field label="Para">
                <Segmented value={sel.tipo} onChange={(v) => setSel({ ...sel, tipo: v })} options={[{ value: 'alta', label: 'Incorporaciones' }, { value: 'baja', label: 'Salidas' }]} />
              </Field>
            </div>
            <div className="space-y-2">
              {sel.tareas.map((t, i) => (
                <div key={i} className="grid gap-2 rounded-xl bg-sunken/60 p-2 md:grid-cols-[1fr_200px_200px_110px_32px]">
                  <Input value={t.titulo} onChange={(e) => upd(i, { titulo: e.target.value })} placeholder="Tarea" />
                  <Select value={t.responsable} onChange={(e) => upd(i, { responsable: e.target.value as Tarea['responsable'] })} options={altShared.RESPONSABLES_TAREA} />
                  {t.responsable === 'departamento' ? (
                    <RefSelect target="departamentos" value={t.departamentoId ?? null} onChange={(v) => upd(i, { departamentoId: v })} />
                  ) : t.responsable === 'concreta' ? (
                    <RefSelect target="personas" value={t.personaId ?? null} onChange={(v) => upd(i, { personaId: v })} />
                  ) : (
                    <span />
                  )}
                  <NumberInput value={t.dias} onChange={(n) => upd(i, { dias: n ?? 0 })} decimals={0} suffix="días" />
                  <IconButton icon={Trash2} label="Quitar" size="sm" onClick={() => setSel({ ...sel, tareas: sel.tareas.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <Button size="sm" icon={Plus} onClick={() => setSel({ ...sel, tareas: [...sel.tareas, { titulo: '', responsable: 'rrhh', dias: 0 }] })}>
                Tarea
              </Button>
              <p className="text-[12px] text-muted">Días respecto a la fecha de alta o baja: negativo para antes (p. ej. −3 para preparar el portátil).</p>
            </div>
            <div className="flex justify-end border-t border-line pt-3">
              <Button variant="primary" icon={Save} disabled={!sel.nombre.trim()} loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>
                Guardar
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
