import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { HardDrive, LifeBuoy, Plus, ShieldCheck } from 'lucide-react';
import { fmtDate, fmtDateTime } from '@kite/shared';
import { errorMessage } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Alert, Button, Card, Spinner } from '@/components/ui';
import { PublicLayout } from '@/pages/public/PublicLayout';
import { ContactoEmpresa, EstadoCliente, Estrellas, NuevoAviso, type EmpresaPublica } from './PublicoComun';

/** Portal de asistencia del cliente: sus equipos, el estado de sus avisos y abrir uno nuevo. */
export default function PublicoPortal() {
  const { token } = useParams();
  const nav = useNavigate();
  const { data: d, isLoading, error } = useApi<any>(`/sat/public/portal/${token}`, { retry: false });
  const [nuevo, setNuevo] = useState(false);
  const empresa: EmpresaPublica | undefined = d?.empresa;
  return (
    <PublicLayout empresa={empresa?.nombre} logoUrl={empresa?.logoUrl} marca={empresa?.marca}>
      {isLoading ? (
        <Spinner />
      ) : error || !d ? (
        <Alert tone="red">{errorMessage(error)}</Alert>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[13px] text-muted">Portal de asistencia</p>
              <h1 className="text-[22px] font-semibold">{d.cliente}</h1>
            </div>
            {!nuevo && (
              <Button variant="primary" icon={Plus} onClick={() => setNuevo(true)}>
                Abrir un aviso
              </Button>
            )}
          </div>
          {nuevo && <NuevoAviso endpoint={`/sat/public/portal/${token}/tickets`} equipos={d.equipos} onCreado={(t) => nav(`/publico/sat/ticket/${t.token}`)} />}
          <Card className="overflow-hidden">
            <p className="flex items-center gap-2 px-5 pb-2 pt-4 text-[13px] font-semibold">
              <LifeBuoy className="h-4 w-4 text-primary" /> Mis avisos
            </p>
            <ul className="divide-y divide-line">
              {d.tickets.map((t: any) => (
                <li key={t.codigo}>
                  <Link to={`/publico/sat/ticket/${t.token}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{t.asunto}</span>
                      <span className="flex items-center gap-2 text-[12px] text-muted">
                        {t.codigo} · {fmtDateTime(t.creadoEn)}
                        {t.valoracion ? <Estrellas value={t.valoracion} size="sm" /> : t.puedeValorar ? <span className="font-semibold text-primary">Valorar</span> : null}
                      </span>
                    </span>
                    <EstadoCliente estado={t.estado} />
                  </Link>
                </li>
              ))}
              {!d.tickets.length && <li className="px-4 py-5 text-center text-[13px] text-muted">No tienes avisos.</li>}
            </ul>
          </Card>
          <Card className="overflow-hidden">
            <p className="flex items-center gap-2 px-5 pb-2 pt-4 text-[13px] font-semibold">
              <HardDrive className="h-4 w-4 text-primary" /> Mis equipos
            </p>
            <ul className="divide-y divide-line">
              {d.equipos.map((e: any) => (
                <li key={e.id} className="px-4 py-2.5">
                  <span className="block text-[13.5px] font-medium">{e.nombre}</span>
                  <span className="flex flex-wrap items-center gap-1 text-[12px] text-muted">
                    {[e.marca, e.modelo, e.ubicacion, e.numeroSerie && `S/N ${e.numeroSerie}`].filter(Boolean).join(' · ')}
                    {e.garantiaHasta && (
                      <span className={e.enGarantia ? 'inline-flex items-center gap-0.5 font-medium text-primary' : ''}>
                        {e.enGarantia && <ShieldCheck className="h-3.5 w-3.5" />}· garantía {e.enGarantia ? 'hasta' : 'terminada el'} {fmtDate(e.garantiaHasta)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {!d.equipos.length && <li className="px-4 py-5 text-center text-[13px] text-muted">Sin equipos registrados.</li>}
            </ul>
          </Card>
          <ContactoEmpresa empresa={empresa} />
        </div>
      )}
    </PublicLayout>
  );
}
