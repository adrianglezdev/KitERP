import { DOC_COMPRA, DOC_ESTADOS, DOC_MODULO, DOC_TIPOS, optionLabel, type DocTipo } from '@kite/shared';

/** Ruta del listado de cada tipo de documento (la registra el módulo propietario). */
export const DOC_LIST_PATH: Record<DocTipo, string> = {
  presupuesto: '/presupuestos',
  pedido: '/pedidos',
  albaran: '/albaranes',
  factura: '/facturas',
  factura_rectificativa: '/facturas',
  factura_simplificada: '/facturas',
  proforma: '/facturas',
  pedido_compra: '/compras/pedidos',
  recepcion: '/compras/recepciones',
  factura_proveedor: '/compras/facturas',
};

export const tipoLabel = (t: string) => optionLabel(DOC_TIPOS, t)?.label ?? t;
export const estadoOpt = (tipo: string, estado: string) => optionLabel(DOC_ESTADOS[tipo as DocTipo], estado);
export const esCompra = (t: string) => DOC_COMPRA.includes(t as DocTipo);
export const moduloDoc = (t: string) => DOC_MODULO[t as DocTipo];

export function permisoEditarDoc(tipo: string) {
  const m = moduloDoc(tipo);
  if (m === 'cpr') return tipo === 'recepcion' ? ['cpr.recibir', 'cpr.editar'] : ['cpr.editar'];
  return [`${m}.editar`];
}
