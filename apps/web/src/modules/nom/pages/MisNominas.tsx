import { useState } from 'react';
import { FileBadge, HandCoins, Wallet } from 'lucide-react';
import { download } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { AnticipoDialog, AnticipoFila, ListaRecibos } from '../comun';

/** Portal del empleado: mis recibos, certificado de empresa y anticipos. */
export default function MisNominas() {
  const [pedir, setPedir] = useState(false);
  const ant = useApi<any[]>('/nom/anticipos?mias=1');
  return (
    <>
      <PageHeader
        title="Mis nóminas"
        icon={Wallet}
        subtitle="Tus recibos y documentos laborales. Solo tú y RRHH podéis verlos."
        actions={
          <>
            <Button icon={FileBadge} onClick={() => download('/nom/certificado', 'certificado-empresa.pdf')}>
              Certificado de empresa
            </Button>
            <Button icon={HandCoins} onClick={() => setPedir(true)}>
              Pedir anticipo
            </Button>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="p-4">
          <ListaRecibos url="/nom/recibos?mias=1" />
        </Card>
        <Card className="h-fit overflow-hidden">
          <CardHeader title="Mis anticipos" />
          <ul className="divide-y divide-line">
            {(ant.data ?? []).map((a) => (
              <AnticipoFila key={a.id} a={a} />
            ))}
            {!ant.data?.length && <li className="px-4 py-4 text-center text-[13px] text-muted">Ninguno.</li>}
          </ul>
        </Card>
      </div>
      {pedir && <AnticipoDialog onClose={() => setPedir(false)} />}
    </>
  );
}
