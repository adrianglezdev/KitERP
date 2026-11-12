import { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { fmtHours } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Card, IconButton, PageHeader, RefSelect, Spinner } from '@/components/ui';

interface Celda {
  fecha: string;
  turnoId: string | null;
  libre: boolean;
  excepcion: boolean;
  festivo: string | null;
  ausencia: { tipo: string; color: string } | null;
  previstas: number;
}
interface Datos {
  desde: string;
  hasta: string;
  dias: string[];
  turnos: { id: string; nombre: string; horaInicio: string; horaFin: string; color: string }[];
  editable: boolean;
  filas: { persona: { id: string; nombre: string; departamento: string | null }; celdas: Celda[]; horas: number }[];
}

const sumar = (fecha: string, dias: number) => {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/**
 * Cuadrante semanal: el turno de cada persona cada día. Se calcula a partir de las asignaciones de turno;
 * un responsable con permiso puede cambiar días concretos (excepciones) pulsando en la celda.
 */
export default function Cuadrante() {
  const [desde, setDesde] = useState<string | undefined>(undefined);
  const [departamento, setDepartamento] = useState<string | null>(null);
  const url = `/hor/cuadrante?dias=14${desde ? `&desde=${desde}` : ''}${departamento ? `&departamentoId=${departamento}` : ''}`;
  const { data, isLoading } = useApi<Datos>(url, { placeholderData: (p) => p });
  const [cambios, setCambios] = useState<Record<string, { personaId: string; fecha: string; turnoId: string | null; libre: boolean }>>({});
  const turno = useMemo(() => new Map((data?.turnos ?? []).map((t) => [t.id, t])), [data]);
  const guardar = useMut(() => api.put('/hor/cuadrante', { celdas: Object.values(cambios) }), { ok: 'Cuadrante guardado', invalidate: ['/hor'], onSuccess: () => setCambios({}) });

  const ciclar = (personaId: string, c: Celda) => {
    if (!data?.editable) return;
    const k = `${personaId}|${c.fecha}`;
    const actual = cambios[k] ?? { turnoId: c.turnoId, libre: c.libre };
    const opciones: (string | null)[] = [...data.turnos.map((t) => t.id), null];
    const i = opciones.indexOf(actual.libre ? null : actual.turnoId);
    const sig = opciones[(i + 1) % opciones.length] ?? null;
    setCambios({ ...cambios, [k]: { personaId, fecha: c.fecha, turnoId: sig, libre: sig === null } });
  };

  return (
    <>
      <PageHeader
        title="Cuadrante"
        icon={CalendarRange}
        subtitle={data?.editable ? 'Pulsa en un día para cambiar el turno de esa persona (turno → otro turno → libre).' : 'Turnos previstos de tu equipo.'}
        actions={
          Object.keys(cambios).length > 0 && (
            <Button variant="primary" icon={Save} loading={guardar.isPending} onClick={() => guardar.mutate(undefined)}>
              Guardar {Object.keys(cambios).length} cambios
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <IconButton icon={ChevronLeft} label="Semana anterior" variant="secondary" onClick={() => data && setDesde(sumar(data.desde, -7))} />
        <span className="text-[13.5px] font-medium">{data ? `${data.desde.split('-').reverse().join('/')} – ${data.hasta.split('-').reverse().join('/')}` : ''}</span>
        <IconButton icon={ChevronRight} label="Semana siguiente" variant="secondary" onClick={() => data && setDesde(sumar(data.desde, 7))} />
        <Button size="sm" variant="ghost" onClick={() => setDesde(undefined)}>
          Hoy
        </Button>
        <div className="w-full sm:ml-auto sm:w-60">
          <RefSelect target="departamentos" value={departamento} onChange={setDepartamento} placeholder="Todos los departamentos" />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
        {data?.turnos.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 ring-1 ring-line-strong/70">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />
            {t.nombre} {t.horaInicio.slice(0, 5)}–{t.horaFin.slice(0, 5)}
          </span>
        ))}
      </div>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <Card className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-muted">Persona</th>
                {data.dias.map((d) => {
                  const dow = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7;
                  return (
                    <th key={d} className={cn('px-1 py-2 text-center font-medium', dow >= 5 ? 'text-muted/70' : 'text-muted')}>
                      {DIAS[dow]}
                      <br />
                      {d.slice(8)}
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-right font-medium text-muted">Horas</th>
              </tr>
            </thead>
            <tbody>
              {data.filas.map((f) => (
                <tr key={f.persona.id} className="border-t border-line">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-1.5">
                    <span className="block max-w-[170px] truncate font-medium">{f.persona.nombre}</span>
                    {f.persona.departamento && <span className="block truncate text-[11px] text-muted">{f.persona.departamento}</span>}
                  </td>
                  {f.celdas.map((c) => {
                    const ch = cambios[`${f.persona.id}|${c.fecha}`];
                    const tId = ch ? (ch.libre ? null : ch.turnoId) : c.libre ? null : c.turnoId;
                    const t = tId ? turno.get(tId) : null;
                    return (
                      <td key={c.fecha} className="p-0.5">
                        <button
                          type="button"
                          disabled={!data.editable}
                          onClick={() => ciclar(f.persona.id, c)}
                          title={[t?.nombre ?? 'Libre', c.festivo, c.ausencia?.tipo].filter(Boolean).join(' · ')}
                          className={cn('flex h-9 w-full min-w-[44px] items-center justify-center rounded-md text-[11px] font-semibold transition', ch && 'ring-2 ring-primary', data.editable && 'hover:opacity-80', !t && 'bg-sunken text-muted')}
                          style={t ? { background: `${t.color}26`, color: t.color } : undefined}
                        >
                          {c.ausencia ? <span style={{ color: c.ausencia.color }}>{c.ausencia.tipo.slice(0, 3)}</span> : c.festivo ? 'Fest.' : t ? t.nombre.slice(0, 3) : '—'}
                        </button>
                      </td>
                    );
                  })}
                  <td className="tabular px-2 text-right">{fmtHours(f.horas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
