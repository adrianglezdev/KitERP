import { and, asc, desc, eq, getTableColumns, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import ExcelJS from 'exceljs';
import { toZod, type ResourceDef, type Scope, optionLabel } from '@kite/shared';
import { db, type Tx } from '../db/client';
import type { Ctx } from './context';
import { audit, diff } from './audit';
import { forbidden, notFound, parse } from './errors';
import { can, canOnOwner, scopeCondition } from './permissions';
import { resolveRefs } from './refs';

export interface CrudOptions {
  path: string;
  resource: ResourceDef;
  table: PgTable;
  entity: string;
  perms: { ver: string | string[]; crear?: string; editar?: string; borrar?: string };
  /** Columna con la persona dueña de la fila, para aplicar el alcance (propio/equipo/departamento). */
  scopeCol?: PgColumn;
  /** Al crear, si el usuario solo tiene alcance "propio", se asigna a sí mismo en esta columna. */
  ownerOnCreate?: string;
  hardDelete?: boolean;
  baseWhere?: (ctx: Ctx, req: FastifyRequest) => SQL | undefined;
  searchCols?: (PgColumn | SQL)[];
  extraFilters?: Record<string, PgColumn>;
  defaults?: (ctx: Ctx) => Record<string, unknown>;
  beforeSave?: (tx: Tx, ctx: Ctx, data: Record<string, any>, existing: Record<string, any> | null) => Promise<Record<string, any>> | Record<string, any>;
  afterSave?: (tx: Tx, ctx: Ctx, row: Record<string, any>, existing: Record<string, any> | null) => Promise<void>;
  beforeDelete?: (tx: Tx, ctx: Ctx, row: Record<string, any>) => Promise<void>;
  transformOut?: (row: Record<string, any>, ctx: Ctx) => Record<string, any>;
  /** Operaciones habilitadas (por defecto todas). */
  only?: ('list' | 'get' | 'create' | 'update' | 'delete')[];
}

const asList = (p: string | string[]) => (Array.isArray(p) ? p : [p]);

export function registerCrud(app: FastifyInstance, o: CrudOptions) {
  const cols = getTableColumns(o.table) as Record<string, PgColumn>;
  const idCol = cols.id!;
  const empresaCol = cols.empresaId;
  const archivedCol = cols.archivadoEn;
  const verPerms = asList(o.perms.ver);
  const crear = o.perms.crear ?? verPerms[0]!;
  const editar = o.perms.editar ?? crear;
  const borrar = o.perms.borrar ?? editar;
  const createSchema = toZod(o.resource);
  const updateSchema = toZod(o.resource, { partial: true });
  const ops = new Set(o.only ?? ['list', 'get', 'create', 'update', 'delete']);
  const searchCols =
    o.searchCols ?? (o.resource.searchable ?? []).map((k) => cols[k]).filter(Boolean as unknown as (c: PgColumn | undefined) => c is PgColumn);

  const viewScope = (ctx: Ctx): Scope | undefined => {
    let best: Scope | undefined;
    for (const p of verPerms) {
      const s = ctx.perms.get(p);
      if (s && (!best || ['propio', 'equipo', 'departamento', 'todo'].indexOf(s) > ['propio', 'equipo', 'departamento', 'todo'].indexOf(best))) best = s;
    }
    return best;
  };

  async function baseConds(ctx: Ctx, req: FastifyRequest): Promise<SQL[]> {
    const scope = viewScope(ctx);
    if (!scope) throw forbidden();
    const conds: (SQL | undefined)[] = [];
    if (empresaCol) conds.push(eq(empresaCol, ctx.empresaId));
    if (o.scopeCol) conds.push(await scopeCondition(ctx, scope, o.scopeCol));
    if (o.baseWhere) conds.push(o.baseWhere(ctx, req));
    return conds.filter(Boolean) as SQL[];
  }

  const out = (row: Record<string, any>, ctx: Ctx) => {
    let r = row;
    for (const [k, f] of Object.entries(o.resource.fields)) {
      if (f.sensitive && !can(ctx, f.sensitive)) r = { ...r, [k]: null };
    }
    return o.transformOut ? o.transformOut(r, ctx) : r;
  };

  async function fetchOne(ctx: Ctx, req: FastifyRequest, id: string) {
    const conds = await baseConds(ctx, req);
    const [row] = await db
      .select()
      .from(o.table)
      .where(and(eq(idCol, id), ...conds));
    if (!row) throw notFound(`${o.resource.label} no encontrado`);
    return row as Record<string, any>;
  }

  async function checkOwner(ctx: Ctx, perm: string, row: Record<string, any>) {
    const pdef = ctx.perms.get(perm);
    if (!pdef) throw forbidden();
    if (!o.scopeCol || pdef === 'todo') return;
    const key = Object.entries(cols).find(([, c]) => c === o.scopeCol)?.[0];
    if (key && !(await canOnOwner(ctx, perm, row[key]))) throw forbidden('Este registro no está dentro de tu alcance');
  }

  /* ── Listado ── */
  if (ops.has('list'))
    app.get(o.path, async (req) => {
      const ctx = req.ctx;
      const q = req.query as Record<string, string>;
      const page = Math.max(1, Number(q.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25));
      const conds = await baseConds(ctx, req);
      if (archivedCol) conds.push(q.archivados === '1' ? isNotNull(archivedCol) : isNull(archivedCol));
      if (q.q && searchCols.length) {
        const like = `%${q.q.trim().replace(/[%_]/g, '')}%`;
        conds.push(or(...searchCols.map((c) => ilike(c as PgColumn, like)))!);
      }
      for (const [key, raw] of Object.entries(q)) {
        if (!key.startsWith('f.') || raw === '' || raw === undefined) continue;
        const [, field, op] = key.split('.');
        const col = o.extraFilters?.[field!] ?? cols[field!];
        if (!col) continue;
        if (op === 'desde') conds.push(gte(col, raw));
        else if (op === 'hasta') conds.push(lte(col, raw));
        else if (raw === '__null') conds.push(isNull(col));
        else if (raw === 'true' || raw === 'false') conds.push(eq(col, raw === 'true'));
        else if (raw.includes(',')) conds.push(inArray(col, raw.split(',')));
        else conds.push(eq(col, raw));
      }
      const where = conds.length ? and(...conds) : undefined;
      const sortKey = q.sort && cols[q.sort] ? q.sort : (o.resource.defaultSort?.field ?? (cols.creadoEn ? 'creadoEn' : 'id'));
      const dir = (q.dir ?? (q.sort ? 'asc' : (o.resource.defaultSort?.dir ?? 'desc'))) === 'asc' ? asc : desc;
      const orderBy = [dir(cols[sortKey]!), desc(idCol)];

      if (q.format === 'xlsx' || q.format === 'csv') return exportRows(req, ctx, where, orderBy, q.format);

      const [items, [count]] = await Promise.all([
        db
          .select()
          .from(o.table)
          .where(where)
          .orderBy(...orderBy)
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ n: sql<number>`count(*)::int` }).from(o.table).where(where),
      ]);
      const rows = (items as Record<string, any>[]).map((r) => out(r, ctx));
      return { items: rows, total: count?.n ?? 0, page, pageSize, refs: await resolveRefs(ctx, o.resource, rows) };
    });

  async function exportRows(req: FastifyRequest, ctx: Ctx, where: SQL | undefined, orderBy: SQL[], format: string) {
    const items = (await db.select().from(o.table).where(where).orderBy(...orderBy).limit(50000)) as Record<string, any>[];
    const rows = items.map((r) => out(r, ctx));
    const refs = await resolveRefs(ctx, o.resource, rows);
    const fields = Object.entries(o.resource.fields).filter(([, f]) => !f.hidden && f.type !== 'json' && f.type !== 'file');
    const value = (k: string, v: any) => {
      const f = o.resource.fields[k]!;
      if (v === null || v === undefined) return '';
      if (f.type === 'ref' && f.ref) return refs[f.ref]?.[v] ?? v;
      if (f.type === 'enum') return optionLabel(f.options, v)?.label ?? v;
      if (f.type === 'bool') return v ? 'Sí' : 'No';
      if (Array.isArray(v)) return v.join(', ');
      return v;
    };
    const reply = (req as any).__reply;
    void reply;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(o.resource.plural.slice(0, 30));
    ws.columns = fields.map(([k, f]) => ({ header: f.label, key: k, width: Math.min(40, Math.max(12, f.label.length + 4)) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(Object.fromEntries(fields.map(([k]) => [k, value(k, r[k])])));
    if (format === 'csv') {
      const buf = await wb.csv.writeBuffer({ formatterOptions: { delimiter: ';' } });
      return { __file: true, buffer: Buffer.concat([Buffer.from('﻿'), Buffer.from(buf as ArrayBuffer)]), mime: 'text/csv; charset=utf-8', name: `${o.resource.key}.csv` };
    }
    const buf = await wb.xlsx.writeBuffer();
    return { __file: true, buffer: Buffer.from(buf as ArrayBuffer), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: `${o.resource.key}.xlsx` };
  }

  /* ── Detalle ── */
  if (ops.has('get'))
    app.get(`${o.path}/:id`, async (req) => {
      const { id } = req.params as { id: string };
      const row = out(await fetchOne(req.ctx, req, id), req.ctx);
      return { ...row, _refs: await resolveRefs(req.ctx, o.resource, [row]), _puedeEditar: can(req.ctx, editar) };
    });

  /* ── Alta ── */
  if (ops.has('create'))
    app.post(o.path, async (req, reply) => {
      const ctx = req.ctx;
      if (!can(ctx, crear)) throw forbidden();
      let data = parse(createSchema, req.body) as Record<string, any>;
      if (o.ownerOnCreate && ctx.perms.get(crear) === 'propio') data[o.ownerOnCreate] = ctx.personaId;
      else if (o.ownerOnCreate && !data[o.ownerOnCreate]) data[o.ownerOnCreate] = ctx.personaId;
      const row = await db.transaction(async (tx) => {
        data = { ...(o.defaults?.(ctx) ?? {}), ...data };
        if (empresaCol) data.empresaId = ctx.empresaId;
        if (cols.creadoPor && !data.creadoPor) data.creadoPor = ctx.usuarioId;
        if (o.beforeSave) data = await o.beforeSave(tx, ctx, data, null);
        if (o.scopeCol) await checkOwner(ctx, crear, data);
        const [created] = (await tx.insert(o.table).values(data as any).returning()) as Record<string, any>[];
        await audit(tx, ctx, 'crear', o.entity, created!.id, diff(null, created));
        if (o.afterSave) await o.afterSave(tx, ctx, created!, null);
        return created!;
      });
      reply.code(201);
      return out(row, ctx);
    });

  /* ── Edición ── */
  if (ops.has('update'))
    app.patch(`${o.path}/:id`, async (req) => {
      const ctx = req.ctx;
      const { id } = req.params as { id: string };
      if (!can(ctx, editar)) throw forbidden();
      const existing = await fetchOne(ctx, req, id);
      await checkOwner(ctx, editar, existing);
      let data = parse(updateSchema, req.body) as Record<string, any>;
      for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
      // un campo sensible solo lo cambia quien puede verlo
      for (const [k, f] of Object.entries(o.resource.fields)) if (f.sensitive && !can(ctx, f.sensitive)) delete data[k];
      const row = await db.transaction(async (tx) => {
        if (o.beforeSave) data = await o.beforeSave(tx, ctx, data, existing);
        if (o.scopeCol && ctx.perms.get(editar) !== 'todo') await checkOwner(ctx, editar, { ...existing, ...data });
        if (!Object.keys(data).length) return existing;
        const [updated] = (await tx.update(o.table).set(data as any).where(eq(idCol, id)).returning()) as Record<string, any>[];
        await audit(tx, ctx, 'editar', o.entity, id, diff(existing, updated));
        if (o.afterSave) await o.afterSave(tx, ctx, updated!, existing);
        return updated!;
      });
      return out(row, ctx);
    });

  /* ── Archivar / borrar ── */
  if (ops.has('delete')) {
    app.delete(`${o.path}/:id`, async (req) => {
      const ctx = req.ctx;
      const { id } = req.params as { id: string };
      if (!can(ctx, borrar)) throw forbidden();
      const existing = await fetchOne(ctx, req, id);
      await checkOwner(ctx, borrar, existing);
      await db.transaction(async (tx) => {
        if (o.beforeDelete) await o.beforeDelete(tx, ctx, existing);
        if (archivedCol && !o.hardDelete) {
          await tx.update(o.table).set({ archivadoEn: new Date() } as any).where(eq(idCol, id));
          await audit(tx, ctx, 'archivar', o.entity, id);
        } else {
          await tx.delete(o.table).where(eq(idCol, id));
          await audit(tx, ctx, 'borrar', o.entity, id, existing);
        }
      });
      return { ok: true };
    });
    if (archivedCol && !o.hardDelete)
      app.post(`${o.path}/:id/restaurar`, async (req) => {
        const ctx = req.ctx;
        const { id } = req.params as { id: string };
        if (!can(ctx, borrar)) throw forbidden();
        const conds = await baseConds(ctx, req);
        await db.transaction(async (tx) => {
          const r = await tx.update(o.table).set({ archivadoEn: null } as any).where(and(eq(idCol, id), ...conds)).returning({ id: idCol });
          if (!r.length) throw notFound();
          await audit(tx, ctx, 'restaurar', o.entity, id);
        });
        return { ok: true };
      });
  }
}
