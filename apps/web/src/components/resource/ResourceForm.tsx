import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultsOf, toZod, type ResourceDef } from '@kite/shared';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { invalidatePrefix } from '@/lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button, Dialog, Field } from '@/components/ui';
import { FieldControl } from './ResourceField';

export interface ResourceFormProps {
  def: ResourceDef;
  /** Ruta de la API, p. ej. "/terceros". */
  endpoint: string;
  /** Registro a editar (si no se indica, se crea uno nuevo). */
  record?: Record<string, any> | null;
  /** Valores iniciales al crear. */
  initial?: Record<string, unknown>;
  /** Campos a ocultar (por ejemplo el padre ya fijado). */
  hide?: string[];
  onSaved?: (row: any) => void;
  onCancel?: () => void;
  /** Contenido extra al final del formulario. */
  extra?: ReactNode;
  /** Contenido que depende de los valores (avisos de duplicados, cálculos…). */
  renderExtra?: (values: Record<string, any>) => ReactNode;
  submitLabel?: string;
  /** Guardado propio (rutas que no siguen el patrón POST/PATCH del recurso). */
  onSubmitData?: (data: Record<string, unknown>) => Promise<any>;
  /** Mostrar y enviar solo estos campos. */
  only?: string[];
}

/** Formulario generado a partir de la definición del recurso (secciones, validación y referencias). */
export function ResourceForm({ def, endpoint, record, initial, hide = [], onSaved, onCancel, extra, renderExtra, submitLabel, onSubmitData, only }: ResourceFormProps) {
  const qc = useQueryClient();
  const { can } = useSession();
  const editing = !!record?.id;
  const start = useMemo(() => {
    const base = { ...defaultsOf(def), ...(initial ?? {}) };
    if (record) for (const k of Object.keys(def.fields)) if (record[k] !== undefined) base[k] = record[k];
    // los selectores trabajan con texto (p. ej. el tipo de IVA 21 → "21")
    for (const [k, f] of Object.entries(def.fields)) if (f.type === 'enum' && base[k] !== null && base[k] !== undefined && base[k] !== '') base[k] = String(base[k]);
    return base;
  }, [def, record, initial]);
  const [values, setValues] = useState<Record<string, any>>(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setValues(start), [start]);

  const set = (k: string, v: unknown) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const visible = (k: string) => {
    const f = def.fields[k];
    if (!f || f.hidden || f.readOnly || hide.includes(k)) return false;
    if (only && !only.includes(k)) return false;
    if (f.sensitive && !can(f.sensitive)) return false;
    return true;
  };

  const sections = def.sections?.length ? def.sections : [{ title: '', fields: Object.keys(def.fields) }];

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const schema = toZod(def, { partial: editing });
    const data: Record<string, unknown> = {};
    for (const k of Object.keys(def.fields)) if (visible(k) || initial?.[k] !== undefined) data[k] = values[k];
    const r = schema.safeParse(data);
    if (!r.success) {
      const errs: Record<string, string> = {};
      for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      toast.error('Revisa los campos marcados');
      return;
    }
    setSaving(true);
    try {
      const row = onSubmitData ? await onSubmitData(r.data) : editing ? await api.patch(`${endpoint}/${record!.id}`, r.data) : await api.post(endpoint, r.data);
      toast.success(editing ? 'Cambios guardados' : `${def.label} creado`);
      invalidatePrefix(qc, endpoint);
      onSaved?.(row);
    } catch (err) {
      if (err instanceof ApiError && err.details?.fields) setErrors(err.details.fields as Record<string, string>);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {sections.map((s, i) => {
        const fields = s.fields.filter(visible);
        if (!fields.length) return null;
        return (
          <fieldset key={i} className="space-y-3">
            {s.title && <legend className="mb-1 text-[13px] font-bold text-muted">{s.title}</legend>}
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {fields.map((k) => {
                const f = def.fields[k]!;
                const wide = f.colSpan === 2 || f.type === 'textarea' || f.type === 'tags' || f.type === 'refs' || f.type === 'json';
                return (
                  <Field key={k} label={f.type === 'bool' ? undefined : f.label} htmlFor={`f-${k}`} error={errors[k]} help={f.help} required={f.required} className={cn(wide && 'sm:col-span-2', f.type === 'bool' && 'self-end pb-2')}>
                    <FieldControl name={k} def={f} value={values[k]} onChange={(v) => set(k, v)} error={errors[k]} refLabel={record?._refs?.[f.ref ?? '']?.[values[k]]} />
                  </Field>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      {extra}
      {renderExtra?.(values)}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" variant="primary" loading={saving}>
          {submitLabel ?? (editing ? 'Guardar cambios' : 'Crear')}
        </Button>
      </div>
    </form>
  );
}

export function ResourceFormDialog({ open, onOpenChange, title, ...props }: ResourceFormProps & { open: boolean; onOpenChange: (o: boolean) => void; title?: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title ?? (props.record?.id ? `Editar ${props.def.label.toLowerCase()}` : `Nuevo: ${props.def.label.toLowerCase()}`)} size="lg">
      {open && (
        <ResourceForm
          {...props}
          onCancel={() => onOpenChange(false)}
          onSaved={(r) => {
            onOpenChange(false);
            props.onSaved?.(r);
          }}
        />
      )}
    </Dialog>
  );
}
