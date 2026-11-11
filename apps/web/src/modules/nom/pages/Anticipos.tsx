import { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Card, EmptyState, PageHeader, Segmented, Spinner, useConfirm } from '@/components/ui';
import { AnticipoFila } from '../comun';

export default function Anticipos() {
  const [estado, setEstado] = useState('pendiente');
  const { data, isLoading } = useApi<any[]>(`/nom/anticipos${estado ? `?estado=${estado}` : ''}`);
  const confirm = useConfirm();
  const accion = useMut(({ url, body }: { url: string; body?: unknown }) => api.post(url, body ?? {}), { ok: 'Hecho', invalidate: ['/nom/anticipos'] });
  return (
    <>
      <PageHeader title="Anticipos" icon={HandCoins} subtitle="Al aprobarlo se añade como descuento en la nómina del mes y se crea el pago en tesorería." />
      <Segmented className="mb-3" value={estado} onChange={setEstado} options={[{ value: 'pendiente', label: 'Pendientes' }, { value: 'aprobado', label: 'Aprobados' }, { value: 'rechazado', label: 'Rechazados' }, { value: '', label: 'Todos' }]} />
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={HandCoins} title="No hay anticipos" />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {data.map((a) => (
              <AnticipoFila
                key={a.id}
                a={a}
                onAprobar={() => accion.mutate({ url: `/nom/anticipos/${a.id}/aprobar` })}
                onRechazar={async () => {
                  const motivo = await confirm({ title: 'Rechazar el anticipo', confirm: 'Rechazar', danger: true, input: { label: 'Motivo (opcional)' } });
                  if (motivo !== false) accion.mutate({ url: `/nom/anticipos/${a.id}/rechazar`, body: { motivo: typeof motivo === 'string' && motivo ? motivo : null } });
                }}
              />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
