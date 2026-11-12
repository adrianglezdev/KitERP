import { useState } from 'react';
import { fmtDateTime } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { Alert, Badge, Card, DataTable, Dialog } from '@/components/ui';

const ESTADO: Record<string, { label: string; tone: 'green' | 'yellow' | 'red' | 'gray' }> = {
  enviado: { label: 'Enviado', tone: 'green' },
  pendiente: { label: 'En cola', tone: 'yellow' },
  sin_smtp: { label: 'Sin servidor de correo', tone: 'gray' },
  error: { label: 'Error', tone: 'red' },
};

export default function Emails() {
  const { data, isLoading } = useApi<any[]>('/emails');
  const [ver, setVer] = useState<string | null>(null);
  const detalle = useApi<any>(ver ? `/emails/${ver}` : null);
  const sinSmtp = data?.some((e) => e.estado === 'sin_smtp');
  return (
    <div className="space-y-4">
      {sinSmtp && <Alert tone="yellow" title="El servidor de correo no está configurado">Los emails se guardan aquí y se enviarán en cuanto se configure el SMTP (variables SMTP_* del servidor). No se pierde ninguno.</Alert>}
      <Card className="overflow-hidden">
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          onRowClick={(r) => setVer(r.id)}
          columns={[
            { key: 'para', header: 'Para', cell: (r) => r.para },
            { key: 'asunto', header: 'Asunto', cell: (r) => <span className="block max-w-[340px] truncate">{r.asunto}</span> },
            { key: 'estado', header: 'Estado', cell: (r) => <Badge tone={ESTADO[r.estado]?.tone ?? 'gray'} dot>{ESTADO[r.estado]?.label ?? r.estado}</Badge> },
            { key: 'fecha', header: 'Fecha', cell: (r) => fmtDateTime(r.enviadoEn ?? r.creadoEn) },
          ]}
          mobileTitle={(r) => r.asunto}
          mobileSubtitle={(r) => r.para}
        />
      </Card>
      <Dialog open={!!ver} onOpenChange={(o) => !o && setVer(null)} title={detalle.data?.asunto ?? 'Email'} size="lg">
        {detalle.data && <iframe title="Contenido del email" sandbox="" srcDoc={detalle.data.html} className="h-[60vh] w-full rounded-lg border border-line-strong/70 bg-white" />}
      </Dialog>
    </div>
  );
}
