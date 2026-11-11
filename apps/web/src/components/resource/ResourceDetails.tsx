import type { ResourceDef } from '@kite/shared';
import { useSession } from '@/lib/session';
import { KeyValue } from '@/components/ui';
import { FieldValue } from './ResourceField';

/** Ficha de solo lectura agrupada por las secciones del recurso. */
export function ResourceDetails({ def, record, exclude = [] }: { def: ResourceDef; record: Record<string, any>; exclude?: string[] }) {
  const { can } = useSession();
  const sections = def.sections?.length ? def.sections : [{ title: '', fields: Object.keys(def.fields) }];
  return (
    <div className="space-y-6">
      {sections.map((s, i) => {
        const fields = s.fields.filter((k) => {
          const f = def.fields[k];
          return f && !f.hidden && !exclude.includes(k) && (!f.sensitive || can(f.sensitive));
        });
        if (!fields.length) return null;
        return (
          <div key={i}>
            {s.title && <h3 className="mb-3 text-[12.5px] font-semibold uppercase tracking-wide text-muted">{s.title}</h3>}
            <KeyValue
              items={fields.map((k) => {
                const f = def.fields[k]!;
                return { label: f.label, value: <FieldValue def={f} value={record[k]} refs={record._refs} />, span: f.type === 'textarea' || f.colSpan === 2 ? 2 : 1 };
              })}
            />
          </div>
        );
      })}
    </div>
  );
}
