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

describe('Apariencia y aplicaciones por empresa', () => {
  const OCEANO = {
    tema: 'oceano',
    colores: { primario: '#0e7c86', acento: '#FFC857', info: '#2F6FED', alerta: '#E5484D', estructura: '#12343B' },
    fuenteTitulos: 'jakarta',
    fuenteTexto: 'jakarta',
    esquinas: 'suaves',
    botones: 'redondeados',
    tarjetas: 'sombra',
    barra: 'oscura',
    densidad: 'comoda',
    modo: 'sistema',
    nombreApp: 'Brisa',
  };

  it('la marca de la instalación se puede leer sin iniciar sesión', async () => {
    const app = await getApp();
    const r = await app.inject({ method: 'GET', url: '/api/public/marca' });
    expect(r.statusCode).toBe(200);
    const m = r.json();
    expect(m.nombre).toBe('Brisa Instalaciones');
    expect(m.apariencia.colores.primario).toMatch(/^#[0-9A-F]{6}$/);
    // nada interno: solo nombre, logo y apariencia
    expect(Object.keys(m).sort()).toEqual(['apariencia', 'id', 'logoUrl', 'nombre']);
  });

  it('cada empresa guarda su apariencia, validada, sin perder el resto de ajustes', async () => {
    const admin = await as('admin@kite.test');
    const antes = (await admin.get('/api/empresa')).body;
    try {
      const mal = await admin.patch('/api/empresa', { ajustes: { apariencia: { ...OCEANO, colores: { ...OCEANO.colores, primario: 'azul' } } } });
      expect(mal.status).toBeGreaterThanOrEqual(400);
      const ok = await admin.patch('/api/empresa', { ajustes: { apariencia: OCEANO } });
      expect(ok.status).toBe(200);
      const me = (await admin.get('/api/auth/me')).body;
      expect(me.empresa.apariencia.colores.primario).toBe('#0E7C86');
      expect(me.empresa.apariencia.nombreApp).toBe('Brisa');
      const despues = (await admin.get('/api/empresa')).body;
      expect(despues.ajustes.margenMinimoPresupuesto).toBe(antes.ajustes.margenMinimoPresupuesto);
    } finally {
      await admin.patch('/api/empresa', { ajustes: { apariencia: null } });
    }
    const me = (await admin.get('/api/auth/me')).body;
    expect(me.empresa.apariencia.tema).toBe('cometa');
  });

  it('quien no gestiona la configuración no puede cambiar la apariencia', async () => {
    const marta = await as('comercial@kite.test');
    expect((await marta.patch('/api/empresa', { ajustes: { apariencia: OCEANO } })).status).toBe(403);
  });

  it('cada persona guarda sus aplicaciones favoritas', async () => {
    const marta = await as('comercial@kite.test');
    const javier = await as('comercial2@kite.test');
    const r = await marta.patch('/api/auth/preferencias', { favoritos: ['fac', 'clientes', 'opo'] });
    expect(r.status).toBe(200);
    expect((await marta.get('/api/auth/me')).body.preferencias.favoritos).toEqual(['fac', 'clientes', 'opo']);
    expect((await javier.get('/api/auth/me')).body.preferencias.favoritos).toBeUndefined();
  });

  it('al cambiar de empresa cambian la apariencia y los módulos', async () => {
    const admin = await as('admin@kite.test');
    const me = (await admin.get('/api/auth/me')).body;
    expect(me.empresa.nombre).toBe('Brisa Instalaciones');
    const otra = me.empresas.find((e: any) => e.id !== me.empresa.id);
    expect(otra?.nombre).toBe('Costa Audiovisual');
    try {
      expect((await admin.post('/api/auth/empresa', { empresaId: otra.id })).status).toBe(200);
      const alli = (await admin.get('/api/auth/me')).body;
      expect(alli.empresa.apariencia.tema).toBe('atardecer');
      expect(alli.empresa.apariencia.nombreApp).toBe('Costa AV');
      expect(alli.modulos).toContain('fac');
      expect(alli.modulos).not.toContain('sat');
      expect(alli.preferencias.favoritos).toBeUndefined();
    } finally {
      await admin.post('/api/auth/empresa', { empresaId: me.empresa.id });
    }
  });
});
