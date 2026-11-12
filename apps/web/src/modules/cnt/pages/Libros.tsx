import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, BookOpen, Download } from 'lucide-react';
import { fmtDate, fmtMoney } from '@kite/shared';
import { download } from '@/lib/api';
import { useApi, useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Button, Card, DataTable, EmptyState, Field, Input, PageHeader, Segmented, Select, Spinner, Tabs } from '@/components/ui';
import { AnioSelect, Importe } from '../comun';

type Libro = 'mayor' | 'sumas' | 'balance' | 'pyg' | 'iva' | 'analitica';

/** Libros y estados contables con exportación a Excel. */
export default function Libros() {
  const [sp] = useSearchParams();
  const libro = (sp.get('libro') as Libro) || 'mayor';
  const [anio, setAnio] = useState(sp.get('anio') ?? String(new Date().getFullYear()));
  return (
    <>
      <PageHeader title="Libros y estados" icon={BookOpen} actions={<AnioSelect value={anio} onChange={setAnio} />} />
      <Tabs
        urlKey="libro"
        tabs={[
          { id: 'mayor', label: 'Mayor' },
          { id: 'sumas', label: 'Sumas y saldos' },
          { id: 'balance', label: 'Balance' },
          { id: 'pyg', label: 'Pérdidas y ganancias' },
          { id: 'iva', label: 'Libros de IVA' },
          { id: 'analitica', label: 'Centros de coste' },
        ]}
      />
      <div className="mt-4">
        {libro === 'mayor' && <Mayor anio={anio} inicial={sp.get('cuenta') ?? ''} />}
        {libro === 'sumas' && <Sumas anio={anio} />}
        {libro === 'balance' && <Balance anio={anio} />}
        {libro === 'pyg' && <PyG anio={anio} />}
        {libro === 'iva' && <Iva anio={anio} />}
        {libro === 'analitica' && <Analitica anio={anio} />}
      </div>
    </>
  );
}

function Exportar({ url, nombre }: { url: string; nombre: string }) {
  return (
    <Button size="sm" icon={Download} onClick={() => download(`${url}${url.includes('?') ? '&' : '?'}format=xlsx`, nombre)}>
      Excel
    </Button>
  );
}

function Mayor({ anio, inicial }: { anio: string; inicial: string }) {
  const [cuenta, setCuenta] = useState(inicial);
  const dc = useDebounced(cuenta);
  const url = `/cnt/libros/mayor?anio=${anio}&cuenta=${dc}`;
  const { data, isLoading } = useApi<any>(dc.length >= 3 ? url : null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Cuenta o grupo">
          <Input className="w-48" value={cuenta} inputMode="numeric" onChange={(e) => setCuenta(e.target.value.replace(/\D/g, ''))} placeholder="p. ej. 4300001 o 572" />
        </Field>
        {data && <Exportar url={url} nombre={`mayor-${dc}-${anio}.xlsx`} />}
        {data?.nombre && <span className="pb-2 text-[13.5px] font-semibold">{data.nombre}</span>}
      </div>
      {dc.length < 3 ? (
        <Alert tone="blue">Escribe al menos 3 dígitos de la cuenta.</Alert>
      ) : isLoading || !data ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            dense
            rows={data.lineas}
            empty="Sin movimientos en el periodo."
            columns={[
              { key: 'fecha', header: 'Fecha', cell: (l: any) => fmtDate(l.fecha), width: '96px' },
              { key: 'numero', header: 'Asiento', cell: (l: any) => l.numero, width: '72px' },
              { key: 'cuenta', header: 'Cuenta', cell: (l: any) => <span className="font-mono text-[12px]">{l.cuenta}</span>, hideBelow: 'md' },
              { key: 'concepto', header: 'Concepto', cell: (l: any) => <span className="line-clamp-1">{l.concepto}</span> },
              { key: 'debe', header: 'Debe', align: 'right', cell: (l: any) => (l.debe ? fmtMoney(l.debe) : '') },
              { key: 'haber', header: 'Haber', align: 'right', cell: (l: any) => (l.haber ? fmtMoney(l.haber) : '') },
              { key: 'saldo', header: 'Saldo', align: 'right', cell: (l: any) => <Importe v={l.saldo} /> },
            ]}
            mobileTitle={(l: any) => l.concepto}
            mobileSubtitle={(l: any) => `${fmtDate(l.fecha)} · asiento ${l.numero}`}
            mobileRight={(l: any) => <Importe v={l.debe - l.haber} />}
            footer={
              <div className="flex flex-wrap justify-end gap-x-6 px-4 py-2 text-[13px]">
                <span>Saldo anterior <b>{fmtMoney(data.saldoAnterior)}</b></span>
                <span>Debe <b>{fmtMoney(data.debe)}</b></span>
                <span>Haber <b>{fmtMoney(data.haber)}</b></span>
                <span>Saldo final <b>{fmtMoney(data.saldoFinal)}</b></span>
              </div>
            }
          />
        </Card>
      )}
    </div>
  );
}

function Sumas({ anio }: { anio: string }) {
  const [nivel, setNivel] = useState('7');
  const url = `/cnt/libros/sumas-saldos?anio=${anio}&nivel=${nivel}`;
  const { data, isLoading } = useApi<any>(url);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Nivel">
          <Select className="w-44" value={nivel} onChange={(e) => setNivel(e.target.value)} options={[{ value: '1', label: 'Grupo (1 dígito)' }, { value: '2', label: 'Subgrupo (2)' }, { value: '3', label: 'Cuenta (3)' }, { value: '4', label: '4 dígitos' }, { value: '7', label: 'Subcuenta' }]} />
        </Field>
        <Exportar url={url} nombre={`sumas-saldos-${anio}.xlsx`} />
        {data && !data.cuadra && (
          <span className="flex items-center gap-1 pb-2 text-[13px] font-semibold text-bad">
            <AlertTriangle className="h-4 w-4" /> No cuadra
          </span>
        )}
      </div>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            dense
            rows={data.filas.map((f: any) => ({ ...f, id: f.cuenta }))}
            columns={[
              { key: 'cuenta', header: 'Cuenta', cell: (f: any) => <span className="font-mono text-[12.5px]">{f.cuenta}</span>, width: '96px' },
              { key: 'nombre', header: 'Nombre', cell: (f: any) => <span className="line-clamp-1">{f.nombre}</span> },
              { key: 'debe', header: 'Debe', align: 'right', cell: (f: any) => fmtMoney(f.debe), hideBelow: 'md' },
              { key: 'haber', header: 'Haber', align: 'right', cell: (f: any) => fmtMoney(f.haber), hideBelow: 'md' },
              { key: 'deudor', header: 'Saldo deudor', align: 'right', cell: (f: any) => (f.deudor ? fmtMoney(f.deudor) : '') },
              { key: 'acreedor', header: 'Saldo acreedor', align: 'right', cell: (f: any) => (f.acreedor ? fmtMoney(f.acreedor) : '') },
            ]}
            mobileTitle={(f: any) => `${f.cuenta} · ${f.nombre}`}
            mobileRight={(f: any) => <Importe v={f.saldo} />}
            footer={
              <div className="flex justify-end gap-6 px-4 py-2 text-[13px] font-semibold">
                <span>Debe {fmtMoney(data.totales.debe)}</span>
                <span>Haber {fmtMoney(data.totales.haber)}</span>
              </div>
            }
          />
        </Card>
      )}
    </div>
  );
}

function Estado({ lineas }: { lineas: any[] }) {
  return (
    <ul className="divide-y divide-line">
      {lineas.map((l) => (
        <li key={l.id} className={cn('flex items-center gap-3 py-1.5 pr-4 text-[13.5px]', l.nivel === 0 && 'bg-sunken/60 font-bold')} style={{ paddingLeft: 16 + l.nivel * 16 }}>
          <span className={cn('min-w-0 flex-1', l.nivel === 1 && 'font-semibold')}>{l.titulo}</span>
          <Importe v={l.importe} bold={l.nivel <= 1} />
        </li>
      ))}
    </ul>
  );
}

function Balance({ anio }: { anio: string }) {
  const [fecha, setFecha] = useState('');
  const url = `/cnt/libros/balance?anio=${anio}${fecha ? `&fecha=${fecha}` : ''}`;
  const { data, isLoading } = useApi<any>(url);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="A fecha">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Exportar url={url} nombre={`balance-${anio}.xlsx`} />
      </div>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          {!data.cuadra && <Alert tone="red">El balance no cuadra: revisa {data.sinClasificar?.length ? `las cuentas sin clasificar (${data.sinClasificar.map((c: any) => c.cuenta ?? c).join(', ')})` : 'los asientos'}.</Alert>}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <p className="px-5 pb-2 pt-4 font-display font-bold">Activo · {fmtMoney(data.totalActivo)}</p>
              <Estado lineas={data.activo} />
            </Card>
            <Card className="overflow-hidden">
              <p className="px-5 pb-2 pt-4 font-display font-bold">Patrimonio neto y pasivo · {fmtMoney(data.totalPasivo)}</p>
              <Estado lineas={data.pasivo} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function PyG({ anio }: { anio: string }) {
  const url = `/cnt/libros/pyg?anio=${anio}`;
  const { data, isLoading } = useApi<any>(url);
  return (
    <div className="space-y-3">
      <Exportar url={url} nombre={`pyg-${anio}.xlsx`} />
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden">
          <Estado lineas={data.lineas} />
          <p className="flex justify-between border-t border-line px-4 py-3 font-display text-[16px] font-bold">
            <span>Resultado del ejercicio</span>
            <Importe v={data.resultado} bold />
          </p>
        </Card>
      )}
    </div>
  );
}

function Iva({ anio }: { anio: string }) {
  const [tipo, setTipo] = useState<'expedidas' | 'recibidas'>('expedidas');
  const [trim, setTrim] = useState('');
  const rango = trim ? `&desde=${anio}-${String((Number(trim) - 1) * 3 + 1).padStart(2, '0')}-01&hasta=${anio}-${String(Number(trim) * 3).padStart(2, '0')}-${['31', '30', '30', '31'][Number(trim) - 1]}` : '';
  const url = `/cnt/libros/iva?anio=${anio}&tipo=${tipo}${rango}`;
  const { data, isLoading } = useApi<any>(url);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={tipo} onChange={setTipo} options={[{ value: 'expedidas', label: 'Facturas emitidas' }, { value: 'recibidas', label: 'Facturas recibidas' }]} />
        <Select className="w-40" value={trim} onChange={(e) => setTrim(e.target.value)} options={[1, 2, 3, 4].map((t) => ({ value: String(t), label: `${t}.º trimestre` }))} placeholder="Todo el año" />
        <Exportar url={url} nombre={`libro-iva-${tipo}-${anio}.xlsx`} />
      </div>
      {isLoading || !data ? (
        <Spinner />
      ) : !data.lineas.length ? (
        <Card>
          <EmptyState title="Sin facturas en el periodo" />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            dense
            rows={data.lineas.map((l: any, i: number) => ({ ...l, id: String(i) }))}
            columns={[
              { key: 'fecha', header: 'Fecha', cell: (l: any) => fmtDate(l.fecha), width: '96px' },
              { key: 'numero', header: 'Número', cell: (l: any) => l.numero },
              { key: 'nif', header: 'NIF', cell: (l: any) => l.nif, hideBelow: 'lg' },
              { key: 'nombre', header: tipo === 'expedidas' ? 'Cliente' : 'Proveedor', cell: (l: any) => <span className="line-clamp-1">{l.nombre}</span> },
              { key: 'base', header: 'Base', align: 'right', cell: (l: any) => fmtMoney(l.base) },
              { key: 'tipo', header: '%', align: 'right', cell: (l: any) => `${Number(l.ivaTipo)}`, hideBelow: 'md' },
              { key: 'cuota', header: 'Cuota', align: 'right', cell: (l: any) => fmtMoney(l.cuota) },
              { key: 'total', header: 'Total', align: 'right', cell: (l: any) => (l.total != null ? fmtMoney(l.total) : ''), hideBelow: 'md' },
            ]}
            mobileTitle={(l: any) => `${l.numero} · ${l.nombre}`}
            mobileSubtitle={(l: any) => `${fmtDate(l.fecha)} · base ${fmtMoney(l.base)} al ${Number(l.ivaTipo)} %`}
            mobileRight={(l: any) => fmtMoney(l.cuota)}
            footer={
              <div className="flex flex-wrap justify-end gap-x-6 px-4 py-2 text-[13px] font-semibold">
                <span>{data.totales.facturas} facturas</span>
                <span>Base {fmtMoney(data.totales.base)}</span>
                <span>Cuota {fmtMoney(data.totales.cuota)}</span>
                {data.totales.retencion ? <span>Retenciones {fmtMoney(data.totales.retencion)}</span> : null}
                <span>Total {fmtMoney(data.totales.total)}</span>
              </div>
            }
          />
        </Card>
      )}
    </div>
  );
}

function Analitica({ anio }: { anio: string }) {
  const url = `/cnt/libros/analitica?anio=${anio}`;
  const { data, isLoading } = useApi<any[]>(url);
  return (
    <div className="space-y-3">
      <Exportar url={url} nombre={`analitica-${anio}.xlsx`} />
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            rows={data.map((c) => ({ ...c, id: c.centroId ?? '_' }))}
            empty="Sin ingresos ni gastos en el periodo."
            columns={[
              { key: 'nombre', header: 'Centro de coste', cell: (c: any) => <span className="font-medium">{c.nombre}</span> },
              { key: 'ingresos', header: 'Ingresos', align: 'right', cell: (c: any) => fmtMoney(c.ingresos) },
              { key: 'gastos', header: 'Gastos', align: 'right', cell: (c: any) => fmtMoney(c.gastos) },
              { key: 'resultado', header: 'Resultado', align: 'right', cell: (c: any) => <Importe v={c.resultado} bold /> },
            ]}
            mobileTitle={(c: any) => c.nombre}
            mobileRight={(c: any) => <Importe v={c.resultado} bold />}
          />
        </Card>
      )}
    </div>
  );
}
