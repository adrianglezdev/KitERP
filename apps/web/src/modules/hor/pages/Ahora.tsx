import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, MapPinOff, Users } from 'lucide-react';
import { fmtHours } from '@kite/shared';
import { download } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, RefSelect, Segmented, Spinner } from '@/components/ui';
import { IncidenciaBadge, NOTA_LEGAL_REGISTRO, hora, mesLocal } from '../comun';

interface Fila {
  personaId: string;
  nombre: string;
  puesto: string | null;
  departamento: string | null;
  estado: 'trabajando' | 'pausa' | 'fuera';
  desde: string | null;
  ultimo: { tipo: string; momento: string; dentroGeovalla: boolean | null; origen: string } | null;
  horasHoy: number;
  turno: { nombre: string; inicio: string; fin: string } | null;
  ausencia: { tipo: string } | string | null;
  festivo: string | null;
  incidencias: { tipo: string; detalle: string }[];
}

const ESTADO = {
  trabajando: { label: 'Trabajando', tone: 'green' as const },
  pausa: { label: 'En pausa', tone: 'yellow' as const },
  fuera: { label: 'Fuera', tone: 'gray' as const },
};

/** Quién está trabajando ahora mismo en el equipo, con sus horas de hoy, y descarga del registro oficial. */
export default function Ahora() {
  const [departamento, setDepartamento] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'trabajando' | 'fuera'>('todos');
  const [mes, setMes] = useState(mesLocal());
  const { data, isLoading } = useApi<Fila[]>(`/hor/ahora${departamento ? `?departamentoId=${departamento}` : ''}`, { refetchInterval: 60_000 });
  const filas = (data ?? []).filter((f) => filtro === 'todos' || (filtro === 'trabajando' ? f.estado !== 'fuera' : f.estado === 'fuera'));
  const n = (e: string) => (data ?? []).filter((f) => f.estado === e).length;
  const ausenciaTexto = (a: Fila['ausencia']) => (a ? (typeof a === 'string' ? a : a.tipo) : null);

  return (
    <>
      <PageHeader title="Equipo ahora" icon={Users} subtitle={`${n('trabajando')} trabajando · ${n('pausa')} en pausa · ${n('fuera')} fuera`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={filtro} onChange={setFiltro} options={[{ value: 'todos', label: 'Todos' }, { value: 'trabajando', label: 'Dentro' }, { value: 'fuera', label: 'Fuera' }]} />
        <div className="w-full sm:w-60">
          <RefSelect target="departamentos" value={departamento} onChange={setDepartamento} placeholder="Todos los departamentos" />
        </div>
      </div>
      {isLoading ? (
        <Spinner />
      ) : !filas.length ? (
        <Card>
          <EmptyState icon={Users} title="Nadie en esta vista" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filas.map((f) => (
            <Link key={f.personaId} to={`/personas/${f.personaId}?tab=hor-fichajes`} className="rounded-xl border border-line bg-surface p-4 shadow-card transition hover:border-primary/40">
              <div className="flex items-start gap-3">
                <Avatar name={f.nombre} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{f.nombre}</p>
                  <p className="truncate text-[12.5px] text-muted">{[f.puesto, f.departamento].filter(Boolean).join(' · ')}</p>
                </div>
                <Badge tone={ESTADO[f.estado].tone} dot>
                  {ESTADO[f.estado].label}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                <span className="tabular font-semibold text-fg">{fmtHours(f.horasHoy)} hoy</span>
                {f.desde && f.estado !== 'fuera' && <span>desde las {hora(f.desde)}</span>}
                {f.turno && <span>· turno {f.turno.nombre}</span>}
                {ausenciaTexto(f.ausencia) && <Badge tone="blue">{ausenciaTexto(f.ausencia)}</Badge>}
                {f.festivo && <Badge tone="brown">{f.festivo}</Badge>}
                {f.ultimo?.dentroGeovalla === false && (
                  <span className={cn('inline-flex items-center gap-1 text-warn')}>
                    <MapPinOff className="h-3.5 w-3.5" /> fuera del centro
                  </span>
                )}
              </div>
              {f.incidencias.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {f.incidencias.map((i) => (
                    <IncidenciaBadge key={i.tipo} tipo={i.tipo} />
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      <Card className="mt-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-primary" /> Registro de jornada oficial
            </p>
            <p className="text-[12.5px] text-muted">{NOTA_LEGAL_REGISTRO}</p>
          </div>
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-[170px]" aria-label="Mes" />
          <Button icon={Download} onClick={() => download(`/hor/registro?mes=${mes}&format=xlsx${departamento ? `&departamentoId=${departamento}` : ''}`)}>
            Excel
          </Button>
          <Button icon={Download} onClick={() => download(`/hor/registro?mes=${mes}&format=pdf${departamento ? `&departamentoId=${departamento}` : ''}`)}>
            PDF
          </Button>
        </div>
      </Card>
    </>
  );
}
