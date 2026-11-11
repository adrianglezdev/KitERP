import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Pencil, Plus } from 'lucide-react';
import { cntShared, fmtMoney } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useDebounced, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button, Card, Dialog, Field, IconButton, Input, PageHeader, SearchInput, Segmented, Spinner, Tabs, useTab } from '@/components/ui';
import { ResourceList } from '@/components/resource';
import { AnioSelect, Importe, PGC_GRUPOS } from '../comun';

/** Plan General Contable con saldos, centros de coste y ajustes fiscales por tercero. */
export default function PlanCuentas() {
  const tab = useTab('plan');
  return (
    <>
      <PageHeader title="Plan de cuentas" icon={BookOpen} subtitle="PGC de PYMES. Las subcuentas de clientes y proveedores se crean solas." />
      <Tabs
        tabs={[
          { id: 'plan', label: 'Cuentas' },
          { id: 'centros', label: 'Centros de coste' },
          { id: 'fiscal', label: 'Retenciones y 347 por tercero' },
        ]}
      />
      <div className="mt-4">
        {tab === 'plan' && <Plan />}
        {tab === 'centros' && <ResourceList def={cntShared.centroCosteResource} endpoint="/cnt/centros" createPerm="cnt.gestionar" embedded />}
        {tab === 'fiscal' && <ResourceList def={cntShared.terceroFiscalResource} endpoint="/cnt/terceros-fiscal" createPerm="cnt.gestionar" embedded />}
      </div>
    </>
  );
}

function Plan() {
  const { can } = useSession();
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [grupo, setGrupo] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [conMovs, setConMovs] = useState<'todas' | 'saldo'>('saldo');
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const { data, isLoading } = useApi<any[]>(`/cnt/cuentas?anio=${anio}${grupo ? `&grupo=${grupo}` : ''}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`);
  const filas = (data ?? []).filter((c) => conMovs === 'todas' || dq || c.debe || c.haber || c.codigo.length <= 3);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <AnioSelect value={anio} onChange={setAnio} />
        <Segmented value={grupo} onChange={setGrupo} options={[{ value: '', label: 'Todos' }, ...Object.keys(PGC_GRUPOS).map((g) => ({ value: g, label: g }))]} />
        <Segmented value={conMovs} onChange={setConMovs} options={[{ value: 'saldo', label: 'Con movimientos' }, { value: 'todas', label: 'Todas' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Código o nombre" className="sm:ml-auto sm:w-60" />
        {can('cnt.gestionar') && (
          <Button icon={Plus} onClick={() => setEdit(null)}>
            Subcuenta
          </Button>
        )}
      </div>
      {grupo && <p className="text-[13px] text-muted">Grupo {grupo}: {PGC_GRUPOS[grupo]}</p>}
      {isLoading ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {filas.slice(0, 800).map((c) => (
              <li key={c.id} className={cn('flex items-center gap-3 px-4 py-1.5 text-[13px]', c.codigo.length <= 2 && 'bg-sunken/60 font-semibold', !c.subcuenta && 'text-fg/80')}>
                <span className="w-24 shrink-0 font-mono text-[12.5px]" style={{ paddingLeft: Math.min(c.codigo.length - 1, 3) * 8 }}>
                  {c.codigo}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {c.subcuenta ? (
                    <Link to={`/contabilidad/libros?libro=mayor&cuenta=${c.codigo}&anio=${anio}`} className="hover:text-primary">
                      {c.nombre}
                    </Link>
                  ) : (
                    c.nombre
                  )}
                </span>
                <span className="hidden w-28 text-right tabular-nums text-muted md:inline">{c.debe ? fmtMoney(c.debe) : ''}</span>
                <span className="hidden w-28 text-right tabular-nums text-muted md:inline">{c.haber ? fmtMoney(c.haber) : ''}</span>
                <span className="w-28 text-right">{c.saldo ? <Importe v={c.saldo} /> : ''}</span>
                {can('cnt.gestionar') && c.subcuenta ? <IconButton icon={Pencil} label="Renombrar" size="sm" onClick={() => setEdit(c)} /> : <span className="w-7" />}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {edit !== undefined && <CuentaDialog cuenta={edit} onClose={() => setEdit(undefined)} />}
    </div>
  );
}

function CuentaDialog({ cuenta, onClose }: { cuenta: any | null; onClose: () => void }) {
  const [codigo, setCodigo] = useState(cuenta?.codigo ?? '');
  const [nombre, setNombre] = useState(cuenta?.nombre ?? '');
  const m = useMut(() => (cuenta ? api.patch(`/cnt/cuentas/${cuenta.id}`, { nombre }) : api.post('/cnt/cuentas', { codigo, nombre })), { ok: 'Cuenta guardada', invalidate: ['/cnt/cuentas'], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={cuenta ? `Cuenta ${cuenta.codigo}` : 'Nueva subcuenta'} footer={<Button variant="primary" loading={m.isPending} onClick={() => m.mutate(undefined)}>Guardar</Button>}>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Código" help="7 o más dígitos">
          <Input value={codigo} disabled={!!cuenta} inputMode="numeric" onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
