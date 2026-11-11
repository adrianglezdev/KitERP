import { useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Card, IconButton, PageHeader, RefSelect, Spinner } from '@/components/ui';

const mesActual = () => new Date().toISOString().slice(0, 7);
const mover = (mes: string, n: number) => {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1 + n, 15)).toISOString().slice(0, 7);
};
const LETRA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Calendario del equipo: quién falta cada día, con festivos, para ver solapes antes de aprobar. */
export default function Calendario() {
  const [mes, setMes] = useState(mesActual());
  const [dep, setDep] = useState<string | null>(null);
  const { data, isLoading } = useApi<any>(`/aus/calendario?mes=${mes}${dep ? `&departamentoId=${dep}` : ''}`, { placeholderData: (p: any) => p });
  const hoy = new Date().toISOString().slice(0, 10);
  const titulo = new Date(mes + '-15').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return (
    <>
      <PageHeader title="Calendario de equipo" icon={CalendarRange} subtitle="Ausencias aprobadas y pendientes de cada persona." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <IconButton icon={ChevronLeft} label="Mes anterior" variant="secondary" onClick={() => setMes(mover(mes, -1))} />
        <span className="w-40 text-center text-[15px] font-semibold capitalize">{titulo}</span>
        <IconButton icon={ChevronRight} label="Mes siguiente" variant="secondary" onClick={() => setMes(mover(mes, 1))} />
        <div className="w-full sm:ml-auto sm:w-60">
          <RefSelect target="departamentos" value={dep} onChange={setDep} placeholder="Todos los departamentos" />
        </div>
      </div>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <Card className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-[11.5px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-[12px] font-medium text-muted">Persona</th>
                {data.dias.map((d: string) => {
                  const dow = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7;
                  const fest = data.festivos.find((f: any) => f.fecha === d && !f.centroId);
                  return (
                    <th key={d} title={fest?.nombre} className={cn('px-0 py-1.5 text-center font-medium', dow >= 5 || fest ? 'bg-sunken text-muted/70' : 'text-muted', d === hoy && 'text-primary')}>
                      {LETRA[dow]}
                      <br />
                      {Number(d.slice(8))}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.personas.map((p: any) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="sticky left-0 z-10 max-w-[180px] truncate bg-surface px-3 py-1.5 text-[12.5px] font-medium">{p.nombre}</td>
                  {data.dias.map((d: string) => {
                    const dow = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7;
                    const a = p.ausencias.find((x: any) => x.desde <= d && x.hasta >= d);
                    const fest = data.festivos.find((f: any) => f.fecha === d && (!f.centroId || f.centroId === p.centroId));
                    return (
                      <td key={d} className={cn('h-8 p-0.5', (dow >= 5 || fest) && 'bg-sunken')}>
                        {a && (
                          <span
                            title={`${a.tipo}${a.estado !== 'aprobada' ? ' (pendiente)' : ''}`}
                            className={cn('flex h-full w-full items-center justify-center rounded text-[10px] font-bold text-white', a.estado !== 'aprobada' && 'opacity-50 ring-1 ring-inset ring-white')}
                            style={{ background: a.color }}
                          >
                            {a.codigo ?? ''}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-2 text-[12px] text-muted">Las casillas translúcidas son solicitudes pendientes de aprobar. Las columnas sombreadas son fines de semana y festivos.</p>
    </>
  );
}
