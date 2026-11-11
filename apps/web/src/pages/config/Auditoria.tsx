import { useState } from 'react';
import { History } from 'lucide-react';
import { fmtDateTime } from '@kite/shared';
import { qs } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Alert, Button, Card, DataTable, Dialog, Input } from '@/components/ui';

export default function Auditoria() {
  const [page, setPage] = useState(1);
  const [entidad, setEntidad] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const { data, isLoading } = useApi<{ items: any[] }>(`/auditoria${qs({ page, entidad, desde, hasta })}`, { placeholderData: (p) => p });
  const [ver, setVer] = useState<any | null>(null);
  return (
    <div className="space-y-4">
      <Alert tone="violet" icon={History}>Cada creación, cambio, borrado, inicio de sesión sensible o firma queda registrado con quién, cuándo, desde qué IP y qué cambió. Este registro no se puede modificar ni borrar.</Alert>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <Input placeholder="Tipo de registro (p. ej. documento, tercero)" value={entidad} onChange={(e) => { setEntidad(e.target.value); setPage(1); }} className="max-w-xs" />
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-[150px]" aria-label="Desde" />
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-[150px]" aria-label="Hasta" />
        </div>
        <DataTable
          loading={isLoading}
          dense
          rows={data?.items ?? []}
          onRowClick={setVer}
          columns={[
            { key: 'fecha', header: 'Fecha', cell: (r) => fmtDateTime(r.creadoEn) },
            { key: 'usuario', header: 'Usuario', cell: (r) => r.usuario ?? 'Sistema' },
            { key: 'accion', header: 'Acción', cell: (r) => r.accion.replace(/_/g, ' ') },
            { key: 'entidad', header: 'Registro', cell: (r) => r.entidad },
            { key: 'ip', header: 'IP', hideBelow: 'lg', cell: (r) => r.ip ?? '—' },
          ]}
          mobileTitle={(r) => `${r.accion.replace(/_/g, ' ')} · ${r.entidad}`}
          mobileSubtitle={(r) => `${r.usuario ?? 'Sistema'} · ${fmtDateTime(r.creadoEn)}`}
        />
        <div className="flex justify-between border-t border-line p-3">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anteriores
          </Button>
          <Button size="sm" disabled={(data?.items.length ?? 0) < 50} onClick={() => setPage(page + 1)}>
            Siguientes
          </Button>
        </div>
      </Card>
      <Dialog open={!!ver} onOpenChange={(o) => !o && setVer(null)} title="Detalle del cambio" size="lg">
        <pre className="scroll-thin max-h-[60vh] overflow-auto rounded-lg bg-sunken p-3 text-[12px]">{JSON.stringify(ver?.cambios, null, 2)}</pre>
      </Dialog>
    </div>
  );
}
