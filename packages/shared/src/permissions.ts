/**
 * Permisos de KiteERP.
 * Cada permiso pertenece a un módulo y, si es "scoped", se concede con un alcance:
 *   propio  → solo lo suyo (sus clientes, sus fichajes, sus gastos…)
 *   equipo  → lo suyo y lo de las personas que dependen de él (recursivo)
 *   departamento → todo su departamento
 *   todo    → toda la empresa
 */

export const SCOPES = ['propio', 'equipo', 'departamento', 'todo'] as const;
export type Scope = (typeof SCOPES)[number];
export const SCOPE_LABELS: Record<Scope, string> = {
  propio: 'Solo lo suyo',
  equipo: 'Su equipo',
  departamento: 'Su departamento',
  todo: 'Toda la empresa',
};
export function scopeRank(s: Scope | undefined | null): number {
  return s ? SCOPES.indexOf(s) + 1 : 0;
}
export function maxScope(a: Scope | undefined, b: Scope | undefined): Scope | undefined {
  return scopeRank(a) >= scopeRank(b) ? a : b;
}

export interface PermissionDef {
  key: string;
  module: string;
  label: string;
  scoped: boolean;
}

const P = (module: string, key: string, label: string, scoped = false): PermissionDef => ({ module, key, label, scoped });

export const PERMISSIONS: PermissionDef[] = [
  // Núcleo
  P('core', 'personas.ver', 'Ver el directorio de personas'),
  P('core', 'personas.gestionar', 'Crear y editar personas, centros y departamentos'),
  P('core', 'terceros.ver', 'Ver clientes y proveedores', true),
  P('core', 'terceros.gestionar', 'Crear y editar clientes y proveedores', true),
  P('core', 'catalogo.ver', 'Ver artículos, servicios y tarifas'),
  P('core', 'catalogo.gestionar', 'Editar artículos, servicios y tarifas'),
  P('usr', 'usr.gestionar', 'Gestionar usuarios y roles'),
  P('usr', 'auditoria.ver', 'Consultar el registro de auditoría'),
  P('cfg', 'cfg.gestionar', 'Configurar empresa, series, impuestos y módulos'),
  P('doc', 'doc.plantillas', 'Gestionar plantillas de documentos'),
  P('doc', 'doc.firmas', 'Enviar documentos a firmar'),
  P('msg', 'msg.anuncios', 'Publicar anuncios en el tablón'),
  P('msg', 'msg.denuncias', 'Gestionar el canal de denuncias'),
  P('msg', 'msg.encuestas', 'Crear encuestas y ver resultados'),
  P('api', 'api.gestionar', 'Gestionar claves de API, webhooks e importaciones'),

  // Personas
  P('fic', 'fic.ver', 'Ver fichas de trabajadores', true),
  P('fic', 'fic.editar', 'Editar fichas de trabajadores', true),
  P('fic', 'fic.sensible', 'Ver datos sensibles (salario, salud, IBAN)', true),
  P('hor', 'hor.fichar', 'Fichar'),
  P('hor', 'hor.ver', 'Ver fichajes y horas', true),
  P('hor', 'hor.aprobar', 'Aprobar correcciones de fichaje', true),
  P('hor', 'hor.gestionar', 'Gestionar turnos, cuadrantes y quioscos'),
  P('aus', 'aus.solicitar', 'Solicitar vacaciones y permisos'),
  P('aus', 'aus.ver', 'Ver ausencias', true),
  P('aus', 'aus.aprobar', 'Aprobar ausencias', true),
  P('aus', 'aus.gestionar', 'Gestionar tipos, saldos y calendario laboral'),
  P('nom', 'nom.ver', 'Ver recibos de nómina', true),
  P('nom', 'nom.gestionar', 'Preparar nóminas y repartir recibos'),
  P('nom', 'nom.anticipos', 'Aprobar anticipos', true),
  P('alt', 'alt.ver', 'Ver selección, altas y bajas'),
  P('alt', 'alt.gestionar', 'Gestionar selección, altas y bajas'),
  P('alt', 'alt.evaluar', 'Evaluar personas', true),

  // Comercial
  P('crm', 'crm.ver', 'Ver actividad comercial', true),
  P('crm', 'crm.editar', 'Registrar actividad comercial', true),
  P('opo', 'opo.ver', 'Ver oportunidades', true),
  P('opo', 'opo.editar', 'Gestionar oportunidades', true),
  P('pre', 'pre.ver', 'Ver presupuestos', true),
  P('pre', 'pre.editar', 'Crear y editar presupuestos', true),
  P('pre', 'pre.aprobar', 'Aprobar presupuestos con margen bajo'),
  P('ped', 'ped.ver', 'Ver pedidos y albaranes', true),
  P('ped', 'ped.editar', 'Crear y editar pedidos y albaranes', true),
  P('ped', 'ped.preparar', 'Preparar y entregar pedidos'),
  P('fac', 'fac.ver', 'Ver facturas', true),
  P('fac', 'fac.editar', 'Crear borradores de factura'),
  P('fac', 'fac.emitir', 'Emitir y rectificar facturas'),

  // Operaciones
  P('stk', 'stk.ver', 'Ver stock y almacenes'),
  P('stk', 'stk.mover', 'Registrar movimientos, traspasos e inventarios', true),
  P('stk', 'stk.gestionar', 'Gestionar almacenes y configuración de stock'),
  P('cpr', 'cpr.solicitar', 'Solicitar compras'),
  P('cpr', 'cpr.ver', 'Ver compras', true),
  P('cpr', 'cpr.editar', 'Gestionar pedidos y facturas de proveedor'),
  P('cpr', 'cpr.aprobar', 'Aprobar solicitudes y pedidos de compra', true),
  P('cpr', 'cpr.recibir', 'Recibir mercancía'),
  P('pry', 'pry.ver', 'Ver proyectos', true),
  P('pry', 'pry.editar', 'Gestionar proyectos', true),
  P('pry', 'pry.imputar', 'Imputar horas y material a proyectos'),
  P('sat', 'sat.ver', 'Ver tickets y órdenes de trabajo', true),
  P('sat', 'sat.editar', 'Trabajar tickets y órdenes', true),
  P('sat', 'sat.planificar', 'Asignar y planificar técnicos'),
  P('sat', 'sat.contratos', 'Gestionar contratos y equipos de cliente'),
  P('act', 'act.ver', 'Ver activos y flota', true),
  P('act', 'act.gestionar', 'Gestionar activos, mantenimientos y vencimientos'),
  P('dtc', 'dtc.ver', 'Consultar documentación técnica'),
  P('dtc', 'dtc.editar', 'Redactar y versionar documentación técnica'),
  P('dtc', 'dtc.aprobar', 'Revisar y aprobar documentación técnica'),
  P('dtc', 'dtc.restringido', 'Ver documentación técnica restringida'),

  // Finanzas
  P('tes', 'tes.ver', 'Ver tesorería y vencimientos'),
  P('tes', 'tes.gestionar', 'Remesas, cobros, pagos y conciliación'),
  P('cnt', 'cnt.ver', 'Ver contabilidad e impuestos'),
  P('cnt', 'cnt.gestionar', 'Registrar asientos, cierres y modelos'),
  P('gas', 'gas.crear', 'Registrar sus gastos'),
  P('gas', 'gas.ver', 'Ver gastos', true),
  P('gas', 'gas.aprobar', 'Aprobar gastos', true),
  P('gas', 'gas.liquidar', 'Liquidar gastos'),
  P('bi', 'bi.ver', 'Ver informes y paneles'),
];

export const PERMISSION_MAP = new Map(PERMISSIONS.map((p) => [p.key, p]));
export type PermissionKey = string;

/** Permisos que se conceden automáticamente a quien tiene personas a su cargo. */
export const MANAGER_IMPLICIT: Record<string, Scope> = {
  'fic.ver': 'equipo',
  'hor.ver': 'equipo',
  'hor.aprobar': 'equipo',
  'aus.ver': 'equipo',
  'aus.aprobar': 'equipo',
  'gas.ver': 'equipo',
  'gas.aprobar': 'equipo',
  'cpr.aprobar': 'equipo',
  'alt.evaluar': 'equipo',
};

/** Permisos básicos que tiene cualquier trabajador con usuario. */
export const EMPLOYEE_BASE: Record<string, Scope> = {
  'personas.ver': 'todo',
  'hor.fichar': 'todo',
  'hor.ver': 'propio',
  'aus.solicitar': 'todo',
  'aus.ver': 'propio',
  'nom.ver': 'propio',
  'fic.ver': 'propio',
  'gas.crear': 'todo',
  'gas.ver': 'propio',
  'cpr.solicitar': 'todo',
  'cpr.ver': 'propio',
  'pry.imputar': 'todo',
  'dtc.ver': 'todo',
};

export interface RoleTemplate {
  key: string;
  nombre: string;
  descripcion: string;
  permisos: '*' | Record<string, Scope>;
}

const all = (keys: string[], scope: Scope = 'todo') => Object.fromEntries(keys.map((k) => [k, scope]));
const byModule = (mods: string[], scope: Scope = 'todo') =>
  all(PERMISSIONS.filter((p) => mods.includes(p.module)).map((p) => p.key), scope);

export const DEFAULT_ROLES: RoleTemplate[] = [
  { key: 'admin', nombre: 'Administrador', descripcion: 'Acceso total, incluida la configuración.', permisos: '*' },
  {
    key: 'direccion',
    nombre: 'Dirección',
    descripcion: 'Ve y aprueba todo el negocio. No configura el sistema.',
    permisos: {
      ...all(PERMISSIONS.filter((p) => !['usr.gestionar', 'cfg.gestionar', 'api.gestionar', 'msg.denuncias'].includes(p.key)).map((p) => p.key)),
    },
  },
  {
    key: 'rrhh',
    nombre: 'RRHH',
    descripcion: 'Personas, tiempo, nóminas y comunicación interna.',
    permisos: {
      ...byModule(['fic', 'hor', 'aus', 'nom', 'alt']),
      ...all(['personas.ver', 'personas.gestionar', 'msg.anuncios', 'msg.denuncias', 'msg.encuestas', 'doc.plantillas', 'doc.firmas', 'bi.ver', 'dtc.ver']),
      'gas.ver': 'todo',
      'act.ver': 'todo',
    },
  },
  {
    key: 'administracion',
    nombre: 'Administración',
    descripcion: 'Facturación, compras, tesorería y contabilidad. Sin acceso al servicio técnico.',
    permisos: {
      ...byModule(['fac', 'tes', 'cnt']),
      ...all(['terceros.ver', 'terceros.gestionar', 'catalogo.ver', 'crm.ver', 'pre.ver', 'ped.ver', 'cpr.ver', 'cpr.editar', 'cpr.aprobar', 'gas.ver', 'gas.liquidar', 'nom.ver', 'act.ver', 'stk.ver', 'pry.ver', 'bi.ver', 'doc.firmas', 'dtc.ver']),
    },
  },
  {
    key: 'comercial',
    nombre: 'Comercial',
    descripcion: 'Su cartera de clientes, oportunidades, presupuestos y pedidos. Sin acceso a tickets del SAT.',
    permisos: {
      ...all(['terceros.ver', 'terceros.gestionar', 'crm.ver', 'crm.editar', 'opo.ver', 'opo.editar', 'pre.ver', 'pre.editar', 'ped.ver', 'ped.editar', 'fac.ver', 'pry.ver'], 'propio'),
      ...all(['catalogo.ver', 'stk.ver', 'bi.ver', 'doc.firmas', 'dtc.ver']),
    },
  },
  {
    key: 'almacen',
    nombre: 'Almacén',
    descripcion: 'Stock, preparación de pedidos y recepción de compras.',
    permisos: {
      ...byModule(['stk']),
      ...all(['catalogo.ver', 'catalogo.gestionar', 'terceros.ver', 'ped.ver', 'ped.preparar', 'cpr.ver', 'cpr.editar', 'cpr.recibir', 'bi.ver', 'dtc.ver']),
      'act.ver': 'propio',
    },
  },
  {
    key: 'responsable_sat',
    nombre: 'Responsable técnico',
    descripcion: 'Planifica el servicio técnico, gestiona contratos y la documentación técnica.',
    permisos: {
      ...byModule(['sat', 'dtc']),
      ...all(['terceros.ver', 'catalogo.ver', 'stk.ver', 'stk.mover', 'pre.ver', 'pre.editar', 'act.ver', 'act.gestionar', 'pry.ver', 'bi.ver', 'crm.ver']),
    },
  },
  {
    key: 'tecnico',
    nombre: 'Técnico',
    descripcion: 'Sus órdenes de trabajo, su furgoneta y la documentación técnica.',
    permisos: {
      ...all(['sat.ver', 'sat.editar', 'stk.mover', 'pry.ver', 'act.ver', 'pre.ver', 'pre.editar'], 'propio'),
      ...all(['catalogo.ver', 'stk.ver', 'dtc.ver']),
    },
  },
  {
    key: 'empleado',
    nombre: 'Empleado',
    descripcion: 'Fichar, pedir vacaciones, gastos y ver sus nóminas.',
    permisos: {},
  },
];
