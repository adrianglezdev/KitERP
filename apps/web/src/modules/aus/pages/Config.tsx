import { Settings2, Sparkles } from 'lucide-react';
import { ausShared } from '@kite/shared';
import { api } from '@/lib/api';
import { useMut } from '@/lib/hooks';
import { Alert, Button, PageHeader, useConfirm } from '@/components/ui';
import { ResourceList } from '@/components/resource';

/** Configuración de ausencias: tipos (vacaciones, permisos, bajas), saldos por persona y mínimos por departamento. */
export default function Config() {
  const confirm = useConfirm();
  const anio = new Date().getFullYear();
  const generar = useMut((a: number) => api.post<{ creados: number }>('/aus/saldos/generar', { anio: a }), { ok: (r) => `${r.creados} saldos creados`, invalidate: ['/aus'] });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tipos y saldos de ausencia"
        icon={Settings2}
        actions={
          <Button icon={Sparkles} onClick={async () => (await confirm({ title: `Generar saldos de ${anio + 1}`, message: 'Crea el saldo de cada persona para el año siguiente con los días de cada tipo y el arrastre permitido. No modifica los saldos que ya existan.', confirm: 'Generar' })) && generar.mutate(anio + 1)}>
            Saldos de {anio + 1}
          </Button>
        }
      />
      <Alert tone="violet">El calendario laboral (festivos nacionales, autonómicos y locales) está en Configuración → Calendario laboral y lo usan a la vez las ausencias y el control horario.</Alert>
      <ResourceList def={ausShared.tipoAusenciaResource} endpoint="/aus/tipos" createPerm="aus.gestionar" title={<h2 className="text-[16px] font-bold">Tipos de ausencia</h2>} />
      <ResourceList def={ausShared.saldoResource} endpoint="/aus/saldos" createPerm="aus.gestionar" title={<h2 className="text-[16px] font-bold">Saldos por persona</h2>} />
      <ResourceList def={ausShared.minimoResource} endpoint="/aus/minimos" createPerm="aus.gestionar" title={<h2 className="text-[16px] font-bold">Mínimo de personas por departamento</h2>} />
    </div>
  );
}
