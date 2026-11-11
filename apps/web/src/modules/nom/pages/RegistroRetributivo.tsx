import { useState } from 'react';
import { Download, Scale } from 'lucide-react';
import { fmtMoney } from '@kite/shared';
import { download } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Button, Card, PageHeader, Segmented, Select, Spinner } from '@/components/ui';

/** Registro retributivo (RD 902/2020): medias y medianas por sexo y brecha. */
export default function RegistroRetributivo() {
  const a = new Date().getFullYear();
  const [anio, setAnio] = useState(String(a));
  const [agrupar, setAgrupar] = useState<'grupo' | 'categoria'>('grupo');
  const url = `/nom/registro-retributivo?anio=${anio}&agrupar=${agrupar}`;
  const { data, isLoading } = useApi<any>(url);
  const celda = (s: any) => (s.n ? `${fmtMoney(s.media)} · ${fmtMoney(s.mediana)}` : '—');
  return (
    <>
      <PageHeader
        title="Registro retributivo"
        icon={Scale}
        subtitle="Obligatorio para todas las empresas. Se calcula con los salarios de las fichas laborales."
        actions={
          <Button icon={Download} onClick={() => download(`${url}&format=xlsx`, `registro-retributivo-${anio}.xlsx`)}>
            Excel
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select className="w-28" value={anio} onChange={(e) => setAnio(e.target.value)} options={[a, a - 1, a - 2].map((x) => ({ value: String(x), label: String(x) }))} />
        <Segmented value={agrupar} onChange={setAgrupar} options={[{ value: 'grupo', label: 'Por grupo de cotización' }, { value: 'categoria', label: 'Por categoría' }]} />
      </div>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="border-b border-line bg-sunken text-left text-[12px] text-muted">
                <tr>
                  <th className="px-3 py-2">Grupo</th>
                  <th className="px-3 py-2 text-right">Mujeres (media · mediana)</th>
                  <th className="px-3 py-2 text-right">Hombres (media · mediana)</th>
                  <th className="px-3 py-2 text-right">Brecha</th>
                </tr>
              </thead>
              <tbody>
                {[...data.filas, data.total].map((f: any) => (
                  <tr key={f.grupo} className={cn('border-b border-line/60', f === data.total && 'bg-sunken/60 font-semibold')}>
                    <td className="px-3 py-2">{f.grupo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {celda(f.mujeres)} <span className="text-muted">({f.mujeres.n})</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {celda(f.hombres)} <span className="text-muted">({f.hombres.n})</span>
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', f.brecha != null && Math.abs(f.brecha) >= 25 && 'font-bold text-bad')}>{f.brecha != null ? `${f.brecha} %` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Alert tone="blue" className="mt-4">
            {data.nota} Una brecha del 25 % o más obliga a justificarla.
          </Alert>
        </>
      )}
    </>
  );
}
