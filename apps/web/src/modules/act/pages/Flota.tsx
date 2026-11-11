import { useNavigate } from 'react-router-dom';
import { Car } from 'lucide-react';
import { fmtDate, fmtMoney } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { Card, DataTable, EnumBadge, PageHeader, Stat } from '@/components/ui';
import { ACTIVO_ESTADOS } from '../comun';

/** Cuadro de mando de la flota: coste anual, coste por km y consumo de cada vehículo. */
export default function Flota() {
  const nav = useNavigate();
  const { data, isLoading } = useApi<any>('/act/flota');
  const r = data?.resumen;
  return (
    <>
      <PageHeader title="Flota" icon={Car} subtitle="Costes del último año: combustible, mantenimiento, seguros, multas…" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vehículos" value={r?.vehiculos ?? '…'} tone="violet" />
        <Stat label="Coste último año" value={r ? fmtMoney(r.costeAnio) : '…'} tone="yellow" />
        <Stat label="Km recorridos" value={r ? r.kmRecorridos.toLocaleString('es-ES') : '…'} tone="green" />
        <Stat label="Coste medio por km" value={r?.costeKm != null ? `${r.costeKm.toLocaleString('es-ES')} €` : '—'} tone="violet" />
      </div>
      <Card className="overflow-hidden">
        <DataTable
          rows={data?.vehiculos ?? []}
          loading={isLoading}
          onRowClick={(v: any) => nav(`/activos/${v.id}`)}
          empty="No hay vehículos."
          columns={[
            { key: 'nombre', header: 'Vehículo', cell: (v: any) => <span className="font-medium">{v.nombre}</span> },
            { key: 'matricula', header: 'Matrícula', cell: (v: any) => v.matricula ?? '—' },
            { key: 'asignado', header: 'Lo lleva', cell: (v: any) => v.asignado ?? '—', hideBelow: 'md' },
            { key: 'estado', header: 'Estado', cell: (v: any) => <EnumBadge options={ACTIVO_ESTADOS} value={v.estado} />, hideBelow: 'lg' },
            { key: 'km', header: 'Km', align: 'right', cell: (v: any) => (v.km ?? 0).toLocaleString('es-ES'), hideBelow: 'md' },
            { key: 'coste', header: 'Coste año', align: 'right', cell: (v: any) => fmtMoney(v.costes.ultimoAnio) },
            { key: 'ckm', header: '€/km', align: 'right', cell: (v: any) => (v.costes.costeKm != null ? v.costes.costeKm.toLocaleString('es-ES') : '—'), hideBelow: 'md' },
            { key: 'cons', header: 'l/100', align: 'right', cell: (v: any) => v.costes.consumo100 ?? '—', hideBelow: 'lg' },
            { key: 'prox', header: 'Próximo vencimiento', cell: (v: any) => (v.proximoVencimiento ? `${v.proximoVencimiento.descripcion || v.proximoVencimiento.tipo} · ${fmtDate(v.proximoVencimiento.fecha)}` : '—'), hideBelow: 'xl' },
          ]}
          mobileTitle={(v: any) => `${v.nombre}${v.matricula ? ` · ${v.matricula}` : ''}`}
          mobileSubtitle={(v: any) => v.asignado ?? 'Sin asignar'}
          mobileRight={(v: any) => fmtMoney(v.costes.ultimoAnio)}
        />
      </Card>
    </>
  );
}
