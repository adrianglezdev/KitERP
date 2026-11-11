import { Link } from 'react-router-dom';
import { CheckCircle2, Download, ShieldAlert, ShieldCheck } from 'lucide-react';
import { fmtDateTime, fmtMoney } from '@kite/shared';
import { download } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Alert, Badge, Button, Card, DataTable, IconButton, PageHeader } from '@/components/ui';

export default function Verifactu() {
  const { data, isLoading } = useApi<any[]>('/verifactu');
  const cadena = useApi<{ registros: number; correcta: boolean; errores: string[] }>('/verifactu/verificar');
  const pendientes = (data ?? []).filter((r) => r.estadoEnvio !== 'aceptado').length;
  return (
    <>
      <PageHeader
        title="Verifactu"
        icon={ShieldCheck}
        subtitle="Registro inalterable de facturación (RD 1007/2023). Cada factura emitida se encadena con la anterior mediante una huella SHA-256."
        actions={
          <Button icon={ShieldCheck} loading={cadena.isFetching} onClick={() => cadena.refetch()}>
            Comprobar la cadena
          </Button>
        }
      />
      <div className="mb-5 grid gap-3 md:grid-cols-2">
        {cadena.data &&
          (cadena.data.correcta ? (
            <Alert tone="green" icon={CheckCircle2} title="Cadena íntegra">
              Se han comprobado {cadena.data.registros} registros: ninguna factura se ha alterado ni falta ninguna.
            </Alert>
          ) : (
            <Alert tone="red" icon={ShieldAlert} title="La cadena tiene incidencias">
              {cadena.data.errores.slice(0, 5).join('. ')}
            </Alert>
          ))}
        {pendientes > 0 && (
          <Alert tone="yellow" title={`${pendientes} registros pendientes de remitir a la AEAT`}>
            Para el envío automático hace falta instalar el certificado electrónico de la empresa en el servidor. Mientras tanto los registros quedan guardados y encadenados, y el QR de cada factura ya es válido para su cotejo.
          </Alert>
        )}
      </div>
      <Card className="overflow-hidden">
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          columns={[
            { key: 'secuencia', header: 'Nº', cell: (r) => <span className="tabular text-muted">{r.secuencia}</span> },
            { key: 'numSerie', header: 'Factura', cell: (r) => <Link to={`/documentos/${r.documentoId}`} className="font-medium hover:text-primary">{r.numSerie}</Link> },
            { key: 'fecha', header: 'Expedición', cell: (r) => r.fechaExpedicion },
            { key: 'tipo', header: 'Tipo', cell: (r) => <Badge tone="purple">{r.tipoFactura}</Badge> },
            { key: 'huella', header: 'Huella', hideBelow: 'lg', cell: (r) => <code className="text-[11.5px] text-muted">{r.huella.slice(0, 20)}…</code> },
            { key: 'estado', header: 'Envío', cell: (r) => <Badge tone={r.estadoEnvio === 'aceptado' ? 'green' : 'yellow'}>{r.estadoEnvio === 'sin_certificado' ? 'Pendiente' : r.estadoEnvio}</Badge> },
            { key: 'importe', header: 'Importe', align: 'right', cell: (r) => fmtMoney(r.importeTotal) },
            { key: 'creado', header: 'Generado', hideBelow: 'xl', cell: (r) => fmtDateTime(r.creadoEn) },
            { key: 'xml', header: '', cell: (r) => <IconButton icon={Download} label="Descargar XML" size="sm" onClick={() => download(`/verifactu/${r.id}/xml`)} /> },
          ]}
          mobileTitle={(r) => r.numSerie}
          mobileSubtitle={(r) => `${r.fechaExpedicion} · ${r.tipoFactura}`}
          mobileRight={(r) => <span className="tabular font-semibold">{fmtMoney(r.importeTotal)}</span>}
        />
      </Card>
      <p className="mt-3 text-[12.5px] text-muted">
        Calendario vigente: obligatorio para sociedades desde el 1 de enero de 2027 y para el resto desde el 1 de julio de 2027 (revisa cualquier cambio normativo).{' '}
        <Download className="hidden" />
      </p>
    </>
  );
}
