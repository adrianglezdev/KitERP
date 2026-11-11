import { Link } from 'react-router-dom';
import { CheckCheck, Eye } from 'lucide-react';
import { dtcShared, fmtDate } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Button, Card, EmptyState, EnumBadge, PageHeader, Spinner } from '@/components/ui';

/** Documentos distribuidos a mi departamento cuya versión vigente aún no he leído. */
export default function Pendientes() {
  const { data, isLoading } = useApi<any[]>('/dtc/pendientes-leer');
  const leido = useMut((id: string) => api.post(`/dtc/documentos/${id}/leido`, {}), { ok: 'Lectura registrada', invalidate: ['/dtc'] });
  return (
    <>
      <PageHeader title="Pendientes de leer" icon={Eye} subtitle="Documentos que tu departamento debe conocer. Ábrelos y confirma que los has leído." />
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={CheckCheck} title="Estás al día">
            No tienes documentación pendiente de leer.
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {data.map((d) => (
              <li key={d.versionId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/dtc/documentos/${d.id}`} className="block truncate text-[14px] font-semibold hover:text-primary">
                    {d.titulo}
                  </Link>
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                    {d.codigo} · <EnumBadge options={dtcShared.DTC_TIPOS} value={d.tipo} dot={false} /> · versión {d.version}
                    {d.aprobadoEn && ` · publicada el ${fmtDate(d.aprobadoEn)}`}
                  </p>
                  {d.resumenCambios && <p className="mt-1 text-[13px] text-fg/80">Cambios: {d.resumenCambios}</p>}
                </div>
                <Link to={`/dtc/documentos/${d.id}`}>
                  <Button size="sm">Abrir</Button>
                </Link>
                <Button size="sm" variant="primary" icon={CheckCheck} loading={leido.isPending && leido.variables === d.id} onClick={() => leido.mutate(d.id)}>
                  Leído
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
