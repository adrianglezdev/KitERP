import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { qs } from '@/lib/api';
import { useApi, useDebounced } from '@/lib/hooks';
import { useSession } from '@/lib/session';

/**
 * Aviso de posibles duplicados mientras se da de alta un cliente o proveedor
 * (mismo NIF, email o teléfono, o nombre muy parecido). Aparece aunque el duplicado
 * pertenezca a la cartera de otro comercial, para no crear la misma empresa dos veces.
 */
export function DuplicadosTercero({ values, excluir }: { values: Record<string, any>; excluir?: string | null }) {
  const { can } = useSession();
  // se compara como texto para que el retardo no se reinicie en cada pintado
  const clave = useDebounced(JSON.stringify({ nif: values.nif ?? '', email: values.email ?? '', telefono: values.telefono ?? '', nombre: values.nombre ?? '' }), 450);
  const v = JSON.parse(clave) as { nif: string; email: string; telefono: string; nombre: string };
  const activo = can('terceros.gestionar') && (v.nif.length >= 8 || v.email.includes('@') || v.telefono.replace(/\D/g, '').length >= 9 || v.nombre.length >= 4);
  const { data } = useApi<{ id: string; nombre: string; nif: string | null }[]>(activo ? `/terceros-duplicados${qs({ ...v, excluir: excluir ?? undefined })}` : null);
  if (!data?.length) return null;
  return (
    <div className="flex gap-3 rounded-xl bg-warn-soft px-4 py-3 text-[13px] ring-1 ring-inset ring-warn/25">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
      <div>
        <p className="font-semibold text-warn">Puede que ya exista</p>
        <ul className="mt-1 space-y-0.5">
          {data.map((d) => (
            <li key={d.id}>
              <Link to={`/terceros/${d.id}`} target="_blank" className="text-fg underline">
                {d.nombre}
              </Link>
              {d.nif && <span className="text-muted"> · {d.nif}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-muted">Si es la misma empresa, usa la ficha existente. Si no está en tu cartera, pide a su comercial que te la asigne.</p>
      </div>
    </div>
  );
}
