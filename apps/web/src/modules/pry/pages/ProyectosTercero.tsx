import { Link } from 'react-router-dom';
import { pryShared } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { EnumBadge, ProgressBar, Spinner } from '@/components/ui';

export default function ProyectosTercero({ id }: { id: string }) {
  const { data, isLoading } = useApi<any>(`/pry/proyectos?clienteId=${id}&pageSize=50`);
  if (isLoading) return <Spinner />;
  if (!data?.items.length) return <p className="text-center text-[13px] text-muted">Sin proyectos.</p>;
  return (
    <ul className="-my-2 divide-y divide-line">
      {data.items.map((p: any) => (
        <li key={p.id}>
          <Link to={`/proyectos/${p.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">
                {p.codigo} · {p.nombre}
              </span>
              <span className="mt-1 block w-40">
                <ProgressBar value={p.avance} />
              </span>
            </span>
            <EnumBadge options={pryShared.PROYECTO_ESTADOS} value={p.estado} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
