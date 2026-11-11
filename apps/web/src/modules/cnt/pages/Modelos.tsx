import { useState } from 'react';
import { Calculator, Info } from 'lucide-react';
import { fmtMoney } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Card, CardHeader, DataTable, Field, PageHeader, Select, Spinner } from '@/components/ui';
import { AnioSelect } from '../comun';

const MODELOS = [
  { value: '303', label: '303 · IVA trimestral', trimestral: true },
  { value: '390', label: '390 · Resumen anual de IVA' },
  { value: '111', label: '111 · Retenciones de trabajo y profesionales', trimestral: true },
  { value: '115', label: '115 · Retenciones de alquileres', trimestral: true },
  { value: '180', label: '180 · Resumen anual de alquileres' },
  { value: '190', label: '190 · Resumen anual de retenciones' },
  { value: '347', label: '347 · Operaciones con terceros (> 3.005,06 €)' },
  { value: '349', label: '349 · Operaciones intracomunitarias', trimestral: true },
];

/** Borradores de los modelos tributarios calculados con la contabilidad y las facturas. */
export default function Modelos() {
  const [modelo, setModelo] = useState('303');
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [trimestre, setTrimestre] = useState(String(Math.floor(new Date().getMonth() / 3) + 1));
  const m = MODELOS.find((x) => x.value === modelo)!;
  const { data, isLoading } = useApi<any>(`/cnt/modelos/${modelo}?anio=${anio}${m.trimestral ? `&trimestre=${trimestre}` : ''}`);
  const formatea = (c: any) => (c.tipo === 'numero' ? String(c.importe) : c.tipo === 'porcentaje' ? `${c.importe} %` : fmtMoney(c.importe));
  const listado: any[] = data?.perceptores ?? data?.declarados ?? data?.operadores ?? [];
  return (
    <>
      <PageHeader title="Modelos tributarios" icon={Calculator} subtitle="Borrador calculado con lo contabilizado. Revísalo y trasládalo a la sede electrónica de la AEAT." />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Modelo">
          <Select className="w-80 max-w-full" value={modelo} onChange={(e) => setModelo(e.target.value)} options={MODELOS} />
        </Field>
        <Field label="Año">
          <AnioSelect value={anio} onChange={setAnio} />
        </Field>
        {m.trimestral && (
          <Field label="Trimestre">
            <Select className="w-36" value={trimestre} onChange={(e) => setTrimestre(e.target.value)} options={[1, 2, 3, 4].map((t) => ({ value: String(t), label: `${t}T` }))} />
          </Field>
        )}
      </div>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          {data.tipoResultado && (
            <Alert tone={data.resultado > 0 ? 'orange' : 'green'} icon={Info} title={`Resultado: ${fmtMoney(data.resultado)}`}>
              {data.tipoResultado}
            </Alert>
          )}
          <Card className="overflow-hidden">
            <CardHeader title={`Modelo ${modelo}`} />
            <ul className="divide-y divide-line">
              {data.casillas.map((c: any) => (
                <li key={c.casilla} className={cn('flex items-center gap-3 px-4 py-2 text-[13.5px]', c.destacado && 'bg-primary-soft/50 font-semibold')}>
                  <span className="w-10 shrink-0 rounded bg-sunken px-1.5 py-0.5 text-center font-mono text-[12px]">{c.casilla}</span>
                  <span className="min-w-0 flex-1">{c.concepto}</span>
                  <span className="tabular-nums">{formatea(c)}</span>
                </li>
              ))}
            </ul>
          </Card>
          {data.trimestres && (
            <Card className="overflow-hidden">
              <CardHeader title="Por trimestres" />
              <DataTable
                dense
                rows={data.trimestres.map((t: any, i: number) => ({ ...t, id: String(i) }))}
                columns={Object.keys(data.trimestres[0] ?? {}).map((k) => ({ key: k, header: k, align: typeof data.trimestres[0][k] === 'number' && k !== 'trimestre' ? ('right' as const) : undefined, cell: (t: any) => (typeof t[k] === 'number' && k !== 'trimestre' ? fmtMoney(t[k]) : String(t[k])) }))}
              />
            </Card>
          )}
          {listado.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title={data.perceptores ? 'Perceptores' : data.declarados ? 'Declarados' : 'Operadores'} />
              <DataTable
                dense
                rows={listado.map((x, i) => ({ ...x, id: String(i) }))}
                columns={[
                  { key: 'nif', header: 'NIF', cell: (x: any) => x.nif ?? <span className="text-bad">Sin NIF</span>, width: '120px' },
                  { key: 'nombre', header: 'Nombre', cell: (x: any) => <span className="line-clamp-1">{x.nombre}</span> },
                  { key: 'clave', header: 'Clave', cell: (x: any) => x.claveTexto ?? x.clave ?? '', hideBelow: 'md' },
                  ...(listado[0].trimestres ? [{ key: 'trim', header: 'Trimestres', cell: (x: any) => x.trimestres.map((n: number) => fmtMoney(n)).join(' · '), hideBelow: 'lg' as const }] : []),
                  { key: 'importe', header: 'Importe', align: 'right', cell: (x: any) => fmtMoney(x.total ?? x.base ?? 0) },
                  ...(listado[0].retencion !== undefined ? [{ key: 'ret', header: 'Retención', align: 'right' as const, cell: (x: any) => fmtMoney(x.retencion) }] : []),
                ]}
                mobileTitle={(x: any) => x.nombre}
                mobileSubtitle={(x: any) => x.nif}
                mobileRight={(x: any) => fmtMoney(x.total ?? x.base ?? 0)}
              />
            </Card>
          )}
        </div>
      )}
    </>
  );
}
