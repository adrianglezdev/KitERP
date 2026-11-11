import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, CalendarPlus, X } from 'lucide-react';
import { fmtNumber } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Button, Card, CardHeader, EmptyState, PageHeader, Skeleton, useConfirm } from '@/components/ui';
import { EstadoBadge, SaldoCard, SolicitudDialog, rango, type SaldoResumen } from '../comun';

/** Vacaciones y permisos del propio trabajador: saldo del año, lo pedido y botón para pedir. */
export default function MisAusencias() {
  const [sp, setSp] = useSearchParams();
  const confirm = useConfirm();
  const [nueva, setNuevaRaw] = useState(sp.get('nueva') === '1');
  const setNueva = (v: boolean) => {
    setNuevaRaw(v);
    if (!v && sp.get('nueva')) setSp({}, { replace: true });
  };
  const resumen = useApi<{ anio: number; saldos: SaldoResumen[] }>('/aus/resumen');
  const mias = useApi<any[]>('/aus/solicitudes?mias=1');
  const cancelar = useMut((id: string) => api.post(`/aus/solicitudes/${id}/cancelar`), { ok: 'Solicitud cancelada', invalidate: ['/aus', '/aprobaciones'] });
  return (
    <>
      <PageHeader
        title="Mis vacaciones y permisos"
        icon={CalendarDays}
        actions={
          <Button variant="primary" icon={CalendarPlus} onClick={() => setNueva(true)}>
            Pedir días
          </Button>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {resumen.isLoading ? <Skeleton className="h-32 rounded-xl" /> : resumen.data?.saldos.map((s) => <SaldoCard key={s.tipoId} s={s} />)}
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Mis solicitudes" />
        {!mias.data?.length ? (
          <EmptyState icon={CalendarDays} title="Aún no has pedido nada este año" />
        ) : (
          <ul className="divide-y divide-line">
            {mias.data.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">
                    {s.tipo} · {rango(s.desde, s.hasta, s.medioDia)}
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {fmtNumber(s.dias, 1)} días{s.motivoRechazo ? ` · ${s.motivoRechazo}` : ''}
                  </p>
                </div>
                <EstadoBadge estado={s.estado} />
                {s.puedeCancelar && (
                  <Button size="sm" variant="ghost" icon={X} onClick={async () => (await confirm({ title: 'Cancelar solicitud', message: 'Los días vuelven a tu saldo.', confirm: 'Cancelar solicitud' })) && cancelar.mutate(s.id)}>
                    Cancelar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <SolicitudDialog open={nueva} onOpenChange={setNueva} />
    </>
  );
}
