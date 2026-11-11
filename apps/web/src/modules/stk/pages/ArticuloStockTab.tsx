import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Layers, Plus, Save, Settings2, SlidersHorizontal, Trash2 } from 'lucide-react';
import { fmtDate, fmtMoney, stkShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { FieldControl } from '@/components/resource';
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, EnumBadge, Field, IconButton, NumberInput, RefSelect, Spinner, Stat } from '@/components/ui';
import { fmtQty } from '../ui';
import { movimientoColumns } from './Movimientos';
import { AjusteDialog } from './Stock';

/** Pestaña "Stock" de la ficha de artículo. */
export default function ArticuloStockTab({ id, record }: { id: string; record: any }) {
  const { can } = useSession();
  const url = `/stk/stock/${id}`;
  const { data, isLoading } = useApi<any>(url);
  const [ajuste, setAjuste] = useState(false);
  if (isLoading || !data) return <Spinner />;
  const t = data.totales;
  const u = data.articulo.unidad;
  if (!data.articulo.controlaStock || data.articulo.tipo === 'servicio')
    return (
      <EmptyState icon={Boxes} title="Este artículo no controla stock">
        Activa «Controla stock» en sus datos si quieres llevar sus existencias.
      </EmptyState>
    );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Físico" value={fmtQty(t.fisico, u)} />
        <Stat label="Reservado" value={fmtQty(t.reservado, u)} tone="yellow" />
        <Stat label="Disponible" value={<span className={cn(t.disponible < 0 && 'text-bad')}>{fmtQty(t.disponible, u)}</span>} tone={data.config?.stockMin && t.fisico < data.config.stockMin ? 'red' : 'green'} hint={data.config?.stockMin ? `mínimo ${fmtQty(data.config.stockMin)}` : undefined} />
        <Stat label="Valor (PMP)" value={fmtMoney(t.valor)} hint={`coste medio ${fmtMoney(t.costeMedio)}`} tone="brown" />
      </div>

      <Card>
        <CardHeader title="Por almacén" icon={Boxes} actions={can('stk.mover') && <Button size="sm" icon={SlidersHorizontal} onClick={() => setAjuste(true)}>Ajustar</Button>} />
        {!data.saldos.length ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted">Sin existencias en ningún almacén</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.saldos.map((s: any) => (
              <li key={`${s.almacenId}-${s.lote}`} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {s.almacen} {s.tipo === 'furgoneta' && <Badge tone="blue">Furgoneta</Badge>}
                  </p>
                  {s.lote && (
                    <p className="text-[12.5px] text-muted">
                      Lote {s.lote}
                      {s.caducidad && ` · caduca ${fmtDate(s.caducidad)}`}
                    </p>
                  )}
                </div>
                {s.reservado > 0 && <span className="text-[12.5px] text-warn">{fmtQty(s.reservado)} reserv.</span>}
                <span className={cn('tabular w-24 text-right font-semibold', s.cantidad < 0 && 'text-bad')}>{fmtQty(s.cantidad, u)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.reservas.length > 0 && (
        <Card>
          <CardHeader title="Reservado para pedidos" />
          <ul className="divide-y divide-line">
            {data.reservas.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                <Link to={`/documentos/${r.documentoId}`} className="min-w-0 truncate hover:text-primary">
                  <b className="font-medium">{r.codigo ?? 'Pedido'}</b> · {r.tercero}
                  {r.fecha && <span className="text-muted"> · entrega {fmtDate(r.fecha)}</span>}
                </Link>
                <span className="tabular font-medium">{fmtQty(r.cantidad, u)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {record?.tipo === 'kit' && <KitEditor id={id} componentes={data.kit} editable={can(['stk.gestionar', 'catalogo.gestionar'])} />}

      <ConfigStock id={id} config={data.config} editable={data.puedeGestionar} />

      {data.series.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="Números de serie" icon={Layers} subtitle={`${data.series.filter((s: any) => s.estado === 'en_stock').length} en stock`} />
          <DataTable
            dense
            rows={data.series}
            columns={[
              { key: 'n', header: 'Nº de serie', cell: (s: any) => <Link className="font-medium hover:text-primary" to={`/stock/trazabilidad?q=${encodeURIComponent(s.numeroSerie)}`}>{s.numeroSerie}</Link> },
              { key: 'e', header: 'Estado', cell: (s: any) => <EnumBadge options={stkShared.SERIE_ESTADOS} value={s.estado} /> },
              { key: 'a', header: 'Dónde', cell: (s: any) => (s.estado === 'en_stock' ? s.almacen : s.tercero) ?? '—' },
              { key: 'f', header: 'Fecha', hideBelow: 'md', cell: (s: any) => fmtDate(s.fechaSalida ?? s.fechaEntrada) },
            ]}
          />
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="Últimos movimientos" actions={<Link to={`/stock/movimientos?articuloId=${id}`} className="text-[12.5px] font-medium text-primary">Ver todos</Link>} />
        <DataTable columns={movimientoColumns({ articulo: false })} rows={data.movimientos} dense mobileTitle={(m) => m.almacen} mobileSubtitle={(m) => fmtDate(m.momento)} empty={<p className="px-4 py-6 text-center text-[13px] text-muted">Sin movimientos</p>} />
      </Card>
      {ajuste && <AjusteDialog articuloId={id} onClose={() => setAjuste(false)} />}
    </div>
  );
}

function ConfigStock({ id, config, editable }: { id: string; config: any; editable: boolean }) {
  const def = stkShared.articuloConfigResource;
  const [v, setV] = useState<Record<string, any>>({});
  useEffect(() => setV({ stockMin: config?.stockMin ?? null, puntoPedido: config?.puntoPedido ?? null, cantidadPedido: config?.cantidadPedido ?? null, controlaLotes: !!config?.controlaLotes, controlaSeries: !!config?.controlaSeries, ubicacionId: config?.ubicacionId ?? null }), [config]);
  const guardar = useMut(() => api.put(`/stk/config/${id}`, v), { ok: 'Configuración de stock guardada', invalidate: [`/stk/stock/${id}`, '/stk/stock'] });
  return (
    <Card>
      <CardHeader title="Mínimos, lotes y series" icon={Settings2} actions={editable && <Button size="sm" variant="primary" icon={Save} loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>Guardar</Button>} />
      <div className="grid gap-4 p-4 sm:grid-cols-3">
        {(['stockMin', 'puntoPedido', 'cantidadPedido'] as const).map((k) => (
          <Field key={k} label={def.fields[k]!.label} help={def.fields[k]!.help}>
            {editable ? <FieldControl name={k} def={def.fields[k]!} value={v[k]} onChange={(x) => setV((s) => ({ ...s, [k]: x }))} /> : <p className="tabular">{fmtQty(v[k])}</p>}
          </Field>
        ))}
        <Field label="Ubicación habitual">
          <RefSelect target="ubicaciones" value={v.ubicacionId} onChange={(x) => setV((s) => ({ ...s, ubicacionId: x }))} disabled={!editable} placeholder="Sin ubicación" />
        </Field>
        <div className="space-y-2 self-end pb-2 sm:col-span-2">
          {(['controlaLotes', 'controlaSeries'] as const).map((k) => (
            <FieldControl key={k} name={k} def={{ ...def.fields[k]!, readOnly: !editable }} value={v[k]} onChange={(x) => editable && setV((s) => ({ ...s, [k]: x }))} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function KitEditor({ id, componentes, editable }: { id: string; componentes: any[]; editable: boolean }) {
  const [ls, setLs] = useState<{ key: number; componenteId: string | null; label?: string; cantidad: number | null }[]>([]);
  useEffect(() => setLs(componentes.map((c, i) => ({ key: i, componenteId: c.componenteId, label: `${c.referencia} · ${c.nombre}`, cantidad: c.cantidad }))), [componentes]);
  const guardar = useMut(() => api.put(`/stk/kits/${id}`, { componentes: ls.filter((l) => l.componenteId && l.cantidad).map((l) => ({ componenteId: l.componenteId, cantidad: l.cantidad })) }), { ok: 'Escandallo guardado', invalidate: [`/stk/stock/${id}`] });
  return (
    <Card>
      <CardHeader title="Escandallo del kit" icon={Layers} subtitle="Al vender el kit se descuentan estos componentes" actions={editable && <Button size="sm" variant="primary" icon={Save} loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>Guardar</Button>} />
      <div className="space-y-2 p-4">
        {!ls.length && <p className="text-[13px] text-muted">Sin componentes: el kit se trata como un artículo normal.</p>}
        {ls.map((l) => (
          <div key={l.key} className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
            <RefSelect target="articulos" value={l.componenteId} label={l.label} disabled={!editable} onChange={(v, o) => setLs((x) => x.map((y) => (y.key === l.key ? { ...y, componenteId: v, label: o?.label } : y)))} />
            <NumberInput value={l.cantidad} disabled={!editable} decimals={3} onChange={(v) => setLs((x) => x.map((y) => (y.key === l.key ? { ...y, cantidad: v } : y)))} />
            {editable && <IconButton icon={Trash2} label="Quitar" onClick={() => setLs(ls.filter((x) => x.key !== l.key))} />}
          </div>
        ))}
        {editable && (
          <Button icon={Plus} variant="ghost" onClick={() => setLs([...ls, { key: Date.now(), componenteId: null, cantidad: 1 }])}>
            Añadir componente
          </Button>
        )}
      </div>
    </Card>
  );
}
