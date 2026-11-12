import { useState } from 'react';
import { Copy, KeyRound, Plus, ShieldCheck, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { SCOPE_LABELS, SCOPES } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { relTime } from '@/lib/utils';
import { Alert, Avatar, Badge, Button, Card, Checkbox, DataTable, Dialog, Field, IconButton, Input, RefSelect, SearchInput, Select, Switch, useConfirm } from '@/components/ui';

export default function Usuarios() {
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const { data, isLoading } = useApi<any[]>(`/usuarios${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const roles = useApi<any[]>('/roles');
  const [edit, setEdit] = useState<any | null>(null);
  const [temporal, setTemporal] = useState<string | null>(null);
  const reset = useMut((id: string) => api.post<{ passwordTemporal: string }>(`/usuarios/${id}/reset-password`), { onSuccess: (r) => setTemporal(r.passwordTemporal) });
  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-4">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre o email" className="min-w-[200px] flex-1" />
          <Button variant="primary" icon={Plus} onClick={() => setEdit({})}>
            Nuevo usuario
          </Button>
        </div>
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          onRowClick={(r) => setEdit(r)}
          columns={[
            {
              key: 'nombre',
              header: 'Persona',
              cell: (r) => (
                <span className="flex items-center gap-2.5">
                  <Avatar name={r.nombre} size={28} />
                  <span>
                    <span className="block font-medium">{r.nombre}</span>
                    <span className="block text-[12px] text-muted">{r.email}</span>
                  </span>
                </span>
              ),
            },
            { key: 'rol', header: 'Rol', cell: (r) => (r.rol ? <Badge tone="violet">{r.rol}</Badge> : <Badge>Sin rol</Badge>) },
            { key: 'extra', header: 'Permisos extra', hideBelow: 'lg', cell: (r) => (r.permisosExtra.length ? `${r.permisosExtra.length}` : '—') },
            { key: '2fa', header: '2 pasos', hideBelow: 'md', cell: (r) => (r.totp ? <ShieldCheck className="h-4 w-4 text-ok" /> : <span className="text-muted">—</span>) },
            { key: 'acceso', header: 'Último acceso', hideBelow: 'md', cell: (r) => (r.ultimoAcceso ? relTime(r.ultimoAcceso) : 'Nunca') },
            { key: 'activo', header: 'Estado', cell: (r) => (r.activo ? <Badge tone="green" dot>Activo</Badge> : <Badge tone="red" dot>Bloqueado</Badge>) },
            {
              key: 'acc',
              header: '',
              cell: (r) => <IconButton icon={KeyRound} label="Restablecer contraseña" size="sm" onClick={async () => (await confirm({ title: `Restablecer la contraseña de ${r.nombre}`, message: 'Se generará una contraseña temporal y se cerrarán sus sesiones.', confirm: 'Restablecer' })) && reset.mutate(r.id)} />,
            },
          ]}
          mobileTitle={(r) => r.nombre}
          mobileSubtitle={(r) => `${r.rol ?? 'Sin rol'} · ${r.email}`}
        />
      </Card>
      {edit && <UsuarioDialog u={edit} roles={roles.data ?? []} onClose={() => setEdit(null)} onTemporal={setTemporal} />}
      <Dialog open={!!temporal} onOpenChange={(o) => !o && setTemporal(null)} title="Contraseña temporal" size="sm">
        <p className="mb-3 text-[13.5px]">Comunícasela por un canal seguro. Se le pedirá cambiarla al entrar.</p>
        <div className="flex gap-2">
          <Input readOnly value={temporal ?? ''} className="font-mono" onFocus={(e) => e.target.select()} />
          <Button icon={Copy} onClick={() => navigator.clipboard.writeText(temporal ?? '').then(() => toast.success('Copiada')).catch(() => {})}>
            Copiar
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function UsuarioDialog({ u, roles, onClose, onTemporal }: { u: any; roles: any[]; onClose: () => void; onTemporal: (p: string) => void }) {
  const nuevo = !u.id;
  const catalogo = useApi<any[]>('/permisos/catalogo');
  const [f, setF] = useState({ email: u.email ?? '', personaId: u.personaId ?? null, rolId: u.rolId ?? roles.find((r) => r.clave === 'empleado')?.id ?? null, activo: u.activo ?? true, accesoHasta: u.accesoHasta ?? '', enviarInvitacion: true });
  const [extra, setExtra] = useState<{ permiso: string; alcance: string }[]>(u.permisosExtra ?? []);
  const [nuevoPerm, setNuevoPerm] = useState('');
  const save = useMut(
    () =>
      nuevo
        ? api.post<{ passwordTemporal: string | null }>('/usuarios', { ...f, accesoHasta: f.accesoHasta || null, permisosExtra: extra })
        : api.patch(`/usuarios/${u.id}`, { personaId: f.personaId, rolId: f.rolId, activo: f.activo, accesoHasta: f.accesoHasta || null, permisosExtra: extra }),
    {
      ok: nuevo ? 'Usuario creado' : 'Usuario actualizado',
      invalidate: ['/usuarios', '/roles'],
      onSuccess: (r: any) => {
        onClose();
        if (r?.passwordTemporal) onTemporal(r.passwordTemporal);
      },
    },
  );
  const rol = roles.find((r) => r.id === f.rolId);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={nuevo ? 'Nuevo usuario' : `Usuario: ${u.nombre}`}
      size="lg"
      footer={
        <Button variant="primary" disabled={!f.email} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Guardar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email de acceso" required>
            <Input type="email" value={f.email} disabled={!nuevo} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Persona" help="Vincula el usuario con su ficha del directorio">
            <RefSelect target="personas" value={f.personaId} onChange={(v) => setF({ ...f, personaId: v })} />
          </Field>
          <Field label="Rol">
            <Select value={f.rolId ?? ''} onChange={(e) => setF({ ...f, rolId: e.target.value || null })} options={roles.map((r) => ({ value: r.id, label: r.nombre }))} placeholder="Sin rol" />
          </Field>
          <Field label="Acceso hasta (opcional)" help="Para personal temporal o la gestoría">
            <Input type="date" value={f.accesoHasta} onChange={(e) => setF({ ...f, accesoHasta: e.target.value })} />
          </Field>
        </div>
        {rol && <Alert tone="violet" icon={UserCog}>{rol.descripcion}</Alert>}
        {nuevo ? (
          <Checkbox checked={f.enviarInvitacion} onChange={(v) => setF({ ...f, enviarInvitacion: v })} label="Enviar email de bienvenida con la contraseña temporal" />
        ) : (
          <Switch checked={f.activo} onChange={(v) => setF({ ...f, activo: v })} label="Puede entrar" description="Si lo desactivas se cierran sus sesiones al momento." />
        )}
        <div className="space-y-2">
          <p className="label">Permisos adicionales al rol</p>
          {extra.map((x, i) => {
            const def = catalogo.data?.find((c) => c.key === x.permiso);
            return (
              <div key={x.permiso} className="flex items-center gap-2 rounded-lg border border-line-strong/70 px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{def?.label ?? x.permiso}</span>
                {def?.scoped && (
                  <Select className="w-44 py-1" value={x.alcance} onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, alcance: e.target.value } : y)))} options={SCOPES.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))} />
                )}
                <button type="button" className="text-muted hover:text-bad" onClick={() => setExtra(extra.filter((_, j) => j !== i))}>
                  Quitar
                </button>
              </div>
            );
          })}
          <div className="flex gap-2">
            <Select value={nuevoPerm} onChange={(e) => setNuevoPerm(e.target.value)} placeholder="Añadir un permiso…">
              {catalogo.data
                ?.filter((c) => !extra.some((x) => x.permiso === c.key))
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.moduloNombre}: {c.label}
                  </option>
                ))}
            </Select>
            <Button disabled={!nuevoPerm} onClick={() => { setExtra([...extra, { permiso: nuevoPerm, alcance: 'todo' }]); setNuevoPerm(''); }}>
              Añadir
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
