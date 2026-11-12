import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, FileText, PenLine } from 'lucide-react';
import { fmtDateTime } from '@kite/shared';
import { api } from '@/lib/api';
import { useApi, useMut } from '@/lib/hooks';
import { Alert, Button, Card, Checkbox, SignaturePad, Spinner } from '@/components/ui';
import { PublicLayout } from './PublicLayout';

export default function PublicFirma() {
  const { token } = useParams();
  const url = `/public/firmas/${token}`;
  const { data: f, isLoading, error, refetch } = useApi<any>(url, { retry: false });
  const [firma, setFirma] = useState<string | null>(null);
  const [acepto, setAcepto] = useState(false);
  const firmar = useMut(() => api.post(url, { firma, acepto: true }), { onSuccess: () => refetch() });
  if (isLoading) return <Spinner className="h-dvh" />;
  if (error || !f)
    return (
      <PublicLayout>
        <Alert tone="red">Este enlace de firma no existe.</Alert>
      </PublicLayout>
    );
  return (
    <PublicLayout empresa={f.empresa} marca={f.marca}>
      <div className="space-y-5">
        <div>
          <p className="text-[13px] text-muted">Documento para firmar</p>
          <h1 className="text-[24px] font-semibold">{f.titulo}</h1>
          <p className="text-[13.5px] text-muted">Firmante: {f.firmante}</p>
        </div>
        {f.estado === 'firmado' && (
          <Alert tone="green" icon={CheckCircle2} title="Documento firmado">
            Firmado el {fmtDateTime(f.firmadoEn)}.{' '}
            {f.url && (
              <a href={f.url} target="_blank" rel="noreferrer" className="font-semibold underline">
                Descargar copia firmada
              </a>
            )}
          </Alert>
        )}
        {f.estado === 'caducado' && <Alert tone="yellow">El plazo para firmar ha terminado. Pide un nuevo enlace.</Alert>}
        {f.url && (
          <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card hover:bg-sunken/60">
            <FileText className="h-6 w-6 text-primary" />
            <span>
              <span className="block font-medium">Leer el documento completo</span>
              <span className="text-[12.5px] text-muted">Se abre en una pestaña nueva (PDF)</span>
            </span>
          </a>
        )}
        {f.contenido && !f.url && <Card className="whitespace-pre-wrap p-4 text-[14px]">{f.contenido}</Card>}
        {f.estado === 'pendiente' && (
          <Card className="space-y-4 p-4">
            <h2 className="flex items-center gap-2 text-[17px] font-bold">
              <PenLine className="h-5 w-5 text-primary" /> Firma
            </h2>
            <SignaturePad onChange={setFirma} />
            <Checkbox checked={acepto} onChange={setAcepto} label="He leído el documento y acepto firmarlo electrónicamente." description="Se guardarán la fecha, la hora, tu dirección IP y una huella del documento como evidencia." />
            {firmar.isError && <Alert tone="red">{String((firmar.error as Error)?.message)}</Alert>}
            <Button variant="primary" size="lg" className="w-full sm:w-auto" disabled={!firma || !acepto} loading={firmar.isPending} onClick={() => firmar.mutate(undefined)}>
              Firmar documento
            </Button>
          </Card>
        )}
      </div>
    </PublicLayout>
  );
}
