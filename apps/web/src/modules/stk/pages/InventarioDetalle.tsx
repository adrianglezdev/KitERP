import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, optionLabel, stkShared } from '@kite/shared';
import { api, errorMessage } from '@/lib/api';
import { invalidatePrefix, useApi, useMut } from '@/lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, Checkbox, Dialog, EmptyState, EnumBadge, Field, PageHeader, ProgressBar, SearchInput, Segmented, Spinner, useConfirm } from '@/components/ui';
import { ScanInput, Stepper, fmtQty } from '../ui';

interface Linea {
  id: string;
  articuloId: string;
  referencia: string;
  nombre: string;
  ean: string | null;
  unidad: string;
  lote: string;
  teorico: number;
  contado: number | null;
  diferencia: number | null;
}

/** Recuento desde el móvil: se escanea (o busca) el artículo, se indica cuántos hay y se confirma al final. */
export default function InventarioDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const url = `/stk/inventarios/${id}`;
  const qc = useQueryClient();
  const { data, isLoading } = useApi<any>(url);
  const [filtro, setFiltro] = useState<'pendientes' | 'contadas' | 'diferencias' | 'todas'>('pendientes');
  const [q, setQ] = useState('');
  const [editar, setEditar] = useState<Linea | null>(null);
  const [verTeorico, setVerTeorico] = useState(false);
  const contar = useMut((p: { lineaId?: string; codigo?: string; cantidad: number; modo?: 'fijar' | 'sumar' }) => api.post(`${url}/contar`, p), { invalidate: [url] });
  const confirmar = useMut((noContadosACero: boolean) => api.post(`${url}/confirmar`, { noContadosACero }), {
    ok: (r: any) => `Recuento confirmado: ${r.ajustes} ajuste${r.ajustes === 1 ? '' : 's'} de stock`,
    invalidate: ['/stk'],
  });
  const cancelar = useMut(() => api.post(`${url}/cancelar`), { ok: 'Recuento cancelado', invalidate: ['/stk'], onSuccess: () => nav('/stock/inventarios') });

  const lineas: Linea[] = data?.lineas ?? [];
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return lineas.filter((l) => {
      if (t && !`${l.referencia} ${l.nombre} ${l.ean ?? ''} ${l.lote}`.toLowerCase().includes(t)) return false;
      if (filtro === 'pendientes') return l.contado === null;
      if (filtro === 'contadas') return l.contado !== null;
      if (filtro === 'diferencias') return l.contado !== null && Math.abs((l.diferencia ?? l.contado - l.teorico)) > 0.0001;
      return true;
    });
  }, [lineas, filtro, q]);

  if (isLoading || !data) return <Spinner />;
  const abierto = data.estado === 'abierto' && data.puedeContar;
  const contadas = lineas.filter((l) => l.contado !== null).length;

  const escanear = async (codigo: string) => {
    const l = lineas.find((x) => x.ean === codigo || x.referencia.toLowerCase() === codigo.toLowerCase());
    if (l) return setEditar(l);
    try {
      // artículo que no estaba en la hoja: se añade con una unidad y se abre para corregir
      const r = await api.post<Linea>(`${url}/contar`, { codigo, cantidad: 1, modo: 'sumar' });
      toast.success(`${r.referencia} añadido al recuento`);
      invalidatePrefix(qc, url);
      setEditar({ ...r, contado: r.contado } as Linea);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        back="/stock/inventarios"
        title={`Recuento ${data.codigo}`}
        subtitle={`${data.almacen} · ${optionLabel(stkShared.INVENTARIO_TIPOS, data.tipo)?.label} · ${fmtDate(data.fecha)}`}
        badges={<EnumBadge options={stkShared.INVENTARIO_ESTADOS} value={data.estado} />}
        actions={
          abierto && (
            <>
              <Button
                variant="ghost"
                icon={XCircle}
                onClick={async () => {
                  if (await confirm({ title: '¿Cancelar el recuento?', message: 'No se ajustará ningún stock.', danger: true, confirm: 'Cancelar recuento' })) cancelar.mutate(undefined);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                icon={CheckCircle2}
                loading={confirmar.isPending}
                onClick={async () => {
                  const faltan = lineas.length - contadas;
                  const ok = await confirm({
                    title: 'Confirmar el recuento',
                    message:
                      faltan > 0 ? (
                        <>
                          Quedan <b>{faltan}</b> artículos sin contar: no se tocará su stock. Las diferencias del resto se registrarán como regularización de inventario.
                        </>
                      ) : (
                        'Las diferencias se registrarán como regularización de inventario.'
                      ),
                    confirm: 'Confirmar y ajustar stock',
                  });
                  if (ok) confirmar.mutate(false);
                }}
              >
                Confirmar
              </Button>
            </>
          )
        }
      />
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <ProgressBar value={contadas} max={lineas.length} tone={contadas === lineas.length ? 'green' : 'violet'} />
          <span className="tabular shrink-0 text-[13px] text-muted">
            {contadas} de {lineas.length}
          </span>
        </div>
        {abierto && <ScanInput onCode={escanear} busy={contar.isPending} />}
        {data.notas && <p className="text-[13px] text-muted">{data.notas}</p>}
      </Card>
      {data.estado === 'confirmado' && <Alert tone="green" icon={CheckCircle2} title="Recuento confirmado">Las diferencias ya están aplicadas al stock.</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: 'pendientes', label: 'Sin contar', count: lineas.length - contadas },
            { value: 'contadas', label: 'Contados', count: contadas },
            { value: 'diferencias', label: 'Con diferencia' },
            { value: 'todas', label: 'Todos' },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Filtrar…" className="min-w-[160px] flex-1" />
        <Checkbox checked={verTeorico} onChange={setVerTeorico} label="Ver stock teórico" />
      </div>

      <Card className="overflow-hidden">
        {!visibles.length ? (
          <EmptyState icon={ClipboardCheck} title={filtro === 'pendientes' ? 'Todo contado' : 'Nada que mostrar'} />
        ) : (
          <ul className="divide-y divide-line">
            {visibles.map((l) => {
              const dif = l.contado !== null ? (l.diferencia ?? l.contado - l.teorico) : null;
              return (
                <li key={l.id}>
                  <button type="button" disabled={!abierto} onClick={() => setEditar(l)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken enabled:hover:bg-sunken/60">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium">{l.nombre}</p>
                      <p className="truncate text-[12.5px] text-muted">
                        {l.referencia}
                        {l.lote && ` · lote ${l.lote}`}
                        {verTeorico && ` · teórico ${fmtQty(l.teorico, l.unidad)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {l.contado === null ? (
                        <Badge>Sin contar</Badge>
                      ) : (
                        <>
                          <p className="tabular text-[16px] font-bold">{fmtQty(l.contado, l.unidad)}</p>
                          {verTeorico && dif !== null && Math.abs(dif) > 0.0001 && <p className={cn('tabular text-[12px] font-medium', dif > 0 ? 'text-ok' : 'text-bad')}>{dif > 0 ? '+' : ''}{fmtQty(dif)}</p>}
                        </>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {editar && <ContarDialog linea={editar} onClose={() => setEditar(null)} onSave={(cantidad) => contar.mutate({ lineaId: editar.id, cantidad }, { onSuccess: () => { toast.success(`${editar.referencia}: ${fmtQty(cantidad)}`); setEditar(null); } })} saving={contar.isPending} />}
    </div>
  );
}

function ContarDialog({ linea, onClose, onSave, saving }: { linea: Linea; onClose: () => void; onSave: (n: number) => void; saving: boolean }) {
  const [n, setN] = useState<number | null>(linea.contado ?? null);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={linea.nombre}
      description={`${linea.referencia}${linea.lote ? ` · lote ${linea.lote}` : ''}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="lg" loading={saving} disabled={n === null} onClick={() => n !== null && onSave(n)}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label={`¿Cuántos hay? (${linea.unidad})`}>
        <div className="flex justify-center py-2">
          <Stepper value={n} onChange={setN} />
        </div>
      </Field>
    </Dialog>
  );
}
