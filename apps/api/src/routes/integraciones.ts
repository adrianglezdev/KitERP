import { createHmac } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { SCOPES, articuloResource, personaResource, terceroResource, toZod, type ResourceDef } from '@kite/shared';
import { db, type DbOrTx } from '../db/client';
import { apiClaves, articulos, emailsSalida, personas, terceros, webhooks } from '../db/schema';
import { randomToken, sha256 } from '../core/auth';
import { audit } from '../core/audit';
import { badRequest, notFound, parse } from '../core/errors';
import { guard } from '../core/permissions';

/** Envía un evento a los webhooks suscritos (firmado con HMAC-SHA256 en la cabecera X-Kite-Signature). */
export async function dispatchWebhook(tx: DbOrTx, empresaId: string, evento: string, payload: unknown) {
  const hooks = await tx.select().from(webhooks).where(and(eq(webhooks.empresaId, empresaId), eq(webhooks.activo, true)));
  for (const h of hooks.filter((x) => x.eventos.includes(evento) || x.eventos.includes('*'))) {
    const body = JSON.stringify({ evento, fecha: new Date().toISOString(), datos: payload });
    const sig = createHmac('sha256', h.secreto).update(body).digest('hex');
    fetch(h.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kite-signature': sig, 'x-kite-event': evento }, body, signal: AbortSignal.timeout(8000) })
      .then((r) => db.update(webhooks).set({ ultimoEstado: String(r.status), ultimoEnvio: new Date() }).where(eq(webhooks.id, h.id)))
      .catch((e) => db.update(webhooks).set({ ultimoEstado: `error: ${e.message}`.slice(0, 200), ultimoEnvio: new Date() }).where(eq(webhooks.id, h.id)));
  }
}

const IMPORTABLES: Record<string, { def: ResourceDef; table: any; key: string }> = {
  terceros: { def: terceroResource, table: terceros, key: 'nif' },
  articulos: { def: articuloResource, table: articulos, key: 'referencia' },
  personas: { def: personaResource, table: personas, key: 'email' },
};

export async function integracionesRoutes(app: FastifyInstance) {
  /* Claves de API */
  app.get('/api-claves', { preHandler: guard('api.gestionar') }, async (req) => {
    const rows = await db.select().from(apiClaves).where(eq(apiClaves.empresaId, req.ctx.empresaId)).orderBy(desc(apiClaves.creadoEn));
    return rows.map(({ hash: _h, ...r }) => r);
  });
  app.post('/api-claves', { preHandler: guard('api.gestionar') }, async (req) => {
    const body = parse(z.object({ nombre: z.string().min(1), permisos: z.record(z.enum(SCOPES)) }), req.body);
    const prefijo = randomToken(6).replace(/[^a-zA-Z0-9]/g, 'x');
    const token = `kite_${prefijo}_${randomToken(24)}`;
    const [k] = await db.insert(apiClaves).values({ empresaId: req.ctx.empresaId, nombre: body.nombre, prefijo, hash: sha256(token), permisos: body.permisos, creadoPor: req.ctx.usuarioId }).returning();
    await audit(db, req.ctx, 'crear', 'api_clave', k!.id, { nombre: body.nombre });
    return { id: k!.id, token, aviso: 'Copia la clave ahora: no se volverá a mostrar.' };
  });
  app.delete('/api-claves/:id', { preHandler: guard('api.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    await db.update(apiClaves).set({ revocadaEn: new Date() }).where(and(eq(apiClaves.id, id), eq(apiClaves.empresaId, req.ctx.empresaId), isNull(apiClaves.revocadaEn)));
    await audit(db, req.ctx, 'revocar', 'api_clave', id);
    return { ok: true };
  });

  /* Webhooks */
  app.get('/webhooks', { preHandler: guard('api.gestionar') }, async (req) => db.select().from(webhooks).where(eq(webhooks.empresaId, req.ctx.empresaId)));
  app.post('/webhooks', { preHandler: guard('api.gestionar') }, async (req) => {
    const body = parse(z.object({ url: z.string().url().startsWith('https://', 'La URL debe usar https'), eventos: z.array(z.string()).min(1) }), req.body);
    const [w] = await db.insert(webhooks).values({ ...body, empresaId: req.ctx.empresaId, secreto: randomToken(24) }).returning();
    await audit(db, req.ctx, 'crear', 'webhook', w!.id, { url: body.url });
    return w;
  });
  app.delete('/webhooks/:id', { preHandler: guard('api.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.empresaId, req.ctx.empresaId)));
    return { ok: true };
  });

  /* Importación desde Excel / CSV */
  app.get('/importar/:tipo/plantilla', { preHandler: guard('api.gestionar') }, async (req) => {
    const { tipo } = req.params as { tipo: string };
    const imp = IMPORTABLES[tipo];
    if (!imp) throw notFound();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Datos');
    const fields = Object.entries(imp.def.fields).filter(([, f]) => ['text', 'email', 'phone', 'url', 'nif', 'iban', 'money', 'number', 'percent', 'int', 'enum', 'bool', 'date'].includes(f.type));
    ws.columns = fields.map(([k, f]) => ({ header: k, key: k, width: Math.max(14, f.label.length + 2) }));
    ws.addRow(Object.fromEntries(fields.map(([k, f]) => [k, `${f.label}${f.required ? ' (obligatorio)' : ''}`])));
    ws.getRow(1).font = { bold: true };
    ws.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };
    const buf = await wb.xlsx.writeBuffer();
    return { __file: true, buffer: Buffer.from(buf as ArrayBuffer), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: `plantilla-${tipo}.xlsx` };
  });

  app.post('/importar/:tipo', { preHandler: guard('api.gestionar') }, async (req) => {
    const { tipo } = req.params as { tipo: string };
    const { simular } = req.query as { simular?: string };
    const imp = IMPORTABLES[tipo];
    if (!imp) throw notFound();
    const file = await req.file();
    if (!file) throw badRequest('Adjunta un archivo Excel (.xlsx) o CSV');
    const buf = await file.toBuffer();
    const wb = new ExcelJS.Workbook();
    if (file.filename.toLowerCase().endsWith('.csv')) {
      const { Readable } = await import('node:stream');
      await wb.csv.read(Readable.from(buf.toString('utf8').replace(/^﻿/, '')), { parserOptions: { delimiter: buf.toString('utf8').includes(';') ? ';' : ',' } });
    } else await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw badRequest('El archivo está vacío');
    const headers = (ws.getRow(1).values as unknown[]).slice(1).map((h) => String(h ?? '').trim());
    const schema = toZod(imp.def);
    const valid: Record<string, unknown>[] = [];
    const errores: { fila: number; error: string }[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const vals = (row.values as unknown[]).slice(1);
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (!h || !(h in imp.def.fields)) return;
        let v = vals[i] as any;
        if (v && typeof v === 'object' && 'text' in v) v = v.text;
        if (v instanceof Date) v = v.toISOString().slice(0, 10);
        const f = imp.def.fields[h]!;
        if (f.type === 'bool' && typeof v === 'string') v = ['si', 'sí', 'true', '1', 'x'].includes(v.toLowerCase());
        if (v !== undefined && v !== null && v !== '') obj[h] = typeof v === 'number' || typeof v === 'boolean' ? v : String(v).trim();
      });
      if (!Object.keys(obj).length) return;
      // la fila de ayuda de la plantilla repite las etiquetas de los campos
      const esAyuda = Object.entries(obj).some(([k, v]) => {
        const label = imp.def.fields[k]?.label;
        return String(v).endsWith('(obligatorio)') || (!!label && String(v) === label);
      });
      if (esAyuda) return;
      const r = schema.safeParse(obj);
      if (r.success) valid.push(r.data);
      else errores.push({ fila: n, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    });
    if (simular) return { validas: valid.length, errores };
    const res = await db.transaction(async (tx) => {
      let creados = 0;
      let actualizados = 0;
      for (const row of valid) {
        const keyVal = row[imp.key];
        let existing: { id: string } | undefined;
        if (keyVal) [existing] = await tx.select({ id: imp.table.id }).from(imp.table).where(and(eq(imp.table.empresaId, req.ctx.empresaId), eq(imp.table[imp.key], keyVal)));
        if (existing) {
          await tx.update(imp.table).set(row).where(eq(imp.table.id, existing.id));
          actualizados++;
        } else {
          await tx.insert(imp.table).values({ ...row, empresaId: req.ctx.empresaId });
          creados++;
        }
      }
      await audit(tx, req.ctx, 'importar', tipo, null, { creados, actualizados, errores: errores.length });
      return { creados, actualizados };
    });
    return { ...res, errores };
  });

  /* Bandeja de salida de emails */
  app.get('/emails', { preHandler: guard('cfg.gestionar') }, async (req) =>
    db.select({ id: emailsSalida.id, para: emailsSalida.para, asunto: emailsSalida.asunto, estado: emailsSalida.estado, error: emailsSalida.error, creadoEn: emailsSalida.creadoEn, enviadoEn: emailsSalida.enviadoEn }).from(emailsSalida).where(eq(emailsSalida.empresaId, req.ctx.empresaId)).orderBy(desc(emailsSalida.creadoEn)).limit(100),
  );
  app.get('/emails/:id', { preHandler: guard('cfg.gestionar') }, async (req) => {
    const { id } = req.params as { id: string };
    const [e] = await db.select().from(emailsSalida).where(and(eq(emailsSalida.id, id), eq(emailsSalida.empresaId, req.ctx.empresaId)));
    if (!e) throw notFound();
    return e;
  });
}
