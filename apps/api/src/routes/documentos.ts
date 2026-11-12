import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DOC_MODULO, DOC_TIPOS, fmtMoney, type DocTipo, type Scope } from '@kite/shared';
import { config } from '../config';
import { db } from '../db/client';
import {
  articulos,
  contactos,
  documentoImpuestos,
  documentoLineas,
  documentos,
  documentosRecurrentes,
  empresas,
  facVerifactu,
  personas,
  terceros,
} from '../db/schema';
import { audit } from '../core/audit';
import { systemCtx } from '../core/context';
import { badRequest, forbidden, notFound, parse } from '../core/errors';
import { saveFile, fileUrl } from '../core/files';
import { marcaPublica } from '../core/marca-publica';
import { emailLayout, queueEmail } from '../core/mail';
import { activeModules } from '../core/modules';
import { can, guard, scopeCondition } from '../core/permissions';
import { resolveRefs } from '../core/refs';
import {
  DESTINOS,
  actualizarDocumento,
  borrarBorrador,
  cargarDocumento,
  convertir,
  crearDocumento,
  documentoSchema,
  ejecutarAccion,
  facturarAlbaranes,
  lineasDe,
  marcarAceptado,
  pendientesPorLinea,
  permisoEditar,
  prepararEnvioPublico,
  puedeEditar,
  relacionados,
  tipoLabel,
} from '../services/documentos';
import { documentoPdf } from '../services/documento-pdf';
import { facturaeXml } from '../services/facturae';
import { verificarCadena } from '../services/verifactu';

const nombreComercial = sql<string>`trim(${personas.nombre} || ' ' || coalesce(${personas.apellidos}, ''))`;

/** Condición de visibilidad para una lista de tipos según los permisos del usuario. */
async function visibilidad(ctx: any, tipos: string[]): Promise<SQL | undefined> {
  const parts: SQL[] = [];
  for (const t of tipos) {
    const mod = DOC_MODULO[t as DocTipo];
    if (!ctx.modules.has(mod)) continue;
    const s = ctx.perms.get(`${mod}.ver`) as Scope | undefined;
    if (!s) continue;
    const c = await scopeCondition(ctx, s, documentos.comercialId);
    parts.push(c ? and(eq(documentos.tipo, t), c)! : eq(documentos.tipo, t));
  }
  if (!parts.length) throw forbidden();
  return or(...parts);
}

export async function documentosRoutes(app: FastifyInstance) {
  app.get('/documentos', async (req) => {
    const ctx = req.ctx;
    const q = req.query as Record<string, string>;
    const tipos = (q.tipo ? q.tipo.split(',') : DOC_TIPOS.map((t) => t.value)).filter((t) => DOC_MODULO[t as DocTipo]);
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25));
    const conds: (SQL | undefined)[] = [eq(documentos.empresaId, ctx.empresaId), await visibilidad(ctx, tipos), q.archivados === '1' ? undefined : isNull(documentos.archivadoEn)];
    if (q.estado) conds.push(inArray(documentos.estado, q.estado.split(',')));
    if (q.estadoPago) conds.push(inArray(documentos.estadoPago, q.estadoPago.split(',')));
    if (q.terceroId) conds.push(eq(documentos.terceroId, q.terceroId));
    if (q.comercialId) conds.push(eq(documentos.comercialId, q.comercialId));
    if (q.proyectoId) conds.push(eq(documentos.proyectoId, q.proyectoId));
    if (q.origenTipo) conds.push(eq(documentos.origenTipo, q.origenTipo));
    if (q.origenId) conds.push(eq(documentos.origenId, q.origenId));
    if (q.desde) conds.push(gte(documentos.fecha, q.desde));
    if (q.hasta) conds.push(lte(documentos.fecha, q.hasta));
    if (q.soloUltimaVersion === '1') conds.push(sql`${documentos.version} = (SELECT max(d2.version) FROM documentos d2 WHERE d2.grupo_id = ${documentos.grupoId})`);
    if (q.q) {
      const like = `%${q.q.replace(/[%_]/g, '')}%`;
      conds.push(or(ilike(documentos.codigo, like), ilike(documentos.titulo, like), ilike(documentos.referenciaExterna, like), ilike(terceros.nombre, like), ilike(terceros.nif, like)));
    }
    const where = and(...conds);
    const sortCols: Record<string, any> = { fecha: documentos.fecha, codigo: documentos.codigo, total: documentos.total, tercero: terceros.nombre, estado: documentos.estado };
    const sortCol = sortCols[q.sort ?? 'fecha'] ?? documentos.fecha;
    const dir = q.dir === 'asc' ? asc : desc;
    const [items, [tot]] = await Promise.all([
      db
        .select({
          id: documentos.id,
          tipo: documentos.tipo,
          codigo: documentos.codigo,
          estado: documentos.estado,
          estadoPago: documentos.estadoPago,
          fecha: documentos.fecha,
          fechaValidez: documentos.fechaValidez,
          fechaEntrega: documentos.fechaEntrega,
          titulo: documentos.titulo,
          referenciaExterna: documentos.referenciaExterna,
          baseImponible: documentos.baseImponible,
          total: documentos.total,
          margen: documentos.margen,
          version: documentos.version,
          terceroId: documentos.terceroId,
          tercero: terceros.nombre,
          comercialId: documentos.comercialId,
          comercial: nombreComercial,
          bloqueado: documentos.bloqueado,
        })
        .from(documentos)
        .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
        .leftJoin(personas, eq(personas.id, documentos.comercialId))
        .where(where)
        .orderBy(dir(sortCol), desc(documentos.creadoEn))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${documentos.total}),0)::float`, base: sql<number>`coalesce(sum(${documentos.baseImponible}),0)::float` })
        .from(documentos)
        .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
        .where(where),
    ]);
    const verMargen = can(ctx, 'pre.editar') || can(ctx, 'pre.aprobar');
    return { items: items.map((i) => (verMargen ? i : { ...i, margen: null })), total: tot?.n ?? 0, sumaTotal: tot?.total ?? 0, sumaBase: tot?.base ?? 0, page, pageSize };
  });

  app.get('/documentos/:id', async (req) => {
    const ctx = req.ctx;
    const { id } = req.params as { id: string };
    return db.transaction(async (tx) => {
      const d = await cargarDocumento(tx, ctx, id);
      const [lineas, impuestos, [tercero], rel, pend, [vf]] = await Promise.all([
        lineasDe(tx, id),
        tx.select().from(documentoImpuestos).where(eq(documentoImpuestos.documentoId, id)),
        tx.select().from(terceros).where(eq(terceros.id, d.terceroId)),
        relacionados(tx, d),
        pendientesPorLinea(tx, d),
        tx.select({ huella: facVerifactu.huella, estadoEnvio: facVerifactu.estadoEnvio, urlQr: facVerifactu.urlQr, secuencia: facVerifactu.secuencia, fechaHoraGen: facVerifactu.fechaHoraGen }).from(facVerifactu).where(eq(facVerifactu.documentoId, id)),
      ]);
      const verCostes = can(ctx, permisoEditar(d.tipo)) && (d.circuito === 'compra' || can(ctx, 'pre.editar') || can(ctx, 'pre.aprobar') || can(ctx, 'fac.emitir'));
      const refs = await resolveRefs(ctx, { fields: { comercialId: { type: 'ref', ref: 'personas', label: '' }, contactoId: { type: 'ref', ref: 'contactos', label: '' }, formaPagoId: { type: 'ref', ref: 'formas_pago', label: '' } } }, [d]);
      return {
        ...d,
        firmaImagen: d.firmaImagen ? true : null,
        coste: verCostes ? d.coste : null,
        margen: verCostes ? d.margen : null,
        lineas: lineas.map((l) => (verCostes ? l : { ...l, coste: null })),
        impuestos,
        tercero: tercero && { id: tercero.id, nombre: tercero.nombre, nif: tercero.nif, email: tercero.email, telefono: tercero.telefono, localidad: tercero.localidad, regimenIva: tercero.regimenIva, riesgoMax: tercero.riesgoMax },
        relacionados: rel,
        pendientes: pend,
        verifactu: vf ?? null,
        destinos: (DESTINOS[d.tipo] ?? []).filter((t) => ctx.modules.has(DOC_MODULO[t as DocTipo]) && can(ctx, permisoEditar(t))),
        puedeEditar: await puedeEditar(ctx, d),
        enlacePublico: d.tokenPublico ? `${config.appUrl}/p/${d.tokenPublico}` : null,
        _refs: refs,
      };
    });
  });

  app.post('/documentos', async (req, reply) => {
    const body = parse(documentoSchema, req.body);
    const d = await db.transaction((tx) => crearDocumento(tx, req.ctx, body));
    reply.code(201);
    return d;
  });

  app.put('/documentos/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(documentoSchema.omit({ tipo: true }), req.body);
    return db.transaction((tx) => actualizarDocumento(tx, req.ctx, id, body));
  });

  app.delete('/documentos/:id', async (req) => {
    const { id } = req.params as { id: string };
    await db.transaction((tx) => borrarBorrador(tx, req.ctx, id));
    return { ok: true };
  });

  app.post('/documentos/:id/accion/:accion', async (req) => {
    const { id, accion } = req.params as { id: string; accion: string };
    return db.transaction((tx) => ejecutarAccion(tx, req.ctx, id, accion, (req.body as Record<string, unknown>) ?? {}));
  });

  app.post('/documentos/:id/convertir', async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ tipo: z.string(), lineas: z.array(z.object({ lineaId: z.string().uuid(), cantidad: z.coerce.number() })).optional() }), req.body);
    const d = await db.transaction((tx) => convertir(tx, req.ctx, id, body.tipo, body.lineas));
    return { id: d.id };
  });

  app.post('/documentos/facturar-albaranes', async (req) => {
    const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).min(1) }), req.body);
    if (!can(req.ctx, 'fac.editar')) throw forbidden();
    const d = await db.transaction((tx) => facturarAlbaranes(tx, req.ctx, ids));
    return { id: d.id };
  });

  /** Albaranes entregados sin facturar, agrupados por cliente. */
  app.get('/documentos-pendientes/facturar', { preHandler: guard('fac.editar') }, async (req) => {
    const rows = await db
      .select({ id: documentos.id, codigo: documentos.codigo, fecha: documentos.fecha, total: documentos.total, baseImponible: documentos.baseImponible, terceroId: documentos.terceroId, tercero: terceros.nombre, origenTipo: documentos.origenTipo, referenciaExterna: documentos.referenciaExterna })
      .from(documentos)
      .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
      .where(and(eq(documentos.empresaId, req.ctx.empresaId), eq(documentos.tipo, 'albaran'), eq(documentos.estado, 'entregado'), isNull(documentos.archivadoEn)))
      .orderBy(asc(terceros.nombre), asc(documentos.fecha));
    return rows;
  });

  /** Líneas de pedidos confirmados pendientes de servir (para almacén). */
  app.get('/documentos-pendientes/servir', { preHandler: guard(['ped.preparar', 'ped.ver']) }, async (req) => {
    const pedidos = await db
      .select({ id: documentos.id, codigo: documentos.codigo, fecha: documentos.fecha, fechaEntrega: documentos.fechaEntrega, estado: documentos.estado, tercero: terceros.nombre, terceroId: documentos.terceroId })
      .from(documentos)
      .innerJoin(terceros, eq(terceros.id, documentos.terceroId))
      .where(and(eq(documentos.empresaId, req.ctx.empresaId), eq(documentos.tipo, 'pedido'), inArray(documentos.estado, ['confirmado', 'en_preparacion', 'parcial']), isNull(documentos.archivadoEn)))
      .orderBy(sql`${documentos.fechaEntrega} NULLS LAST`, asc(documentos.fecha));
    return pedidos;
  });

  /* PDF y envío */
  app.get('/documentos/:id/pdf', async (req) => {
    const { id } = req.params as { id: string };
    await db.transaction((tx) => cargarDocumento(tx, req.ctx, id));
    const { buffer, nombre } = await documentoPdf(id);
    return { __file: true, buffer, mime: 'application/pdf', name: nombre, inline: (req.query as { descargar?: string }).descargar !== '1' };
  });

  app.post('/documentos/:id/enviar', async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ para: z.string().email('Email no válido'), asunto: z.string().min(1), mensaje: z.string().default('') }), req.body);
    const ctx = req.ctx;
    return db.transaction(async (tx) => {
      const d = await cargarDocumento(tx, ctx, id);
      if (!(await puedeEditar(ctx, d)) && !can(ctx, 'fac.emitir')) throw forbidden();
      if (d.estado === 'borrador' && ['factura', 'factura_rectificativa', 'factura_simplificada'].includes(d.tipo)) throw badRequest('Emite la factura antes de enviarla');
      if (d.tipo === 'presupuesto' && d.estado === 'borrador') {
        const r = await ejecutarAccion(tx, ctx, id, 'enviar');
        if (r.estado === 'pendiente_aprobacion') return { ok: false, ...r };
      }
      const token = await prepararEnvioPublico(tx, id);
      const { buffer, nombre } = await documentoPdf(id);
      const f = await saveFile(tx, { empresaId: ctx.empresaId, nombre, mime: 'application/pdf', data: buffer, subidoPor: ctx.usuarioId });
      const [emp] = await tx.select({ nombre: empresas.nombre, ajustes: empresas.ajustes }).from(empresas).where(eq(empresas.id, ctx.empresaId));
      const enlace = `${config.appUrl}/p/${token}`;
      await queueEmail(tx, {
        empresaId: ctx.empresaId,
        para: body.para,
        asunto: body.asunto,
        html: emailLayout({
          empresa: emp!.nombre,
          titulo: `${tipoLabel(d.tipo)} ${d.codigo ?? ''}`,
          cuerpo: `${body.mensaje ? `<p>${body.mensaje.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` : ''}<p>Importe: <b>${fmtMoney(d.total)}</b></p>`,
          boton: { texto: d.tipo === 'presupuesto' ? 'Ver y aceptar el presupuesto' : 'Ver documento', url: enlace },
          ajustes: emp!.ajustes,
        }),
        adjuntos: [{ archivoId: f.id, nombre }],
      });
      await tx.update(documentos).set({ enviadoEn: new Date(), estado: d.tipo === 'proforma' ? 'enviada' : d.tipo === 'presupuesto' && d.estado === 'borrador' ? 'enviado' : d.estado }).where(eq(documentos.id, id));
      await audit(tx, ctx, 'enviar', 'documento', id, { para: body.para });
      return { ok: true, enlace };
    });
  });

  app.get('/documentos/:id/facturae', { preHandler: guard('fac.ver') }, async (req) => {
    const { id } = req.params as { id: string };
    const d = await db.transaction((tx) => cargarDocumento(tx, req.ctx, id));
    if (!d.bloqueado) throw badRequest('Emite la factura antes de generar el Facturae');
    const xml = await facturaeXml(id);
    return { __file: true, buffer: Buffer.from(xml, 'utf8'), mime: 'application/xml', name: `${d.codigo}.xsig.xml` };
  });

  /* Verifactu */
  app.get('/verifactu', { preHandler: guard('fac.ver') }, async (req) => {
    const rows = await db
      .select({ id: facVerifactu.id, secuencia: facVerifactu.secuencia, numSerie: facVerifactu.numSerie, fechaExpedicion: facVerifactu.fechaExpedicion, tipoFactura: facVerifactu.tipoFactura, importeTotal: facVerifactu.importeTotal, huella: facVerifactu.huella, estadoEnvio: facVerifactu.estadoEnvio, documentoId: facVerifactu.documentoId, creadoEn: facVerifactu.creadoEn })
      .from(facVerifactu)
      .where(eq(facVerifactu.empresaId, req.ctx.empresaId))
      .orderBy(desc(facVerifactu.secuencia))
      .limit(300);
    return rows;
  });
  app.get('/verifactu/verificar', { preHandler: guard('fac.ver') }, async (req) => db.transaction((tx) => verificarCadena(tx, req.ctx.empresaId)));
  app.get('/verifactu/:id/xml', { preHandler: guard('fac.ver') }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.select().from(facVerifactu).where(and(eq(facVerifactu.id, id), eq(facVerifactu.empresaId, req.ctx.empresaId)));
    if (!r) throw notFound();
    return { __file: true, buffer: Buffer.from(r.xml, 'utf8'), mime: 'application/xml', name: `verifactu-${r.numSerie}.xml` };
  });

  /* Facturación recurrente */
  const recurrenteSchema = z.object({
    nombre: z.string().min(1),
    terceroId: z.string().uuid(),
    serieId: z.string().uuid().nullish(),
    formaPagoId: z.string().uuid().nullish(),
    periodicidad: z.enum(['mensual', 'trimestral', 'semestral', 'anual']),
    proximaFecha: z.string(),
    finFecha: z.string().nullish(),
    emitirAutomaticamente: z.boolean().default(false),
    activo: z.boolean().default(true),
    lineas: z.array(z.object({ articuloId: z.string().uuid().nullish(), descripcion: z.string().min(1), cantidad: z.coerce.number(), precio: z.coerce.number(), descuento: z.coerce.number().default(0), ivaTipo: z.coerce.number(), retencion: z.coerce.number().default(0) })).min(1),
  });
  app.get('/documentos-recurrentes', { preHandler: guard('fac.ver') }, async (req) =>
    db
      .select({ r: documentosRecurrentes, tercero: terceros.nombre })
      .from(documentosRecurrentes)
      .innerJoin(terceros, eq(terceros.id, documentosRecurrentes.terceroId))
      .where(eq(documentosRecurrentes.empresaId, req.ctx.empresaId))
      .orderBy(asc(documentosRecurrentes.proximaFecha))
      .then((rows) => rows.map((x) => ({ ...x.r, tercero: x.tercero, importe: x.r.lineas.reduce((a, l) => a + l.cantidad * l.precio * (1 - (l.descuento ?? 0) / 100), 0) }))),
  );
  app.post('/documentos-recurrentes', { preHandler: guard('fac.editar') }, async (req) => {
    const body = parse(recurrenteSchema, req.body);
    const [r] = await db.insert(documentosRecurrentes).values({ ...body, finFecha: body.finFecha || null, empresaId: req.ctx.empresaId }).returning();
    await audit(db, req.ctx, 'crear', 'recurrente', r!.id);
    return r;
  });
  app.put('/documentos-recurrentes/:id', { preHandler: guard('fac.editar') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(recurrenteSchema, req.body);
    const [r] = await db.update(documentosRecurrentes).set({ ...body, finFecha: body.finFecha || null }).where(and(eq(documentosRecurrentes.id, id), eq(documentosRecurrentes.empresaId, req.ctx.empresaId))).returning();
    if (!r) throw notFound();
    await audit(db, req.ctx, 'editar', 'recurrente', id);
    return r;
  });
  app.delete('/documentos-recurrentes/:id', { preHandler: guard('fac.editar') }, async (req) => {
    const { id } = req.params as { id: string };
    await db.update(documentosRecurrentes).set({ activo: false }).where(and(eq(documentosRecurrentes.id, id), eq(documentosRecurrentes.empresaId, req.ctx.empresaId)));
    return { ok: true };
  });
  app.post('/documentos-recurrentes/generar', { preHandler: guard('fac.editar') }, async (req) => ({ generadas: await generarRecurrentes(req.ctx.empresaId) }));

  /* ── Páginas públicas (enlace enviado al cliente) ── */
  app.get('/public/documentos/:token', { config: { public: true } }, async (req) => {
    const { token } = req.params as { token: string };
    const [d] = await db.select().from(documentos).where(eq(documentos.tokenPublico, token));
    if (!d) throw notFound('Este enlace no existe o ha caducado');
    if (d.tipo === 'presupuesto' && d.estado === 'enviado') {
      await db.update(documentos).set({ estado: 'visto', vistoEn: new Date() }).where(eq(documentos.id, d.id));
      d.estado = 'visto';
    }
    const [emp] = await db.select({ nombre: empresas.nombre, logo: empresas.logoArchivoId, email: empresas.email, telefono: empresas.telefono }).from(empresas).where(eq(empresas.id, d.empresaId));
    const lineas = await lineasDe(db as any, d.id);
    const [t] = await db.select({ nombre: terceros.nombre }).from(terceros).where(eq(terceros.id, d.terceroId));
    const caducado = d.tipo === 'presupuesto' && d.fechaValidez && d.fechaValidez < new Date().toISOString().slice(0, 10) && ['enviado', 'visto'].includes(d.estado);
    return {
      empresa: { nombre: emp!.nombre, logoUrl: fileUrl(emp!.logo, 86400), email: emp!.email, telefono: emp!.telefono },
      marca: await marcaPublica(d.empresaId),
      tipo: d.tipo,
      tipoLabel: tipoLabel(d.tipo),
      codigo: d.codigo,
      titulo: d.titulo,
      fecha: d.fecha,
      fechaValidez: d.fechaValidez,
      estado: caducado ? 'caducado' : d.estado,
      cliente: t?.nombre,
      baseImponible: d.baseImponible,
      totalIva: d.totalIva,
      total: d.total,
      observaciones: d.observaciones,
      condiciones: d.condiciones,
      aceptadoEn: d.aceptadoEn,
      aceptadoPor: d.aceptadoPor,
      lineas: lineas.map((l) => ({ tipoLinea: l.tipoLinea, descripcion: l.descripcion, cantidad: l.cantidad, precio: l.precio, descuento: l.descuento, subtotal: l.subtotal })),
      pdf: `/api/public/documentos/${token}/pdf`,
    };
  });
  app.get('/public/documentos/:token/pdf', { config: { public: true } }, async (req) => {
    const { token } = req.params as { token: string };
    const [d] = await db.select({ id: documentos.id }).from(documentos).where(eq(documentos.tokenPublico, token));
    if (!d) throw notFound();
    const { buffer, nombre } = await documentoPdf(d.id);
    return { __file: true, buffer, mime: 'application/pdf', name: nombre, inline: true };
  });
  app.post('/public/documentos/:token/responder', { config: { public: true, rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (req) => {
    const { token } = req.params as { token: string };
    const body = parse(
      z.object({ aceptar: z.boolean(), nombre: z.string().trim().min(2, 'Escribe tu nombre'), firma: z.string().startsWith('data:image/png').nullish(), motivo: z.string().nullish() }),
      req.body,
    );
    const [d] = await db.select().from(documentos).where(eq(documentos.tokenPublico, token));
    if (!d || d.tipo !== 'presupuesto') throw notFound();
    if (!['enviado', 'visto'].includes(d.estado)) throw badRequest('Este presupuesto ya no admite respuesta');
    if (d.fechaValidez && d.fechaValidez < new Date().toISOString().slice(0, 10)) throw badRequest('El presupuesto ha caducado. Pide uno actualizado.');
    const ctx = systemCtx(d.empresaId, await activeModules(d.empresaId));
    ctx.ip = req.ip;
    await db.transaction(async (tx) => {
      if (body.aceptar) await marcarAceptado(tx, ctx, d.id, { nombre: body.nombre, firma: body.firma ?? null });
      else {
        await tx.update(documentos).set({ estado: 'rechazado', rechazoMotivo: body.motivo ?? null, aceptadoPor: body.nombre }).where(eq(documentos.id, d.id));
        await audit(tx, ctx, 'rechazar_cliente', 'documento', d.id, { nombre: body.nombre, motivo: body.motivo });
        const { notify } = await import('../core/notify');
        await notify(tx, ctx, { modulo: 'pre', tipo: 'rechazado', titulo: `Presupuesto ${d.codigo} rechazado por el cliente`, cuerpo: body.motivo ?? null, enlace: `/documentos/${d.id}`, personaIds: [d.comercialId], email: true });
      }
    });
    return { ok: true };
  });

  /* Artículos más vendidos a un cliente (ayuda al crear documentos) */
  app.get('/documentos-ayuda/habituales/:terceroId', async (req) => {
    const { terceroId } = req.params as { terceroId: string };
    if (!can(req.ctx, 'pre.editar') && !can(req.ctx, 'ped.editar') && !can(req.ctx, 'fac.editar') && !can(req.ctx, 'cpr.editar')) throw forbidden();
    return db
      .select({ articuloId: documentoLineas.articuloId, referencia: articulos.referencia, nombre: articulos.nombre, veces: sql<number>`count(*)::int`, ultimoPrecio: sql<number>`(array_agg(${documentoLineas.precio} ORDER BY ${documentos.fecha} DESC))[1]::float` })
      .from(documentoLineas)
      .innerJoin(documentos, eq(documentos.id, documentoLineas.documentoId))
      .innerJoin(articulos, eq(articulos.id, documentoLineas.articuloId))
      .where(and(eq(documentos.terceroId, terceroId), eq(documentos.empresaId, req.ctx.empresaId)))
      .groupBy(documentoLineas.articuloId, articulos.referencia, articulos.nombre)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
  });

  contactos; // tablas usadas por los tipos de drizzle
}

/** Genera las facturas recurrentes vencidas. Las marcadas como automáticas se emiten; el resto quedan en borrador. */
export async function generarRecurrentes(empresaId: string) {
  const hoy = new Date().toISOString().slice(0, 10);
  const pendientes = await db
    .select()
    .from(documentosRecurrentes)
    .where(and(eq(documentosRecurrentes.empresaId, empresaId), eq(documentosRecurrentes.activo, true), lte(documentosRecurrentes.proximaFecha, hoy)));
  let n = 0;
  const ctx = systemCtx(empresaId, await activeModules(empresaId));
  if (!ctx.modules.has('fac')) return 0;
  for (const r of pendientes) {
    await db.transaction(async (tx) => {
      const [lock] = await tx.select().from(documentosRecurrentes).where(eq(documentosRecurrentes.id, r.id)).for('update');
      if (!lock || lock.proximaFecha > hoy || !lock.activo) return;
      const d = await crearDocumento(
        tx,
        ctx,
        {
          tipo: 'factura',
          fecha: lock.proximaFecha,
          terceroId: lock.terceroId,
          formaPagoId: lock.formaPagoId,
          serieId: lock.serieId,
          titulo: lock.nombre,
          descuentoGlobal: 0,
          origenTipo: lock.origenTipo ?? 'recurrente',
          origenId: lock.origenId ?? lock.id,
          lineas: lock.lineas.map((l) => ({ ...l, tipoLinea: 'articulo' as const, descuento: l.descuento ?? 0, retencion: l.retencion ?? 0, coste: 0 })),
        },
        { sinPermisos: true },
      );
      if (lock.emitirAutomaticamente) await ejecutarAccion(tx, { ...ctx, perms: new Map([['fac.emitir', 'todo'], ['fac.ver', 'todo'], ['fac.editar', 'todo']]) }, d.id, 'emitir');
      const next = new Date(lock.proximaFecha + 'T12:00:00Z');
      next.setUTCMonth(next.getUTCMonth() + ({ mensual: 1, trimestral: 3, semestral: 6, anual: 12 } as Record<string, number>)[lock.periodicidad]!);
      const proxima = next.toISOString().slice(0, 10);
      await tx
        .update(documentosRecurrentes)
        .set({ proximaFecha: proxima, ultimoDocumentoId: d.id, activo: !lock.finFecha || proxima <= lock.finFecha })
        .where(eq(documentosRecurrentes.id, lock.id));
      n++;
    });
  }
  return n;
}
