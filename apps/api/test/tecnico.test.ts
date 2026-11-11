import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sqlClient } from '../src/db/client';
import { documentosRecurrentes } from '../src/db/schema/documentos';
import { saveFile } from '../src/core/files';
import { satOrdenes } from '../src/modules/sat/schema';
import { as, getApp } from './helpers';

/** Pruebas de los módulos SAT (servicio técnico) y DTC (documentación técnica). */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const masDias = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

type Cliente = Awaited<ReturnType<typeof as>>;
let admin: Cliente, jefe: Cliente, tec1: Cliente, tec2: Cliente, comercial: Cliente, administracion: Cliente, direccion: Cliente;
let tec1Id: string, tec2Id: string, direccionId: string, empresaId: string, satDepId: string;

async function refId(c: Cliente, target: string, q: string) {
  const r = await c.get(`/api/refs/${target}?q=${encodeURIComponent(q)}`);
  expect(r.status).toBe(200);
  expect(r.body.length).toBeGreaterThan(0);
  return r.body[0].id as string;
}

async function nuevoArchivo(nombre: string) {
  const f = await saveFile(db, { empresaId, nombre, mime: 'application/pdf', data: Buffer.from(`%PDF-1.4 prueba ${nombre} ${Date.now()} ${Math.random()}`) });
  return f.id;
}

beforeAll(async () => {
  [admin, jefe, tec1, tec2, comercial, administracion, direccion] = await Promise.all(
    ['admin', 'sat', 'tecnico', 'tecnico2', 'comercial', 'administracion', 'direccion'].map((u) => as(`${u}@kite.test`)),
  );
  const me1 = (await tec1.get('/api/auth/me')).body;
  tec1Id = me1.user.personaId;
  satDepId = me1.user.departamento.id;
  empresaId = me1.empresa.id;
  tec2Id = (await tec2.get('/api/auth/me')).body.user.personaId;
  direccionId = (await direccion.get('/api/auth/me')).body.user.personaId;
});

afterAll(async () => {
  await (await getApp()).close();
  await sqlClient.end();
});

describe('SAT · límites de permisos', () => {
  it('Comercial y Administración reciben 403 en el servicio técnico', async () => {
    for (const c of [comercial, administracion]) {
      for (const url of ['/api/sat/tickets', '/api/sat/ordenes', '/api/sat/equipos', '/api/sat/mis-ordenes', '/api/sat/planificacion', '/api/sat/contratos']) {
        expect((await c.get(url)).status, url).toBe(403);
      }
      expect((await c.post('/api/sat/tickets', { asunto: 'x' })).status).toBe(403);
    }
  });

  it('no ven tickets ni órdenes en la línea de tiempo del cliente, la búsqueda ni el panel', async () => {
    const hotel = await refId(admin, 'clientes', 'Hotel Mar Azul');
    const deAdmin = await admin.get(`/api/timeline/tercero/${hotel}`);
    expect(deAdmin.status).toBe(200);
    expect(deAdmin.body.some((e: any) => e.modulo === 'sat')).toBe(true);
    for (const c of [comercial, administracion]) {
      const tl = await c.get(`/api/timeline/tercero/${hotel}`);
      expect(tl.status).toBe(200); // ven la ficha del cliente…
      expect(tl.body.some((e: any) => e.modulo === 'sat')).toBe(false); // …pero nada del SAT
      const busq = await c.get('/api/buscar?q=TK26');
      expect(busq.body.some((r: any) => r.modulo === 'sat')).toBe(false);
      const panel = await c.get('/api/panel');
      expect(panel.body.some((w: any) => w.modulo === 'sat')).toBe(false);
      expect((await c.get(`/api/sat/terceros/${hotel}/resumen`)).status).toBe(403);
    }
  });

  it('un técnico solo ve sus propias órdenes y tickets', async () => {
    const mias = await tec1.get('/api/sat/ordenes?pageSize=200');
    expect(mias.status).toBe(200);
    expect(mias.body.items.length).toBeGreaterThan(0);
    expect(mias.body.items.every((o: any) => o.tecnicoId === tec1Id)).toBe(true);
    const tks = await tec1.get('/api/sat/tickets?pageSize=200');
    expect(tks.body.items.every((t: any) => t.responsableId === tec1Id)).toBe(true);

    const deLucia = (await tec2.get('/api/sat/ordenes?pageSize=200')).body.items[0];
    expect(deLucia.tecnicoId).toBe(tec2Id);
    expect((await tec1.get(`/api/sat/ordenes/${deLucia.id}`)).status).toBe(404);
    expect((await tec1.get(`/api/sat/ordenes/${deLucia.id}/ficha`)).status).toBe(404);
    expect((await tec1.post(`/api/sat/ordenes/${deLucia.id}/cerrar`, { trabajoRealizado: 'No es mía' })).status).toBe(404);
    expect((await tec1.post(`/api/sat/ordenes/${deLucia.id}/estado`, { estado: 'en_curso' })).status).toBe(404);
    // ni puede reasignarse trabajo ni planificar
    expect((await tec1.post(`/api/sat/ordenes/${mias.body.items[0].id}/planificar`, { tecnicoId: tec2Id })).status).toBe(403);

    const hoyMias = await tec1.get('/api/sat/mis-ordenes');
    expect(hoyMias.status).toBe(200);
    expect(hoyMias.body.ordenes.length).toBeGreaterThan(0);
    expect(hoyMias.body.ordenes[0].mapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  });
});

describe('SAT · ticket → orden → cierre con materiales', () => {
  it('cerrar la orden crea un albarán entregado vinculado y resuelve el ticket', async () => {
    const clinica = await refId(jefe, 'clientes', 'Clínica Dental');
    const filtro = await refId(jefe, 'articulos', 'FIL-AC-STD');

    const tk = await jefe.post('/api/sat/tickets', { terceroId: clinica, asunto: 'Prueba: el equipo no arranca', prioridad: 'alta', canal: 'telefono' });
    expect(tk.status).toBe(201);
    expect(tk.body.codigo).toMatch(/^TK/);
    expect(tk.body.estado).toBe('nuevo');
    expect(tk.body.sla.objetivo).toBe('respuesta');

    const o = await jefe.post(`/api/sat/tickets/${tk.body.id}/orden`, { tecnicoId: tec1Id, planificadaInicio: `${hoy()}T10:00`, planificadaFin: `${hoy()}T11:00` });
    expect(o.status).toBe(201);
    expect(o.body.codigo).toMatch(/^OT/);
    expect(o.body.estado).toBe('planificada');
    expect((await jefe.get(`/api/sat/tickets/${tk.body.id}/ficha`)).body.estado).toBe('asignado');

    // Sergio la ve en sus órdenes de hoy y la empieza
    expect((await tec1.get('/api/sat/mis-ordenes')).body.ordenes.some((x: any) => x.id === o.body.id)).toBe(true);
    const empezar = await tec1.post(`/api/sat/ordenes/${o.body.id}/estado`, { estado: 'en_curso' });
    expect(empezar.status).toBe(200);
    expect((await tec1.get(`/api/sat/ordenes/${o.body.id}/ficha`)).body.cronometro).not.toBeNull();

    const parte = { uid: `parte-${o.body.id}`, trabajoRealizado: 'Sustituidos los filtros y limpieza de la unidad interior.', materiales: [{ articuloId: filtro, cantidad: 2 }], horas: 1, desplazamiento: true, facturable: true, firma: PNG, firmaNombre: 'Tomás García' };
    const cierre = await tec1.post(`/api/sat/ordenes/${o.body.id}/cerrar`, parte);
    expect(cierre.status).toBe(200);
    expect(cierre.body.estado).toBe('finalizada');
    expect(cierre.body.albaranId).toBeTruthy();

    // reenvío del mismo parte desde el móvil (sin cobertura): no duplica nada
    const repetido = await tec1.post(`/api/sat/ordenes/${o.body.id}/cerrar`, parte);
    expect(repetido.status).toBe(200);
    expect(repetido.body.repetido).toBe(true);
    expect(repetido.body.albaranId).toBe(cierre.body.albaranId);
    expect((await tec1.post(`/api/sat/ordenes/${o.body.id}/cerrar`, { ...parte, uid: 'otro' })).status).toBe(409);

    const alb = await admin.get(`/api/documentos/${cierre.body.albaranId}`);
    expect(alb.status).toBe(200);
    expect(alb.body.tipo).toBe('albaran');
    expect(alb.body.estado).toBe('entregado');
    expect(alb.body.origenTipo).toBe('sat_orden');
    expect(alb.body.origenId).toBe(o.body.id);
    expect(alb.body.aceptadoPor).toBe('Tomás García');
    const lineaFiltro = alb.body.lineas.find((l: any) => l.articuloId === filtro);
    expect(Number(lineaFiltro.cantidad)).toBe(2);
    expect(Number(lineaFiltro.precio)).toBeGreaterThan(0);
    expect(alb.body.lineas.some((l: any) => l.referencia === 'SRV-HORA' && Number(l.cantidad) === 1)).toBe(true);
    expect(alb.body.lineas.some((l: any) => l.referencia === 'SRV-DESPL')).toBe(true);

    const ficha = await jefe.get(`/api/sat/tickets/${tk.body.id}/ficha`);
    expect(ficha.body.estado).toBe('resuelto');
    expect(ficha.body.resueltoEn).toBeTruthy();
    const of = await tec1.get(`/api/sat/ordenes/${o.body.id}/ficha`);
    expect(of.body.albaran.id).toBe(cierre.body.albaranId);
    expect(of.body.materiales).toHaveLength(1);
    expect(of.body.firmaUrl).toBeTruthy();
  });

  it('una orden sin cargo (garantía) genera el albarán a precio cero para la trazabilidad del material', async () => {
    const clinica = await refId(jefe, 'clientes', 'Clínica Dental');
    const bomba = await refId(jefe, 'articulos', 'BOMBA-COND');
    const o = await jefe.post('/api/sat/ordenes', { terceroId: clinica, tipo: 'correctivo', prioridad: 'normal', tecnicoId: tec1Id, facturable: false, descripcion: 'Prueba garantía' });
    expect(o.status).toBe(201);
    const c = await tec1.post(`/api/sat/ordenes/${o.body.id}/cerrar`, { trabajoRealizado: 'Bomba sustituida en garantía', materiales: [{ articuloId: bomba, cantidad: 1 }], horas: 0.5, facturable: false });
    expect(c.status).toBe(200);
    const alb = await admin.get(`/api/documentos/${c.body.albaranId}`);
    expect(alb.body.estado).toBe('entregado');
    expect(Number(alb.body.total)).toBe(0);
    expect(alb.body.lineas.some((l: any) => l.articuloId === bomba)).toBe(true);
  });

  it('el portal público del equipo permite abrir un aviso sin sesión', async () => {
    const equipos = await jefe.get('/api/sat/equipos?pageSize=5');
    const ficha = await jefe.get(`/api/sat/equipos/${equipos.body.items[0].id}/ficha`);
    const token = String(ficha.body.enlacePublico).split('/').pop();
    const app = await getApp();
    const pub = await app.inject({ method: 'GET', url: `/api/sat/public/equipo/${token}` });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().equipo.nombre).toBe(ficha.body.nombre);
    const alta = await app.inject({ method: 'POST', url: `/api/sat/public/equipo/${token}/tickets`, payload: { asunto: 'Hace un ruido raro', nombre: 'Recepción', contacto: '600 000 000' } });
    expect(alta.statusCode).toBe(201);
    expect(alta.json().estado).toBe('nuevo');
    expect((await app.inject({ method: 'GET', url: '/api/sat/public/equipo/no-existe-este-token' })).statusCode).toBe(404);
  });
});

describe('SAT · contratos de mantenimiento', () => {
  it('un contrato con cuota crea (y mantiene) su facturación periódica', async () => {
    const colegio = await refId(jefe, 'clientes', 'Colegio San Vicente');
    const c = await jefe.post('/api/sat/contratos', { terceroId: colegio, nombre: 'Contrato de prueba', estado: 'activo', inicio: hoy(), periodicidadMeses: 6, proximaVisita: masDias(2), cuota: 120, cuotaPeriodicidad: 'mensual', tecnicoId: tec2Id });
    expect(c.status).toBe(201);
    expect(c.body.codigo).toMatch(/^CM/);
    const rec = async () => db.select().from(documentosRecurrentes).where(and(eq(documentosRecurrentes.origenTipo, 'sat_contrato'), eq(documentosRecurrentes.origenId, c.body.id)));
    let rows = await rec();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.terceroId).toBe(colegio);
    expect(rows[0]!.periodicidad).toBe('mensual');
    expect(rows[0]!.activo).toBe(true);
    expect(rows[0]!.lineas[0]!.precio).toBe(120);

    expect((await jefe.patch(`/api/sat/contratos/${c.body.id}`, { cuota: 150 })).status).toBe(200);
    rows = await rec();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lineas[0]!.precio).toBe(150);

    // La visita preventiva (en 2 días) se genera una sola vez aunque la tarea se ejecute dos veces
    expect((await jefe.post('/api/sat/contratos/generar-visitas')).status).toBe(200);
    await jefe.post('/api/sat/contratos/generar-visitas');
    const visitas = await db.select().from(satOrdenes).where(eq(satOrdenes.contratoId, c.body.id));
    expect(visitas).toHaveLength(1);
    expect(visitas[0]!.tipo).toBe('preventivo');
    expect(visitas[0]!.tecnicoId).toBe(tec2Id);
    expect(visitas[0]!.facturable).toBe(false);
    const despues = await jefe.get(`/api/sat/contratos/${c.body.id}`);
    expect(despues.body.proximaVisita > masDias(150)).toBe(true);

    expect((await jefe.patch(`/api/sat/contratos/${c.body.id}`, { estado: 'finalizado' })).status).toBe(200);
    expect((await rec())[0]!.activo).toBe(false);

    // el técnico no ve contratos (ni sus cuotas)
    expect((await tec1.get('/api/sat/contratos')).status).toBe(403);
  });
});

describe('DTC · documentación técnica', () => {
  it('flujo de versiones: borrador → revisión → aprobada; solo una vigente y las anteriores obsoletas', async () => {
    const doc = await jefe.post('/api/dtc/documentos', { titulo: 'Procedimiento de prueba de estanqueidad', tipo: 'procedimiento', confidencialidad: 'interno', revisorId: direccionId });
    expect(doc.status).toBe(201);
    expect(doc.body.codigo).toMatch(/^DT/);
    expect(doc.body.estado).toBe('borrador');

    const v1 = await jefe.post(`/api/dtc/documentos/${doc.body.id}/versiones`, { archivoId: await nuevoArchivo('v1.pdf'), resumenCambios: 'Primera edición', enviar: true });
    expect(v1.status).toBe(201);
    expect(v1.body.numero).toBe('1.0');
    // sin versión vigente, un técnico no lo ve
    expect((await tec1.get(`/api/dtc/documentos/${doc.body.id}`)).status).toBe(404);
    // nadie aprueba lo que ha redactado
    expect((await jefe.post(`/api/dtc/versiones/${v1.body.id}/aprobar`)).status).toBe(403);
    // un técnico no puede aprobar
    expect((await tec1.post(`/api/dtc/versiones/${v1.body.id}/aprobar`)).status).toBe(403);
    // aparece en la bandeja de aprobaciones del revisor
    const bandeja = await direccion.get('/api/aprobaciones');
    expect(bandeja.body.some((a: any) => a.id === v1.body.id && a.modulo === 'dtc')).toBe(true);
    expect((await direccion.post(`/api/dtc/versiones/${v1.body.id}/aprobar`)).status).toBe(200);

    let ficha = (await jefe.get(`/api/dtc/documentos/${doc.body.id}/ficha`)).body;
    expect(ficha.estado).toBe('aprobado');
    expect(ficha.versionVigente).toBe('1.0');
    expect(ficha.proximaRevision).toBeTruthy();

    // una versión rechazada no cambia la vigente
    const v2r = await jefe.post(`/api/dtc/documentos/${doc.body.id}/versiones`, { archivoId: await nuevoArchivo('v1-1r.pdf'), enviar: true });
    expect(v2r.body.numero).toBe('1.1');
    expect((await jefe.post(`/api/dtc/documentos/${doc.body.id}/versiones`, { archivoId: await nuevoArchivo('otra.pdf') })).status).toBe(409);
    expect((await direccion.post(`/api/dtc/versiones/${v2r.body.id}/rechazar`, { motivo: 'Falta el croquis' })).status).toBe(200);
    expect((await jefe.get(`/api/dtc/documentos/${doc.body.id}/ficha`)).body.versionVigente).toBe('1.0');

    const v2 = await jefe.post(`/api/dtc/documentos/${doc.body.id}/versiones`, { archivoId: await nuevoArchivo('v2.pdf'), mayor: true, resumenCambios: 'Nuevo croquis', enviar: true });
    expect(v2.body.numero).toBe('2.0');
    expect((await direccion.post(`/api/dtc/versiones/${v2.body.id}/aprobar`)).status).toBe(200);

    ficha = (await jefe.get(`/api/dtc/documentos/${doc.body.id}/ficha`)).body;
    expect(ficha.versionVigente).toBe('2.0');
    expect(ficha.versiones.filter((v: any) => v.estado === 'aprobada')).toHaveLength(1);
    const antigua = ficha.versiones.find((v: any) => v.numero === '1.0');
    expect(antigua.estado).toBe('obsoleta');
    expect(antigua.url).toBeTruthy(); // sigue descargable en el historial

    // distribución al servicio técnico y acuse de lectura
    expect((await jefe.put(`/api/dtc/documentos/${doc.body.id}/distribucion`, { departamentoIds: [satDepId] })).status).toBe(200);
    expect((await tec1.get('/api/dtc/pendientes-leer')).body.some((p: any) => p.id === doc.body.id)).toBe(true);
    expect((await tec1.post(`/api/dtc/documentos/${doc.body.id}/leido`)).status).toBe(200);
    expect((await tec1.get('/api/dtc/pendientes-leer')).body.some((p: any) => p.id === doc.body.id)).toBe(false);
    const informe = (await jefe.get(`/api/dtc/documentos/${doc.body.id}/lecturas`)).body;
    expect(informe.personas.find((p: any) => p.id === tec1Id).leidoEn).toBeTruthy();
    expect(informe.personas.find((p: any) => p.id === tec2Id).leidoEn).toBeNull();
    expect((await tec1.get(`/api/dtc/documentos/${doc.body.id}/lecturas`)).status).toBe(403);
  });

  it('los documentos restringidos solo los ve quien tiene dtc.restringido', async () => {
    expect((await tec1.post('/api/dtc/documentos', { titulo: 'No debería', tipo: 'plano', confidencialidad: 'interno' })).status).toBe(403);
    const doc = await jefe.post('/api/dtc/documentos', { titulo: 'Plano confidencial de prueba', tipo: 'plano', confidencialidad: 'restringido' });
    expect(doc.status).toBe(201);
    const v = await jefe.post(`/api/dtc/documentos/${doc.body.id}/versiones`, { archivoId: await nuevoArchivo('plano.pdf'), enviar: true });
    expect((await direccion.post(`/api/dtc/versiones/${v.body.id}/aprobar`)).status).toBe(200);

    expect((await jefe.get(`/api/dtc/documentos/${doc.body.id}`)).status).toBe(200);
    for (const c of [tec1, comercial, administracion]) {
      const lista = await c.get('/api/dtc/documentos?pageSize=200');
      expect(lista.status).toBe(200);
      expect(lista.body.items.some((d: any) => d.id === doc.body.id)).toBe(false);
      expect(lista.body.items.some((d: any) => d.confidencialidad === 'restringido')).toBe(false);
      expect((await c.get(`/api/dtc/documentos/${doc.body.id}`)).status).toBe(404);
      expect((await c.get(`/api/dtc/documentos/${doc.body.id}/ficha`)).status).toBe(404);
      expect((await c.get(`/api/adjuntos/dtc_documento/${doc.body.id}`)).status).toBe(403);
    }
    // un técnico sí ve la documentación interna vigente, como el manual del split
    const internos = await tec1.get('/api/dtc/documentos?pageSize=200');
    expect(internos.body.items.some((d: any) => d.codigo === 'MAN-001')).toBe(true);
  });
});
