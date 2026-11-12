import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlarmClock, Users } from 'lucide-react';
import { fmtDate, ficShared, optionLabel } from '@kite/shared';
import { useApi, useDebounced } from '@/lib/hooks';
import { Badge, Card, CardHeader, Checkbox, DataTable, EnumBadge, PageHeader, SearchInput } from '@/components/ui';

interface Fila {
  id: string;
  nombre: string;
  puesto: string | null;
  departamento: string | null;
  activo: boolean;
  tieneFicha: boolean;
  dni: string | null;
  categoria: string | null;
  tipoContrato: string | null;
  fechaAlta: string | null;
  finContrato: string | null;
  validado: boolean;
  cambioPendiente: boolean;
  alertas: number;
}

/** Plantilla para RRHH: contrato de cada persona, datos sin validar y avisos de los próximos días. */
export default function Plantilla() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [inactivos, setInactivos] = useState(false);
  const { data, isLoading } = useApi<Fila[]>(`/fic/plantilla?q=${encodeURIComponent(dq)}${inactivos ? '&inactivos=1' : ''}`);
  const alertas = useApi<any[]>('/fic/alertas?dias=60');
  return (
    <>
      <PageHeader title="Plantilla" icon={Users} subtitle="Contratos, datos laborales y avisos de vencimientos de cada persona." />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4">
            <SearchInput value={q} onChange={setQ} placeholder="Nombre o DNI" className="min-w-[200px] flex-1" />
            <Checkbox checked={inactivos} onChange={setInactivos} label="Incluir bajas" />
          </div>
          <DataTable
            loading={isLoading}
            rows={data ?? []}
            onRowClick={(r) => nav(`/personas/${r.id}?tab=fic-ficha`)}
            columns={[
              { key: 'nombre', header: 'Persona', cell: (r) => <span className="font-medium">{r.nombre}</span> },
              { key: 'puesto', header: 'Puesto', hideBelow: 'lg', cell: (r) => r.puesto ?? '—' },
              { key: 'contrato', header: 'Contrato', cell: (r) => (r.tipoContrato ? <EnumBadge options={ficShared.TIPOS_CONTRATO} value={r.tipoContrato} dot={false} /> : <Badge tone="yellow">Sin ficha</Badge>) },
              { key: 'alta', header: 'Alta', hideBelow: 'md', cell: (r) => (r.fechaAlta ? fmtDate(r.fechaAlta) : '—') },
              { key: 'fin', header: 'Fin de contrato', hideBelow: 'md', cell: (r) => (r.finContrato ? fmtDate(r.finContrato) : '—') },
              {
                key: 'estado',
                header: '',
                cell: (r) => (
                  <span className="flex flex-wrap gap-1">
                    {!r.activo && <Badge tone="red">Baja</Badge>}
                    {r.cambioPendiente && <Badge tone="violet">Cambios por validar</Badge>}
                    {r.tieneFicha && !r.validado && <Badge tone="gray">Sin validar</Badge>}
                    {r.alertas > 0 && <Badge tone="orange">{r.alertas} avisos</Badge>}
                  </span>
                ),
              },
            ]}
            mobileSubtitle={(r) => [r.puesto, r.tipoContrato ? optionLabel(ficShared.TIPOS_CONTRATO, r.tipoContrato)?.label : 'Sin ficha'].filter(Boolean).join(' · ')}
            mobileRight={(r) => (r.alertas ? <Badge tone="orange">{r.alertas}</Badge> : null)}
          />
        </Card>
        <Card className="h-fit overflow-hidden">
          <CardHeader title="Próximos vencimientos" icon={AlarmClock} subtitle="60 días" />
          {!alertas.data?.length ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">Nada vence pronto.</p>
          ) : (
            <ul className="divide-y divide-line">
              {alertas.data.slice(0, 25).map((a) => (
                <li key={a.id}>
                  <Link to={a.enlace} className="block px-4 py-2.5 hover:bg-sunken">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13.5px] font-medium">{a.persona}</span>
                      <Badge tone={a.dias <= 7 ? 'red' : a.dias <= 15 ? 'orange' : 'gray'}>{a.dias < 0 ? 'Vencido' : a.dias === 0 ? 'Hoy' : `${a.dias} días`}</Badge>
                    </span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {optionLabel(ficShared.ALERTA_TIPOS, a.tipo)?.label} · {a.detalle} · {fmtDate(a.fecha)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
