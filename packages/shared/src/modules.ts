/**
 * Catálogo de módulos de KiteERP.
 * El núcleo (Plataforma) está siempre activo; el resto se activa por empresa.
 * `requires`: dependencias obligatorias. `connects`: módulos con los que se integra si están activos.
 */

export type Pillar = 'personas' | 'comercial' | 'operaciones' | 'finanzas' | 'plataforma';

export const PILLARS: Record<Pillar, { label: string; color: string; soft: string; description: string }> = {
  personas: { label: 'Personas', color: '#F1DE07', soft: '#FDF9CC', description: 'Trabajadores, tiempo y RRHH' },
  comercial: { label: 'Comercial', color: '#7D2CDD', soft: '#EFE4FB', description: 'Del primer contacto a la factura' },
  operaciones: { label: 'Operaciones', color: '#35AE29', soft: '#E1F4DE', description: 'Material, compras, trabajo y técnica' },
  finanzas: { label: 'Finanzas', color: '#B28574', soft: '#F3EAE6', description: 'Dinero, impuestos y datos' },
  plataforma: { label: 'Plataforma', color: '#5E2A78', soft: '#ECE3F1', description: 'El núcleo, siempre activo' },
};

export interface ModuleInfo {
  code: string;
  name: string;
  short: string;
  pillar: Pillar;
  icon: string;
  description: string;
  core?: boolean;
  requires: string[][]; // cada grupo interno es un OR: [['fac','cpr']] = requiere FAC o CPR
  connects: string[];
}

export const MODULES = [
  // ── Plataforma (núcleo) ──
  { code: 'usr', name: 'Usuarios y permisos', short: 'Usuarios', pillar: 'plataforma', icon: 'ShieldCheck', core: true, description: 'Quién entra, qué ve y qué puede hacer.', requires: [], connects: [] },
  { code: 'cfg', name: 'Configuración', short: 'Configuración', pillar: 'plataforma', icon: 'Settings', core: true, description: 'Empresa, centros, series, impuestos y módulos.', requires: [], connects: [] },
  { code: 'doc', name: 'Documentos y firma', short: 'Documentos', pillar: 'plataforma', icon: 'FolderOpen', core: true, description: 'Adjuntos, plantillas y firma electrónica.', requires: [], connects: [] },
  { code: 'msg', name: 'Comunicación interna', short: 'Comunicación', pillar: 'plataforma', icon: 'Megaphone', core: true, description: 'Avisos, tareas, comentarios y canal de denuncias.', requires: [], connects: [] },
  { code: 'api', name: 'Integraciones y API', short: 'Integraciones', pillar: 'plataforma', icon: 'Plug', core: true, description: 'API, webhooks e importaciones.', requires: [], connects: [] },

  // ── Personas ──
  { code: 'fic', name: 'Ficha del trabajador', short: 'Trabajadores', pillar: 'personas', icon: 'IdCard', description: 'Expediente laboral, formación, PRL y material.', requires: [], connects: ['hor', 'aus', 'nom', 'act'] },
  { code: 'hor', name: 'Control horario', short: 'Fichaje', pillar: 'personas', icon: 'Clock', description: 'Registro de jornada, turnos y cuadrantes.', requires: [], connects: ['aus', 'nom', 'pry', 'sat'] },
  { code: 'aus', name: 'Vacaciones y ausencias', short: 'Ausencias', pillar: 'personas', icon: 'CalendarDays', description: 'Saldos, solicitudes y calendario de equipo.', requires: [], connects: ['hor', 'nom'] },
  { code: 'nom', name: 'Nóminas', short: 'Nóminas', pillar: 'personas', icon: 'Wallet', description: 'Variables, reparto de recibos y anticipos.', requires: [['fic']], connects: ['hor', 'aus', 'gas', 'cnt'] },
  { code: 'alt', name: 'Altas, bajas y evaluación', short: 'Talento', pillar: 'personas', icon: 'UserPlus', description: 'Selección, incorporación, salida y evaluación.', requires: [['fic']], connects: ['act', 'doc'] },
  { code: 'por', name: 'Portal del empleado', short: 'Portal', pillar: 'personas', icon: 'Smartphone', description: 'La vista sencilla para cada trabajador.', requires: [], connects: [] },

  // ── Comercial ──
  { code: 'crm', name: 'Clientes y contactos', short: 'CRM', pillar: 'comercial', icon: 'Building2', description: 'Actividad comercial, segmentos y línea de tiempo.', requires: [], connects: ['opo', 'pre', 'sat', 'fac'] },
  { code: 'opo', name: 'Oportunidades', short: 'Oportunidades', pillar: 'comercial', icon: 'Target', description: 'Embudo de ventas y previsión.', requires: [['crm']], connects: ['pre'] },
  { code: 'pre', name: 'Presupuestos', short: 'Presupuestos', pillar: 'comercial', icon: 'FileSignature', description: 'Ofertas con margen y aceptación online.', requires: [], connects: ['stk', 'ped', 'pry', 'fac'] },
  { code: 'ped', name: 'Pedidos y albaranes', short: 'Pedidos', pillar: 'comercial', icon: 'PackageCheck', description: 'Lo vendido, preparado y entregado.', requires: [], connects: ['pre', 'stk', 'fac'] },
  { code: 'fac', name: 'Facturación', short: 'Facturas', pillar: 'comercial', icon: 'Receipt', description: 'Facturas legales, Verifactu y Facturae.', requires: [], connects: ['ped', 'sat', 'pry', 'tes', 'cnt'] },

  // ── Operaciones ──
  { code: 'stk', name: 'Artículos y stock', short: 'Stock', pillar: 'operaciones', icon: 'Boxes', description: 'Almacenes, lotes, series e inventarios.', requires: [], connects: ['ped', 'cpr', 'sat', 'pry'] },
  { code: 'cpr', name: 'Compras y proveedores', short: 'Compras', pillar: 'operaciones', icon: 'ShoppingCart', description: 'Solicitudes, pedidos, recepciones y facturas.', requires: [], connects: ['stk', 'tes', 'cnt'] },
  { code: 'pry', name: 'Proyectos y partes', short: 'Proyectos', pillar: 'operaciones', icon: 'KanbanSquare', description: 'Tareas, horas, materiales y rentabilidad.', requires: [], connects: ['hor', 'stk', 'gas', 'fac'] },
  { code: 'sat', name: 'Servicio técnico', short: 'SAT', pillar: 'operaciones', icon: 'Wrench', description: 'Tickets, órdenes de trabajo y contratos.', requires: [], connects: ['stk', 'fac', 'hor', 'crm', 'pre', 'dtc'] },
  { code: 'act', name: 'Activos y flota', short: 'Activos', pillar: 'operaciones', icon: 'Truck', description: 'Maquinaria, vehículos y vencimientos.', requires: [], connects: ['fic', 'gas', 'cnt', 'dtc'] },
  { code: 'dtc', name: 'Documentación técnica', short: 'Doc. técnica', pillar: 'operaciones', icon: 'BookOpenCheck', description: 'Manuales, planos y procedimientos con versiones y aprobación.', requires: [], connects: ['stk', 'sat', 'pry', 'act'] },

  // ── Finanzas ──
  { code: 'tes', name: 'Tesorería', short: 'Tesorería', pillar: 'finanzas', icon: 'Landmark', description: 'Vencimientos, remesas SEPA y conciliación.', requires: [['fac', 'cpr']], connects: ['cnt'] },
  { code: 'cnt', name: 'Contabilidad e impuestos', short: 'Contabilidad', pillar: 'finanzas', icon: 'BookOpen', description: 'PGC, asientos automáticos y modelos.', requires: [], connects: [] },
  { code: 'gas', name: 'Gastos y dietas', short: 'Gastos', pillar: 'finanzas', icon: 'ReceiptEuro', description: 'Tickets, kilometraje y liquidaciones.', requires: [], connects: ['nom', 'pry', 'cnt'] },
  { code: 'bi', name: 'Informes y paneles', short: 'Informes', pillar: 'finanzas', icon: 'BarChart3', description: 'Indicadores y informes exportables.', requires: [], connects: [] },
] as const satisfies readonly ModuleInfo[];

export type ModuleCode = (typeof MODULES)[number]['code'];
export const MODULE_CODES = MODULES.map((m) => m.code) as ModuleCode[];
export const CORE_MODULE_CODES = MODULES.filter((m) => 'core' in m && m.core).map((m) => m.code) as ModuleCode[];
export const OPTIONAL_MODULE_CODES = MODULE_CODES.filter((c) => !CORE_MODULE_CODES.includes(c));

export function moduleInfo(code: string): ModuleInfo | undefined {
  return (MODULES as readonly ModuleInfo[]).find((m) => m.code === code);
}

/** Devuelve los grupos de dependencias no satisfechos para activar `code`. */
export function missingRequirements(code: string, active: Iterable<string>): string[][] {
  const set = new Set(active);
  const info = moduleInfo(code);
  if (!info) return [];
  return info.requires.filter((group) => !group.some((c) => set.has(c)));
}

/** Módulos activos que dejarían de cumplir sus requisitos si se desactiva `code`. */
export function dependents(code: string, active: Iterable<string>): string[] {
  const set = new Set(active);
  set.delete(code);
  return [...set].filter((c) => missingRequirements(c, set).length > 0);
}
