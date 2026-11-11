import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Hourglass, Plus } from 'lucide-react';
import { fmtDate, fmtHours } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button, Card, DataTable, Dialog, Field, Input, NumberInput, PageHeader, RefSelect, useConfirm } from '@/components/ui';
import { mesLocal } from '../comun';

/** Bolsa de horas: horas a favor o en contra de cada persona (diferencia entre lo trabajado y lo previsto). */
export default function Bolsa() {
  const { can } = useSession();
  const confirm = useConfirm();
  const { data, isLoading } = useApi<{ personas: { personaId: string; nombre: string; departamento: string | null; saldo: number; ultimo: string | null }[] }>('/hor/bolsa');
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ personaId: null as string | null, horas: null as number | null, concepto: '' });
  const anterior = (() => {
    const [y, m] = mesLocal().split('-').map(Number);
    const d = new Date(Date.UTC(y!, m! - 2, 15));
    return d.toISOString().slice(0, 7);
  })();
  const crear = useMut(() => api.post('/hor/bolsa', f), { ok: 'Movimiento añadido', invalidate: ['/hor/bolsa'], onSuccess: () => setNuevo(false) });
  const cerrar = useMut(() => api.post<{ personas?: number }>('/hor/bolsa/cerrar-mes', { mes: anterior }), { ok: 'Mes llevado a la bolsa', invalidate: ['/hor/bolsa'] });
  return (
    <>
      <PageHeader
        title="Bolsa de horas"
        icon={Hourglass}
        subtitle="Horas a favor (positivas) o pendientes de recuperar (negativas) de cada persona."
        actions={
          can('hor.gestionar') && (
            <>
              <Button onClick={async () => (await confirm({ title: `Cerrar ${anterior}`, message: 'Se añadirá a la bolsa de cada persona la diferencia entre lo trabajado y lo previsto en ese mes. Solo se hace una vez por mes.', confirm: 'Cerrar mes' })) && cerrar.mutate(undefined)}>
                Cerrar el mes anterior
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setNuevo(true)}>
                Ajuste manual
              </Button>
            </>
          )
        }
      />
      <Card className="overflow-hidden">
        <DataTable
          loading={isLoading}
          rows={(data?.personas ?? []).map((p) => ({ ...p, id: p.personaId }))}
          columns={[
            { key: 'nombre', header: 'Persona', cell: (r) => <Link to={`/personas/${r.personaId}?tab=hor-fichajes`} className="font-medium hover:text-primary">{r.nombre}</Link> },
            { key: 'dep', header: 'Departamento', hideBelow: 'md', cell: (r) => r.departamento ?? '—' },
            { key: 'ultimo', header: 'Último movimiento', hideBelow: 'md', cell: (r) => (r.ultimo ? fmtDate(r.ultimo) : '—') },
            { key: 'saldo', header: 'Saldo', align: 'right', cell: (r) => <span className={cn('font-semibold', r.saldo > 0 ? 'text-ok' : r.saldo < 0 ? 'text-bad' : 'text-muted')}>{r.saldo > 0 ? '+' : ''}{fmtHours(r.saldo)}</span> },
          ]}
          mobileRight={(r) => <span className={cn('font-semibold', r.saldo > 0 ? 'text-ok' : r.saldo < 0 ? 'text-bad' : 'text-muted')}>{fmtHours(r.saldo)}</span>}
        />
      </Card>
      <Dialog open={nuevo} onOpenChange={setNuevo} title="Ajuste de la bolsa de horas" size="sm" footer={<Button variant="primary" disabled={!f.personaId || !f.horas || f.concepto.length < 2} loading={crear.isPending} onClick={() => crear.mutate(undefined)}>Guardar</Button>}>
        <div className="space-y-3">
          <Field label="Persona">
            <RefSelect target="personas" value={f.personaId} onChange={(v) => setF({ ...f, personaId: v })} />
          </Field>
          <Field label="Horas" help="Negativas si son horas disfrutadas o a recuperar">
            <NumberInput value={f.horas} onChange={(v) => setF({ ...f, horas: v })} suffix="h" />
          </Field>
          <Field label="Concepto">
            <Input value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} placeholder="Ej.: Compensación por inventario del sábado" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
