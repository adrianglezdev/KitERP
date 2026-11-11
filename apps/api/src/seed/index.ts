import { eq, sql } from 'drizzle-orm';
import { DEFAULT_ROLES, OPTIONAL_MODULE_CODES } from '@kite/shared';
import { db, sqlClient } from '../db/client';
import {
  articulos,
  centros,
  contactos,
  departamentos,
  empresas,
  familias,
  festivos,
  formasPago,
  modulosEmpresa,
  personas,
  rolPermisos,
  roles,
  tarifas,
  terceros,
  usuarioEmpresas,
  usuarios,
} from '../db/schema';
import { hashPassword } from '../core/auth';
import type { SeedCtx } from '../core/modules';
import { moduleDefs } from '../modules/registry';

/**
 * Datos de ejemplo: una empresa de instalaciones y mantenimiento con 11 personas.
 * Todas las cuentas de demostración usan la contraseña DEMO_PASSWORD (ver README).
 */
export const DEMO_PASSWORD = 'Kite2026demo';

const PERSONAS: { key: string; nombre: string; apellidos: string; puesto: string; dep: string; resp?: string; rol: string; email: string; centro?: string }[] = [
  { key: 'admin', nombre: 'Raúl', apellidos: 'Vidal Soler', puesto: 'Responsable de sistemas', dep: 'direccion', resp: 'direccion', rol: 'admin', email: 'admin@kite.test' },
  { key: 'direccion', nombre: 'Laura', apellidos: 'Martín Ortega', puesto: 'Directora general', dep: 'direccion', rol: 'direccion', email: 'direccion@kite.test' },
  { key: 'administracion', nombre: 'Carlos', apellidos: 'Ruiz Pastor', puesto: 'Responsable de administración', dep: 'administracion', resp: 'direccion', rol: 'administracion', email: 'administracion@kite.test' },
  { key: 'rrhh', nombre: 'Ana', apellidos: 'Fernández Gil', puesto: 'Técnica de RRHH', dep: 'rrhh', resp: 'direccion', rol: 'rrhh', email: 'rrhh@kite.test' },
  { key: 'comercial1', nombre: 'Marta', apellidos: 'Gómez Ibáñez', puesto: 'Jefa comercial', dep: 'comercial', resp: 'direccion', rol: 'comercial', email: 'comercial@kite.test' },
  { key: 'comercial2', nombre: 'Javier', apellidos: 'López Marco', puesto: 'Comercial', dep: 'comercial', resp: 'comercial1', rol: 'comercial', email: 'comercial2@kite.test' },
  { key: 'almacen', nombre: 'Pablo', apellidos: 'Sánchez Roig', puesto: 'Jefe de almacén', dep: 'almacen', resp: 'direccion', rol: 'almacen', email: 'almacen@kite.test', centro: 'almacen' },
  { key: 'operario', nombre: 'David', apellidos: 'Moreno Vila', puesto: 'Mozo de almacén', dep: 'almacen', resp: 'almacen', rol: 'empleado', email: 'empleado@kite.test', centro: 'almacen' },
  { key: 'jefesat', nombre: 'Elena', apellidos: 'Torres Calvo', puesto: 'Responsable de servicio técnico', dep: 'sat', resp: 'direccion', rol: 'responsable_sat', email: 'sat@kite.test' },
  { key: 'tecnico1', nombre: 'Sergio', apellidos: 'Navarro Peris', puesto: 'Técnico de mantenimiento', dep: 'sat', resp: 'jefesat', rol: 'tecnico', email: 'tecnico@kite.test' },
  { key: 'tecnico2', nombre: 'Lucía', apellidos: 'Romero Bas', puesto: 'Técnica instaladora', dep: 'sat', resp: 'jefesat', rol: 'tecnico', email: 'tecnico2@kite.test' },
];

const DEPARTAMENTOS = [
  { key: 'direccion', nombre: 'Dirección', color: '#5E2A78' },
  { key: 'administracion', nombre: 'Administración', color: '#B28574' },
  { key: 'comercial', nombre: 'Comercial', color: '#7D2CDD' },
  { key: 'almacen', nombre: 'Almacén y logística', color: '#35AE29' },
  { key: 'sat', nombre: 'Servicio técnico', color: '#2E8B57' },
  { key: 'rrhh', nombre: 'Recursos humanos', color: '#D4BE00' },
];

const CLIENTES = [
  { key: 'hotel', nombre: 'Hotel Mar Azul', razonSocial: 'Hoteles Mar Azul S.A.', nif: 'A46103834', localidad: 'Valencia', provincia: 'Valencia', cp: '46023', email: 'compras@hotelmarazul.test', telefono: '963 112 233', comercial: 'comercial1', riesgo: 25000 },
  { key: 'clinica', nombre: 'Clínica Dental Sonrisa', razonSocial: 'Sonrisa Dental S.L.', nif: 'B98765431', localidad: 'Paterna', provincia: 'Valencia', cp: '46980', email: 'admin@clinicasonrisa.test', telefono: '961 445 566', comercial: 'comercial2', riesgo: 8000 },
  { key: 'colegio', nombre: 'Colegio San Vicente', razonSocial: 'Fundación Educativa San Vicente', nif: 'G46000006', localidad: 'Valencia', provincia: 'Valencia', cp: '46010', email: 'gerencia@colegiosv.test', telefono: '963 778 899', comercial: 'comercial1', riesgo: 15000 },
  { key: 'super', nombre: 'Supermercados Huerta', razonSocial: 'Distribuciones Huerta S.L.', nif: 'B46222220', localidad: 'Torrent', provincia: 'Valencia', cp: '46900', email: 'mantenimiento@superhuerta.test', telefono: '961 223 344', comercial: 'comercial2', riesgo: 30000 },
  { key: 'oficinas', nombre: 'Coworking Ruzafa', razonSocial: 'Espacios Ruzafa S.L.', nif: 'B46333332', localidad: 'Valencia', provincia: 'Valencia', cp: '46006', email: 'hola@coworkingruzafa.test', telefono: '960 334 455', comercial: 'comercial1', riesgo: 6000 },
  { key: 'restaurante', nombre: 'Restaurante La Albufera', razonSocial: 'Albufera Gastro S.L.', nif: 'B46444444', localidad: 'El Palmar', provincia: 'Valencia', cp: '46012', email: 'reservas@laalbufera.test', telefono: '961 620 000', comercial: 'comercial2', regimen: 'recargo' },
  { key: 'ayto', nombre: 'Ayuntamiento de Alboraia', razonSocial: 'Ayuntamiento de Alboraia', nif: 'P4600600C', localidad: 'Alboraia', provincia: 'Valencia', cp: '46120', email: 'contratacion@alboraia.test', telefono: '961 317 000', comercial: 'comercial1' },
  { key: 'particular', nombre: 'Jorge Peña', razonSocial: 'Jorge Peña Ruiz', nif: '12345678Z', localidad: 'Burjassot', provincia: 'Valencia', cp: '46100', email: 'jorge.pena@correo.test', telefono: '600 112 233', comercial: 'comercial2', estado: 'potencial' },
];

const PROVEEDORES = [
  { key: 'climafrio', nombre: 'Climafrío Distribución', nif: 'B46555553', localidad: 'Manises', email: 'pedidos@climafrio.test', telefono: '961 520 520' },
  { key: 'electro', nombre: 'Electro Suministros Levante', nif: 'B46666665', localidad: 'Valencia', email: 'ventas@electrolevante.test', telefono: '963 600 600' },
  { key: 'ferreteria', nombre: 'Ferretería Industrial Turia', nif: 'B46777777', localidad: 'Quart de Poblet', email: 'tienda@ferreteriaturia.test', telefono: '961 540 540' },
  { key: 'gasolinera', nombre: 'Estación de Servicio Pista Silla', nif: 'B46888889', localidad: 'Silla', email: 'info@pistasilla.test', telefono: '961 200 200' },
];

const ARTICULOS: { ref: string; nombre: string; tipo?: string; fam: string; pvp: number; coste: number; prov?: string; unidad?: string; marca?: string; modelo?: string; iva?: number }[] = [
  { ref: 'AC-SPLIT-35', nombre: 'Aire acondicionado split 3,5 kW', fam: 'clima', pvp: 890, coste: 520, prov: 'climafrio', marca: 'Daikin', modelo: 'TXF35' },
  { ref: 'AC-SPLIT-50', nombre: 'Aire acondicionado split 5 kW', fam: 'clima', pvp: 1290, coste: 760, prov: 'climafrio', marca: 'Daikin', modelo: 'TXF50' },
  { ref: 'AC-CASS-71', nombre: 'Cassette 7,1 kW con mando', fam: 'clima', pvp: 2150, coste: 1380, prov: 'climafrio', marca: 'Mitsubishi', modelo: 'PLA-M71' },
  { ref: 'BC-AERO-200', nombre: 'Aerotermia ACS 200 L', fam: 'clima', pvp: 1850, coste: 1150, prov: 'climafrio', marca: 'Ariston', modelo: 'Nuos 200' },
  { ref: 'FIL-AC-STD', nombre: 'Filtro estándar para split', fam: 'repuestos', pvp: 18, coste: 6.5, prov: 'climafrio' },
  { ref: 'GAS-R32-3', nombre: 'Gas refrigerante R32 (botella 3 kg)', fam: 'repuestos', pvp: 145, coste: 82, prov: 'climafrio', unidad: 'ud' },
  { ref: 'TUB-CU-14', nombre: 'Tubo de cobre 1/4" aislado', fam: 'material', pvp: 6.9, coste: 3.1, prov: 'climafrio', unidad: 'm' },
  { ref: 'TUB-CU-38', nombre: 'Tubo de cobre 3/8" aislado', fam: 'material', pvp: 8.4, coste: 3.9, prov: 'climafrio', unidad: 'm' },
  { ref: 'CAB-3X25', nombre: 'Cable manguera 3x2,5 mm²', fam: 'material', pvp: 2.4, coste: 0.95, prov: 'electro', unidad: 'm' },
  { ref: 'MAG-16A', nombre: 'Magnetotérmico 2P 16 A', fam: 'electricidad', pvp: 14.5, coste: 5.8, prov: 'electro' },
  { ref: 'DIF-40A', nombre: 'Diferencial 2P 40 A 30 mA', fam: 'electricidad', pvp: 48, coste: 21, prov: 'electro' },
  { ref: 'LED-PAN-60', nombre: 'Panel LED 60x60 40 W', fam: 'electricidad', pvp: 39, coste: 14.2, prov: 'electro' },
  { ref: 'SOP-AC-PARED', nombre: 'Soporte de pared para unidad exterior', fam: 'material', pvp: 32, coste: 11, prov: 'ferreteria' },
  { ref: 'BOMBA-COND', nombre: 'Bomba de condensados', fam: 'repuestos', pvp: 89, coste: 41, prov: 'climafrio' },
  { ref: 'TACO-8', nombre: 'Taco químico M8 (caja 20)', fam: 'material', pvp: 24, coste: 9.5, prov: 'ferreteria', unidad: 'caja' },
  { ref: 'SRV-HORA', nombre: 'Hora de técnico', tipo: 'servicio', fam: 'servicios', pvp: 42, coste: 24, unidad: 'h' },
  { ref: 'SRV-HORA-URG', nombre: 'Hora de técnico urgente (fuera de horario)', tipo: 'servicio', fam: 'servicios', pvp: 65, coste: 30, unidad: 'h' },
  { ref: 'SRV-DESPL', nombre: 'Desplazamiento', tipo: 'servicio', fam: 'servicios', pvp: 25, coste: 8, unidad: 'servicio' },
  { ref: 'SRV-INST-SPLIT', nombre: 'Instalación de split (hasta 3 m de tubería)', tipo: 'servicio', fam: 'servicios', pvp: 280, coste: 150, unidad: 'servicio' },
  { ref: 'SRV-MANT-ANUAL', nombre: 'Mantenimiento preventivo anual por equipo', tipo: 'servicio', fam: 'servicios', pvp: 75, coste: 35, unidad: 'servicio' },
];

export async function seed() {
  const [existe] = await db.select({ id: empresas.id }).from(empresas).limit(1);
  if (existe) {
    console.log('La base de datos ya tiene datos: no se cargan los de ejemplo');
    return;
  }
  const hash = await hashPassword(DEMO_PASSWORD);

  await db.transaction(async (tx) => {
    const [emp] = await tx
      .insert(empresas)
      .values({
        nombre: 'Brisa Instalaciones',
        razonSocial: 'Brisa Instalaciones y Mantenimiento S.L.',
        nif: 'B12345674',
        direccion: 'Calle de la Industria 12',
        codigoPostal: '46014',
        localidad: 'Valencia',
        provincia: 'Valencia',
        telefono: '963 000 111',
        email: 'info@brisa.test',
        web: 'brisa.test',
        iban: 'ES9121000418450200051332',
        bic: 'CAIXESBBXXX',
      })
      .returning();
    const empresaId = emp!.id;

    const [sede] = await tx
      .insert(centros)
      .values({ empresaId, nombre: 'Sede central', direccion: 'Calle de la Industria 12', codigoPostal: '46014', localidad: 'Valencia', provincia: 'Valencia', comunidad: 'Comunitat Valenciana', lat: 39.4537, lng: -0.3966, radioGeovalla: 200 })
      .returning();
    const [alm] = await tx
      .insert(centros)
      .values({ empresaId, nombre: 'Almacén Paterna', direccion: 'Polígono Fuente del Jarro, calle 3', codigoPostal: '46988', localidad: 'Paterna', provincia: 'Valencia', comunidad: 'Comunitat Valenciana', lat: 39.5216, lng: -0.4559, radioGeovalla: 250 })
      .returning();
    const centrosMap = { sede: sede!.id, almacen: alm!.id };

    const deps: Record<string, string> = {};
    for (const d of DEPARTAMENTOS) {
      const [r] = await tx.insert(departamentos).values({ empresaId, nombre: d.nombre, color: d.color }).returning();
      deps[d.key] = r!.id;
    }

    const rolesMap: Record<string, string> = {};
    for (const r of DEFAULT_ROLES) {
      const [row] = await tx.insert(roles).values({ empresaId, clave: r.key, nombre: r.nombre, descripcion: r.descripcion, sistema: true }).returning();
      rolesMap[r.key] = row!.id;
      if (r.permisos !== '*' && Object.keys(r.permisos).length)
        await tx.insert(rolPermisos).values(Object.entries(r.permisos).map(([permiso, alcance]) => ({ rolId: row!.id, permiso, alcance })));
    }

    const pers: Record<string, string> = {};
    let n = 1;
    for (const p of PERSONAS) {
      const [row] = await tx
        .insert(personas)
        .values({
          empresaId,
          nombre: p.nombre,
          apellidos: p.apellidos,
          email: p.email.replace('@kite.test', '@brisa.test'),
          telefono: `600 ${String(100 + n).padStart(3, '0')} ${String(200 + n * 7).slice(0, 3)}`,
          puesto: p.puesto,
          departamentoId: deps[p.dep],
          centroId: p.centro ? centrosMap[p.centro as 'almacen'] : centrosMap.sede,
          codigoEmpleado: `E${String(n).padStart(3, '0')}`,
        })
        .returning();
      pers[p.key] = row!.id;
      n++;
    }
    for (const p of PERSONAS) if (p.resp && p.resp !== p.key) await tx.update(personas).set({ responsableId: pers[p.resp] }).where(eq(personas.id, pers[p.key]!));
    await tx.update(departamentos).set({ responsableId: pers.direccion }).where(eq(departamentos.id, deps.direccion!));
    await tx.update(departamentos).set({ responsableId: pers.administracion }).where(eq(departamentos.id, deps.administracion!));
    await tx.update(departamentos).set({ responsableId: pers.comercial1 }).where(eq(departamentos.id, deps.comercial!));
    await tx.update(departamentos).set({ responsableId: pers.almacen }).where(eq(departamentos.id, deps.almacen!));
    await tx.update(departamentos).set({ responsableId: pers.jefesat }).where(eq(departamentos.id, deps.sat!));
    await tx.update(departamentos).set({ responsableId: pers.rrhh }).where(eq(departamentos.id, deps.rrhh!));

    let adminUsuarioId = '';
    for (const p of PERSONAS) {
      const [u] = await tx.insert(usuarios).values({ email: p.email, passwordHash: hash }).returning();
      if (p.key === 'admin') adminUsuarioId = u!.id;
      await tx.insert(usuarioEmpresas).values({ usuarioId: u!.id, empresaId, personaId: pers[p.key], rolId: rolesMap[p.rol] });
    }

    for (const code of OPTIONAL_MODULE_CODES) await tx.insert(modulosEmpresa).values({ empresaId, modulo: code, activo: true });

    const [fpTransf] = await tx.insert(formasPago).values({ empresaId, nombre: 'Transferencia a 30 días', tipo: 'transferencia', plazos: [{ dias: 30, porcentaje: 100 }] }).returning();
    const [fpRecibo] = await tx.insert(formasPago).values({ empresaId, nombre: 'Recibo domiciliado 30 días', tipo: 'domiciliacion', plazos: [{ dias: 30, porcentaje: 100 }] }).returning();
    await tx.insert(formasPago).values({ empresaId, nombre: 'Recibo domiciliado 30/60', tipo: 'domiciliacion', plazos: [{ dias: 30, porcentaje: 50 }, { dias: 60, porcentaje: 50 }] });
    const [fpContado] = await tx.insert(formasPago).values({ empresaId, nombre: 'Contado', tipo: 'contado', plazos: [{ dias: 0, porcentaje: 100 }] }).returning();
    const [tarDist] = await tx.insert(tarifas).values({ empresaId, nombre: 'Clientes preferentes (-8 %)', tipo: 'descuento', porcentaje: 8 }).returning();

    const ters: Record<string, string> = {};
    for (const c of CLIENTES) {
      const [row] = await tx
        .insert(terceros)
        .values({
          empresaId,
          nombre: c.nombre,
          razonSocial: c.razonSocial,
          nif: c.nif,
          esCliente: true,
          estado: c.estado ?? 'cliente',
          localidad: c.localidad,
          provincia: c.provincia,
          codigoPostal: c.cp,
          direccion: 'Avenida Principal 1',
          email: c.email,
          telefono: c.telefono,
          comercialId: pers[c.comercial],
          formaPagoId: c.key === 'particular' ? fpContado!.id : c.key === 'super' || c.key === 'hotel' ? fpRecibo!.id : fpTransf!.id,
          tarifaId: c.key === 'super' ? tarDist!.id : null,
          riesgoMax: c.riesgo ?? null,
          regimenIva: c.regimen ?? 'general',
          iban: c.key === 'super' || c.key === 'hotel' ? 'ES7921000813610123456789' : null,
          mandatoSepa: c.key === 'super' || c.key === 'hotel' ? `MANDATO-${c.key.toUpperCase()}` : null,
          mandatoFecha: c.key === 'super' || c.key === 'hotel' ? '2025-01-15' : null,
          etiquetas: c.key === 'hotel' || c.key === 'super' ? ['contrato mantenimiento'] : c.key === 'ayto' ? ['administración pública'] : [],
          rgpdConsentimiento: true,
        })
        .returning();
      ters[c.key] = row!.id;
      await tx.insert(contactos).values({ empresaId, terceroId: row!.id, nombre: ['Isabel', 'Tomás', 'Rosa', 'Miguel', 'Nuria', 'Andrés', 'Pilar', 'Jorge'][Object.keys(ters).length - 1]!, apellidos: 'García', cargo: c.key === 'particular' ? 'Titular' : 'Responsable de mantenimiento', rol: 'tecnico', email: c.email, telefono: c.telefono, principal: true });
    }
    for (const p of PROVEEDORES) {
      const [row] = await tx
        .insert(terceros)
        .values({ empresaId, nombre: p.nombre, razonSocial: `${p.nombre} S.L.`, nif: p.nif, esCliente: false, esProveedor: true, estado: 'cliente', localidad: p.localidad, provincia: 'Valencia', email: p.email, telefono: p.telefono, formaPagoId: fpTransf!.id, iban: 'ES6000491500051234567892' })
        .returning();
      ters[p.key] = row!.id;
      await tx.insert(contactos).values({ empresaId, terceroId: row!.id, nombre: 'Departamento', apellidos: 'de pedidos', rol: 'compras', email: p.email, telefono: p.telefono, principal: true });
    }

    const fams: Record<string, string> = {};
    for (const [k, nombre] of Object.entries({ clima: 'Climatización', repuestos: 'Repuestos', material: 'Material de instalación', electricidad: 'Electricidad', servicios: 'Servicios' })) {
      const [f] = await tx.insert(familias).values({ empresaId, nombre, cuentaVentas: k === 'servicios' ? '705' : '700' }).returning();
      fams[k] = f!.id;
    }
    const arts: Record<string, string> = {};
    for (const a of ARTICULOS) {
      const [row] = await tx
        .insert(articulos)
        .values({
          empresaId,
          referencia: a.ref,
          nombre: a.nombre,
          tipo: a.tipo ?? 'producto',
          familiaId: fams[a.fam],
          unidad: a.unidad ?? (a.tipo === 'servicio' ? 'servicio' : 'ud'),
          precioVenta: a.pvp,
          coste: a.coste,
          ivaTipo: a.iva ?? 21,
          proveedorId: a.prov ? ters[a.prov] : null,
          marca: a.marca,
          modelo: a.modelo,
          controlaStock: (a.tipo ?? 'producto') === 'producto',
          ean: a.tipo ? null : `84${String(Math.abs(hashCode(a.ref))).padStart(10, '0').slice(0, 10)}${0}`,
        })
        .returning();
      arts[a.ref] = row!.id;
    }

    const anio = new Date().getFullYear();
    const fest = [
      [`${anio}-01-01`, 'Año Nuevo'],
      [`${anio}-01-06`, 'Epifanía del Señor'],
      [`${anio}-05-01`, 'Fiesta del Trabajo'],
      [`${anio}-08-15`, 'Asunción de la Virgen'],
      [`${anio}-10-12`, 'Fiesta Nacional de España'],
      [`${anio}-11-01`, 'Todos los Santos'],
      [`${anio}-12-06`, 'Día de la Constitución'],
      [`${anio}-12-08`, 'Inmaculada Concepción'],
      [`${anio}-12-25`, 'Navidad'],
    ];
    await tx.insert(festivos).values(fest.map(([fecha, nombre]) => ({ empresaId, fecha: fecha!, nombre: nombre!, ambito: 'nacional' })));
    await tx.insert(festivos).values([
      { empresaId, fecha: `${anio}-03-19`, nombre: 'San José', ambito: 'autonomico' },
      { empresaId, fecha: `${anio}-10-09`, nombre: 'Día de la Comunitat Valenciana', ambito: 'autonomico' },
      { empresaId, fecha: `${anio}-01-22`, nombre: 'San Vicente Mártir', ambito: 'local', centroId: centrosMap.sede },
    ]);

    const s: SeedCtx = { empresaId, adminUsuarioId, personas: pers, terceros: ters, articulos: arts, departamentos: deps, centros: centrosMap };
    for (const def of moduleDefs) {
      if (!def.seed) continue;
      await def.seed(tx, s);
    }
  });
  console.log('Datos de ejemplo cargados. Usuario admin@kite.test');
}

function hashCode(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

const isMain = process.argv[1] && /seed[\\/]index\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  seed()
    .then(() => sqlClient.end())
    .catch(async (e) => {
      console.error(e);
      await sqlClient.end();
      process.exit(1);
    });
}

export const _sql = sql;
