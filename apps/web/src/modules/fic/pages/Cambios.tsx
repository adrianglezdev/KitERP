import { Link } from 'react-router-dom';
import { Check, UserCheck, X } from 'lucide-react';
import { fmtDateTime } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { relTime } from '@/lib/utils';
import { Button, Card, EmptyState, PageHeader, Spinner, useConfirm } from '@/components/ui';

/** Cambios de datos personales que proponen los trabajadores desde su portal y que RRHH valida. */
export default function Cambios() {
  const confirm = useConfirm();
  const { data, isLoading } = useApi<any[]>('/fic/cambios');
  const decidir = useMut((p: { id: string; ok: boolean; motivo?: string }) => api.post(`/fic/cambios/${p.id}/${p.ok ? 'aprobar' : 'rechazar'}`, p.motivo ? { motivo: p.motivo } : {}), {
    ok: 'Hecho',
    invalidate: ['/fic', '/aprobaciones'],
  });
  return (
    <>
      <PageHeader title="Cambios por validar" icon={UserCheck} subtitle="Datos personales que los trabajadores han actualizado. No se aplican hasta que los validas." />
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={UserCheck} title="No hay cambios pendientes" />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link to={`/personas/${c.personaId}?tab=fic-ficha`} className="text-[15px] font-semibold hover:text-primary">
                    {c.persona}
                  </Link>
                  <p className="text-[12.5px] text-muted" title={fmtDateTime(c.creadoEn)}>
                    Enviado {relTime(c.creadoEn)}
                    {c.comentario ? ` · «${c.comentario}»` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    icon={X}
                    onClick={async () => {
                      const m = await confirm({ title: 'Rechazar cambios', input: { label: 'Motivo (lo verá el trabajador)', required: true }, danger: true, confirm: 'Rechazar' });
                      if (typeof m === 'string') decidir.mutate({ id: c.id, ok: false, motivo: m });
                    }}
                  >
                    Rechazar
                  </Button>
                  <Button size="sm" variant="success" icon={Check} onClick={() => decidir.mutate({ id: c.id, ok: true })}>
                    Validar
                  </Button>
                </div>
              </div>
              <table className="mt-3 w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11.5px] uppercase tracking-wide text-muted">
                    <th className="py-1 font-medium">Dato</th>
                    <th className="py-1 font-medium">Antes</th>
                    <th className="py-1 font-medium">Ahora</th>
                  </tr>
                </thead>
                <tbody>
                  {c.cambios.map((x: any) => (
                    <tr key={x.campo} className="border-t border-line">
                      <td className="py-1.5 pr-3 text-muted">{x.label}</td>
                      <td className="py-1.5 pr-3 line-through decoration-bad/60">{x.antes ?? '—'}</td>
                      <td className="py-1.5 font-medium">{x.despues ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
