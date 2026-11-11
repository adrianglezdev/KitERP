import { afterAll, describe, expect, it } from 'vitest';
import { sqlClient } from '../src/db/client';
import { as, getApp } from './helpers';

afterAll(async () => {
  await (await getApp()).close();
  await sqlClient.end();
});

const hoy = () => new Date().toISOString().slice(0, 10);

describe('Comercial: alcance de cada comercial', () => {
  it('un comercial no ve los documentos de clientes de otro comercial', async () => {
    const javier = await as('comercial2@kite.test');
    const docs = await javier.get('/api/documentos?tipo=presupuesto,factura&pageSize=200');
    expect(docs.status).toBe(200);
    // Hotel Mar Azul es de Marta (comercial1)
    expect(docs.body.items.some((d: any) => d.tercero === 'Hotel Mar Azul')).toBe(false);
    const hotel = (await (await as('admin@kite.test')).get('/api/refs/clientes?q=Hotel')).body[0];
    expect((await javier.get(`/api/terceros/${hotel.id}`)).status).toBe(404);
  });

  it('la jefa comercial ve también lo de su equipo', async () => {
    const marta = await as('comercial@kite.test');
    const docs = await marta.get('/api/documentos?tipo=presupuesto&pageSize=200');
    expect(docs.body.items.some((d: any) => d.comercial?.startsWith('Javier'))).toBe(true);
  });

  it('un comercial no puede crear un presupuesto para el cliente de otro', async () => {
    const javier = await as('comercial2@kite.test');
    const admin = await as('admin@kite.test');
    const hotel = (await admin.get('/api/refs/clientes?q=Hotel')).body[0];
    const r = await javier.post('/api/documentos', { tipo: 'presupuesto', fecha: hoy(), terceroId: hotel.id, lineas: [{ descripcion: 'X', cantidad: 1, precio: 10, ivaTipo: 21 }] });
    // el documento se asigna a él, pero el cliente no es suyo: no puede ni seleccionarlo en el buscador
    const refs = await javier.get('/api/refs/clientes?q=Hotel');
    expect(refs.body.length).toBe(0);
    expect(r.status).toBe(403);
  });
});

describe('Presupuestos', () => {
  it('margen bajo → pendiente de aprobación → dirección aprueba → se puede enviar', async () => {
    const javier = await as('comercial2@kite.test');
    const clientes = await javier.get('/api/refs/clientes?q=Clínica');
    const art = (await javier.get('/api/refs/articulos?q=AC-SPLIT-35')).body[0];
    const pre = await javier.post('/api/documentos', {
      tipo: 'presupuesto',
      fecha: hoy(),
      terceroId: clientes.body[0].id,
      lineas: [{ articuloId: art.id, descripcion: 'Split', cantidad: 1, precio: 560, ivaTipo: 21, coste: 520 }],
    });
    expect(pre.status).toBe(201);
    const env = await javier.post(`/api/documentos/${pre.body.id}/accion/enviar`);
    expect(env.body.estado).toBe('pendiente_aprobacion');

    const laura = await as('direccion@kite.test');
    const bandeja = await laura.get('/api/aprobaciones');
    expect(bandeja.body.some((a: any) => a.id === pre.body.id)).toBe(true);
    expect((await laura.post(`/api/documentos/${pre.body.id}/accion/aprobar`)).status).toBe(200);
    const env2 = await javier.post(`/api/documentos/${pre.body.id}/accion/enviar`);
    expect(env2.body.estado).toBe('enviado');
  });

  it('el cliente acepta con su firma desde el enlace público y la oportunidad pasa a ganada', async () => {
    const marta = await as('comercial@kite.test');
    const tablero = await marta.get('/api/opo/tablero');
    const abierta = tablero.body.items.find((o: any) => tablero.body.etapas.find((e: any) => e.id === o.etapaId)?.tipo === 'abierta' && !o.presupuestoId);
    expect(abierta).toBeTruthy();
    const p = await marta.post(`/api/opo/oportunidades/${abierta.id}/presupuesto`);
    expect(p.status).toBe(200);
    await marta.post(`/api/documentos/${p.body.id}/accion/enviar`);
    const doc = await marta.get(`/api/documentos/${p.body.id}`);
    const token = doc.body.enlacePublico.split('/p/')[1];

    const app = await getApp();
    const vista = await app.inject({ method: 'GET', url: `/api/public/documentos/${token}` });
    expect(vista.statusCode).toBe(200);
    expect(vista.json().estado).toBe('visto');
    const firma = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const ok = await app.inject({ method: 'POST', url: `/api/public/documentos/${token}/responder`, payload: { aceptar: true, nombre: 'Isabel García', firma } });
    expect(ok.statusCode).toBe(200);
    expect((await marta.get(`/api/documentos/${p.body.id}`)).body.estado).toBe('aceptado');
    const o = await marta.get(`/api/opo/oportunidades/${abierta.id}`);
    expect(o.body.ganadaEn).toBeTruthy();
    // no se puede responder dos veces
    const otra = await app.inject({ method: 'POST', url: `/api/public/documentos/${token}/responder`, payload: { aceptar: false, nombre: 'Otro' } });
    expect(otra.statusCode).toBe(400);
  });
});

describe('Oportunidades y actividad', () => {
  it('perder una oportunidad exige motivo', async () => {
    const marta = await as('comercial@kite.test');
    const t = await marta.get('/api/opo/tablero');
    const perdida = t.body.etapas.find((e: any) => e.tipo === 'perdida');
    const abierta = t.body.items.find((o: any) => t.body.etapas.find((e: any) => e.id === o.etapaId)?.tipo === 'abierta');
    expect((await marta.post(`/api/opo/oportunidades/${abierta.id}/etapa`, { etapaId: perdida.id })).status).toBe(400);
    expect((await marta.post(`/api/opo/oportunidades/${abierta.id}/etapa`, { etapaId: perdida.id, motivoPerdida: 'precio' })).status).toBe(200);
  });

  it('registrar actividad en un cliente de otro comercial está prohibido', async () => {
    const javier = await as('comercial2@kite.test');
    const admin = await as('admin@kite.test');
    const hotel = (await admin.get('/api/refs/clientes?q=Hotel')).body[0];
    const r = await javier.post('/api/crm/actividades', { tipo: 'llamada', asunto: 'Prueba', terceroId: hotel.id, fecha: new Date().toISOString() });
    expect(r.status).toBe(403);
  });

  it('el formulario web público crea un cliente potencial y una oportunidad', async () => {
    const admin = await as('admin@kite.test');
    const me = await admin.get('/api/auth/me');
    const app = await getApp();
    const r = await app.inject({ method: 'POST', url: `/api/opo/publico/${me.body.empresa.id}/contacto`, payload: { nombre: 'Lucía Prueba', email: 'lucia.prueba@correo.test', mensaje: 'Quiero presupuesto de aire acondicionado', acepto: true } });
    expect(r.statusCode).toBe(200);
    const t = await admin.get('/api/terceros?q=lucia.prueba');
    expect(t.body.items[0]?.estado).toBe('potencial');
  });
});
