import { Link } from 'react-router-dom';
import { fmtDate } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { EnumBadge, Spinner } from '@/components/ui';
import { ACTIVO_TIPOS } from '../comun';

/** Pestaña "Activos" en la ficha de la persona: lo que tiene ahora y lo que ha tenido. */
export default function ActivosPersona({ id }: { id: string }) {
  const { data, isLoading } = useApi<any>(`/act/persona/${id}`);
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div>
        <p className="label mb-1">Tiene asignado</p>
        {!data.activos.length ? (
          <p className="text-[13px] text-muted">Nada.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line-strong/70">
            {data.activos.map((a: any) => (
              <li key={a.id}>
                <Link to={`/activos/${a.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-sunken">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{a.nombre}</span>
                    <span className="text-[12px] text-muted">
                      {a.codigo}
                      {a.matricula && ` · ${a.matricula}`}
                      {a.proximo && ` · ${a.proximo.descripcion || a.proximo.tipo} el ${fmtDate(a.proximo.fecha)}`}
                    </span>
                  </span>
                  <EnumBadge options={ACTIVO_TIPOS} value={a.tipo} dot={false} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {data.historial.length > 0 && (
        <div>
          <p className="label mb-1">Historial</p>
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line-strong/70 text-[13px]">
            {data.historial.map((h: any) => (
              <li key={h.id} className="flex justify-between gap-3 px-3 py-2">
                <span className="truncate">
                  {h.codigo} · {h.nombre}
                </span>
                <span className="shrink-0 text-muted">
                  {fmtDate(h.desde)} → {h.hasta ? fmtDate(h.hasta) : 'ahora'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
