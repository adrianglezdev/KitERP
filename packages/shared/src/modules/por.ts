// Recursos del módulo POR (Portal del empleado). No tiene tablas propias: agrega datos de otros módulos.

export interface PortalResumen {
  persona: { id: string; nombre: string; puesto: string | null; departamento: string | null; responsable: string | null } | null;
  jornada: { estado: 'fuera' | 'trabajando' | 'pausa'; desde: string | null; horasHoy: number; horasSemana: number; previstasSemana: number } | null;
  turnos: { fecha: string; turno: string | null; horario: string | null; color: string | null; festivo: string | null; ausencia: string | null }[] | null;
  vacaciones: { disponibles: number; asignados: number; pendientes: number; unidad: string; proxima: { desde: string; hasta: string; tipo: string; estado: string } | null } | null;
  nominas: { ultimo: { id: string; titulo: string; publicadoEn: string; leido: boolean } | null; sinLeer: number } | null;
  firmasPendientes: number;
  avisosSinLeer: number;
  datosPendientes: boolean;
}
