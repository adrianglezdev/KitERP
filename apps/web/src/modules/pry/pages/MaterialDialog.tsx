import { useState } from 'react';
import { AlertTriangle, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { fmtMoney } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button, Dialog, Field, IconButton, Input, Segmented } from '@/components/ui';
import { NumberInput } from '@/components/form/inputs';
import { RefSelect } from '@/components/form/RefSelect';

interface Linea {
  key: string;
  modo: 'articulo' | 'libre';
  articuloId: string | null;
  articuloLabel?: string;
  descripcion: string;
  cantidad: number | null;
  costeUnitario: number | null;
  lote: string;
}
const nueva = (): Linea => ({ key: crypto.randomUUID(), modo: 'articulo', articuloId: null, descripcion: '', cantidad: 1, costeUnitario: null, lote: '' });
const hoy = () => new Date().toLocaleDateString('sv-SE');

/**
 * Registrar el material gastado en un proyecto. Los artículos del catálogo se descuentan del almacén
 * elegido (o de la furgoneta de quien lo registra) y su coste se toma del coste medio del almacén.
 * El material sin artículo (compras en tienda, por ejemplo) solo suma su coste al proyecto.
 */
export function MaterialDialog({ proyecto, onClose }: { proyecto: any; onClose: () => void }) {
  const { has, can, session } = useSession();
  const conStock = has('stk');
  const [fecha, setFecha] = useState(hoy());
  const [almacenId, setAlmacenId] = useState<string | null>(null);
  const [partidaId, setPartidaId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([nueva()]);
  const upd = (i: number, p: Partial<Linea>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  // sin almacén elegido, el material sale de la furgoneta de quien lo registra (si tiene)
  const pid = session?.user.personaId;
  const furgo = useApi<{ id: string; label: string }[]>(conStock && pid ? '/refs/almacenes?q=&f.tipo=furgoneta&f.personaId=' + pid : null);
  const origen = almacenId ?? furgo.data?.[0]?.id ?? null;
  const ids = lineas.filter((l) => l.modo === 'articulo' && l.articuloId).map((l) => l.articuloId!);
  const puedeVerStock = conStock && (can('stk.ver') || can('stk.mover'));
  const disp = useApi<Record<string, { disponible: number }>>(puedeVerStock && ids.length ? `/stk/disponible?articuloIds=${ids.join(',')}${origen ? `&almacenId=${origen}` : ''}` : null);

  const validas = lineas.filter((l) => (l.cantidad ?? 0) > 0 && (l.modo === 'articulo' ? !!l.articuloId : !!l.descripcion.trim()));
  const guardar = useMut(
    () =>
      api.post<any>(`/pry/proyectos/${proyecto.id}/material`, {
        fecha,
        almacenId,
        partidaId,
        lineas: validas.map((l) =>
          l.modo === 'articulo'
            ? { articuloId: l.articuloId, cantidad: l.cantidad, lote: l.lote.trim() || null }
            : { descripcion: l.descripcion.trim(), cantidad: l.cantidad, costeUnitario: l.costeUnitario ?? 0 },
        ),
      }),
    { ok: (r) => `${r.consumos.length} ${r.consumos.length === 1 ? 'línea registrada' : 'líneas registradas'}`, invalidate: ['/pry', '/stk'], onSuccess: onClose },
  );

  return (
    <Dialog
      open
      size="xl"
      onOpenChange={(o) => !o && onClose()}
      title={`Material para ${proyecto.codigo}`}
      footer={
        <Button variant="primary" icon={PackagePlus} disabled={!validas.length} loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>
          Registrar {validas.length > 1 ? `${validas.length} líneas` : 'material'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fecha">
            <Input type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          {conStock && (
            <Field label="Sale de" help={almacenId ? undefined : furgo.data?.length ? 'Por defecto, tu furgoneta' : 'Por defecto, el almacén principal'}>
              <RefSelect target="almacenes" value={almacenId} onChange={setAlmacenId} placeholder={furgo.data?.[0]?.label ?? 'Almacén principal'} />
            </Field>
          )}
          <Field label="Partida">
            <RefSelect target="pry_partidas" filter={{ proyectoId: proyecto.id }} value={partidaId} onChange={setPartidaId} placeholder="Sin partida" />
          </Field>
        </div>

        <div className="space-y-2">
          {lineas.map((l, i) => {
            const d = l.articuloId ? disp.data?.[l.articuloId] : undefined;
            const falta = d && l.cantidad ? l.cantidad > d.disponible : false;
            return (
              <div key={l.key} className="space-y-2 rounded-xl bg-sunken/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Segmented
                    value={l.modo}
                    onChange={(m) => upd(i, { modo: m })}
                    options={[
                      { value: 'articulo', label: 'Del catálogo' },
                      { value: 'libre', label: 'Otro material' },
                    ]}
                  />
                  <IconButton icon={Trash2} label="Quitar línea" size="sm" disabled={lineas.length === 1} onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} />
                </div>
                {l.modo === 'articulo' ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_130px_150px]">
                    <Field label="Artículo">
                      <RefSelect target="articulos" value={l.articuloId} label={l.articuloLabel} onChange={(id, o) => upd(i, { articuloId: id, articuloLabel: o?.label })} placeholder="Referencia, nombre o código de barras" />
                    </Field>
                    <Field label="Cantidad">
                      <NumberInput value={l.cantidad} onChange={(n) => upd(i, { cantidad: n })} decimals={3} invalid={falta} />
                    </Field>
                    <Field label="Lote (si lo lleva)">
                      <Input value={l.lote} onChange={(e) => upd(i, { lote: e.target.value })} />
                    </Field>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-[1fr_130px_150px]">
                    <Field label="Descripción">
                      <Input value={l.descripcion} onChange={(e) => upd(i, { descripcion: e.target.value })} placeholder="Ej.: tornillería comprada en ferretería" />
                    </Field>
                    <Field label="Cantidad">
                      <NumberInput value={l.cantidad} onChange={(n) => upd(i, { cantidad: n })} decimals={3} />
                    </Field>
                    <Field label="Coste unitario">
                      <NumberInput value={l.costeUnitario} onChange={(n) => upd(i, { costeUnitario: n })} suffix="€" />
                    </Field>
                  </div>
                )}
                {d && (
                  <p className={cn('flex items-center gap-1 text-[12.5px]', falta ? 'font-semibold text-warn' : 'text-muted')}>
                    {falta && <AlertTriangle className="h-3.5 w-3.5" />}
                    Disponible {origen ? (almacenId ? 'en ese almacén' : 'en tu furgoneta') : 'en total'}: {d.disponible.toLocaleString('es-ES')}
                    {falta && ' · se registrará igualmente y el stock quedará en negativo hasta que se regularice'}
                  </p>
                )}
                {l.modo === 'libre' && l.cantidad && l.costeUnitario ? <p className="text-[12.5px] text-muted">Importe: {fmtMoney(l.cantidad * l.costeUnitario)}</p> : null}
              </div>
            );
          })}
          <Button size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, nueva()])}>
            Otra línea
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
