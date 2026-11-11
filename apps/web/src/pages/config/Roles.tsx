import { useMemo, useState } from 'react';
import { Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { SCOPE_LABELS, SCOPES, type Scope } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Alert, Badge, Button, Card, Field, Input, Spinner, Textarea, useConfirm } from '@/components/ui';

interface Perm {
  key: string;
  module: string;
  label: string;
  scoped: boolean;
  moduloNombre: string;
}

export default function Roles() {
  const confirm = useConfirm();
  const roles = useApi<any[]>('/roles');
  const catalogo = useApi<Perm[]>('/permisos/catalogo');
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ nombre: string; descripcion: string; permisos: Record<string, Scope> } | null>(null);
  const rol = roles.data?.find((r) => r.id === sel) ?? null;

  const elegir = (r: any | null) => {
    setSel(r?.id ?? 'nuevo');
    setDraft(r ? { nombre: r.nombre, descripcion: r.descripcion ?? '', permisos: Object.fromEntries(r.permisos.map((p: any) => [p.permiso, p.alcance])) } : { nombre: '', descripcion: '', permisos: {} });
  };
  const grupos = useMemo(() => {
    const m = new Map<string, Perm[]>();
    for (const p of catalogo.data ?? []) m.set(p.moduloNombre, [...(m.get(p.moduloNombre) ?? []), p]);
    return [...m.entries()];
  }, [catalogo.data]);

  const save = useMut(
    () => {
      const body = { nombre: draft!.nombre, descripcion: draft!.descripcion, permisos: Object.entries(draft!.permisos).map(([permiso, alcance]) => ({ permiso, alcance })) };
      return sel === 'nuevo' ? api.post('/roles', body) : api.put(`/roles/${sel}`, body);
    },
    { ok: 'Rol guardado. Los cambios se aplican en menos de un minuto.', invalidate: ['/roles'], onSuccess: (r: any) => r?.id && setSel(r.id) },
  );
  const borrar = useMut(() => api.del(`/roles/${sel}`), { ok: 'Rol borrado', invalidate: ['/roles'], onSuccess: () => { setSel(null); setDraft(null); } });

  if (roles.isLoading || catalogo.isLoading) return <Spinner />;
  const admin = rol?.clave === 'admin';
  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit overflow-hidden">
        <ul className="divide-y divide-line">
          {roles.data?.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => elegir(r)} className={cn('flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-sunken', sel === r.id && 'bg-primary-soft')}>
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{r.nombre}</span>
                  <span className="text-[12px] text-muted">{r.usuarios} usuarios</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-line p-3">
          <Button size="sm" icon={Plus} className="w-full" onClick={() => elegir(null)}>
            Nuevo rol
          </Button>
        </div>
      </Card>
      {!draft ? (
        <Alert tone="violet">Elige un rol para ver y ajustar sus permisos. Los permisos con alcance permiten limitar a «solo lo suyo», «su equipo», «su departamento» o «toda la empresa». Quien tiene personas a su cargo ve además lo de su equipo.</Alert>
      ) : admin ? (
        <Alert tone="violet" icon={Lock} title="Administrador">Este rol tiene siempre todos los permisos, incluidos los de módulos que se añadan en el futuro.</Alert>
      ) : (
        <div className="space-y-4">
          <Card className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Nombre">
              <Input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} />
            </Field>
            <Field label="Descripción">
              <Textarea value={draft.descripcion} onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })} rows={1} />
            </Field>
          </Card>
          {grupos.map(([mod, perms]) => (
            <Card key={mod} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line bg-sunken/50 px-4 py-2">
                <p className="text-[13px] font-semibold">{mod}</p>
                <Badge>{perms.filter((p) => draft.permisos[p.key]).length}/{perms.length}</Badge>
              </div>
              <ul className="divide-y divide-line">
                {perms.map((p) => {
                  const v = draft.permisos[p.key];
                  return (
                    <li key={p.key} className="flex flex-wrap items-center gap-3 px-4 py-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-[13.5px]">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[rgb(var(--primary))]"
                          checked={!!v}
                          onChange={(e) => {
                            const n = { ...draft.permisos };
                            if (e.target.checked) n[p.key] = 'todo';
                            else delete n[p.key];
                            setDraft({ ...draft, permisos: n });
                          }}
                        />
                        <span className="truncate">{p.label}</span>
                      </label>
                      {p.scoped && v && (
                        <div className="flex flex-wrap gap-1">
                          {SCOPES.map((s) => (
                            <button key={s} type="button" onClick={() => setDraft({ ...draft, permisos: { ...draft.permisos, [p.key]: s } })} className={cn('rounded-md px-2 py-0.5 text-[11.5px] font-medium', v === s ? 'bg-primary text-primary-fg' : 'bg-sunken text-muted hover:text-fg')}>
                              {SCOPE_LABELS[s]}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
          <div className="flex justify-between gap-2">
            {sel !== 'nuevo' && !rol?.sistema ? (
              <Button variant="ghost" icon={Trash2} onClick={async () => (await confirm({ title: 'Borrar rol', danger: true, confirm: 'Borrar' })) && borrar.mutate(undefined)}>
                Borrar rol
              </Button>
            ) : (
              <span />
            )}
            <Button variant="primary" disabled={!draft.nombre} loading={save.isPending} onClick={() => save.mutate(undefined)}>
              Guardar rol
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
