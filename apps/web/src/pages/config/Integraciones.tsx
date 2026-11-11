import { useState } from 'react';
import { Copy, Download, FileUp, KeyRound, Plus, Trash2, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDateTime } from '@kite/shared';
import { api, download, errorMessage } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Alert, Badge, Button, Card, CardHeader, Checkbox, Dialog, Field, IconButton, Input, Select, useConfirm } from '@/components/ui';

const EVENTOS = ['*', 'ventas.factura_emitida', 'ventas.presupuesto_aceptado', 'ventas.pedido_confirmado', 'ventas.albaran_entregado', 'compras.recepcion_confirmada', 'tes.cobro_registrado', 'persona.creada'];

export default function Integraciones() {
  const confirm = useConfirm();
  const claves = useApi<any[]>('/api-claves');
  const hooks = useApi<any[]>('/webhooks');
  const [nuevaClave, setNuevaClave] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [soloLectura, setSoloLectura] = useState(true);
  const [hook, setHook] = useState({ url: '', eventos: ['ventas.factura_emitida'] });
  const crearClave = useMut(
    () => api.post<{ token: string }>('/api-claves', { nombre, permisos: soloLectura ? { 'terceros.ver': 'todo', 'catalogo.ver': 'todo', 'fac.ver': 'todo', 'pre.ver': 'todo', 'ped.ver': 'todo' } : { 'terceros.ver': 'todo', 'terceros.gestionar': 'todo', 'catalogo.ver': 'todo', 'catalogo.gestionar': 'todo', 'ped.ver': 'todo', 'ped.editar': 'todo', 'fac.ver': 'todo' } }),
    { invalidate: ['/api-claves'], onSuccess: (r) => { setToken(r.token); setNuevaClave(false); setNombre(''); } },
  );
  const revocar = useMut((id: string) => api.del(`/api-claves/${id}`), { ok: 'Clave revocada', invalidate: ['/api-claves'] });
  const crearHook = useMut(() => api.post('/webhooks', hook), { ok: 'Webhook creado', invalidate: ['/webhooks'], onSuccess: () => setHook({ url: '', eventos: ['ventas.factura_emitida'] }) });
  const borrarHook = useMut((id: string) => api.del(`/webhooks/${id}`), { invalidate: ['/webhooks'] });

  return (
    <div className="space-y-5">
      <Importar />
      <Card>
        <CardHeader title="Claves de API" icon={KeyRound} subtitle="Para conectar la tienda online, la gestoría u otros programas" actions={<Button size="sm" icon={Plus} onClick={() => setNuevaClave(true)}>Nueva clave</Button>} />
        <ul className="divide-y divide-line">
          {claves.data?.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.nombre}</span>
                <span className="text-[12px] text-muted">kite_{c.prefijo}_… · {c.ultimoUso ? `último uso ${fmtDateTime(c.ultimoUso)}` : 'sin usar'}</span>
              </span>
              {c.revocadaEn ? <Badge tone="red">Revocada</Badge> : <IconButton icon={Trash2} label="Revocar" size="sm" onClick={async () => (await confirm({ title: 'Revocar clave', message: 'Las integraciones que la usen dejarán de funcionar.', danger: true, confirm: 'Revocar' })) && revocar.mutate(c.id)} />}
            </li>
          ))}
          {!claves.data?.length && <li className="px-4 py-5 text-center text-[13px] text-muted">No hay claves creadas.</li>}
        </ul>
        <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-muted">
          Uso: cabecera <code>Authorization: Bearer kite_…</code> contra <code>/api/…</code> (las mismas rutas que usa la web).
        </p>
      </Card>
      <Card>
        <CardHeader title="Webhooks" icon={Webhook} subtitle="Avisos automáticos a otra aplicación cuando ocurre algo, firmados con HMAC-SHA256" />
        <ul className="divide-y divide-line">
          {hooks.data?.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{h.url}</span>
                <span className="text-[12px] text-muted">{h.eventos.join(', ')} · secreto {h.secreto.slice(0, 6)}… {h.ultimoEstado && `· último envío ${h.ultimoEstado}`}</span>
              </span>
              <IconButton icon={Trash2} label="Borrar" size="sm" onClick={() => borrarHook.mutate(h.id)} />
            </li>
          ))}
        </ul>
        <div className="grid gap-2 border-t border-line p-4 sm:grid-cols-[1fr_240px_auto]">
          <Input placeholder="https://…" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} />
          <Select value={hook.eventos[0]} onChange={(e) => setHook({ ...hook, eventos: [e.target.value] })} options={EVENTOS.map((e) => ({ value: e, label: e === '*' ? 'Todos los eventos' : e }))} />
          <Button icon={Plus} disabled={!hook.url.startsWith('https://')} onClick={() => crearHook.mutate(undefined)}>
            Añadir
          </Button>
        </div>
      </Card>
      <Dialog open={nuevaClave} onOpenChange={setNuevaClave} title="Nueva clave de API" size="sm" footer={<Button variant="primary" disabled={!nombre} loading={crearClave.isPending} onClick={() => crearClave.mutate(undefined)}>Crear</Button>}>
        <div className="space-y-3">
          <Field label="Nombre">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Tienda online" />
          </Field>
          <Checkbox checked={soloLectura} onChange={setSoloLectura} label="Solo lectura" description="Sin marcar, también puede crear clientes, artículos y pedidos." />
        </div>
      </Dialog>
      <Dialog open={!!token} onOpenChange={(o) => !o && setToken(null)} title="Copia la clave ahora" size="sm">
        <Alert tone="yellow" className="mb-3">No se volverá a mostrar. Guárdala en un lugar seguro.</Alert>
        <div className="flex gap-2">
          <Input readOnly value={token ?? ''} className="font-mono text-[12px]" onFocus={(e) => e.target.select()} />
          <Button icon={Copy} onClick={() => navigator.clipboard.writeText(token ?? '').then(() => toast.success('Copiada')).catch(() => {})}>
            Copiar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Importar() {
  const [tipo, setTipo] = useState('terceros');
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const enviar = async (simular: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const r = await api.post(`/importar/${tipo}${simular ? '?simular=1' : ''}`, fd);
      setRes({ ...r, simulado: simular });
      if (!simular) toast.success(`Importación terminada: ${r.creados} nuevos y ${r.actualizados} actualizados`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title="Importar desde Excel" icon={FileUp} subtitle="Para la puesta en marcha: clientes y proveedores, artículos o personas" />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Qué importar" className="w-56">
            <Select value={tipo} onChange={(e) => { setTipo(e.target.value); setRes(null); }} options={[{ value: 'terceros', label: 'Clientes y proveedores' }, { value: 'articulos', label: 'Artículos' }, { value: 'personas', label: 'Personas' }]} />
          </Field>
          <Button icon={Download} onClick={() => download(`/importar/${tipo}/plantilla`)}>
            Descargar plantilla
          </Button>
        </div>
        <input type="file" accept=".xlsx,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }} className="block text-[13px]" />
        <div className="flex gap-2">
          <Button disabled={!file} loading={busy} onClick={() => enviar(true)}>
            Comprobar
          </Button>
          <Button variant="primary" disabled={!file || !res?.simulado || !res.validas} loading={busy} onClick={() => enviar(false)}>
            Importar {res?.validas ? `${res.validas} filas` : ''}
          </Button>
        </div>
        {res && (
          <Alert tone={res.errores.length ? 'yellow' : 'green'} title={res.simulado ? `${res.validas} filas correctas, ${res.errores.length} con errores` : 'Importación completada'}>
            {res.errores.slice(0, 8).map((e: any) => (
              <span key={e.fila} className="block">
                Fila {e.fila}: {e.error}
              </span>
            ))}
            {res.simulado && !res.errores.length && 'Si existen registros con el mismo NIF, referencia o email, se actualizarán.'}
          </Alert>
        )}
      </div>
    </Card>
  );
}
