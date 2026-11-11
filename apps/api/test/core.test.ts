import { afterAll, describe, expect, it } from 'vitest';
import { sqlClient } from '../src/db/client';
import { as, getApp } from './helpers';

afterAll(async () => {
  await (await getApp()).close();
  await sqlClient.end();
});

describe('Autenticación y permisos', () => {
  it('rechaza contraseña incorrecta', async () => {
    const app = await getApp();
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@kite.test', password: 'mala-1234567' } });
    expect(r.statusCode).toBe(401);
  });

  it('devuelve la sesión con permisos y módulos', async () => {
    const admin = await as('admin@kite.test');
    const me = await admin.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.permisos['usr.gestionar']).toBe('todo');
    expect(me.body.modulos).toContain('fac');
  });

  it('un comercial solo ve su cartera de clientes', async () => {
    const marta = await as('comercial@kite.test');
    const javier = await as('comercial2@kite.test');
    const a = await marta.get('/api/terceros?pageSize=100');
    const b = await javier.get('/api/terceros?pageSize=100');
    expect(a.status).toBe(200);
    // Marta es responsable de Javier: ve también los suyos
    expect(a.body.total).toBeGreaterThan(b.body.total);
    expect(b.body.items.every((t: any) => t.nombre !== 'Hotel Mar Azul')).toBe(true);
  });

  it('un comercial no puede gestionar usuarios ni ver contabilidad', async () => {
    const marta = await as('comercial@kite.test');
    expect((await marta.get('/api/usuarios')).status).toBe(403);
  });
});

describe('Circuito de venta', () => {
  it('presupuesto → pedido → albarán → factura con Verifactu', async () => {
    const admin = await as('admin@kite.test');
    const clientes = await admin.get('/api/refs/clientes?q=Hotel');
    const hotel = clientes.body[0];
    const arts = await admin.get('/api/refs/articulos?q=AC-SPLIT-35');
    const precio = await admin.get(`/api/articulos/${arts.body[0].id}/precio?terceroId=${hotel.id}`);
    const pre = await admin.post('/api/documentos', {
      tipo: 'presupuesto',
      fecha: new Date().toISOString().slice(0, 10),
      terceroId: hotel.id,
      titulo: 'Climatización recepción',
      lineas: [
        { ...precio.body, cantidad: 2 },
        { tipoLinea: 'texto', descripcion: 'Incluye retirada de equipos antiguos' },
        { descripcion: 'Instalación', cantidad: 2, precio: 280, ivaTipo: 21 },
      ],
    });
    expect(pre.status).toBe(201);
    expect(pre.body.total).toBeCloseTo((890 * 2 + 560) * 1.21, 2);

    const conv = await admin.post(`/api/documentos/${pre.body.id}/convertir`, { tipo: 'pedido' });
    expect(conv.status).toBe(200);
    const presDespues = await admin.get(`/api/documentos/${pre.body.id}`);
    expect(presDespues.body.estado).toBe('aceptado');

    const ped = conv.body.id;
    expect((await admin.post(`/api/documentos/${ped}/accion/confirmar`)).status).toBe(200);
    // entrega parcial: solo 1 de los 2 equipos
    const pedDoc = await admin.get(`/api/documentos/${ped}`);
    const lineaSplit = pedDoc.body.lineas.find((l: any) => l.referencia === 'AC-SPLIT-35');
    const alb = await admin.post(`/api/documentos/${ped}/convertir`, { tipo: 'albaran', lineas: [{ lineaId: lineaSplit.id, cantidad: 1 }] });
    expect(alb.status).toBe(200);
    expect((await admin.post(`/api/documentos/${alb.body.id}/accion/entregar`, { receptor: 'Isabel' })).status).toBe(200);
    expect((await admin.get(`/api/documentos/${ped}`)).body.estado).toBe('parcial');

    const fac = await admin.post('/api/documentos/facturar-albaranes', { ids: [alb.body.id] });
    expect(fac.status).toBe(200);
    const emit = await admin.post(`/api/documentos/${fac.body.id}/accion/emitir`);
    expect(emit.status).toBe(200);
    const f = await admin.get(`/api/documentos/${fac.body.id}`);
    expect(f.body.codigo).toMatch(/^F\d{2}-\d{5}$/);
    expect(f.body.verifactu.huella).toMatch(/^[0-9A-F]{64}$/);
    expect((await admin.get(`/api/documentos/${alb.body.id}`)).body.estado).toBe('facturado');

    // una factura emitida no se puede modificar ni borrar
    const edit = await admin.put(`/api/documentos/${fac.body.id}`, { fecha: f.body.fecha, terceroId: hotel.id, lineas: [] });
    expect(edit.status).toBe(409);
    expect((await admin.del(`/api/documentos/${fac.body.id}`)).status).toBe(409);

    const cadena = await admin.get('/api/verifactu/verificar');
    expect(cadena.body.correcta).toBe(true);

    const pdf = await (await getApp()).inject({ method: 'GET', url: `/api/documentos/${fac.body.id}/pdf`, headers: { cookie: '' } });
    expect(pdf.statusCode).toBe(401);
  });

  it('la rectificativa anula en negativo y marca la original', async () => {
    const admin = await as('admin@kite.test');
    const list = await admin.get('/api/documentos?tipo=factura&estado=emitida');
    const f = list.body.items[0];
    const r = await admin.post(`/api/documentos/${f.id}/accion/rectificar`, { modo: 'total', motivo: 'Error en el precio' });
    expect(r.status).toBe(200);
    const em = await admin.post(`/api/documentos/${r.body.id}/accion/emitir`);
    expect(em.status).toBe(200);
    const rect = await admin.get(`/api/documentos/${r.body.id}`);
    expect(rect.body.total).toBeCloseTo(-f.total, 2);
    expect((await admin.get(`/api/documentos/${f.id}`)).body.estado).toBe('rectificada');
  });
});
