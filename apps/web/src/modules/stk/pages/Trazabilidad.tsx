import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PackageSearch } from 'lucide-react';
import { fmtDate, stkShared } from '@kite/shared';
import { qs } from '@/lib/api';
import { useApi, useDebounced } from '@/lib/hooks';
import { Card, CardHeader, DataTable, EmptyState, EnumBadge, KeyValue, PageHeader, SearchInput, Spinner } from '@/components/ui';
import { movimientoColumns, type Movimiento } from './Movimientos';

/** Dónde ha estado un lote o un número de serie: de qué proveedor vino y a qué cliente fue. */
export default function Trazabilidad() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounced(q, 400);
  const { data, isFetching } = useApi<{ lotes: any[]; series: any[]; movimientosLote: Movimiento[]; movimientosSerie: Movimiento[] }>(dq.trim().length >= 2 ? `/stk/trazabilidad${qs({ q: dq.trim() })}` : null);
  return (
    <div className="space-y-5">
      <PageHeader title="Trazabilidad" icon={PackageSearch} back="/stock" subtitle="Busca un lote o un número de serie" />
      <SearchInput
        value={q}
        onChange={(v) => {
          setQ(v);
          setSp(v ? { q: v } : {}, { replace: true });
        }}
        placeholder="Lote o número de serie…"
        autoFocus
      />
      {dq.trim().length < 2 ? (
        <Card>
          <EmptyState icon={PackageSearch} title="Escribe al menos dos caracteres">Verás de qué proveedor llegó, en qué almacén está y a qué cliente o proyecto fue.</EmptyState>
        </Card>
      ) : isFetching && !data ? (
        <Spinner />
      ) : !data?.lotes.length && !data?.series.length ? (
        <Card>
          <EmptyState icon={PackageSearch} title="Sin resultados" />
        </Card>
      ) : (
        <>
          {data!.series.map((s) => (
            <Card key={s.id}>
              <CardHeader title={`Nº de serie ${s.numeroSerie}`} subtitle={`${s.referencia} · ${s.nombre}`} actions={<EnumBadge options={stkShared.SERIE_ESTADOS} value={s.estado} />} />
              <div className="p-4">
                <KeyValue
                  cols={3}
                  items={[
                    { label: 'Almacén', value: s.estado === 'en_stock' ? s.almacen : null },
                    { label: 'Cliente', value: s.terceroId ? <Link to={`/terceros/${s.terceroId}`} className="text-primary">{s.tercero}</Link> : null },
                    { label: 'Lote', value: s.lote },
                    { label: 'Entrada', value: s.fechaEntrada ? <>{fmtDate(s.fechaEntrada)} {s.documentoEntradaId && <Link className="text-primary" to={`/documentos/${s.documentoEntradaId}`}>· ver recepción</Link>}</> : null },
                    { label: 'Salida', value: s.fechaSalida ? <>{fmtDate(s.fechaSalida)} {s.documentoSalidaId && <Link className="text-primary" to={`/documentos/${s.documentoSalidaId}`}>· ver albarán</Link>}</> : null },
                  ]}
                />
              </div>
            </Card>
          ))}
          {data!.lotes.length > 0 && (
            <Card>
              <CardHeader title="Lotes" />
              <ul className="divide-y divide-line">
                {data!.lotes.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13.5px]">
                    <span>
                      <b className="font-semibold">{l.lote}</b> · {l.referencia} {l.nombre}
                    </span>
                    <span className="text-muted">
                      {l.proveedor ?? 'Proveedor desconocido'}
                      {l.caducidad && ` · caduca ${fmtDate(l.caducidad)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {[...data!.movimientosLote, ...data!.movimientosSerie].length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title="Movimientos" />
              <DataTable columns={movimientoColumns()} rows={[...data!.movimientosLote, ...data!.movimientosSerie].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)} dense mobileTitle={(m) => `${m.referencia} · ${m.almacen}`} mobileSubtitle={(m) => fmtDate(m.momento)} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
