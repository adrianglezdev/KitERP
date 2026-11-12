import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Download, XCircle } from 'lucide-react';
import { fmtDate, fmtMoney, fmtNumber } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Alert, Button, Card, Field, Input, SignaturePad, Spinner, Textarea } from '@/components/ui';
import { PublicLayout } from './PublicLayout';

/** Lo que ve el cliente al abrir el enlace de un presupuesto o factura. */
export default function PublicDocumento() {
  const { token } = useParams();
  const url = `/public/documentos/${token}`;
  const { data: d, isLoading, error, refetch } = useApi<any>(url, { retry: false });
  const [modo, setModo] = useState<'aceptar' | 'rechazar' | null>(null);
  const [nombre, setNombre] = useState('');
  const [firma, setFirma] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const responder = useMut(() => api.post(`${url}/responder`, { aceptar: modo === 'aceptar', nombre, firma, motivo }), { onSuccess: () => { setModo(null); refetch(); } });

  if (isLoading) return <Spinner className="h-dvh" />;
  if (error || !d)
    return (
      <PublicLayout>
        <Alert tone="red">Este enlace no existe o ha caducado. Pide uno nuevo a quien te lo envió.</Alert>
      </PublicLayout>
    );
  const puedeResponder = d.tipo === 'presupuesto' && ['enviado', 'visto'].includes(d.estado);
  return (
    <PublicLayout empresa={d.empresa.nombre} logoUrl={d.empresa.logoUrl} marca={d.marca}>
      <div className="space-y-5">
        <div>
          <p className="text-[13px] text-muted">
            {d.tipoLabel} {d.codigo} · {fmtDate(d.fecha)}
            {d.fechaValidez && d.tipo === 'presupuesto' && ` · válido hasta el ${fmtDate(d.fechaValidez)}`}
          </p>
          <h1 className="text-[24px] font-semibold">{d.titulo ?? `${d.tipoLabel} para ${d.cliente}`}</h1>
        </div>
        {d.estado === 'aceptado' && <Alert tone="green" icon={CheckCircle2} title="Presupuesto aceptado">Aceptado por {d.aceptadoPor} el {fmtDate(d.aceptadoEn)}. Gracias: nos pondremos en contacto contigo.</Alert>}
        {d.estado === 'rechazado' && <Alert tone="gray" title="Presupuesto rechazado">Hemos recibido tu respuesta. Si cambias de idea, contacta con nosotros.</Alert>}
        {d.estado === 'caducado' && <Alert tone="yellow" title="Presupuesto caducado">El plazo de validez ha terminado. Pide uno actualizado.</Alert>}

        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {d.lineas.map((l: any, i: number) =>
              l.tipoLinea !== 'articulo' ? (
                <li key={i} className={`px-4 py-2 text-[13.5px] ${l.tipoLinea === 'capitulo' ? 'font-semibold text-primary' : 'text-muted'}`}>
                  {l.descripcion}
                </li>
              ) : (
                <li key={i} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[14px]">{l.descripcion}</p>
                    <p className="text-[12.5px] text-muted">
                      {fmtNumber(l.cantidad, 3)} × {fmtMoney(l.precio)}
                      {l.descuento ? ` · dto. ${fmtNumber(l.descuento)} %` : ''}
                    </p>
                  </div>
                  <span className="tabular shrink-0 font-medium">{fmtMoney(l.subtotal)}</span>
                </li>
              ),
            )}
          </ul>
          <div className="space-y-1 border-t border-line bg-sunken/40 px-4 py-3 text-[14px]">
            <div className="flex justify-between text-muted">
              <span>Base imponible</span>
              <span className="tabular">{fmtMoney(d.baseImponible)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>IVA</span>
              <span className="tabular">{fmtMoney(d.totalIva)}</span>
            </div>
            <div className="flex justify-between font-display text-[20px] font-semibold">
              <span>Total</span>
              <span className="tabular">{fmtMoney(d.total)}</span>
            </div>
          </div>
        </Card>
        {(d.observaciones || d.condiciones) && (
          <div className="space-y-2 text-[13.5px] text-muted">
            {d.observaciones && <p className="whitespace-pre-wrap">{d.observaciones}</p>}
            {d.condiciones && <p className="whitespace-pre-wrap">{d.condiciones}</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <a href={`/api${d.pdf.replace(/^\/api/, '')}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong/70 bg-surface px-4 text-[14px] font-medium hover:bg-sunken">
            <Download className="h-4 w-4" /> Descargar PDF
          </a>
          {puedeResponder && !modo && (
            <>
              <Button variant="primary" size="lg" icon={CheckCircle2} onClick={() => setModo('aceptar')}>
                Aceptar presupuesto
              </Button>
              <Button size="lg" icon={XCircle} onClick={() => setModo('rechazar')}>
                No me interesa
              </Button>
            </>
          )}
        </div>
        {modo && (
          <Card className="space-y-3 p-4">
            <h2 className="text-[17px] font-bold">{modo === 'aceptar' ? 'Aceptar el presupuesto' : 'Rechazar el presupuesto'}</h2>
            <Field label="Tu nombre y apellidos">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Field>
            {modo === 'aceptar' ? (
              <Field label="Firma">
                <SignaturePad onChange={setFirma} />
              </Field>
            ) : (
              <Field label="¿Nos cuentas el motivo? (opcional)">
                <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
              </Field>
            )}
            {responder.isError && <Alert tone="red">{String((responder.error as Error)?.message)}</Alert>}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setModo(null)}>
                Volver
              </Button>
              <Button variant={modo === 'aceptar' ? 'primary' : 'danger'} disabled={nombre.trim().length < 2 || (modo === 'aceptar' && !firma)} loading={responder.isPending} onClick={() => responder.mutate(undefined)}>
                {modo === 'aceptar' ? 'Confirmar aceptación' : 'Enviar respuesta'}
              </Button>
            </div>
          </Card>
        )}
        {(d.empresa.email || d.empresa.telefono) && (
          <p className="text-[13px] text-muted">
            ¿Dudas? {d.empresa.telefono && <a href={`tel:${d.empresa.telefono.replace(/\s/g, '')}`} className="text-primary">{d.empresa.telefono}</a>} {d.empresa.email && <a href={`mailto:${d.empresa.email}`} className="text-primary">{d.empresa.email}</a>}
          </p>
        )}
      </div>
    </PublicLayout>
  );
}
