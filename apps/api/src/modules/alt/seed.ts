import { eq } from 'drizzle-orm';
import { altShared } from '@kite/shared';
import type { Tx } from '../../db/client';
import { personas, tareas } from '../../db/schema/core';
import type { SeedCtx } from '../../core/modules';
import { addDays, hoyMadrid } from '../hor/tiempo';
import { altCandidatos, altEvaluaciones, altOfertas, altPlanFormacion, altPlantillas, altProcesoTareas, altProcesos } from './schema';

type PlantillaTarea = altShared.PlantillaTarea;

export async function seedAlt(tx: Tx, s: SeedCtx) {
  const empresaId = s.empresaId;
  const p = s.personas;
  const hoy = hoyMadrid();
  const anio = Number(hoy.slice(0, 4));

  const onboarding: PlantillaTarea[] = [
    { titulo: 'Preparar contrato y alta en la Seguridad Social', responsable: 'rrhh', dias: -3 },
    { titulo: 'Crear usuario, correo y accesos', responsable: 'concreta', personaId: p.admin, dias: -1 },
    { titulo: 'Preparar EPI, uniforme y herramientas', responsable: 'responsable', dias: 0 },
    { titulo: 'Formación inicial de prevención de riesgos', responsable: 'rrhh', dias: 2 },
    { titulo: 'Presentación al equipo y visita a las instalaciones', responsable: 'responsable', dias: 0 },
    { titulo: 'Leer y firmar el manual de bienvenida', responsable: 'persona', dias: 5 },
    { titulo: 'Reunión de seguimiento del periodo de prueba', responsable: 'responsable', dias: 30 },
  ];
  const offboarding: PlantillaTarea[] = [
    { titulo: 'Entrevista de salida', responsable: 'rrhh', dias: -2 },
    { titulo: 'Comunicar la baja en la Seguridad Social (sistema RED)', responsable: 'rrhh', dias: 0 },
    { titulo: 'Preparar finiquito y certificado de empresa', responsable: 'rrhh', dias: 0 },
    { titulo: 'Recoger llaves, tarjetas y material', responsable: 'responsable', dias: 0 },
    { titulo: 'Desactivar correo y accesos', responsable: 'concreta', personaId: p.admin, dias: 0 },
    { titulo: 'Traspasar clientes y tareas pendientes', responsable: 'responsable', dias: -5 },
  ];
  const [plAlta] = await tx.insert(altPlantillas).values({ empresaId, nombre: 'Incorporación estándar', tipo: 'alta', tareas: onboarding }).returning();
  await tx.insert(altPlantillas).values({ empresaId, nombre: 'Salida de la empresa', tipo: 'baja', tareas: offboarding });
  await tx.insert(altPlantillas).values({
    empresaId,
    nombre: 'Incorporación de técnico',
    tipo: 'alta',
    tareas: [
      ...onboarding,
      { titulo: 'Asignar furgoneta y tarjeta de combustible', responsable: 'departamento', departamentoId: s.departamentos.sat, dias: 0 },
      { titulo: 'Acompañar en las primeras órdenes de trabajo', responsable: 'departamento', departamentoId: s.departamentos.sat, dias: 7 },
    ],
  });

  const [ofTec] = await tx
    .insert(altOfertas)
    .values({
      empresaId,
      titulo: 'Técnico/a de climatización',
      estado: 'abierta',
      plazas: 2,
      departamentoId: s.departamentos.sat,
      centroId: s.centros.sede,
      responsableId: p.jefesat,
      tipoContrato: 'indefinido',
      jornadaHoras: 40,
      salarioDesde: 22000,
      salarioHasta: 27000,
      fechaCierre: addDays(hoy, 25),
      descripcion: 'Instalación y mantenimiento de equipos de climatización en clientes de Valencia y alrededores.',
      requisitos: 'Carné de manipulación de gases fluorados. Carné B. Valorable experiencia en VRV.',
      creadoPor: s.adminUsuarioId,
      creadoEn: new Date(Date.now() - 20 * 86400000),
    })
    .returning();
  const [ofAdm] = await tx
    .insert(altOfertas)
    .values({ empresaId, titulo: 'Administrativo/a contable', estado: 'pausada', plazas: 1, departamentoId: s.departamentos.administracion, centroId: s.centros.sede, responsableId: p.administracion, tipoContrato: 'temporal', jornadaHoras: 30, salarioDesde: 19000, salarioHasta: 21000, descripcion: 'Apoyo en facturación, conciliación bancaria y cierre mensual.', creadoPor: s.adminUsuarioId, creadoEn: new Date(Date.now() - 45 * 86400000) })
    .returning();
  const cands: Omit<typeof altCandidatos.$inferInsert, 'empresaId'>[] = [
    { ofertaId: ofTec!.id, nombre: 'Iván', apellidos: 'Castro Mena', email: 'ivan.castro@correo.test', telefono: '611 234 567', localidad: 'Valencia', fuente: 'portal', estado: 'entrevista', valoracion: 4, pretension: 25000, disponibilidad: '15 días', notas: 'Cinco años en instaladora de Castellón. Tiene carné de gases fluorados.' },
    { ofertaId: ofTec!.id, nombre: 'Nerea', apellidos: 'Pons Ferrer', email: 'nerea.pons@correo.test', telefono: '622 345 678', localidad: 'Sagunto', fuente: 'referido', estado: 'oferta', valoracion: 5, pretension: 26500, disponibilidad: 'Inmediata', notas: 'Recomendada por Lucía. Muy buena entrevista técnica.' },
    { ofertaId: ofTec!.id, nombre: 'Óscar', apellidos: 'Lara Gil', email: 'oscar.lara@correo.test', localidad: 'Torrent', fuente: 'web', estado: 'nuevo' },
    { ofertaId: ofTec!.id, nombre: 'Miriam', apellidos: 'Sanz Ortiz', email: 'miriam.sanz@correo.test', localidad: 'Paterna', fuente: 'portal', estado: 'cribado', valoracion: 3 },
    { ofertaId: ofTec!.id, nombre: 'Hugo', apellidos: 'Blasco Ruiz', email: 'hugo.blasco@correo.test', localidad: 'Gandía', fuente: 'portal', estado: 'descartado', valoracion: 2, notas: 'Sin carné de conducir.' },
    { ofertaId: ofTec!.id, nombre: 'Alba', apellidos: 'Molina Cano', email: 'alba.molina@correo.test', localidad: 'Valencia', fuente: 'espontanea', estado: 'nuevo' },
    { ofertaId: ofAdm!.id, nombre: 'Rocío', apellidos: 'Vera Llopis', email: 'rocio.vera@correo.test', localidad: 'Mislata', fuente: 'portal', estado: 'entrevista', valoracion: 4 },
    { ofertaId: ofAdm!.id, nombre: 'Daniel', apellidos: 'Peiró Soria', email: 'daniel.peiro@correo.test', localidad: 'Valencia', fuente: 'ett', estado: 'cribado', valoracion: 3 },
  ];
  await tx.insert(altCandidatos).values(cands.map((c, i) => ({ ...c, empresaId, orden: i, consentimiento: true, creadoPor: s.adminUsuarioId, creadoEn: new Date(Date.now() - (18 - i * 2) * 86400000) })));

  // Incorporación en curso de Lucía (entró hace 55 días)
  const fecha = addDays(hoy, -55);
  const [lucia] = await tx.select({ resp: personas.responsableId }).from(personas).where(eq(personas.id, p.tecnico2!));
  const [proc] = await tx.insert(altProcesos).values({ empresaId, personaId: p.tecnico2!, tipo: 'alta', plantillaId: plAlta!.id, fecha, creadoPor: s.adminUsuarioId, creadoEn: new Date(Date.now() - 60 * 86400000) }).returning();
  let i = 0;
  for (const t of onboarding) {
    const asignado = t.responsable === 'rrhh' ? p.rrhh : t.responsable === 'responsable' ? (lucia?.resp ?? p.jefesat) : t.responsable === 'persona' ? p.tecnico2 : t.personaId;
    const hecha = i < 5;
    const [tarea] = await tx
      .insert(tareas)
      .values({ empresaId, titulo: `${t.titulo} · Lucía Romero Bas`, asignadoA: asignado ?? null, creadoPor: s.adminUsuarioId, entidad: 'persona', entidadId: p.tecnico2!, vence: addDays(fecha, t.dias), estado: hecha ? 'hecha' : 'pendiente', completadaEn: hecha ? new Date(Date.now() - 50 * 86400000) : null, prioridad: t.dias <= 0 ? 'alta' : 'normal' })
      .returning();
    await tx.insert(altProcesoTareas).values({ procesoId: proc!.id, tareaId: tarea!.id, titulo: t.titulo, orden: i++ });
  }

  // Evaluaciones
  await tx.insert(altEvaluaciones).values([
    {
      empresaId,
      personaId: p.tecnico1!,
      evaluadorId: p.jefesat!,
      periodo: String(anio - 1),
      fecha: `${anio - 1}-12-15`,
      objetivos: [
        { titulo: 'Tiempo medio de resolución de avisos', peso: 40, puntuacion: 4, comentario: 'Por debajo de 48 h en el 90 % de los casos.' },
        { titulo: 'Satisfacción de los clientes', peso: 30, puntuacion: 5, comentario: 'Varias felicitaciones por escrito.' },
        { titulo: 'Partes de trabajo completos y a tiempo', peso: 30, puntuacion: 3, comentario: 'A veces se retrasa en cerrar las órdenes.' },
      ],
      puntuacion: 4.1,
      fortalezas: 'Resolutivo, buen trato con el cliente.',
      mejoras: 'Cerrar las órdenes el mismo día.',
      estado: 'firmada',
      compartidaEn: new Date(`${anio - 1}-12-16T10:00:00Z`),
      firmadaEn: new Date(`${anio - 1}-12-18T10:00:00Z`),
      comentariosEvaluado: 'De acuerdo. Me apunto al curso de la app de partes.',
    },
    {
      empresaId,
      personaId: p.comercial2!,
      evaluadorId: p.comercial1!,
      periodo: `Primer semestre ${anio}`,
      fecha: addDays(hoy, -10),
      objetivos: [
        { titulo: 'Cumplimiento del objetivo de ventas', peso: 50, puntuacion: 4, comentario: '104 % del objetivo semestral.' },
        { titulo: 'Captación de clientes nuevos', peso: 30, puntuacion: 3, comentario: '6 de 8 previstos.' },
        { titulo: 'Seguimiento de presupuestos en el CRM', peso: 20, puntuacion: 5 },
      ],
      puntuacion: 3.9,
      fortalezas: 'Constancia y orden en el seguimiento.',
      mejoras: 'Prospección de clientes del sector hotelero.',
      estado: 'compartida',
      compartidaEn: new Date(Date.now() - 3 * 86400000),
    },
    {
      empresaId,
      personaId: p.operario!,
      evaluadorId: p.almacen!,
      periodo: `Periodo de prueba ${anio}`,
      fecha: hoy,
      objetivos: [
        { titulo: 'Preparación de pedidos sin errores', peso: 50, puntuacion: null },
        { titulo: 'Puntualidad y cumplimiento del horario', peso: 25, puntuacion: null },
        { titulo: 'Orden y seguridad en el almacén', peso: 25, puntuacion: null },
      ],
      estado: 'borrador',
    },
  ]);

  // Plan de formación anual
  await tx.insert(altPlanFormacion).values([
    { empresaId, anio, accion: 'Reciclaje en gases fluorados y nuevos refrigerantes (R32, R290)', objetivo: 'Mantener la certificación del equipo técnico', departamentoId: s.departamentos.sat, trimestre: '1', modalidad: 'presencial', proveedor: 'Centro de Formación Levante', horas: 16, costeEstimado: 1800, bonificable: true, estado: 'realizada' },
    { empresaId, anio, accion: 'Trabajos en altura (renovación)', objetivo: 'Renovar la formación caducada', personas: [p.tecnico1!, p.tecnico2!], trimestre: '4', modalidad: 'presencial', proveedor: 'Prevención Turia', horas: 8, costeEstimado: 240, bonificable: true, estado: 'planificada' },
    { empresaId, anio, accion: 'Excel avanzado y cuadros de mando', departamentoId: s.departamentos.administracion, trimestre: '2', modalidad: 'online', proveedor: 'Academia Digital', horas: 20, costeEstimado: 300, bonificable: true, estado: 'realizada' },
    { empresaId, anio, accion: 'Igualdad y prevención del acoso laboral', objetivo: 'Obligatoria para toda la plantilla (plan de igualdad)', trimestre: '4', modalidad: 'online', horas: 4, costeEstimado: 0, estado: 'en_curso' },
    { empresaId, anio, accion: 'Técnicas de venta consultiva', departamentoId: s.departamentos.comercial, trimestre: '3', modalidad: 'mixta', proveedor: 'Escuela de Negocios del Mediterráneo', horas: 24, costeEstimado: 1200, bonificable: true, estado: 'cancelada' },
  ]);
}
