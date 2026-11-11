import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, TriangleAlert, X } from 'lucide-react';
import { fmtDate, fmtHours } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, Input, PageHeader, Select, useConfirm } from '@/components/ui';
import { EstadoCorreccion, INCIDENCIA_TIPOS, IncidenciaBadge, hoyLocal } from '../comun';

/**
 * Bandeja del responsable: incidencias calculadas (retrasos, olvidos, excesos) y las correcciones
 * que ha pedido su equipo. Al aprobar una corrección se guarda el fichaje nuevo y se conserva el original.
 */
export default function Incidencias() {
  const confirm = useConfirm();
  const hoy = hoyLocal();
  const [desde, setDesde] = useState(new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(hoy);
  const [tipo, setTipo] = useState('');
  const inc = useApi<any[]>(`/hor/incidencias?desde=${desde}&hasta=${hasta}${tipo ? `&tipo=${tipo}` : ''}`);
  const corr = useApi<any[]>('/hor/correcciones?estado=pendiente');
  const decidir = useMut((p: { id: string; ok: boolean; motivo?: string }) => api.post(`/hor/correcciones/${p.id}/${p.ok ? 'aprobar' : 'rechazar'}`, p.motivo ? { motivo: p.motivo } : {}), {
    ok: 'Corrección resuelta',
    invalidate: ['/hor', '/aprobaciones'],
  });
  const pendientes = (corr.data ?? []).filter((c) => c.puedeAprobar);
  return (
    <>
      <PageHeader title="Incidencias de jornada" icon={TriangleAlert} subtitle="Días con retrasos, fichajes olvidados o jornadas demasiado largas, y correcciones pendientes de tu visto bueno." />
      <Card className="mb-5 overflow-hidden">
        <CardHeader title="Correcciones pendientes" subtitle={`${pendientes.length} esperando tu decisión`} />
        {!pendientes.length ? (
          <p className="px-4 py-5 text-center text-[13px] text-muted">No hay correcciones pendientes.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pendientes.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">
                    {c.persona} · {fmtDate(c.fecha)}
                  </p>
                  <p className="text-[12.5px] text-muted">
                    <EstadoCorreccion c={c} /> · {c.motivo}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    icon={X}
                    onClick={async () => {
                      const m = await confirm({ title: 'Rechazar corrección', input: { label: 'Motivo', required: true }, danger: true, confirm: 'Rechazar' });
                      if (typeof m === 'string') decidir.mutate({ id: c.id, ok: false, motivo: m });
                    }}
                  >
                    Rechazar
                  </Button>
                  <Button size="sm" variant="success" icon={Check} onClick={() => decidir.mutate({ id: c.id, ok: true })}>
                    Aprobar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-[150px]" aria-label="Desde" />
          <span className="text-muted">–</span>
          <Input type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} className="w-[150px]" aria-label="Hasta" />
          <Select className="w-52" value={tipo} onChange={(e) => setTipo(e.target.value)} options={INCIDENCIA_TIPOS} placeholder="Todos los tipos" />
        </div>
        <DataTable
          loading={inc.isLoading}
          rows={inc.data ?? []}
          empty={<EmptyState icon={TriangleAlert} title="Sin incidencias en estas fechas" />}
          columns={[
            { key: 'fecha', header: 'Día', cell: (r) => fmtDate(r.fecha) },
            { key: 'nombre', header: 'Persona', cell: (r) => <Link to={`/personas/${r.personaId}?tab=hor-fichajes`} className="font-medium hover:text-primary">{r.nombre}</Link> },
            { key: 'tipo', header: 'Incidencia', cell: (r) => <IncidenciaBadge tipo={r.tipo} /> },
            { key: 'detalle', header: 'Detalle', hideBelow: 'lg', cell: (r) => <span className="text-muted">{r.detalle}</span> },
            { key: 'horas', header: 'Trabajadas', align: 'right', cell: (r) => fmtHours(r.trabajadas) },
            { key: 'corr', header: '', cell: (r) => (r.correccionPendiente ? <Badge tone="yellow">Corrección pedida</Badge> : null) },
          ]}
          mobileTitle={(r) => r.nombre}
          mobileSubtitle={(r) => `${fmtDate(r.fecha)} · ${r.detalle}`}
          mobileRight={(r) => <IncidenciaBadge tipo={r.tipo} />}
        />
      </Card>
    </>
  );
}
