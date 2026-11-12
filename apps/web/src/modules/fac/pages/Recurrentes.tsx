import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Plus, Repeat, Trash2, Zap } from 'lucide-react';
import { fmtDate, fmtMoney, IVA_TIPOS, todayISO } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, DataTable, Dialog, Field, IconButton, Input, NumberInput, PageHeader, RefSelect, Select, Switch, useConfirm } from '@/components/ui';

const PERIODOS = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
];

interface LineaR {
  articuloId?: string | null;
  descripcion: string;
  cantidad: number;
  precio: number;
  descuento: number;
  ivaTipo: number;
  retencion: number;
}

export default function Recurrentes() {
  const { can } = useSession();
  const confirm = useConfirm();
  const { data, isLoading } = useApi<any[]>('/documentos-recurrentes');
  const [edit, setEdit] = useState<any | null>(null);
  const generar = useMut(() => api.post<{ generadas: number }>('/documentos-recurrentes/generar'), { ok: (r) => (r.generadas ? `${r.generadas} facturas creadas en borrador` : 'No había ninguna pendiente'), invalidate: ['/documentos'] });
  const pausar = useMut((id: string) => api.del(`/documentos-recurrentes/${id}`), { ok: 'Cuota pausada', invalidate: ['/documentos-recurrentes'] });
  return (
    <>
      <PageHeader
        title="Facturas recurrentes"
        icon={Repeat}
        subtitle="Cuotas que se facturan solas cada mes, trimestre o año (mantenimientos, alquileres, suscripciones)."
        actions={
          can('fac.editar') && (
            <>
              <Button icon={Zap} loading={generar.isPending} onClick={() => generar.mutate(undefined)}>
                Generar las vencidas
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setEdit({})}>
                Nueva cuota
              </Button>
            </>
          )
        }
      />
      <Card className="overflow-hidden">
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          onRowClick={(r) => can('fac.editar') && setEdit(r)}
          columns={[
            { key: 'nombre', header: 'Concepto', cell: (r) => <span className="font-medium">{r.nombre}</span> },
            { key: 'tercero', header: 'Cliente', cell: (r) => <Link to={`/terceros/${r.terceroId}`} className="hover:text-primary">{r.tercero}</Link> },
            { key: 'periodicidad', header: 'Cada', cell: (r) => PERIODOS.find((p) => p.value === r.periodicidad)?.label },
            { key: 'proximaFecha', header: 'Próxima', cell: (r) => fmtDate(r.proximaFecha) },
            { key: 'auto', header: 'Emisión', hideBelow: 'lg', cell: (r) => (r.emitirAutomaticamente ? <Badge tone="violet">Automática</Badge> : <Badge>Borrador para revisar</Badge>) },
            { key: 'activo', header: 'Estado', cell: (r) => (r.activo ? <Badge tone="green" dot>Activa</Badge> : <Badge dot>Pausada</Badge>) },
            { key: 'importe', header: 'Base', align: 'right', cell: (r) => fmtMoney(r.importe) },
            {
              key: 'acc',
              header: '',
              cell: (r) =>
                r.activo && can('fac.editar') ? (
                  <IconButton icon={Pause} label="Pausar" size="sm" onClick={async () => (await confirm({ title: 'Pausar cuota', message: 'No se generarán más facturas hasta que la reactives.', confirm: 'Pausar' })) && pausar.mutate(r.id)} />
                ) : null,
            },
          ]}
          mobileSubtitle={(r) => `${r.tercero} · ${fmtDate(r.proximaFecha)}`}
          mobileRight={(r) => <span className="tabular font-semibold">{fmtMoney(r.importe)}</span>}
        />
      </Card>
      {edit && <RecurrenteDialog r={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function RecurrenteDialog({ r, onClose }: { r: any; onClose: () => void }) {
  const [f, setF] = useState({
    nombre: r.nombre ?? '',
    terceroId: r.terceroId ?? null,
    formaPagoId: r.formaPagoId ?? null,
    periodicidad: r.periodicidad ?? 'mensual',
    proximaFecha: r.proximaFecha ?? todayISO(),
    finFecha: r.finFecha ?? '',
    emitirAutomaticamente: r.emitirAutomaticamente ?? false,
    activo: r.activo ?? true,
  });
  const [lineas, setLineas] = useState<LineaR[]>(r.lineas ?? [{ descripcion: '', cantidad: 1, precio: 0, descuento: 0, ivaTipo: 21, retencion: 0 }]);
  const save = useMut(() => (r.id ? api.put(`/documentos-recurrentes/${r.id}`, { ...f, lineas }) : api.post('/documentos-recurrentes', { ...f, lineas })), { ok: 'Cuota guardada', invalidate: ['/documentos-recurrentes'], onSuccess: onClose });
  const setL = (i: number, p: Partial<LineaR>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={r.id ? 'Editar cuota recurrente' : 'Nueva cuota recurrente'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!f.nombre || !f.terceroId || !lineas.some((l) => l.descripcion)} onClick={() => save.mutate(undefined)}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Concepto" required>
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </Field>
          <Field label="Cliente" required>
            <RefSelect target="clientes" value={f.terceroId} onChange={(v) => setF({ ...f, terceroId: v })} />
          </Field>
          <Field label="Periodicidad">
            <Select value={f.periodicidad} onChange={(e) => setF({ ...f, periodicidad: e.target.value })} options={PERIODOS} />
          </Field>
          <Field label="Próxima factura">
            <Input type="date" value={f.proximaFecha} onChange={(e) => setF({ ...f, proximaFecha: e.target.value })} />
          </Field>
          <Field label="Hasta (opcional)">
            <Input type="date" value={f.finFecha} onChange={(e) => setF({ ...f, finFecha: e.target.value })} />
          </Field>
          <Field label="Forma de pago">
            <RefSelect target="formas_pago" value={f.formaPagoId} onChange={(v) => setF({ ...f, formaPagoId: v })} placeholder="La del cliente" />
          </Field>
        </div>
        <Switch checked={f.emitirAutomaticamente} onChange={(v) => setF({ ...f, emitirAutomaticamente: v })} label="Emitir automáticamente" description="Si está desactivado, la factura se crea en borrador para que la revises antes de emitirla." />
        <div className="space-y-2">
          <p className="label">Líneas</p>
          {lineas.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-line-strong/70 p-2 sm:grid-cols-[1fr_80px_110px_90px_auto]">
              <Input className="col-span-2 sm:col-span-1" placeholder="Descripción" value={l.descripcion} onChange={(e) => setL(i, { descripcion: e.target.value })} />
              <NumberInput value={l.cantidad} onChange={(v) => setL(i, { cantidad: v ?? 0 })} decimals={3} />
              <NumberInput value={l.precio} onChange={(v) => setL(i, { precio: v ?? 0 })} suffix="€" />
              <Select value={l.ivaTipo} onChange={(e) => setL(i, { ivaTipo: Number(e.target.value) })} options={IVA_TIPOS.map((t) => ({ value: t.value, label: `${t.value} %` }))} />
              <IconButton icon={Trash2} label="Quitar" onClick={() => setLineas(lineas.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" icon={Plus} onClick={() => setLineas([...lineas, { descripcion: '', cantidad: 1, precio: 0, descuento: 0, ivaTipo: 21, retencion: 0 }])}>
            Añadir línea
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
