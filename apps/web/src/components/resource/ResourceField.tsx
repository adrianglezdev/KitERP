import type { ReactNode } from 'react';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, formatIban, optionLabel, type FieldDef } from '@kite/shared';
import { Checkbox, EnumBadge, Input, NumberInput, RefMultiSelect, RefSelect, Select, TagsInput, Textarea } from '@/components/ui';

/** Control de formulario según el tipo del campo. */
export function FieldControl({ name, def, value, onChange, error, refLabel }: { name: string; def: FieldDef; value: any; onChange: (v: any) => void; error?: string; refLabel?: string }) {
  const id = `f-${name}`;
  const invalid = !!error;
  switch (def.type) {
    case 'textarea':
      return <Textarea id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} invalid={invalid} placeholder={def.placeholder} rows={3} />;
    case 'bool':
      return <Checkbox id={id} checked={!!value} onChange={onChange} label={def.label} />;
    case 'enum':
      return <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} options={def.options ?? []} placeholder={def.required ? undefined : '—'} invalid={invalid} />;
    case 'ref':
      return <RefSelect id={id} target={def.ref!} value={value || null} onChange={(v) => onChange(v)} label={refLabel} filter={def.refFilter} invalid={invalid} />;
    case 'refs':
      return <RefMultiSelect target={def.ref!} value={Array.isArray(value) ? value : []} onChange={onChange} filter={def.refFilter} />;
    case 'tags':
      return <TagsInput value={Array.isArray(value) ? value : []} onChange={onChange} />;
    case 'money':
      return <NumberInput id={id} value={value === '' ? null : value} onChange={onChange} suffix="€" decimals={def.decimals ?? 2} invalid={invalid} />;
    case 'percent':
      return <NumberInput id={id} value={value === '' ? null : value} onChange={onChange} suffix="%" decimals={2} invalid={invalid} />;
    case 'number':
      return <NumberInput id={id} value={value === '' ? null : value} onChange={onChange} decimals={def.decimals ?? 4} invalid={invalid} />;
    case 'int':
      return <Input id={id} type="number" inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} invalid={invalid} />;
    case 'date':
      return <Input id={id} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} invalid={invalid} />;
    case 'datetime':
      return <Input id={id} type="datetime-local" value={value ? String(value).slice(0, 16) : ''} onChange={(e) => onChange(e.target.value)} invalid={invalid} />;
    case 'time':
      return <Input id={id} type="time" value={value ?? ''} onChange={(e) => onChange(e.target.value)} invalid={invalid} />;
    case 'color':
      return (
        <div className="flex items-center gap-2">
          <input type="color" value={value || '#7D2CDD'} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line bg-surface" aria-label={def.label} />
          <Input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="font-mono" />
        </div>
      );
    case 'email':
      return <Input id={id} type="email" inputMode="email" autoComplete="off" value={value ?? ''} onChange={(e) => onChange(e.target.value)} invalid={invalid} placeholder={def.placeholder} />;
    case 'phone':
      return <Input id={id} type="tel" inputMode="tel" value={value ?? ''} onChange={(e) => onChange(e.target.value)} invalid={invalid} placeholder={def.placeholder} />;
    case 'nif':
    case 'iban':
      return <Input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value.toUpperCase())} invalid={invalid} className="font-mono uppercase" placeholder={def.placeholder} />;
    case 'json':
      return (
        <Textarea
          id={id}
          className="font-mono text-[12.5px]"
          value={typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              onChange(e.target.value);
            }
          }}
          rows={4}
        />
      );
    default:
      return <Input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} invalid={invalid} placeholder={def.placeholder} maxLength={def.max} />;
  }
}

/** Valor de un campo para mostrar (listados y fichas). */
export function FieldValue({ def, value, refs }: { def: FieldDef; value: any; refs?: Record<string, Record<string, string>> }): ReactNode {
  if (value === null || value === undefined || value === '') return <span className="text-muted">—</span>;
  switch (def.type) {
    case 'bool':
      return value ? 'Sí' : 'No';
    case 'enum':
      return optionLabel(def.options, value)?.tone ? <EnumBadge options={def.options} value={value} /> : (optionLabel(def.options, String(value))?.label ?? String(value));
    case 'ref':
      return refs?.[def.ref!]?.[value] ?? <span className="text-muted">…</span>;
    case 'refs':
      return (value as string[]).map((v) => refs?.[def.ref!]?.[v] ?? '…').join(', ');
    case 'tags':
      return (
        <span className="flex flex-wrap gap-1">
          {(value as string[]).map((t) => (
            <span key={t} className="rounded-full bg-sunken px-2 py-0.5 text-[12px]">
              {t}
            </span>
          ))}
        </span>
      );
    case 'money':
      return <span className="tabular">{fmtMoney(value)}</span>;
    case 'percent':
      return <span className="tabular">{fmtNumber(value)} %</span>;
    case 'number':
    case 'int':
      return <span className="tabular">{fmtNumber(value, def.decimals ?? 2)}</span>;
    case 'date':
      return fmtDate(value);
    case 'datetime':
      return fmtDateTime(value);
    case 'iban':
      return <span className="font-mono text-[13px]">{formatIban(value)}</span>;
    case 'email':
      return (
        <a href={`mailto:${value}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {value}
        </a>
      );
    case 'phone':
      return (
        <a href={`tel:${String(value).replace(/\s/g, '')}`} className="hover:text-primary" onClick={(e) => e.stopPropagation()}>
          {value}
        </a>
      );
    case 'url':
      return (
        <a href={/^https?:/.test(value) ? value : `https://${value}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          {value}
        </a>
      );
    case 'color':
      return <span className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded" style={{ background: value }} />{value}</span>;
    case 'json':
      return <code className="text-[12px]">{JSON.stringify(value)}</code>;
    default:
      return String(value);
  }
}
