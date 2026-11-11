import type { Tx } from '../../db/client';
import type { SeedCtx } from '../../core/modules';
import { addDays, hoyMadrid } from '../hor/tiempo';
import { FICHAS_DEMO } from '../fic/seed';
import { AUSENCIAS_DEMO } from './demo';
import { contarDias } from './calculo';
import { ausMinimos, ausSaldos, ausSolicitudes, ausTipos } from './schema';

export async function seedAus(tx: Tx, s: SeedCtx) {
  const empresaId = s.empresaId;
  const hoy = hoyMadrid();
  const anio = Number(hoy.slice(0, 4));
  const tipos: Record<string, typeof ausTipos.$inferSelect> = {};
  const defs: (typeof ausTipos.$inferInsert & { clave: string })[] = [
    { empresaId, clave: 'vacaciones', nombre: 'Vacaciones', codigo: 'VAC', color: '#35AE29', retribuido: true, descuentaSaldo: true, diasAnuales: 22, unidad: 'laborables', permiteMedioDia: true, maxArrastre: 5 },
    { empresaId, clave: 'asuntos_propios', nombre: 'Asuntos propios', codigo: 'AP', color: '#7D2CDD', retribuido: true, descuentaSaldo: true, diasAnuales: 2, unidad: 'laborables', permiteMedioDia: true },
    { empresaId, clave: 'permiso_retribuido', nombre: 'Permiso retribuido (art. 37 ET)', codigo: 'PR', color: '#3466D6', retribuido: true, requiereJustificante: true, permiteMedioDia: true, unidad: 'naturales' },
    { empresaId, clave: 'baja_medica', nombre: 'Baja médica (IT)', codigo: 'BM', color: '#D94F4F', retribuido: true, requiereJustificante: true, soloRrhh: true, permiteMedioDia: false, unidad: 'naturales' },
    { empresaId, clave: 'nacimiento', nombre: 'Nacimiento y cuidado de menor', codigo: 'NAC', color: '#D4BE00', retribuido: true, requiereJustificante: true, soloRrhh: true, permiteMedioDia: false, unidad: 'naturales' },
    { empresaId, clave: 'formacion', nombre: 'Formación', codigo: 'FOR', color: '#5E2A78', retribuido: true, permiteMedioDia: true, unidad: 'laborables' },
    { empresaId, clave: 'no_retribuido', nombre: 'Permiso no retribuido', codigo: 'NR', color: '#B28574', retribuido: false, dosNiveles: true, permiteMedioDia: false, unidad: 'naturales' },
  ];
  for (const d of defs) {
    const [t] = await tx.insert(ausTipos).values(d).returning();
    tipos[d.clave] = t!;
  }

  // Saldos del año (prorrateados para quien entró este año)
  for (const [key, f] of Object.entries(FICHAS_DEMO)) {
    const personaId = s.personas[key];
    if (!personaId) continue;
    const alta = addDays(hoy, f.alta);
    const factor = Number(alta.slice(0, 4)) === anio ? Math.max(0, (new Date(`${anio}-12-31T12:00:00Z`).getTime() - new Date(alta + 'T12:00:00Z').getTime()) / 86400000 + 1) / 365 : 1;
    await tx.insert(ausSaldos).values([
      { empresaId, personaId, tipoId: tipos.vacaciones!.id, anio, dias: Math.round(22 * factor * 2) / 2, arrastre: ['tecnico1', 'administracion'].includes(key) ? 2 : 0, notas: factor < 1 ? 'Prorrateado por la fecha de alta' : null },
      { empresaId, personaId, tipoId: tipos.asuntos_propios!.id, anio, dias: factor < 1 ? 1 : 2 },
    ]);
  }

  // Solicitudes de ejemplo
  for (const a of AUSENCIAS_DEMO) {
    const personaId = s.personas[a.key];
    const t = tipos[a.tipo];
    if (!personaId || !t) continue;
    const desde = addDays(hoy, a.desde);
    const hasta = addDays(hoy, a.hasta);
    const dias = await contarDias(tx, empresaId, personaId, t.unidad, desde, hasta, a.medioDia ?? null);
    const resuelta = a.estado === 'aprobada';
    await tx.insert(ausSolicitudes).values({
      empresaId,
      personaId,
      tipoId: t.id,
      desde,
      hasta,
      medioDia: a.medioDia ?? null,
      dias: Math.max(dias, 0.5),
      motivo: a.motivo ?? null,
      estado: a.estado,
      aprobadoResponsablePor: a.estado === 'aprobada_responsable' || resuelta ? s.adminUsuarioId : null,
      aprobadoResponsableEn: a.estado === 'aprobada_responsable' || resuelta ? new Date() : null,
      revisadoPor: resuelta ? s.adminUsuarioId : null,
      revisadoEn: resuelta ? new Date() : null,
      registradaPor: t.soloRrhh ? s.adminUsuarioId : null,
      creadoEn: new Date(a.desde > 0 ? Date.now() - 3 * 86400000 : new Date(desde + 'T08:00:00Z').getTime() - 20 * 86400000),
    });
  }

  await tx.insert(ausMinimos).values([
    { empresaId, departamentoId: s.departamentos.sat!, minimo: 2 },
    { empresaId, departamentoId: s.departamentos.almacen!, minimo: 1 },
  ]);
}
