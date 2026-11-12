import { Lock } from 'lucide-react';
import { moduleInfo, PILLARS, type Pillar } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { iconByName, PILLAR_CLASSES, cn } from '@/lib/utils';
import { Alert, Badge, Card, Spinner, Switch, useConfirm } from '@/components/ui';

export default function Modulos() {
  const { refresh } = useSession();
  const confirm = useConfirm();
  const { data, isLoading } = useApi<any[]>('/modulos');
  const cambiar = useMut((p: { code: string; activo: boolean }) => api.post(`/modulos/${p.code}`, { activo: p.activo }), {
    ok: (r) => (r ? 'Módulo actualizado' : null),
    invalidate: ['/modulos', '/panel'],
    onSuccess: () => refresh(),
  });
  if (isLoading) return <Spinner />;
  const porPilar = (Object.keys(PILLARS) as Pillar[]).map((p) => ({ p, mods: (data ?? []).filter((m) => m.pillar === p) }));
  return (
    <div className="space-y-5">
      <Alert tone="violet">
        Cada módulo es independiente y comparte la misma base de datos. Desactivar un módulo oculta sus menús y pantallas, pero <b>no borra ningún dato</b>: al reactivarlo, todo vuelve como estaba.
      </Alert>
      {porPilar.map(({ p, mods }) => (
        <section key={p}>
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold">
            <span className={cn('h-2.5 w-2.5 rounded-full', PILLAR_CLASSES[p]!.dot)} />
            {PILLARS[p].label}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {mods.map((m) => {
              const Icon = iconByName(m.icon);
              return (
                <Card key={m.code} className={cn('flex items-start gap-3 p-4', !m.activo && 'opacity-75')}>
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', PILLAR_CLASSES[p]!.soft, PILLAR_CLASSES[p]!.text)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[14.5px] font-semibold">{m.name}</p>
                      <code className="text-[11px] uppercase text-muted">{m.code}</code>
                    </div>
                    <p className="text-[13px] text-muted">{m.description}</p>
                    {m.requires.length > 0 && <p className="mt-1 text-[12px] text-muted">Necesita: {m.requires.map((g: string[]) => g.map((c) => moduleInfo(c)?.short).join(' o ')).join(' y ')}</p>}
                    {m.connects.length > 0 && <p className="text-[12px] text-muted">Se conecta con: {m.connects.map((c: string) => moduleInfo(c)?.short).join(', ')}</p>}
                  </div>
                  {m.core ? (
                    <Badge tone="purple">
                      <Lock className="h-3 w-3" /> Núcleo
                    </Badge>
                  ) : (
                    <Switch
                      checked={m.activo}
                      disabled={cambiar.isPending}
                      onChange={async (v) => {
                        if (!v && !(await confirm({ title: `Desactivar ${m.name}`, message: 'Sus menús y pantallas dejarán de verse para todos. Los datos se conservan.', confirm: 'Desactivar' }))) return;
                        cambiar.mutate({ code: m.code, activo: v });
                      }}
                    />
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
