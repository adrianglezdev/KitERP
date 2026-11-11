import { useState } from 'react';
import { CalendarClock, Check } from 'lucide-react';
import { fmtDate, optionLabel } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Card, DataTable, PageHeader, Segmented } from '@/components/ui';
import { useNavigate } from 'react-router-dom';
import { CompletarDialog, DiasBadge, VENCIMIENTO_TIPOS } from '../comun';

/** Calendario de ITV, seguros, revisiones y calibraciones de todos los activos. */
export default function Vencimientos() {
  const { can } = useSession();
  const nav = useNavigate();
  const [vista, setVista] = useState('90');
  const hasta = vista ? new Date(Date.now() + Number(vista) * 86400_000).toLocaleDateString('sv-SE') : '';
  const { data, isLoading } = useApi<any[]>(`/act/vencimientos?estado=pendiente${hasta ? `&hasta=${hasta}` : ''}`);
  const [completar, setCompletar] = useState<any | null>(null);
  return (
    <>
      <PageHeader title="Vencimientos" icon={CalendarClock} subtitle="Avisan por notificación y correo con la antelación indicada en cada uno." />
      <Segmented className="mb-3" value={vista} onChange={setVista} options={[{ value: '30', label: '30 días' }, { value: '90', label: '90 días' }, { value: '365', label: 'Un año' }, { value: '', label: 'Todos' }]} />
      <Card className="overflow-hidden">
        <DataTable
          rows={data ?? []}
          loading={isLoading}
          onRowClick={(v: any) => nav(`/activos/${v.activoId}`)}
          empty="Nada vence en este periodo."
          columns={[
            { key: 'fecha', header: 'Vence', cell: (v: any) => fmtDate(v.fecha), width: '110px' },
            { key: 'activo', header: 'Activo', cell: (v: any) => <span className="font-medium">{v.activo}{v.matricula ? ` · ${v.matricula}` : ''}</span> },
            { key: 'tipo', header: 'Qué', cell: (v: any) => v.descripcion || optionLabel(VENCIMIENTO_TIPOS, v.tipo)?.label },
            { key: 'asignado', header: 'Lo tiene', cell: (v: any) => v.asignado ?? '—', hideBelow: 'lg' },
            { key: 'dias', header: '', cell: (v: any) => <DiasBadge v={v} /> },
            {
              key: 'x',
              header: '',
              width: '90px',
              cell: (v: any) =>
                can('act.gestionar') && (
                  <Button size="sm" icon={Check} onClick={(e) => { e.stopPropagation(); setCompletar(v); }}>
                    Hecho
                  </Button>
                ),
            },
          ]}
          mobileTitle={(v: any) => `${v.activo} · ${v.descripcion || optionLabel(VENCIMIENTO_TIPOS, v.tipo)?.label}`}
          mobileSubtitle={(v: any) => fmtDate(v.fecha)}
          mobileRight={(v: any) => <DiasBadge v={v} />}
        />
      </Card>
      {completar && <CompletarDialog v={completar} onClose={() => setCompletar(null)} />}
    </>
  );
}
