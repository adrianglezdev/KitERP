import { Link } from 'react-router-dom';
import { BookOpen, Download } from 'lucide-react';
import { dtcShared } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { EmptyState, EnumBadge, IconButton, Spinner } from '@/components/ui';

/** Pestaña con los documentos técnicos vinculados a un artículo, cliente o proveedor. */
export default function DocsVinculadosTab({ id, entidad }: { id: string; record?: any; entidad?: string }) {
  const { can } = useSession();
  const { data, isLoading } = useApi<any[]>(`/dtc/vinculados?entidad=${entidad ?? "articulo"}&id=${id}`);
  if (isLoading) return <Spinner />;
  return (
    <div>
      {!data?.length ? (
        <EmptyState icon={BookOpen} title="Sin documentación vinculada">
          {can('dtc.editar') && 'Vincula manuales o fichas técnicas desde la ficha del documento.'}
        </EmptyState>
      ) : (
        <ul className="-my-2 divide-y divide-line">
          {data.map((d) => (
            <li key={d.vinculoId} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link to={`/dtc/documentos/${d.id}`} className="block truncate text-[13.5px] font-medium hover:text-primary">
                  {d.titulo}
                </Link>
                <p className="flex items-center gap-1.5 text-[12px] text-muted">
                  {d.codigo} · <EnumBadge options={dtcShared.DTC_TIPOS} value={d.tipo} dot={false} />
                  {d.version ? ` · v${d.version}` : ' · sin versión vigente'}
                </p>
              </div>
              {d.url && (
                <a href={d.url} target="_blank" rel="noreferrer">
                  <IconButton icon={Download} label="Abrir archivo" size="sm" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
