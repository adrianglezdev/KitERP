/**
 * Contratos de eventos entre módulos.
 * Un módulo publica lo que ha pasado; los módulos activos que estén suscritos reaccionan
 * dentro de la MISMA transacción, de modo que todo se guarda o no se guarda nada.
 * Si el módulo receptor está desactivado, el evento simplemente no tiene efecto.
 */

export interface LineaStock {
  lineaId?: string;
  articuloId: string;
  almacenId?: string | null;
  cantidad: number;
  coste?: number | null;
  lote?: string | null;
  caducidad?: string | null;
  series?: string[] | null;
}

export interface EventMap {
  /* Personas */
  'persona.creada': { personaId: string };
  'persona.baja': { personaId: string; fecha: string };

  /* Ventas (motor de documentos) */
  'ventas.pedido_confirmado': { documentoId: string; lineas: LineaStock[] };
  'ventas.pedido_liberado': { documentoId: string }; // cancelado o servido: liberar reservas
  'ventas.albaran_entregado': { documentoId: string; terceroId: string; origenTipo?: string | null; origenId?: string | null; lineas: LineaStock[] };
  'ventas.factura_emitida': { documentoId: string; terceroId: string; total: number; fecha: string };
  'ventas.presupuesto_aceptado': { documentoId: string; terceroId: string; oportunidadId?: string | null };

  /* Compras */
  'compras.recepcion_confirmada': { documentoId: string; terceroId: string; lineas: LineaStock[] };
  'compras.factura_registrada': { documentoId: string; terceroId: string; total: number; fecha: string };

  /* Tesorería */
  'tes.cobro_registrado': { vencimientoId: string; documentoId?: string | null; terceroId?: string | null; importe: number; fecha: string; cuentaContable: string };
  'tes.pago_registrado': { vencimientoId: string; documentoId?: string | null; terceroId?: string | null; importe: number; fecha: string; cuentaContable: string };

  /* Nóminas y gastos */
  'nom.periodo_cerrado': { periodoId: string; anio: number; mes: number; totales: { bruto: number; ssEmpresa: number; ssTrabajador: number; irpf: number; neto: number } };
  'gas.gasto_liquidado': { gastoId: string; personaId: string; importe: number; iva: number; fecha: string; via: 'nomina' | 'transferencia'; proyectoId?: string | null };

  /* Activos */
  'act.amortizacion': { activoId: string; importe: number; fecha: string; cuentaGasto: string; cuentaAmortizacion: string; concepto: string };

  /* Servicio técnico */
  'sat.orden_cerrada': { ordenId: string; terceroId: string; tecnicoId?: string | null; facturable: boolean; albaranId?: string | null };

  /* Proyectos */
  'pry.material_consumido': { proyectoId: string; lineas: LineaStock[] };
}

export type EventName = keyof EventMap;
