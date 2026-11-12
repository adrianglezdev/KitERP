import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Network } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { Avatar, PageHeader, Spinner } from '@/components/ui';

interface Nodo {
  id: string;
  nombre: string;
  puesto: string | null;
  responsableId: string | null;
  departamento: string | null;
  color: string | null;
  fotoUrl: string | null;
}

function Rama({ n, hijos }: { n: Nodo; hijos: Map<string, Nodo[]> }) {
  const sub = hijos.get(n.id) ?? [];
  return (
    <li className="relative">
      <Link to={`/personas/${n.id}`} className="relative flex max-w-[560px] items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-card transition hover:bg-sunken/60">
        <Avatar name={n.nombre} src={n.fotoUrl} size={34} />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold">{n.nombre}</span>
          <span className="flex items-center gap-1.5 truncate text-[12px] text-muted">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: n.color ?? 'rgb(var(--primary))' }} />
            {n.puesto ?? '—'}
            {n.departamento ? ` · ${n.departamento}` : ''}
          </span>
        </span>
        {sub.length > 0 && <span className="tag ml-auto shrink-0">{sub.length}</span>}
      </Link>
      {sub.length > 0 && (
        <ul className="ml-7 mt-2.5 space-y-2.5 border-l-2 border-line-strong pl-6">
          {sub.map((h) => (
            <Rama key={h.id} n={h} hijos={hijos} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Organigrama() {
  const { data, isLoading } = useApi<Nodo[]>('/organigrama');
  const { raices, hijos } = useMemo(() => {
    const hijos = new Map<string, Nodo[]>();
    const ids = new Set((data ?? []).map((d) => d.id));
    const raices: Nodo[] = [];
    for (const p of data ?? []) {
      if (p.responsableId && ids.has(p.responsableId)) hijos.set(p.responsableId, [...(hijos.get(p.responsableId) ?? []), p]);
      else raices.push(p);
    }
    return { raices, hijos };
  }, [data]);
  return (
    <>
      <PageHeader title="Organigrama" icon={Network} subtitle="Se genera a partir del responsable directo de cada persona." />
      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="max-w-3xl space-y-3">
          {raices.map((r) => (
            <Rama key={r.id} n={r} hijos={hijos} />
          ))}
        </ul>
      )}
    </>
  );
}
