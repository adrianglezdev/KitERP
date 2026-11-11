import { useState } from 'react';
import { CheckCircle2, Eye, Megaphone, Pin, Plus, Trash2 } from 'lucide-react';
import { fmtDate } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn, relTime } from '@/lib/utils';
import { Avatar, Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, IconButton, Input, PageHeader, RefMultiSelect, Spinner, Textarea, useConfirm } from '@/components/ui';

export default function Tablon() {
  const { can } = useSession();
  const confirm = useConfirm();
  const { data, isLoading } = useApi<any[]>('/anuncios');
  const [nuevo, setNuevo] = useState(false);
  const [lecturas, setLecturas] = useState<string | null>(null);
  const leer = useMut((id: string) => api.post(`/anuncios/${id}/leido`), { invalidate: ['/anuncios', '/panel'] });
  const borrar = useMut((id: string) => api.del(`/anuncios/${id}`), { ok: 'Aviso retirado', invalidate: ['/anuncios'] });
  const gestor = can('msg.anuncios');
  return (
    <>
      <PageHeader
        title="Tablón"
        icon={Megaphone}
        subtitle="Avisos de la empresa para toda la plantilla o para departamentos concretos."
        actions={
          gestor && (
            <Button variant="primary" icon={Plus} onClick={() => setNuevo(true)}>
              Publicar aviso
            </Button>
          )
        }
      />
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={Megaphone} title="No hay avisos publicados" />
        </Card>
      ) : (
        <div className="max-w-3xl space-y-3">
          {data.map((a) => (
            <Card key={a.id} className={cn('p-4', !a.leido && 'border-primary/40')}>
              <div className="flex items-start gap-3">
                <Avatar name={a.autor ?? 'Empresa'} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.fijado && <Pin className="h-4 w-4 text-primary" />}
                    <h3 className="text-[16px] font-bold">{a.titulo}</h3>
                    {!a.leido && <Badge tone="violet">Nuevo</Badge>}
                    {a.departamentos?.length > 0 && <Badge>Solo algunos departamentos</Badge>}
                  </div>
                  <p className="text-[12.5px] text-muted">
                    {a.autor ?? 'Empresa'} · {relTime(a.publicadoEn)}
                    {a.caduca && ` · visible hasta el ${fmtDate(a.caduca)}`}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed">{a.cuerpo}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {!a.leido && (
                      <Button size="sm" variant={a.requiereConfirmacion ? 'primary' : 'secondary'} icon={CheckCircle2} onClick={() => leer.mutate(a.id)}>
                        {a.requiereConfirmacion ? 'Confirmo que lo he leído' : 'Marcar como leído'}
                      </Button>
                    )}
                    {gestor && (
                      <>
                        <Button size="sm" variant="ghost" icon={Eye} onClick={() => setLecturas(a.id)}>
                          {a.lecturas ?? 0} lecturas
                        </Button>
                        <IconButton icon={Trash2} label="Retirar aviso" size="sm" onClick={async () => (await confirm({ title: 'Retirar aviso', danger: true, confirm: 'Retirar' })) && borrar.mutate(a.id)} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {nuevo && <NuevoAviso onClose={() => setNuevo(false)} />}
      {lecturas && <Lecturas id={lecturas} onClose={() => setLecturas(null)} />}
    </>
  );
}

function NuevoAviso({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ titulo: '', cuerpo: '', departamentos: [] as string[], requiereConfirmacion: false, fijado: false, caduca: '', avisarPorEmail: false });
  const pub = useMut(() => api.post('/anuncios', { ...f, caduca: f.caduca || null }), { ok: 'Aviso publicado', invalidate: ['/anuncios'], onSuccess: onClose });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Publicar aviso"
      size="lg"
      footer={
        <Button variant="primary" disabled={!f.titulo || !f.cuerpo} loading={pub.isPending} onClick={() => pub.mutate(undefined)}>
          Publicar
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Título" required>
          <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        </Field>
        <Field label="Mensaje" required>
          <Textarea value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} rows={6} />
        </Field>
        <Field label="Departamentos" help="Déjalo vacío para que lo vea toda la empresa">
          <RefMultiSelect target="departamentos" value={f.departamentos} onChange={(v) => setF({ ...f, departamentos: v })} />
        </Field>
        <Field label="Visible hasta (opcional)">
          <Input type="date" value={f.caduca} onChange={(e) => setF({ ...f, caduca: e.target.value })} />
        </Field>
        <Checkbox checked={f.requiereConfirmacion} onChange={(v) => setF({ ...f, requiereConfirmacion: v })} label="Pedir confirmación de lectura" description="Útil para normas internas, protocolos o cambios de horario." />
        <Checkbox checked={f.fijado} onChange={(v) => setF({ ...f, fijado: v })} label="Fijar arriba" />
        <Checkbox checked={f.avisarPorEmail} onChange={(v) => setF({ ...f, avisarPorEmail: v })} label="Enviar también por email" />
      </div>
    </Dialog>
  );
}

function Lecturas({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useApi<any[]>(`/anuncios/${id}/lecturas`);
  const leidos = (data ?? []).filter((d) => d.leidoEn);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Confirmaciones de lectura" description={data ? `${leidos.length} de ${data.length} personas lo han leído` : undefined}>
      <ul className="divide-y divide-line">
        {data?.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-2 text-[13.5px]">
            <span>{p.nombre}</span>
            {p.leidoEn ? <Badge tone="green">{relTime(p.leidoEn)}</Badge> : <Badge>Sin leer</Badge>}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
