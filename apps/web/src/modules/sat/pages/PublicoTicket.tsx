import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, LifeBuoy } from 'lucide-react';
import { fmtDateTime } from '@kite/shared';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Alert, Button, Card, Field, Spinner, Textarea } from '@/components/ui';
import { PublicLayout } from '@/pages/public/PublicLayout';
import { ContactoEmpresa, EstadoCliente, Estrellas, type EmpresaPublica } from './PublicoComun';

/** Seguimiento de un aviso por parte del cliente, con valoración al terminar. */
export default function PublicoTicket() {
  const { token } = useParams();
  const { data: t, isLoading, error, refetch } = useApi<any>(`/sat/public/ticket/${token}`, { retry: false });
  const [val, setVal] = useState(0);
  const [comentario, setComentario] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const empresa: EmpresaPublica | undefined = t?.empresa;
  async function valorar() {
    setBusy(true);
    setErr('');
    try {
      await api.post(`/sat/public/ticket/${token}/valorar`, { valoracion: val, comentario: comentario || null });
      await refetch();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicLayout empresa={empresa?.nombre} logoUrl={empresa?.logoUrl} marca={empresa?.marca}>
      {isLoading ? (
        <Spinner />
      ) : error || !t ? (
        <Alert tone="red">{errorMessage(error)}</Alert>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-[13px] text-muted">Aviso {t.codigo}</p>
            <h1 className="mt-0.5 flex items-center gap-2 text-[22px] font-semibold">
              <LifeBuoy className="h-6 w-6 shrink-0 text-primary" /> {t.asunto}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <EstadoCliente estado={t.estado} />
              <span>Abierto el {fmtDateTime(t.creadoEn)}</span>
              {t.equipo && <span>· {t.equipo}</span>}
            </div>
          </div>
          {t.descripcion && <Card className="whitespace-pre-line p-4 text-[14px]">{t.descripcion}</Card>}
          {t.resueltoEn && (
            <Alert tone="green" icon={CheckCircle2} title="Asistencia resuelta">
              El {fmtDateTime(t.resueltoEn)}.
            </Alert>
          )}
          {t.puedeValorar && (
            <Card className="space-y-3 p-4">
              <h2 className="text-[16px] font-bold">¿Qué tal te hemos atendido?</h2>
              {err && <Alert tone="red">{err}</Alert>}
              <Estrellas value={val} onChange={setVal} />
              <Field label="Comentario (opcional)">
                <Textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} />
              </Field>
              <Button variant="primary" disabled={!val} loading={busy} onClick={valorar}>
                Enviar valoración
              </Button>
            </Card>
          )}
          {!!t.valoracion && (
            <Card className="space-y-2 p-4">
              <p className="text-[14px] font-semibold">Gracias por tu valoración</p>
              <Estrellas value={t.valoracion} size="sm" />
              {t.valoracionComentario && <p className="text-[13.5px] text-muted">{t.valoracionComentario}</p>}
            </Card>
          )}
          <ContactoEmpresa empresa={empresa} />
          {t.portalToken && (
            <Link to={`/publico/sat/${t.portalToken}`} className="inline-block text-[13.5px] font-semibold text-primary hover:underline">
              Ver todos mis equipos y avisos
            </Link>
          )}
        </div>
      )}
    </PublicLayout>
  );
}
