import { eq } from 'drizzle-orm';
import { CORE_MODULE_CODES, OPTIONAL_MODULE_CODES } from '@kite/shared';
import type { Tx } from '../../db/client';
import { contactos, terceros } from '../../db/schema/core';
import { documentos } from '../../db/schema/documentos';
import { randomToken } from '../../core/auth';
import { systemCtx, type Ctx } from '../../core/context';
import type { SeedCtx } from '../../core/modules';
import { nextCode } from '../../core/numbering';
import { crearDocumento, documentoSchema, ejecutarAccion } from '../../services/documentos';
import { satChecklists, satContratos, satEquipos, satOrdenTiempos, satOrdenes, satTickets } from './schema';
import { addDays, addMonths, cerrarOrden, docCtx, madridDay, parseFechaHora, prepararOrdenNueva, prepararTicketNuevo, sincronizarRecurrente } from './service';

const H = (fecha: string, hora: string) => parseFechaHora(`${fecha}T${hora}`)!;

/** Ejecuta un paso opcional en un punto de guardado: si falla (p. ej. otro módulo rechaza algo), la semilla sigue. */
async function opcional<T>(tx: Tx, nombre: string, fn: (sp: Tx) => Promise<T>): Promise<T | null> {
  try {
    return await tx.transaction(fn);
  } catch (e) {
    console.warn(`[sat.seed] ${nombre}: ${(e as Error).message}`);
    return null;
  }
}

export async function seedSat(tx: Tx, s: SeedCtx) {
  const { empresaId, personas: P, terceros: T, articulos: A } = s;
  const base = systemCtx(empresaId, [...CORE_MODULE_CODES, ...OPTIONAL_MODULE_CODES]);
  const como = (personaId: string | undefined): Ctx => ({ ...base, personaId: personaId ?? null });
  const hoy = madridDay();
  const manana = addDays(hoy, 1);

  /* Plantillas de checklist */
  const [ckPrev] = await tx
    .insert(satChecklists)
    .values({
      empresaId,
      nombre: 'Mantenimiento preventivo de split',
      tipo: 'preventivo',
      items: [
        { id: 'p1', texto: 'Limpiar o sustituir filtros', obligatorio: true },
        { id: 'p2', texto: 'Revisar presiones de gas refrigerante', obligatorio: true },
        { id: 'p3', texto: 'Comprobar desagüe de condensados' },
        { id: 'p4', texto: 'Limpiar batería de la unidad exterior' },
        { id: 'p5', texto: 'Medir temperatura de impulsión' },
        { id: 'p6', texto: 'Revisar conexiones eléctricas y apriete de bornas' },
      ],
    })
    .returning();
  const [ckInst] = await tx
    .insert(satChecklists)
    .values({
      empresaId,
      nombre: 'Instalación de equipo de climatización',
      tipo: 'instalacion',
      items: [
        { id: 'i1', texto: 'Prueba de estanqueidad con nitrógeno', obligatorio: true },
        { id: 'i2', texto: 'Vacío de la instalación', obligatorio: true },
        { id: 'i3', texto: 'Carga adicional de gas según longitud de tubería' },
        { id: 'i4', texto: 'Prueba de funcionamiento en frío y calor', obligatorio: true },
        { id: 'i5', texto: 'Explicar el uso del mando al cliente' },
      ],
    })
    .returning();
  await tx.insert(satChecklists).values({
    empresaId,
    nombre: 'Revisión correctiva',
    tipo: 'correctivo',
    items: [
      { id: 'c1', texto: 'Diagnóstico de la avería anotado' },
      { id: 'c2', texto: 'Prueba de funcionamiento tras la reparación', obligatorio: true },
    ],
  });

  /* Contratos de mantenimiento (con su facturación periódica) */
  const contrato = async (v: Omit<typeof satContratos.$inferInsert, 'empresaId' | 'codigo'>) => {
    const [c] = await tx.insert(satContratos).values({ ...v, empresaId, codigo: await nextCode(tx, empresaId, 'sat_contrato', 'CM') }).returning();
    await sincronizarRecurrente(tx, base, c!);
    return c!;
  };
  const cHotel = await contrato({ terceroId: T.hotel!, nombre: 'Mantenimiento de climatización del hotel', inicio: addDays(hoy, -300), fin: addDays(hoy, 430), periodicidadMeses: 3, proximaVisita: addMonths(hoy, 3), tecnicoId: P.tecnico1, checklistId: ckPrev!.id, slaRespuestaHoras: 4, slaResolucionHoras: 24, cuota: 540, cuotaPeriodicidad: 'trimestral', notas: 'Incluye mano de obra de las visitas preventivas y de las averías. El material se factura aparte salvo filtros.' });
  const cSuper = await contrato({ terceroId: T.super!, nombre: 'Mantenimiento de aerotermia y frío', inicio: addDays(hoy, -175), fin: addDays(hoy, 555), periodicidadMeses: 6, proximaVisita: addDays(hoy, 5), tecnicoId: P.tecnico2, checklistId: ckPrev!.id, slaRespuestaHoras: 8, slaResolucionHoras: 48, cuota: 95, cuotaPeriodicidad: 'mensual' });
  const cColegio = await contrato({ terceroId: T.colegio!, nombre: 'Revisión anual de climatización', inicio: addDays(hoy, -200), periodicidadMeses: 12, proximaVisita: addDays(hoy, 165), checklistId: ckPrev!.id, notas: 'Sin cuota: cada visita se factura según tarifa.' });

  /* Equipos instalados */
  const equipo = async (v: Omit<typeof satEquipos.$inferInsert, 'empresaId'>) => (await tx.insert(satEquipos).values({ ...v, empresaId, portalToken: randomToken(18) }).returning())[0]!;
  const e204 = await equipo({ terceroId: T.hotel!, articuloId: A['AC-SPLIT-35'], nombre: 'Split habitación 204', marca: 'Daikin', modelo: 'TXF35', numeroSerie: 'DK35-23-004812', ubicacion: 'Planta 2 · habitación 204', fechaInstalacion: addDays(hoy, -400), garantiaHasta: addDays(hoy, 330), contratoId: cHotel.id });
  await equipo({ terceroId: T.hotel!, articuloId: A['AC-SPLIT-35'], nombre: 'Split habitación 205', marca: 'Daikin', modelo: 'TXF35', numeroSerie: 'DK35-23-004813', ubicacion: 'Planta 2 · habitación 205', fechaInstalacion: addDays(hoy, -400), garantiaHasta: addDays(hoy, 330), contratoId: cHotel.id });
  await equipo({ terceroId: T.hotel!, articuloId: A['AC-SPLIT-50'], nombre: 'Split recepción', marca: 'Daikin', modelo: 'TXF50', numeroSerie: 'DK50-22-001977', ubicacion: 'Planta baja · recepción', fechaInstalacion: addDays(hoy, -700), garantiaHasta: addDays(hoy, 30), contratoId: cHotel.id });
  const eCassHotel = await equipo({ terceroId: T.hotel!, articuloId: A['AC-CASS-71'], nombre: 'Cassette restaurante', marca: 'Mitsubishi', modelo: 'PLA-M71', numeroSerie: 'MT71-21-000118', ubicacion: 'Planta baja · restaurante', fechaInstalacion: addDays(hoy, -1100), garantiaHasta: addDays(hoy, -370), contratoId: cHotel.id });
  const eAero = await equipo({ terceroId: T.super!, articuloId: A['BC-AERO-200'], nombre: 'Aerotermia ACS vestuarios', marca: 'Ariston', modelo: 'Nuos 200', numeroSerie: 'AR200-22-55120', ubicacion: 'Almacén trasero · vestuarios', fechaInstalacion: addDays(hoy, -760), garantiaHasta: addDays(hoy, -30), contratoId: cSuper.id });
  const eClinica = await equipo({ terceroId: T.clinica!, articuloId: A['AC-SPLIT-35'], nombre: 'Split gabinete 1', marca: 'Daikin', modelo: 'TXF35', numeroSerie: 'DK35-24-010355', ubicacion: 'Gabinete 1', fechaInstalacion: addDays(hoy, -530), garantiaHasta: addDays(hoy, 200) });
  const eColegio = await equipo({ terceroId: T.colegio!, articuloId: A['AC-CASS-71'], nombre: 'Cassette sala de profesores', marca: 'Mitsubishi', modelo: 'PLA-M71', numeroSerie: 'MT71-23-004470', ubicacion: 'Edificio A · planta 1', fechaInstalacion: addDays(hoy, -420), garantiaHasta: addDays(hoy, 310), contratoId: cColegio.id });
  const eOficinas = await equipo({ terceroId: T.oficinas!, articuloId: A['AC-SPLIT-50'], nombre: 'Split sala de reuniones', marca: 'Daikin', modelo: 'TXF50', numeroSerie: 'DK50-23-008001', ubicacion: 'Sala de reuniones grande', fechaInstalacion: addDays(hoy, -900), garantiaHasta: addDays(hoy, -170) });
  const eRest = await equipo({ terceroId: T.restaurante!, articuloId: A['AC-SPLIT-50'], nombre: 'Split comedor', marca: 'Daikin', modelo: 'TXF50', numeroSerie: 'DK50-21-000420', ubicacion: 'Comedor principal', fechaInstalacion: addDays(hoy, -1300), garantiaHasta: addDays(hoy, -570) });
  const ePart = await equipo({ terceroId: T.particular!, articuloId: A['BC-AERO-200'], nombre: 'Aerotermia vivienda', marca: 'Ariston', modelo: 'Nuos 200', numeroSerie: 'AR200-25-77001', ubicacion: 'Galería', fechaInstalacion: addDays(hoy, -60), garantiaHasta: addDays(hoy, 670) });

  // Enlace del portal de asistencia para el hotel y el supermercado
  await tx.update(terceros).set({ portalToken: randomToken(24) }).where(eq(terceros.id, T.hotel!));
  await tx.update(terceros).set({ portalToken: randomToken(24) }).where(eq(terceros.id, T.super!));

  const contactoDe = async (terceroId: string) => (await tx.select({ id: contactos.id }).from(contactos).where(eq(contactos.terceroId, terceroId)).limit(1))[0]?.id ?? null;

  /* Tickets */
  const ticket = async (v: Record<string, any>, extra: Partial<typeof satTickets.$inferInsert> = {}) => {
    const data = await prepararTicketNuevo(tx, base, { contactoId: await contactoDe(v.terceroId), ...v });
    const creado: Date | undefined = extra.creadoEn as Date | undefined;
    if (creado) {
      data.venceRespuesta = new Date(creado.getTime() + data.slaRespuestaHoras * 3600_000);
      data.venceResolucion = new Date(creado.getTime() + data.slaResolucionHoras * 3600_000);
      if (data.primeraRespuestaEn) data.primeraRespuestaEn = new Date(creado.getTime() + 30 * 60000);
    }
    const [t] = await tx.insert(satTickets).values({ ...(data as typeof satTickets.$inferInsert), empresaId, ...extra }).returning();
    return t!;
  };
  const orden = async (v: Record<string, any>, extra: Partial<typeof satOrdenes.$inferInsert> = {}) => {
    const data = await prepararOrdenNueva(tx, base, v);
    const [o] = await tx.insert(satOrdenes).values({ ...(data as typeof satOrdenes.$inferInsert), empresaId, ...extra }).returning();
    return o!;
  };
  const todoHecho = (o: typeof satOrdenes.$inferSelect) => o.checklist.map((i) => ({ id: i.id, hecho: true }));
  const cerrarEnPasado = async (o: typeof satOrdenes.$inferSelect, tecnico: string, fecha: string, desde: string, hasta: string, input: Partial<Parameters<typeof cerrarOrden>[3]>) => {
    await opcional(tx, `cierre ${o.codigo}`, async (sp) => {
      const r = await cerrarOrden(sp, como(tecnico), o.id, {
        trabajoRealizado: 'Trabajo realizado',
        checklist: todoHecho(o),
        materiales: [],
        tiempos: [{ inicio: H(fecha, desde).toISOString(), fin: H(fecha, hasta).toISOString() }],
        desplazamiento: true,
        ...input,
      } as Parameters<typeof cerrarOrden>[3]);
      await sp.update(satOrdenes).set({ finalizadaEn: H(fecha, hasta), iniciadaEn: H(fecha, desde), planificadaInicio: H(fecha, desde), planificadaFin: H(fecha, hasta) }).where(eq(satOrdenes.id, o.id));
      if (r.albaranId) await sp.update(documentos).set({ fecha }).where(eq(documentos.id, r.albaranId));
      if (o.ticketId) await sp.update(satTickets).set({ resueltoEn: H(fecha, hasta), slaIncumplido: false }).where(eq(satTickets.id, o.ticketId));
    });
  };

  // 1) Hotel: no enfría la 204 (alta) → orden de hoy para Sergio
  const tkHotel = await ticket(
    { terceroId: T.hotel!, equipoId: e204.id, asunto: 'No enfría la habitación 204', descripcion: 'El cliente de la 204 dice que el aire sale templado desde anoche. Recepción ya ha reiniciado el equipo.', prioridad: 'alta', canal: 'telefono', responsableId: P.tecnico1 },
    { creadoEn: H(addDays(hoy, -1), '17:30') },
  );
  await orden({ terceroId: T.hotel!, ticketId: tkHotel.id, equipoId: e204.id, tipo: 'correctivo', prioridad: 'alta', tecnicoId: P.tecnico1, descripcion: 'Revisar la falta de frío en la habitación 204. Posible falta de gas.', planificadaInicio: H(hoy, '09:00'), planificadaFin: H(hoy, '10:30'), facturable: true });
  await tx.update(satTickets).set({ estado: 'asignado' }).where(eq(satTickets.id, tkHotel.id));

  // 2) Visita preventiva trimestral del hotel, hoy a media mañana
  await orden(
    { terceroId: T.hotel!, contratoId: cHotel.id, tipo: 'preventivo', prioridad: 'normal', tecnicoId: P.tecnico1, checklistId: ckPrev!.id, descripcion: `Visita preventiva del contrato ${cHotel.codigo}: splits de habitaciones, recepción y cassette del restaurante`, planificadaInicio: H(hoy, '11:30'), planificadaFin: H(hoy, '13:30'), facturable: false },
    { visitaFecha: hoy },
  );

  // 3) Clínica: gotea (nuevo, sin asignar)
  await ticket({ terceroId: T.clinica!, equipoId: eClinica.id, asunto: 'Gotea agua por la unidad interior', descripcion: 'Cae agua sobre el sillón del gabinete 1 cuando el equipo lleva un rato encendido.', prioridad: 'normal', canal: 'email' }, { creadoEn: H(hoy, '08:10') });

  // 4) Supermercado: ruido en la aerotermia (urgente, fuera de plazo) → en curso con Lucía
  const tkSuper = await ticket(
    { terceroId: T.super!, equipoId: eAero.id, asunto: 'Ruido fuerte en la aerotermia de vestuarios', descripcion: 'Ruido metálico continuo y no calienta el agua.', prioridad: 'urgente', canal: 'telefono', responsableId: P.tecnico2 },
    { creadoEn: new Date(Date.now() - 30 * 3600_000), estado: 'en_curso', slaIncumplido: true },
  );
  await tx.update(satTickets).set({ primeraRespuestaEn: new Date(Date.now() - 24 * 3600_000) }).where(eq(satTickets.id, tkSuper.id));
  const otSuper = await orden({ terceroId: T.super!, ticketId: tkSuper.id, equipoId: eAero.id, tipo: 'correctivo', prioridad: 'urgente', tecnicoId: P.tecnico2, descripcion: 'Diagnosticar ruido del compresor de la aerotermia.', planificadaInicio: H(hoy, '08:30'), planificadaFin: H(hoy, '10:30'), facturable: true }, { estado: 'en_curso', enRutaEn: H(hoy, '08:05'), iniciadaEn: H(hoy, '08:30') });
  await tx.insert(satOrdenTiempos).values({ ordenId: otSuper.id, personaId: P.tecnico2!, inicio: H(hoy, '08:30') });

  // 5) Colegio: mando del cassette (esperando al cliente)
  await ticket({ terceroId: T.colegio!, equipoId: eColegio.id, asunto: 'El mando del cassette no responde', descripcion: 'Han cambiado las pilas y sigue sin responder. Esperamos a que nos confirmen horario para acceder.', prioridad: 'baja', canal: 'portal', responsableId: P.tecnico2 }, { creadoEn: H(addDays(hoy, -3), '12:00'), estado: 'esperando_cliente' });

  // 6) Instalación de esta tarde en el coworking
  await orden({ terceroId: T.oficinas!, tipo: 'instalacion', prioridad: 'normal', tecnicoId: P.tecnico2, checklistId: ckInst!.id, descripcion: 'Instalación de split 3,5 kW en el despacho de dirección (presupuesto aceptado).', planificadaInicio: H(hoy, '16:00'), planificadaFin: H(hoy, '19:00'), facturable: true });

  // 7) Mañana: cassette del restaurante del hotel, con presupuesto de reparación enviado
  const tkCass = await ticket({ terceroId: T.hotel!, equipoId: eCassHotel.id, asunto: 'El cassette del restaurante hace ruido', descripcion: 'Vibración en el ventilador al arrancar.', prioridad: 'normal', canal: 'portal', responsableId: P.tecnico1 }, { creadoEn: H(addDays(hoy, -2), '10:15') });
  const otCass = await orden({ terceroId: T.hotel!, ticketId: tkCass.id, equipoId: eCassHotel.id, tipo: 'correctivo', prioridad: 'normal', tecnicoId: P.tecnico1, descripcion: 'Sustituir el motor del ventilador si el cliente acepta el presupuesto.', planificadaInicio: H(manana, '09:00'), planificadaFin: H(manana, '11:00'), facturable: true });
  await tx.update(satTickets).set({ estado: 'asignado' }).where(eq(satTickets.id, tkCass.id));
  await opcional(tx, 'presupuesto de reparación', async (sp) => {
    const dctx = docCtx(como(P.tecnico1));
    const lineas = [
      { tipoLinea: 'articulo', descripcion: 'Motor ventilador unidad interior PLA-M71 (original Mitsubishi)', cantidad: 1, precio: 186, ivaTipo: 21, coste: 118 },
      { tipoLinea: 'articulo', articuloId: A['SRV-HORA'], referencia: 'SRV-HORA', descripcion: 'Hora de técnico', cantidad: 2, unidad: 'h', precio: 42, ivaTipo: 21, coste: 24 },
    ];
    const d = await crearDocumento(sp, dctx, documentoSchema.parse({ tipo: 'presupuesto', fecha: addDays(hoy, -1), terceroId: T.hotel!, comercialId: P.tecnico1, titulo: `Reparación ${otCass.codigo}`, origenTipo: 'sat_orden', origenId: otCass.id, lineas }), { sinPermisos: true });
    await ejecutarAccion(sp, dctx, d.id, 'enviar');
    await sp.update(satOrdenes).set({ presupuestoId: d.id }).where(eq(satOrdenes.id, otCass.id));
  });

  /* Historial: órdenes cerradas con su albarán entregado y la valoración del cliente */
  const d7 = addDays(hoy, -7);
  const tkOf = await ticket({ terceroId: T.oficinas!, equipoId: eOficinas.id, asunto: 'Olor a humedad en la sala de reuniones', prioridad: 'normal', canal: 'email', responsableId: P.tecnico1 }, { creadoEn: H(addDays(hoy, -8), '09:20') });
  const otOf = await orden({ terceroId: T.oficinas!, ticketId: tkOf.id, equipoId: eOficinas.id, tipo: 'correctivo', tecnicoId: P.tecnico1, descripcion: 'Revisar olor a humedad.', facturable: true });
  await cerrarEnPasado(otOf, P.tecnico1!, d7, '10:00', '11:30', {
    trabajoRealizado: 'Filtros muy sucios y bandeja de condensados con lodo. Limpieza completa de la unidad interior, desinfección de la batería y sustitución de los dos filtros.',
    materiales: [{ articuloId: A['FIL-AC-STD']!, cantidad: 2 }],
    firmaNombre: 'Nuria García',
  });
  await tx.update(satTickets).set({ valoracion: 5, valoracionComentario: 'Muy rápidos y amables. Ya no huele.', valoradoEn: H(addDays(hoy, -6), '18:00') }).where(eq(satTickets.id, tkOf.id));

  const d14 = addDays(hoy, -14);
  const tkRest = await ticket({ terceroId: T.restaurante!, equipoId: eRest.id, asunto: 'El split del comedor no enfría', prioridad: 'alta', canal: 'telefono', responsableId: P.tecnico2 }, { creadoEn: H(addDays(hoy, -15), '13:00') });
  const otRest = await orden({ terceroId: T.restaurante!, ticketId: tkRest.id, equipoId: eRest.id, tipo: 'correctivo', prioridad: 'alta', tecnicoId: P.tecnico2, descripcion: 'Falta de frío en comedor.', facturable: true });
  await cerrarEnPasado(otRest, P.tecnico2!, d14, '09:00', '11:00', {
    trabajoRealizado: 'Fuga en el abocardado de la unidad exterior. Rehecho el abocardado, prueba de estanqueidad, vacío y recarga de gas R32.',
    materiales: [{ articuloId: A['GAS-R32-3']!, cantidad: 1 }],
    firmaNombre: 'Andrés García',
  });
  await tx.update(satTickets).set({ estado: 'cerrado', cerradoEn: H(addDays(hoy, -10), '09:00'), valoracion: 4, valoracionComentario: 'Bien, aunque tuvimos que esperar al día siguiente.', valoradoEn: H(addDays(hoy, -12), '20:00') }).where(eq(satTickets.id, tkRest.id));

  const d20 = addDays(hoy, -20);
  const tkPart = await ticket({ terceroId: T.particular!, equipoId: ePart.id, asunto: 'Sale agua por debajo de la aerotermia', prioridad: 'normal', canal: 'telefono', responsableId: P.tecnico1 }, { creadoEn: H(addDays(hoy, -22), '19:00') });
  const otPart = await orden({ terceroId: T.particular!, ticketId: tkPart.id, equipoId: ePart.id, tipo: 'correctivo', tecnicoId: P.tecnico1, descripcion: 'Revisar fuga de agua.', facturable: true });
  await cerrarEnPasado(otPart, P.tecnico1!, d20, '17:00', '18:00', {
    trabajoRealizado: 'Bomba de condensados averiada. Sustituida en garantía.',
    materiales: [{ articuloId: A['BOMBA-COND']!, cantidad: 1 }],
    firmaNombre: 'Jorge Peña',
  });
  await tx.update(satTickets).set({ valoracion: 3, valoracionComentario: 'Tardaron dos días en venir.', valoradoEn: H(addDays(hoy, -19), '10:00') }).where(eq(satTickets.id, tkPart.id));

  // Visita preventiva anterior del hotel (sin cargo: filtros a precio cero, solo trazabilidad)
  const visitaAnterior = addMonths(hoy, -3);
  const otPrevAnt = await orden({ terceroId: T.hotel!, contratoId: cHotel.id, tipo: 'preventivo', tecnicoId: P.tecnico1, checklistId: ckPrev!.id, descripcion: `Visita preventiva del contrato ${cHotel.codigo}`, facturable: false }, { visitaFecha: visitaAnterior });
  await cerrarEnPasado(otPrevAnt, P.tecnico1!, visitaAnterior, '09:00', '12:30', {
    trabajoRealizado: 'Revisión completa de los 4 equipos. Filtros sustituidos en las habitaciones 204 y 205. Presiones correctas.',
    materiales: [{ articuloId: A['FIL-AC-STD']!, cantidad: 4 }],
    facturable: false,
    firmaNombre: 'Isabel García',
  });
}
