import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Button, Card, CardHeader, Checkbox, Field, FileDrop, Input, NumberInput, Spinner, Textarea } from '@/components/ui';

export default function Empresa() {
  const { data, isLoading } = useApi<any>('/empresa');
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (data) setF(data);
  }, [data]);
  const save = useMut(() => {
    const { id: _i, creadoEn: _c, actualizadoEn: _a, logoUrl: _l, ...rest } = f;
    return api.patch('/empresa', { ...rest, email: rest.email || null });
  }, { ok: 'Configuración guardada', invalidate: ['/empresa', 'session'] });
  if (isLoading || !f) return <Spinner />;
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const aj = (k: string, v: unknown) => setF({ ...f, ajustes: { ...f.ajustes, [k]: v } });
  const campo = (k: string, label: string, extra: Record<string, unknown> = {}) => (
    <Field label={label}>
      <Input value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...extra} />
    </Field>
  );
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Datos fiscales" subtitle="Aparecen en facturas, presupuestos y emails" />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {campo('nombre', 'Nombre comercial')}
          {campo('razonSocial', 'Razón social')}
          {campo('nif', 'NIF', { className: 'field-input font-mono uppercase' })}
          {campo('telefono', 'Teléfono')}
          {campo('email', 'Email')}
          {campo('web', 'Web')}
          {campo('direccion', 'Dirección')}
          {campo('codigoPostal', 'Código postal')}
          {campo('localidad', 'Localidad')}
          {campo('provincia', 'Provincia')}
          {campo('iban', 'IBAN para cobros', { className: 'field-input font-mono uppercase' })}
          {campo('bic', 'BIC')}
          {campo('sufijoSepa', 'Sufijo del acreedor SEPA')}
        </div>
        <div className="flex items-center gap-4 border-t border-line p-4">
          {f.logoUrl && <img src={f.logoUrl} alt="Logo" className="h-14 max-w-[160px] rounded border border-line-strong/70 bg-white object-contain p-1" />}
          <div className="flex-1">
            <FileDrop compact multiple={false} accept="image/png,image/jpeg,image/svg+xml" label="Sube el logo (PNG o JPG)" onUploaded={(fs) => fs[0] && setF({ ...f, logoArchivoId: fs[0].id, logoUrl: fs[0].url })} />
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Ajustes de funcionamiento" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Margen mínimo de un presupuesto (%)" help="Por debajo, el presupuesto necesita la aprobación de dirección">
            <NumberInput value={f.ajustes.margenMinimoPresupuesto} onChange={(v) => aj('margenMinimoPresupuesto', v ?? 0)} suffix="%" />
          </Field>
          <Field label="Validez de los presupuestos (días)">
            <NumberInput value={f.ajustes.validezPresupuestoDias} onChange={(v) => aj('validezPresupuestoDias', Math.round(v ?? 30))} decimals={0} />
          </Field>
          <Field label="Compras que necesitan aprobación desde (€)">
            <NumberInput value={f.ajustes.umbralAprobacionCompra} onChange={(v) => aj('umbralAprobacionCompra', v ?? 0)} suffix="€" />
          </Field>
          <Field label="Precio por kilómetro (€)">
            <NumberInput value={f.ajustes.precioKm} onChange={(v) => aj('precioKm', v ?? 0)} suffix="€" decimals={3} />
          </Field>
          <Field label="Jornada máxima diaria (h)" help="Se marca como incidencia si se supera">
            <NumberInput value={f.ajustes.horasJornadaMax} onChange={(v) => aj('horasJornadaMax', v ?? 9)} suffix="h" />
          </Field>
          <Field label="Minutos de cortesía al fichar">
            <NumberInput value={f.ajustes.minutosCortesia} onChange={(v) => aj('minutosCortesia', Math.round(v ?? 0))} decimals={0} />
          </Field>
          <Field label="Condiciones por defecto de los presupuestos" className="sm:col-span-2">
            <Textarea value={f.ajustes.condicionesPresupuesto ?? ''} onChange={(e) => aj('condicionesPresupuesto', e.target.value)} rows={3} />
          </Field>
          <Field label="Pie de las facturas" help="Inscripción registral, cláusula de protección de datos…" className="sm:col-span-2">
            <Textarea value={f.ajustes.pieFactura ?? ''} onChange={(e) => aj('pieFactura', e.target.value)} rows={2} />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox checked={!!f.ajustes.bloquearRiesgo} onChange={(v) => aj('bloquearRiesgo', v)} label="Bloquear pedidos de clientes que superan su riesgo máximo" description="Si está desactivado, solo se avisa al comercial." />
          </div>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button variant="primary" icon={Save} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
