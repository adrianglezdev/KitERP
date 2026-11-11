import { useEffect, useState } from 'react';
import { ListChecks, Plus, Save, Trash2 } from 'lucide-react';
import { satShared, optionLabel } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button, Card, Checkbox, EmptyState, Field, IconButton, Input, PageHeader, Select, Switch } from '@/components/ui';

interface Item {
  id: string;
  texto: string;
  obligatorio?: boolean;
}
interface Lista {
  id?: string;
  nombre: string;
  tipo: string | null;
  items: Item[];
  activo: boolean;
}

const nueva = (): Lista => ({ nombre: '', tipo: null, items: [], activo: true });

/** Plantillas de puntos a revisar que el técnico marca en el parte (se eligen al crear la orden). */
export default function Checklists() {
  const { can } = useSession();
  const editable = can('sat.contratos');
  const { data } = useApi<{ items: Lista[] }>('/sat/checklists?pageSize=200');
  const [sel, setSel] = useState<Lista | null>(null);
  const [texto, setTexto] = useState('');
  useEffect(() => {
    if (!sel && data?.items.length) setSel(data.items[0]!);
  }, [data, sel]);
  const guardar = useMut(
    () => {
      const body = { nombre: sel!.nombre, tipo: sel!.tipo || null, items: sel!.items.filter((i) => i.texto.trim()), activo: sel!.activo };
      return sel!.id ? api.patch(`/sat/checklists/${sel!.id}`, body) : api.post('/sat/checklists', body);
    },
    { ok: 'Lista guardada', invalidate: ['/sat/checklists'], onSuccess: (r: any) => setSel(r) },
  );
  const add = () => {
    if (!sel || !texto.trim()) return;
    setSel({ ...sel, items: [...sel.items, { id: crypto.randomUUID(), texto: texto.trim(), obligatorio: false }] });
    setTexto('');
  };
  return (
    <>
      <PageHeader
        title="Listas de comprobación"
        icon={ListChecks}
        subtitle="Puntos que el técnico debe revisar y marcar en cada tipo de trabajo."
        actions={
          editable && (
            <Button icon={Plus} onClick={() => setSel(nueva())}>
              Nueva lista
            </Button>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit overflow-hidden">
          <ul className="divide-y divide-line">
            {data?.items.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => setSel(l)} className={cn('w-full px-4 py-3 text-left hover:bg-sunken', sel?.id === l.id && 'bg-primary-soft')}>
                  <span className="block text-[13.5px] font-medium">{l.nombre}</span>
                  <span className="text-[12px] text-muted">
                    {l.items.length} puntos{l.tipo ? ` · ${optionLabel(satShared.ORDEN_TIPOS, l.tipo)?.label}` : ''}
                    {!l.activo && ' · inactiva'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {!sel ? (
          <Card>
            <EmptyState icon={ListChecks} title="Sin listas todavía" />
          </Card>
        ) : (
          <Card className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
              <Field label="Nombre">
                <Input value={sel.nombre} disabled={!editable} onChange={(e) => setSel({ ...sel, nombre: e.target.value })} placeholder="Mantenimiento de split" />
              </Field>
              <Field label="Para órdenes de tipo">
                <Select value={sel.tipo ?? ''} disabled={!editable} onChange={(e) => setSel({ ...sel, tipo: e.target.value || null })} options={satShared.ORDEN_TIPOS} placeholder="Cualquiera" />
              </Field>
            </div>
            <div className="space-y-1.5">
              <p className="label">Puntos a revisar</p>
              {sel.items.map((it, i) => (
                <div key={it.id} className="flex items-center gap-2">
                  <span className="w-5 text-right text-[12px] text-muted">{i + 1}.</span>
                  <Input value={it.texto} disabled={!editable} onChange={(e) => setSel({ ...sel, items: sel.items.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })} />
                  <Checkbox checked={!!it.obligatorio} disabled={!editable} onChange={(v) => setSel({ ...sel, items: sel.items.map((x, j) => (j === i ? { ...x, obligatorio: v } : x)) })} label="Obligatorio" />
                  {editable && <IconButton icon={Trash2} label="Quitar" size="sm" onClick={() => setSel({ ...sel, items: sel.items.filter((_, j) => j !== i) })} />}
                </div>
              ))}
              {editable && (
                <div className="flex gap-2 pt-1">
                  <Input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Ej.: Comprobar la presión del circuito" />
                  <Button icon={Plus} onClick={add}>
                    Añadir
                  </Button>
                </div>
              )}
            </div>
            {editable && (
              <div className="flex items-center justify-between border-t border-line pt-3">
                <Switch checked={sel.activo} onChange={(v) => setSel({ ...sel, activo: v })} label="Activa" />
                <Button variant="primary" icon={Save} disabled={!sel.nombre.trim()} loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>
                  Guardar
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
