import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { fmtNumber } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Button, Spinner } from '@/components/ui';
import { EstadoBadge, SaldoCard, SolicitudDialog, rango, type SaldoResumen } from '../comun';

/** Pestaña "Ausencias" en la ficha de persona: saldos del año y sus solicitudes. */
export default function AusenciasPersona({ id }: { id: string }) {
  const { can } = useSession();
  const [nueva, setNueva] = useState(false);
  const resumen = useApi<{ saldos: SaldoResumen[] }>(`/aus/resumen?personaId=${id}`);
  const sols = useApi<any[]>(`/aus/solicitudes?personaId=${id}`);
  if (resumen.isLoading) return <Spinner />;
  return (
    <div className="space-y-5">
      {can('aus.gestionar') && (
        <div className="flex justify-end">
          <Button icon={CalendarPlus} onClick={() => setNueva(true)}>
            Registrar ausencia
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">{resumen.data?.saldos.map((s) => <SaldoCard key={s.tipoId} s={s} />)}</div>
      <ul className="divide-y divide-line rounded-xl border border-line-strong/70">
        {(sols.data ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-[13.5px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1">
              {s.tipo} · {rango(s.desde, s.hasta, s.medioDia)} · {fmtNumber(s.dias, 1)} días
            </span>
            <EstadoBadge estado={s.estado} />
          </li>
        ))}
        {!sols.data?.length && <li className="px-3 py-4 text-center text-[13px] text-muted">Sin ausencias registradas.</li>}
      </ul>
      <SolicitudDialog open={nueva} onOpenChange={setNueva} personaId={id} />
    </div>
  );
}
