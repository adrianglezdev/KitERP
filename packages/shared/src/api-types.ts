import type { Scope } from './permissions';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Etiquetas de las referencias de las filas: refs[destino][id] = etiqueta */
  refs?: Record<string, Record<string, string>>;
}

export interface SessionInfo {
  user: {
    id: string;
    email: string;
    personaId: string | null;
    nombre: string;
    iniciales: string;
    fotoUrl: string | null;
    rol: { id: string; nombre: string } | null;
    departamento: { id: string; nombre: string } | null;
    tieneEquipo: boolean;
    totp: boolean;
  };
  empresa: { id: string; nombre: string; nif: string | null; logoUrl: string | null };
  empresas: { id: string; nombre: string }[];
  permisos: Record<string, Scope>;
  modulos: string[];
}

export interface TimelineEntry {
  id: string;
  modulo: string;
  tipo: string;
  icono: string;
  titulo: string;
  detalle?: string | null;
  fecha: string;
  enlace?: string | null;
  autor?: string | null;
  tone?: string;
}

export interface SearchResult {
  id: string;
  modulo: string;
  tipo: string;
  titulo: string;
  subtitulo?: string | null;
  enlace: string;
  icono: string;
}

export type WidgetData =
  | { kind: 'stat'; value: string | number; format?: 'money' | 'number' | 'percent' | 'hours'; delta?: number | null; hint?: string | null; enlace?: string }
  | { kind: 'list'; items: { titulo: string; subtitulo?: string; valor?: string; enlace?: string; tone?: string }[]; vacio?: string; enlace?: string }
  | { kind: 'chart'; chart: 'bar' | 'line' | 'area' | 'pie'; data: Record<string, string | number>[]; xKey: string; series: { key: string; label: string; color?: string }[]; format?: 'money' | 'number' | 'hours' };

export interface DashboardWidget {
  id: string;
  modulo: string;
  titulo: string;
  size: 'sm' | 'md' | 'lg';
  data: WidgetData;
}

export interface ApprovalItem {
  id: string;
  modulo: string;
  tipo: string;
  titulo: string;
  detalle?: string | null;
  solicitante?: string | null;
  fecha: string;
  enlace?: string | null;
  aprobarUrl: string;
  rechazarUrl: string;
}
