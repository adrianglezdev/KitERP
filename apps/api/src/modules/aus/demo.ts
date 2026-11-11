/** Ausencias de ejemplo (días relativos a hoy). Las usa el seed de AUS y el de HOR para no generar fichajes esos días. */
export const AUSENCIAS_DEMO: { key: string; tipo: string; desde: number; hasta: number; estado: string; medioDia?: 'manana' | 'tarde'; motivo?: string }[] = [
  { key: 'administracion', tipo: 'vacaciones', desde: -40, hasta: -33, estado: 'aprobada', motivo: 'Viaje familiar' },
  { key: 'tecnico1', tipo: 'baja_medica', desde: -20, hasta: -18, estado: 'aprobada', motivo: 'Gastroenteritis' },
  { key: 'rrhh', tipo: 'asuntos_propios', desde: -15, hasta: -15, estado: 'aprobada' },
  { key: 'almacen', tipo: 'vacaciones', desde: -12, hasta: -8, estado: 'aprobada' },
  { key: 'tecnico2', tipo: 'asuntos_propios', desde: -3, hasta: -3, estado: 'aprobada', medioDia: 'manana', motivo: 'Gestión en el banco' },
  { key: 'comercial1', tipo: 'vacaciones', desde: 0, hasta: 4, estado: 'aprobada', motivo: 'Puente' },
  { key: 'operario', tipo: 'asuntos_propios', desde: 7, hasta: 7, estado: 'pendiente', motivo: 'Mudanza' },
  { key: 'almacen', tipo: 'vacaciones', desde: 14, hasta: 18, estado: 'aprobada' },
  { key: 'jefesat', tipo: 'vacaciones', desde: 21, hasta: 30, estado: 'pendiente', motivo: 'Vacaciones de invierno' },
  { key: 'comercial2', tipo: 'no_retribuido', desde: 33, hasta: 35, estado: 'aprobada_responsable', motivo: 'Boda de un familiar en el extranjero' },
  { key: 'tecnico1', tipo: 'vacaciones', desde: 9, hasta: 11, estado: 'pendiente' },
];
