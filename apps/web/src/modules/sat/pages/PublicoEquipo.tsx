import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, HardDrive, ShieldCheck } from 'lucide-react';
import { fmtDate, fmtDateTime } from '@kite/shared';
import { errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Alert, Button, Card, Spinner } from '@/components/ui';
import { PublicLayout } from '@/pages/public/PublicLayout';
import { ContactoEmpresa, EstadoCliente, NuevoAviso, type EmpresaPublica } from './PublicoComun';

/** Página que abre el código QR pegado en el equipo: datos, garantía, manuales y aviso de avería. */
export default function PublicoEquipo() {
  const { token } = useParams();
  const nav = useNavigate();
  const { data: d, isLoading, error } = useApi<any>(`/sat/public/equipo/${token}`, { retry: false });
  const [abrir, setAbrir] = useState(false);
  const empresa: EmpresaPublica | undefined = d?.empresa;
  return (
    <PublicLayout empresa={empresa?.nombre} logoUrl={empresa?.logoUrl}>
      {isLoading ? (
        <Spinner />
      ) : error || !d ? (
        <Alert tone="red">{errorMessage(error)}</Alert>
      ) : (
        <div className="space-y-5">
          <div>
            {d.cliente && <p className="text-[13px] text-muted">{d.cliente}</p>}
            <h1 className="mt-0.5 flex items-center gap-2 text-[22px] font-extrabold">
              <HardDrive className="h-6 w-6 shrink-0 text-primary" /> {d.equipo.nombre}
            </h1>
            <p className="mt-1 text-[13.5px] text-muted">{[d.equipo.marca, d.equipo.modelo, d.equipo.ubicacion].filter(Boolean).join(' · ')}</p>
          </div>
          <Card className="grid gap-3 p-4 text-[13.5px] sm:grid-cols-3">
            <div>
              <p className="text-[12px] text-muted">Número de serie</p>
              <p className="font-mono font-medium">{d.equipo.numeroSerie ?? '—'}</p>
            </div>
            <div>
              <p className="text-[12px] text-muted">Instalado</p>
              <p className="font-medium">{d.equipo.fechaInstalacion ? fmtDate(d.equipo.fechaInstalacion) : '—'}</p>
            </div>
            <div>
              <p className="text-[12px] text-muted">Garantía</p>
              <p className="flex items-center gap-1 font-medium">
                {d.equipo.garantiaHasta ? (
                  <>
                    {d.equipo.enGarantia && <ShieldCheck className="h-4 w-4 text-primary" />}
                    {d.equipo.enGarantia ? `Hasta ${fmtDate(d.equipo.garantiaHasta)}` : `Terminó el ${fmtDate(d.equipo.garantiaHasta)}`}
                  </>
                ) : (
                  '—'
                )}
              </p>
            </div>
          </Card>
          {d.abiertos.length > 0 && (
            <Card className="overflow-hidden">
              <p className="border-b border-line px-4 py-2.5 text-[13px] font-semibold">Avisos abiertos de este equipo</p>
              <ul className="divide-y divide-line">
                {d.abiertos.map((t: any) => (
                  <li key={t.codigo} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{t.asunto}</span>
                      <span className="text-[12px] text-muted">
                        {t.codigo} · {fmtDateTime(t.creadoEn)}
                      </span>
                    </span>
                    <EstadoCliente estado={t.estado} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {abrir ? (
            <NuevoAviso endpoint={`/sat/public/equipo/${token}/tickets`} onCreado={(t) => nav(`/publico/sat/ticket/${t.token}`)} />
          ) : (
            <Button variant="primary" size="lg" className="w-full" onClick={() => setAbrir(true)}>
              Avisar de una avería
            </Button>
          )}
          {d.manuales.length > 0 && (
            <Card className="overflow-hidden">
              <p className="border-b border-line px-4 py-2.5 text-[13px] font-semibold">Manuales y documentación</p>
              <ul className="divide-y divide-line">
                {d.manuales.map((m: any, i: number) => (
                  <li key={i}>
                    <a href={m.url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">{m.titulo}</span>
                      {m.version && <span className="text-[12px] text-muted">v{m.version}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <ContactoEmpresa empresa={empresa} />
        </div>
      )}
    </PublicLayout>
  );
}
