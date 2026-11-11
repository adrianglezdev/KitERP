import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, sqlClient } from '../src/db/client';
import { empresas } from '../src/db/schema/core';
import { saveFile } from '../src/core/files';
import { PASSWORD, as, getApp } from './helpers';

/** Pruebas de gastos, nóminas, tesorería, contabilidad e informes: flujos y límites de permisos. */

type Cliente = Awaited<ReturnType<typeof as>>;
let admin: Cliente, empleado: Cliente, administracion: Cliente, comercial: Cliente, comercial2: Cliente;
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

beforeAll(async () => {
  await getApp();
  [admin, empleado, administracion, comercial, comercial2] = await Promise.all(['admin@kite.test', 'empleado@kite.test', 'administracion@kite.test', 'comercial@kite.test', 'comercial2@kite.test'].map((e) => as(e)));
});
afterAll(async () => {
  await (await getApp()).close();
  await sqlClient.end();
});

describe('GAS · gastos y dietas', () => {
  it('ticket: borrador → enviado → aprobado por otra persona → pagado en nómina', async () => {
    const c = await empleado.post('/api/gas/gastos', { tipo: 'ticket', categoria: 'comida', fecha: hoy(), comercio: 'Bar Prueba', concepto: 'Comida con cliente', total: 24.2, ivaTipo: 10 });
    expect(c.status).toBe(201);
    expect(c.body.estado).toBe('borrador');
    expect(c.body.iva).toBeCloseTo(2.2, 2);
    const id = c.body.id;

    // sin la foto del ticket no se puede enviar
    expect((await empleado.post(`/api/gas/gastos/${id}/enviar`)).status).toBe(400);
    const [e] = await db.select({ id: empresas.id }).from(empresas).limit(1);
    const f = await saveFile(db, { empresaId: e!.id, nombre: 'ticket.jpg', mime: 'image/jpeg', data: Buffer.from(`ticket ${Date.now()} ${Math.random()}`) });
    expect((await empleado.patch(`/api/gas/gastos/${id}`, { archivoId: f.id })).status).toBe(200);
    expect((await empleado.post(`/api/gas/gastos/${id}/enviar`)).status).toBe(200);
    // enviado: ya no se puede cambiar
    expect((await empleado.patch(`/api/gas/gastos/${id}`, { total: 99 })).status).toBe(409);
    // nadie aprueba sus propios gastos
    expect((await empleado.post(`/api/gas/gastos/${id}/aprobar`)).status).toBe(403);

    expect((await admin.post(`/api/gas/gastos/${id}/aprobar`)).status).toBe(200);
    const pend = await administracion.get('/api/gas/gastos?vista=liquidar&pageSize=200');
    expect(pend.status).toBe(200);
    expect(pend.body.items.some((g: any) => g.id === id)).toBe(true);

    const l = await administracion.post('/api/gas/liquidaciones', { ids: [id], via: 'nomina', fecha: hoy() });
    expect(l.status).toBe(201);
    const g = await empleado.get(`/api/gas/gastos/${id}`);
    expect(g.body.estado).toBe('liquidado');
  });

  it('kilometraje: el importe sale de los km por el precio de la empresa', async () => {
    const c = await empleado.post('/api/gas/gastos', { tipo: 'kilometraje', fecha: hoy(), km: 100, origen: 'Valencia', destino: 'Sagunto' });
    expect(c.status).toBe(201);
    expect(Number(c.body.total)).toBeGreaterThan(0);
    expect(Number(c.body.iva)).toBe(0);
  });

  it('un empleado solo ve sus gastos y no los de los demás', async () => {
    const otros = await empleado.get('/api/gas/gastos?vista=todos');
    expect(otros.status).toBe(200);
    const mios = await empleado.get('/api/gas/gastos?vista=mios&pageSize=200');
    expect(otros.body.total).toBe(mios.body.total);
    expect((await empleado.get('/api/gas/gastos?vista=liquidar')).status).toBe(403);
  });
});

describe('Límites entre departamentos', () => {
  it('un empleado no entra en tesorería, contabilidad ni nóminas ajenas', async () => {
    expect((await empleado.get('/api/tes/vencimientos')).status).toBe(403);
    expect((await empleado.get('/api/cnt/asientos')).status).toBe(403);
    expect((await empleado.get('/api/nom/periodos')).status).toBe(403);
    const otra = await admin.get('/api/refs/personas?q=Laura');
    const r = await empleado.get(`/api/nom/recibos?personaId=${otra.body[0].id}`);
    expect(r.status).toBe(403);
  });

  it('comercial no ve la contabilidad', async () => {
    expect((await comercial.get('/api/cnt/asientos')).status).toBe(403);
    expect((await comercial.get('/api/cnt/modelos/303')).status).toBe(403);
  });
});

describe('BI · informes', () => {
  const def = { dataset: 'facturas_venta', filtros: { periodo: 'ultimos_12m' }, columnas: ['codigo', 'cliente', 'comercial', 'base'], agruparPor: null, orden: null };

  it('un informe compartido no amplía lo que ve cada persona', async () => {
    const g = await comercial2.post('/api/bi/informes', { ...def, nombre: 'Mis facturas', compartido: true });
    expect(g.status).toBe(201);
    const [propio, deOtro, todo] = await Promise.all([comercial.post('/api/bi/ejecutar', def), comercial.get(`/api/bi/informes/${g.body.id}/ejecutar`), admin.post('/api/bi/ejecutar', def)]);
    expect(deOtro.status).toBe(200);
    // el comercial ve lo mismo ejecutando el informe compartido que ejecutándolo por su cuenta
    expect(deOtro.body.filas.length).toBe(propio.body.filas.length);
    expect(todo.body.filas.length).toBeGreaterThanOrEqual(propio.body.filas.length);
    // solo quien lo creó puede cambiarlo
    expect((await comercial.patch(`/api/bi/informes/${g.body.id}`, { nombre: 'Otro' })).status).toBe(403);
  });

  it('no se puede consultar un conjunto de datos sin permiso', async () => {
    const r = await comercial.post('/api/bi/ejecutar', { ...def, dataset: 'apuntes' });
    expect(r.status).toBe(403);
    const ds = await comercial.get('/api/bi/datasets');
    expect(ds.body.some((d: any) => d.key === 'apuntes')).toBe(false);
  });

  it('exporta a Excel y el panel responde', async () => {
    const x = await (await getApp()).inject({ method: 'GET', url: `/api/bi/exportar?formato=xlsx&def=${encodeURIComponent(JSON.stringify(def))}`, headers: { cookie: await cookieDe('admin@kite.test') } });
    expect(x.statusCode).toBe(200);
    expect(String(x.headers['content-type'])).toContain('spreadsheet');
    const p = await admin.get('/api/bi/panel');
    expect(p.status).toBe(200);
    expect(p.body.permisos.ventas).toBe(true);
  });
});

describe('CNT · contabilidad', () => {
  it('un asiento manual descuadrado se rechaza', async () => {
    const c1 = await admin.get('/api/refs/cnt_cuentas?q=572');
    const c2 = await admin.get('/api/refs/cnt_cuentas?q=629');
    expect(c1.body.length && c2.body.length).toBeTruthy();
    const mal = await admin.post('/api/cnt/asientos', { fecha: hoy(), concepto: 'Prueba', lineas: [{ cuentaId: c2.body[0].id, debe: 10 }, { cuentaId: c1.body[0].id, haber: 9 }] });
    expect(mal.status).toBe(400);
    const bien = await admin.post('/api/cnt/asientos', { fecha: hoy(), concepto: 'Prueba', lineas: [{ cuentaId: c2.body[0].id, debe: 10 }, { cuentaId: c1.body[0].id, haber: 10 }] });
    expect(bien.status).toBe(201);
    const ss = await admin.get('/api/cnt/libros/sumas-saldos?nivel=1');
    expect(ss.body.cuadra).toBe(true);
  });
});

async function cookieDe(email: string) {
  const a = await getApp();
  const r = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } });
  return String(r.headers['set-cookie']).split(';')[0]!;
}
