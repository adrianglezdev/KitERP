import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate } from '@kite/shared';
import { api, errorMessage, qs } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Alert, Button, Card, DataTable, Dialog, EmptyState, Field, IconButton, Input, NumberInput, PageHeader, Pagination, RefSelect, Spinner, type Column } from '@/components/ui';
import { ScanInput, fmtQty } from '../ui';

interface Traspaso {
  id: string;
  codigo: string;
  fecha: string;
  origen: string;
  destino: string;
  lineas: number;
  notas: string | null;
  persona: string | null;
}

export default function Traspasos() {
  const { can } = useSession();
  const [sp, setSp] = useSearchParams();
  const [page, setPage] = useState(1);
  const [nuevo, setNuevo] = useState(sp.get('nuevo') === '1');
  const [ver, setVer] = useState<string | null>(null);
  const { data, isLoading } = useApi<{ items: Traspaso[]; total: number }>(`/stk/traspasos${qs({ page, pageSize: 25 })}`, { placeholderData: (p) => p });
  const cerrar = () => {
    setNuevo(false);
    if (sp.get('nuevo')) {
      const n = new URLSearchParams(sp);
      n.delete('nuevo');
      setSp(n, { replace: true });
    }
  };
  const columns: Column<Traspaso>[] = [
    { key: 'codigo', header: 'Número', cell: (t) => <span className="font-medium">{t.codigo}</span> },
    { key: 'fecha', header: 'Fecha', cell: (t) => fmtDate(t.fecha) },
    {
      key: 'ruta',
      header: 'Origen → destino',
      cell: (t) => (
        <span className="flex items-center gap-1.5">
          {t.origen} <ArrowRight className="h-3.5 w-3.5 text-muted" /> {t.destino}
        </span>
      ),
    },
    { key: 'lineas', header: 'Artículos', align: 'right', cell: (t) => t.lineas },
    { key: 'persona', header: 'Hecho por', hideBelow: 'lg', cell: (t) => t.persona ?? '—' },
    { key: 'notas', header: 'Notas', hideBelow: 'xl', cell: (t) => <span className="block max-w-[260px] truncate text-muted">{t.notas ?? '—'}</span> },
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        title="Traspasos"
        icon={ArrowLeftRight}
        back="/stock"
        subtitle="Movimientos de material entre almacenes y furgonetas"
        actions={
          can('stk.mover') && (
            <Button variant="primary" icon={Plus} onClick={() => setNuevo(true)}>
              Nuevo traspaso
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          loading={isLoading}
          onRowClick={(t) => setVer(t.id)}
          mobileTitle={(t) => `${t.origen} → ${t.destino}`}
          mobileSubtitle={(t) => `${t.codigo} · ${fmtDate(t.fecha)}${t.persona ? ` · ${t.persona}` : ''}`}
          mobileRight={(t) => <span className="text-[13px] text-muted">{t.lineas} art.</span>}
          empty={<EmptyState icon={ArrowLeftRight} title="Aún no hay traspasos">Usa un traspaso para cargar una furgoneta o devolver material al almacén.</EmptyState>}
        />
        {data && <Pagination page={page} pageSize={25} total={data.total} onPage={setPage} />}
      </Card>
      {nuevo && <TraspasoDialog onClose={cerrar} />}
      {ver && <TraspasoDetalle id={ver} onClose={() => setVer(null)} />}
    </div>
  );
}

function TraspasoDetalle({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useApi<any>(`/stk/traspasos/${id}`);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={data ? `Traspaso ${data.codigo}` : 'Traspaso'} description={data ? fmtDate(data.fecha) : undefined}>
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          {data.notas && <p className="text-[13.5px] text-muted">{data.notas}</p>}
          <ul className="divide-y divide-line rounded-xl border border-line-strong/70">
            {data.lineas.map((l: any) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13.5px]">
                <span className="min-w-0 truncate">
                  <b className="font-medium">{l.referencia}</b> · {l.articulo}
                  {l.lote && <span className="text-muted"> · lote {l.lote}</span>}
                </span>
                <span className="tabular font-semibold">{fmtQty(l.cantidad, l.unidad)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}

interface LineaT {
  key: number;
  articuloId: string | null;
  label?: string;
  cantidad: number | null;
  lote: string;
}

/** Nuevo traspaso. Un técnico con alcance "propio" solo puede sacar material de su furgoneta. */
export function TraspasoDialog({ onClose, origen, destino }: { onClose: () => void; origen?: string | null; destino?: string | null }) {
  const { scope, session } = useSession();
  const propio = scope('stk.mover') !== 'todo';
  const [origenId, setOrigenId] = useState<string | null>(origen ?? null);
  const [destinoId, setDestinoId] = useState<string | null>(destino ?? null);
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaT[]>([{ key: 1, articuloId: null, cantidad: 1, lote: '' }]);
  const mios = useApi<{ id: string; label: string }[]>(propio && session?.user.personaId ? `/refs/almacenes${qs({ 'f.personaId': session.user.personaId })}` : null);
  useEffect(() => {
    if (propio && !origenId && mios.data?.[0]) setOrigenId(mios.data[0].id);
  }, [propio, mios.data, origenId]);
  const ids = lineas.map((l) => l.articuloId).filter(Boolean).join(',');
  const disp = useApi<Record<string, { fisico: number; disponible: number }>>(origenId && ids ? `/stk/disponible?articuloIds=${ids}&almacenId=${origenId}` : null);
  const set = (key: number, p: Partial<LineaT>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const crear = useMut(
    () => api.post('/stk/traspasos', { origenId, destinoId, notas: notas || null, lineas: lineas.filter((l) => l.articuloId && l.cantidad).map((l) => ({ articuloId: l.articuloId, cantidad: l.cantidad, lote: l.lote || null })) }),
    { ok: (r: any) => `Traspaso ${r.codigo} registrado`, invalidate: ['/stk'], onSuccess: onClose },
  );
  const escanear = async (codigo: string) => {
    try {
      const a = await api.get<{ id: string; referencia: string; nombre: string }>(`/stk/buscar-codigo${qs({ codigo })}`);
      setLineas((ls) => {
        const ex = ls.find((l) => l.articuloId === a.id);
        if (ex) return ls.map((l) => (l.key === ex.key ? { ...l, cantidad: (l.cantidad ?? 0) + 1 } : l));
        const vacia = ls.find((l) => !l.articuloId);
        if (vacia) return ls.map((l) => (l.key === vacia.key ? { ...l, articuloId: a.id, label: `${a.referencia} · ${a.nombre}`, cantidad: 1 } : l));
        return [...ls, { key: Date.now(), articuloId: a.id, label: `${a.referencia} · ${a.nombre}`, cantidad: 1, lote: '' }];
      });
      toast.success(`${a.referencia} añadido`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const excede = lineas.some((l) => l.articuloId && l.cantidad && disp.data?.[l.articuloId] && l.cantidad > disp.data[l.articuloId]!.fisico);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Nuevo traspaso"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon={ArrowLeftRight} loading={crear.isPending} disabled={!origenId || !destinoId || origenId === destinoId || !lineas.some((l) => l.articuloId && l.cantidad)} onClick={() => crear.mutate(undefined)}>
            Traspasar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Desde" required help={propio ? 'Solo puedes sacar material de tu furgoneta' : undefined}>
            <RefSelect target="almacenes" value={origenId} onChange={setOrigenId} filter={propio && session?.user.personaId ? { personaId: session.user.personaId } : undefined} />
          </Field>
          <Field label="Hacia" required>
            <RefSelect target="almacenes" value={destinoId} onChange={setDestinoId} />
          </Field>
        </div>
        {origenId === destinoId && origenId && <Alert tone="red">El origen y el destino deben ser distintos.</Alert>}
        <ScanInput onCode={escanear} autoFocus={false} />
        <div className="space-y-2">
          {lineas.map((l) => {
            const d = l.articuloId ? disp.data?.[l.articuloId] : undefined;
            return (
              <div key={l.key} className="grid grid-cols-[1fr_110px_auto] items-end gap-2 rounded-xl border border-line-strong/70 p-3 sm:grid-cols-[1fr_120px_110px_auto]">
                <Field label="Artículo" className="col-span-3 sm:col-span-1" help={d ? `Hay ${fmtQty(d.fisico)} en origen` : undefined}>
                  <RefSelect target="articulos" value={l.articuloId} label={l.label} onChange={(v, o) => set(l.key, { articuloId: v, label: o?.label })} />
                </Field>
                <Field label="Lote">
                  <Input value={l.lote} onChange={(e) => set(l.key, { lote: e.target.value })} placeholder="Opcional" />
                </Field>
                <Field label="Cantidad">
                  <NumberInput value={l.cantidad} onChange={(v) => set(l.key, { cantidad: v })} decimals={3} min={0} invalid={!!d && !!l.cantidad && l.cantidad > d.fisico} />
                </Field>
                <IconButton icon={Trash2} label="Quitar" onClick={() => setLineas(lineas.filter((x) => x.key !== l.key))} disabled={lineas.length === 1} />
              </div>
            );
          })}
          <Button icon={Plus} variant="ghost" onClick={() => setLineas([...lineas, { key: Date.now(), articuloId: null, cantidad: 1, lote: '' }])}>
            Añadir artículo
          </Button>
        </div>
        {excede && <Alert tone="yellow">Algún artículo no tiene suficiente stock en el origen: el traspaso se registrará y el origen quedará en negativo.</Alert>}
        <Field label="Notas">
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
    </Dialog>
  );
}
