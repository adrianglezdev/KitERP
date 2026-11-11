// Recursos y enumeraciones del módulo BI (Informes y paneles)
import { enumOptions } from '../resource';

/**
 * Catálogo cerrado de conjuntos de datos para los informes guardados.
 * No hay SQL libre: cada conjunto tiene columnas fijas, el servidor construye la consulta
 * y aplica los permisos y el alcance del usuario.
 */
export type BiColType = 'text' | 'money' | 'number' | 'date' | 'enum';

export interface BiColumn {
  key: string;
  label: string;
  type: BiColType;
  /** Se puede agrupar por esta columna. */
  group?: boolean;
  /** Se puede filtrar por igualdad con esta columna (valor exacto). */
  filter?: boolean;
  options?: readonly { value: string; label: string }[];
}

export interface BiDataset {
  key: string;
  label: string;
  description: string;
  module: string;
  /** Permiso necesario (con su alcance se limita lo que se ve). */
  perm: string;
  dateField: string;
  columns: BiColumn[];
}

const ESTADO_PAGO_OPTS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'pagado', label: 'Pagado' },
  { value: 'impagado', label: 'Impagado' },
];

export const BI_DATASETS: BiDataset[] = [
  {
    key: 'facturas_venta',
    label: 'Facturas emitidas',
    description: 'Facturas, rectificativas y simplificadas emitidas.',
    module: 'fac',
    perm: 'fac.ver',
    dateField: 'fecha',
    columns: [
      { key: 'fecha', label: 'Fecha', type: 'date' },
      { key: 'mes', label: 'Mes', type: 'text', group: true },
      { key: 'codigo', label: 'Número', type: 'text' },
      { key: 'cliente', label: 'Cliente', type: 'text', group: true, filter: true },
      { key: 'comercial', label: 'Comercial', type: 'text', group: true, filter: true },
      { key: 'estadoPago', label: 'Cobro', type: 'enum', group: true, filter: true, options: ESTADO_PAGO_OPTS },
      { key: 'base', label: 'Base imponible', type: 'money' },
      { key: 'iva', label: 'IVA', type: 'money' },
      { key: 'total', label: 'Total', type: 'money' },
    ],
  },
  {
    key: 'ventas_articulos',
    label: 'Ventas por artículo',
    description: 'Líneas de las facturas emitidas, con artículo y familia.',
    module: 'fac',
    perm: 'fac.ver',
    dateField: 'fecha',
    columns: [
      { key: 'fecha', label: 'Fecha', type: 'date' },
      { key: 'mes', label: 'Mes', type: 'text', group: true },
      { key: 'cliente', label: 'Cliente', type: 'text', group: true, filter: true },
      { key: 'referencia', label: 'Referencia', type: 'text', group: true, filter: true },
      { key: 'articulo', label: 'Artículo', type: 'text', group: true },
      { key: 'familia', label: 'Familia', type: 'text', group: true, filter: true },
      { key: 'comercial', label: 'Comercial', type: 'text', group: true, filter: true },
      { key: 'cantidad', label: 'Cantidad', type: 'number' },
      { key: 'importe', label: 'Importe', type: 'money' },
    ],
  },
  {
    key: 'presupuestos',
    label: 'Presupuestos',
    description: 'Presupuestos con su estado y comercial.',
    module: 'pre',
    perm: 'pre.ver',
    dateField: 'fecha',
    columns: [
      { key: 'fecha', label: 'Fecha', type: 'date' },
      { key: 'mes', label: 'Mes', type: 'text', group: true },
      { key: 'codigo', label: 'Número', type: 'text' },
      { key: 'cliente', label: 'Cliente', type: 'text', group: true, filter: true },
      { key: 'comercial', label: 'Comercial', type: 'text', group: true, filter: true },
      {
        key: 'estado',
        label: 'Estado',
        type: 'enum',
        group: true,
        filter: true,
        options: [
          { value: 'borrador', label: 'Borrador' },
          { value: 'enviado', label: 'Enviado' },
          { value: 'visto', label: 'Visto' },
          { value: 'aceptado', label: 'Aceptado' },
          { value: 'rechazado', label: 'Rechazado' },
          { value: 'caducado', label: 'Caducado' },
        ],
      },
      { key: 'base', label: 'Base imponible', type: 'money' },
      { key: 'total', label: 'Total', type: 'money' },
    ],
  },
  {
    key: 'facturas_compra',
    label: 'Facturas de proveedor',
    description: 'Facturas de proveedor registradas.',
    module: 'cpr',
    perm: 'cpr.ver',
    dateField: 'fecha',
    columns: [
      { key: 'fecha', label: 'Fecha', type: 'date' },
      { key: 'mes', label: 'Mes', type: 'text', group: true },
      { key: 'codigo', label: 'Registro', type: 'text' },
      { key: 'numeroProveedor', label: 'Nº del proveedor', type: 'text' },
      { key: 'proveedor', label: 'Proveedor', type: 'text', group: true, filter: true },
      { key: 'estadoPago', label: 'Pago', type: 'enum', group: true, filter: true, options: ESTADO_PAGO_OPTS },
      { key: 'base', label: 'Base imponible', type: 'money' },
      { key: 'iva', label: 'IVA', type: 'money' },
      { key: 'total', label: 'Total', type: 'money' },
    ],
  },
  {
    key: 'vencimientos',
    label: 'Vencimientos de cobro y pago',
    description: 'Cartera de tesorería: lo que queda por cobrar y pagar.',
    module: 'tes',
    perm: 'tes.ver',
    dateField: 'fecha',
    columns: [
      { key: 'fecha', label: 'Vencimiento', type: 'date' },
      { key: 'mes', label: 'Mes', type: 'text', group: true },
      {
        key: 'circuito',
        label: 'Tipo',
        type: 'enum',
        group: true,
        filter: true,
        options: [
          { value: 'cobro', label: 'Cobro' },
          { value: 'pago', label: 'Pago' },
        ],
      },
      { key: 'tercero', label: 'Cliente o proveedor', type: 'text', group: true, filter: true },
      { key: 'documento', label: 'Documento', type: 'text' },
      {
        key: 'estado',
        label: 'Estado',
        type: 'enum',
        group: true,
        filter: true,
        options: [
          { value: 'pendiente', label: 'Pendiente' },
          { value: 'remesado', label: 'En remesa' },
          { value: 'parcial', label: 'Parcial' },
          { value: 'pagado', label: 'Pagado' },
          { value: 'devuelto', label: 'Devuelto' },
          { value: 'impagado', label: 'Impagado' },
        ],
      },
      { key: 'importe', label: 'Importe', type: 'money' },
      { key: 'pendiente', label: 'Pendiente', type: 'money' },
    ],
  },
  {
    key: 'gastos',
    label: 'Gastos de empleados',
    description: 'Tickets, kilometraje y dietas.',
    module: 'gas',
    perm: 'gas.ver',
    dateField: 'fecha',
    columns: [
      { key: 'fecha', label: 'Fecha', type: 'date' },
      { key: 'mes', label: 'Mes', type: 'text', group: true },
      { key: 'persona', label: 'Persona', type: 'text', group: true, filter: true },
      {
        key: 'tipo',
        label: 'Tipo',
        type: 'enum',
        group: true,
        filter: true,
        options: [
          { value: 'ticket', label: 'Ticket' },
          { value: 'kilometraje', label: 'Kilometraje' },
          { value: 'dieta', label: 'Dieta' },
          { value: 'tarjeta', label: 'Tarjeta' },
        ],
      },
      { key: 'categoria', label: 'Categoría', type: 'text', group: true, filter: true },
      { key: 'comercio', label: 'Comercio', type: 'text', group: true },
      {
        key: 'estado',
        label: 'Estado',
        type: 'enum',
        group: true,
        filter: true,
        options: [
          { value: 'borrador', label: 'Borrador' },
          { value: 'enviado', label: 'Pendiente de aprobar' },
          { value: 'aprobado', label: 'Aprobado' },
          { value: 'rechazado', label: 'Rechazado' },
          { value: 'liquidado', label: 'Pagado' },
        ],
      },
      { key: 'iva', label: 'IVA', type: 'money' },
      { key: 'total', label: 'Total', type: 'money' },
    ],
  },
  {
    key: 'apuntes',
    label: 'Apuntes contables',
    description: 'Movimientos del libro diario por cuenta.',
    module: 'cnt',
    perm: 'cnt.ver',
    dateField: 'fecha',
    columns: [
      { key: 'fecha', label: 'Fecha', type: 'date' },
      { key: 'mes', label: 'Mes', type: 'text', group: true },
      { key: 'asiento', label: 'Asiento', type: 'number' },
      { key: 'cuenta', label: 'Cuenta', type: 'text', group: true, filter: true },
      { key: 'nombreCuenta', label: 'Nombre de la cuenta', type: 'text', group: true },
      { key: 'grupo', label: 'Grupo', type: 'text', group: true, filter: true },
      { key: 'concepto', label: 'Concepto', type: 'text' },
      { key: 'centroCoste', label: 'Centro de coste', type: 'text', group: true, filter: true },
      { key: 'debe', label: 'Debe', type: 'money' },
      { key: 'haber', label: 'Haber', type: 'money' },
    ],
  },
];

export function biDataset(key: string) {
  return BI_DATASETS.find((d) => d.key === key);
}

export const BI_PERIODOS = enumOptions([
  { value: 'mes_actual', label: 'Mes actual' },
  { value: 'mes_anterior', label: 'Mes anterior' },
  { value: 'trimestre_actual', label: 'Trimestre actual' },
  { value: 'anio_actual', label: 'Año en curso' },
  { value: 'anio_anterior', label: 'Año anterior' },
  { value: 'ultimos_30', label: 'Últimos 30 días' },
  { value: 'ultimos_12m', label: 'Últimos 12 meses' },
  { value: 'personalizado', label: 'Fechas concretas' },
] as const);

export const BI_PROGRAMACION = enumOptions([
  { value: 'ninguna', label: 'Sin envío automático' },
  { value: 'diaria', label: 'Cada día' },
  { value: 'semanal', label: 'Cada lunes' },
  { value: 'mensual', label: 'El día 1 de cada mes' },
] as const);

export interface BiFiltros {
  periodo: (typeof BI_PERIODOS)[number]['value'];
  desde?: string | null;
  hasta?: string | null;
  /** Filtros de igualdad por columna. */
  campos?: Record<string, string>;
}

/** Fechas de un periodo relativo a `hoy` (AAAA-MM-DD). */
export function rangoPeriodo(f: Pick<BiFiltros, 'periodo' | 'desde' | 'hasta'>, hoy = new Date().toISOString().slice(0, 10)): { desde: string; hasta: string } {
  const [y, m] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const first = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm - 1, 1)));
  const last = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm, 0)));
  switch (f.periodo) {
    case 'mes_actual':
      return { desde: first(y, m), hasta: last(y, m) };
    case 'mes_anterior':
      return m === 1 ? { desde: first(y - 1, 12), hasta: last(y - 1, 12) } : { desde: first(y, m - 1), hasta: last(y, m - 1) };
    case 'trimestre_actual': {
      const q = Math.floor((m - 1) / 3);
      return { desde: first(y, q * 3 + 1), hasta: last(y, q * 3 + 3) };
    }
    case 'anio_actual':
      return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
    case 'anio_anterior':
      return { desde: `${y - 1}-01-01`, hasta: `${y - 1}-12-31` };
    case 'ultimos_30':
      return { desde: iso(new Date(Date.parse(hoy) - 29 * 86400_000)), hasta: hoy };
    case 'ultimos_12m':
      return { desde: first(m === 12 ? y : y - 1, m === 12 ? 1 : m + 1), hasta: hoy };
    default:
      return { desde: f.desde || `${y}-01-01`, hasta: f.hasta || hoy };
  }
}
