import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Clock, FileSignature, Megaphone, Palmtree, UserCog, Wallet } from 'lucide-react';
import type { porShared } from '@kite/shared';
import { fmtDate } from '@kite/shared';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Alert, Avatar, Badge, Card, PageHeader, ProgressBar, Spinner } from '@/components/ui';
import { moduleWebs } from '../../registry';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const horas = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Portal del empleado: todo lo mío en una pantalla pensada para el móvil. */
export default function Portal() {
  const { has, can } = useSession();
  const { data: r, isLoading } = useApi<porShared.PortalResumen>('/por/resumen');
  const tiles = moduleWebs.filter((m) => has(m.code)).flatMap((m) => (m.portal ?? []).filter((p) => !p.perm || can(p.perm)));
  if (isLoading || !r) return <Spinner />;
  const j = r.jornada;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Mi portal" icon={UserCog} />
      {r.persona && (
        <Card className="flex items-center gap-3 p-4">
          <Avatar name={r.persona.nombre} size={48} />
          <div className="min-w-0">
            <p className="truncate font-display text-[18px] font-semibold">{r.persona.nombre}</p>
            <p className="truncate text-[13px] text-muted">{[r.persona.puesto, r.persona.departamento, r.persona.responsable && `responsable: ${r.persona.responsable}`].filter(Boolean).join(' · ')}</p>
          </div>
          <Link to="/mi-ficha" className="ml-auto shrink-0 text-[13px] font-medium text-primary">
            Mi ficha
          </Link>
        </Card>
      )}
      {(r.firmasPendientes > 0 || r.datosPendientes || r.avisosSinLeer > 0) && (
        <div className="space-y-2">
          {r.firmasPendientes > 0 && (
            <Link to="/firmas" className="block">
              <Alert tone="orange" icon={FileSignature}>
                Tienes {r.firmasPendientes} {r.firmasPendientes === 1 ? 'documento' : 'documentos'} pendiente de firmar.
              </Alert>
            </Link>
          )}
          {r.avisosSinLeer > 0 && (
            <Link to="/tablon" className="block">
              <Alert tone="violet" icon={Megaphone}>
                {r.avisosSinLeer} {r.avisosSinLeer === 1 ? 'aviso nuevo' : 'avisos nuevos'} en el tablón.
              </Alert>
            </Link>
          )}
          {r.datosPendientes && <Alert tone="blue">Hay un cambio en tus datos pendiente de que RRHH lo valide.</Alert>}
        </div>
      )}
      {/* Las tarjetas llenan siempre la fila: con tres, van en tres columnas (o 2 + 1 a lo ancho en tableta) */}
      <div
        className={cn(
          'grid gap-4',
          [j, r.vacaciones, r.nominas].filter(Boolean).length > 1 && 'sm:grid-cols-2',
          [j, r.vacaciones, r.nominas].filter(Boolean).length === 3 && 'sm:[&>*:last-child]:col-span-2 lg:grid-cols-3 lg:[&>*:last-child]:col-span-1',
        )}
      >
        {j && (
          <Link to="/fichar" className="block">
            <Card className="h-full p-4 transition-colors hover:bg-sunken/60">
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <Clock className="h-4 w-4 text-muted" /> Jornada
                <Badge tone={j.estado === 'trabajando' ? 'green' : j.estado === 'pausa' ? 'yellow' : 'gray'} className="ml-auto">
                  {j.estado === 'trabajando' ? 'Trabajando' : j.estado === 'pausa' ? 'En pausa' : 'Fuera'}
                </Badge>
              </p>
              <p className="tabular mt-2 font-display text-[24px] font-medium">{horas(j.horasHoy)}</p>
              <p className="text-[13px] text-muted">hoy · semana {horas(j.horasSemana)} de {horas(j.previstasSemana)}</p>
              <div className="mt-2">
                <ProgressBar value={j.previstasSemana ? (j.horasSemana / j.previstasSemana) * 100 : 0} tone="green" />
              </div>
            </Card>
          </Link>
        )}
        {r.vacaciones && (
          <Link to="/ausencias" className="block">
            <Card className="h-full p-4 transition-colors hover:bg-sunken/60">
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <Palmtree className="h-4 w-4 text-muted" /> Vacaciones
              </p>
              <p className="tabular mt-2 font-display text-[24px] font-medium">
                {r.vacaciones.disponibles} <span className="text-[14px] font-medium text-muted">días disponibles</span>
              </p>
              <p className="text-[13px] text-muted">
                de {r.vacaciones.asignados} {r.vacaciones.unidad}
                {r.vacaciones.pendientes ? ` · ${r.vacaciones.pendientes} pendientes de aprobar` : ''}
              </p>
              {r.vacaciones.proxima && (
                <p className="mt-1 text-[13px]">
                  Próxima: {r.vacaciones.proxima.tipo} del {fmtDate(r.vacaciones.proxima.desde)} al {fmtDate(r.vacaciones.proxima.hasta)}
                </p>
              )}
            </Card>
          </Link>
        )}
        {r.nominas && (
          <Link to="/nominas" className="block">
            <Card className="h-full p-4 transition-colors hover:bg-sunken/60">
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <Wallet className="h-4 w-4 text-muted" /> Nóminas
                {r.nominas.sinLeer > 0 && (
                  <Badge tone="violet" className="ml-auto">
                    {r.nominas.sinLeer} sin leer
                  </Badge>
                )}
              </p>
              <p className="mt-2 truncate font-medium">{r.nominas.ultimo?.titulo ?? 'Aún no hay recibos'}</p>
              {r.nominas.ultimo && <p className="text-[13px] text-muted">Publicada el {fmtDate(r.nominas.ultimo.publicadoEn)}</p>}
            </Card>
          </Link>
        )}
      </div>
      {r.turnos && r.turnos.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 flex items-center gap-2 text-[13px] text-muted">
            <CalendarDays className="h-4 w-4 text-muted" /> Mis próximos días
          </p>
          <div className="grid grid-cols-7 gap-1">
            {r.turnos.map((t) => {
              const d = new Date(`${t.fecha}T12:00:00`);
              return (
                <div key={t.fecha} className={cn('rounded-lg px-1 py-2 text-center', t.horario && !t.festivo && !t.ausencia ? 'bg-sunken' : 'text-muted')}>
                  <p className="text-[12px] text-muted">{DIAS[d.getDay()]}</p>
                  <p className="tabular text-[16px] font-medium">{d.getDate()}</p>
                  <p className="flex items-center justify-center gap-1 truncate text-[11px] text-muted" title={t.festivo ?? t.ausencia ?? t.horario ?? ''}>
                    {/* El color del turno, como un punto: identifica el turno sin pintar la casilla */}
                    {t.color && !t.festivo && !t.ausencia && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />}
                    <span className="truncate">{t.festivo ? 'Festivo' : t.ausencia ? t.ausencia : t.horario ?? 'Libre'}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {tiles.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {tiles.map((t) => (
              <li key={t.to}>
                <Link to={t.to} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sunken text-muted">
                    <t.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{t.label}</span>
                    {t.description && <span className="block truncate text-[13px] text-muted">{t.description}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
