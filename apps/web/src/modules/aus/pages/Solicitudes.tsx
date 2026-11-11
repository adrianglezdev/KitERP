import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck2, CalendarPlus, Check, Paperclip, X } from 'lucide-react';
import { fmtNumber } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Card, DataTable, PageHeader, RefSelect, Segmented, useConfirm } from '@/components/ui';
import { ESTADOS, EstadoBadge, SolicitudDialog, rango } from '../comun';

/** Solicitudes del equipo: aprobar o rechazar y, para RRHH, registrar bajas y permisos. */
export default function Solicitudes() {
  const { can } = useSession();
  const confirm = useConfirm();
  const [estado, setEstado] = useState('pendiente,aprobada_responsable');
  const [registrar, setRegistrar] = useState<string | null>(null);
  const [elegir, setElegir] = useState(false);
  const { data, isLoading } = useApi<any[]>(`/aus/solicitudes${estado ? `?estado=${estado}` : ''}`);
  const decidir = useMut((p: { id: string; ok: boolean; motivo?: string }) => api.post(`/aus/solicitudes/${p.id}/${p.ok ? 'aprobar' : 'rechazar'}`, p.motivo ? { motivo: p.motivo } : {}), {
    ok: 'Hecho',
    invalidate: ['/aus', '/aprobaciones'],
  });
  return (
    <>
      <PageHeader
        title="Solicitudes de ausencia"
        icon={CalendarCheck2}
        actions={
          can('aus.gestionar') && (
            <Button icon={CalendarPlus} onClick={() => setElegir(true)}>
              Registrar una ausencia
            </Button>
          )
        }
      />
      <Segmented
        className="mb-4"
        value={estado}
        onChange={setEstado}
        options={[{ value: 'pendiente,aprobada_responsable', label: 'Por aprobar' }, { value: 'aprobada', label: 'Aprobadas' }, { value: 'rechazada,cancelada', label: 'Rechazadas o canceladas' }, { value: '', label: 'Todas' }]}
      />
      <Card className="overflow-hidden">
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          columns={[
            { key: 'persona', header: 'Persona', cell: (r) => <Link to={`/personas/${r.personaId}?tab=aus-ausencias`} className="font-medium hover:text-primary">{r.persona}</Link> },
            { key: 'tipo', header: 'Tipo', cell: (r) => <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.tipo}</span> },
            { key: 'fechas', header: 'Fechas', cell: (r) => rango(r.desde, r.hasta, r.medioDia) },
            { key: 'dias', header: 'Días', align: 'right', cell: (r) => fmtNumber(r.dias, 1) },
            { key: 'just', header: '', hideBelow: 'md', cell: (r) => (r.justificanteUrl ? <a href={r.justificanteUrl} target="_blank" rel="noreferrer" className="text-primary" aria-label="Ver justificante"><Paperclip className="h-4 w-4" /></a> : null) },
            { key: 'estado', header: 'Estado', cell: (r) => <EstadoBadge estado={r.estado} /> },
            {
              key: 'acc',
              header: '',
              cell: (r) =>
                r.puedeAprobar ? (
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      icon={X}
                      onClick={async () => {
                        const m = await confirm({ title: 'Rechazar solicitud', input: { label: 'Motivo', required: true }, danger: true, confirm: 'Rechazar' });
                        if (typeof m === 'string') decidir.mutate({ id: r.id, ok: false, motivo: m });
                      }}
                    >
                      <span className="sr-only">Rechazar</span>
                    </Button>
                    <Button size="sm" variant="success" icon={Check} onClick={() => decidir.mutate({ id: r.id, ok: true })}>
                      Aprobar
                    </Button>
                  </span>
                ) : null,
            },
          ]}
          mobileTitle={(r) => `${r.persona} · ${r.tipo}`}
          mobileSubtitle={(r) => `${rango(r.desde, r.hasta, r.medioDia)} · ${fmtNumber(r.dias, 1)} días`}
          mobileRight={(r) => (r.puedeAprobar ? <Button size="sm" variant="success" icon={Check} onClick={() => decidir.mutate({ id: r.id, ok: true })}>Aprobar</Button> : <EstadoBadge estado={r.estado} />)}
        />
      </Card>
      {elegir && (
        <Card className="mt-4 flex flex-wrap items-end gap-2 p-4">
          <div className="w-72">
            <RefSelect target="personas" value={registrar} onChange={setRegistrar} placeholder="¿Para quién?" />
          </div>
          <Button variant="ghost" onClick={() => setElegir(false)}>
            Cancelar
          </Button>
        </Card>
      )}
      {registrar && <SolicitudDialog open onOpenChange={(o) => { if (!o) { setRegistrar(null); setElegir(false); } }} personaId={registrar} />}
      <span className="hidden">{ESTADOS.length}</span>
    </>
  );
}
