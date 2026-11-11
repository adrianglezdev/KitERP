import { useState } from 'react';
import { Euro } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Card, PageHeader, Spinner } from '@/components/ui';
import { NumberInput } from '@/components/form/inputs';

/** Coste por hora de cada persona (sueldo + Seguridad Social / horas): valora las horas imputadas. */
export default function Costes() {
  const { data, isLoading } = useApi<any[]>('/pry/costes-persona');
  return (
    <>
      <PageHeader title="Coste por hora" icon={Euro} subtitle="Solo lo ven quienes gestionan todos los proyectos. Se aplica a las horas que se imputen desde ahora." />
      {isLoading ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {(data ?? []).map((p) => (
              <Fila key={p.personaId} p={p} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Fila({ p }: { p: any }) {
  const [v, setV] = useState<number | null>(p.costeHora != null ? Number(p.costeHora) : null);
  const m = useMut(() => api.put(`/pry/costes-persona/${p.personaId}`, { costeHora: v ?? 0 }), { ok: 'Coste guardado', invalidate: ['/pry/costes-persona'] });
  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">{p.nombre}</span>
        <span className="text-[12px] text-muted">{p.puesto}</span>
      </span>
      <div className="w-36">
        <NumberInput value={v} onChange={setV} suffix="€/h" />
      </div>
      <button type="button" disabled={m.isPending || v === (p.costeHora != null ? Number(p.costeHora) : null)} onClick={() => m.mutate(undefined)} className="text-[12.5px] font-semibold text-primary disabled:opacity-30">
        Guardar
      </button>
    </li>
  );
}
