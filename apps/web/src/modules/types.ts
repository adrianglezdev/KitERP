import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Permiso(s) necesarios para ver la entrada. */
  perm?: string | string[];
  /** URL de la API que devuelve { n: number } para mostrar un contador. */
  badgeUrl?: string;
  end?: boolean;
}

export interface EntityTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  perm?: string | string[];
  component: ComponentType<{ id: string; record: any }>;
}

export interface PortalTile {
  label: string;
  description?: string;
  to: string;
  icon: LucideIcon;
  perm?: string | string[];
}

export interface QuickAction {
  label: string;
  to: string;
  icon: LucideIcon;
  perm?: string | string[];
}

/** Lo que cada módulo aporta a la web. Solo se muestra si el módulo está activo para la empresa. */
export interface ModuleWeb {
  code: string;
  nav?: NavItem[];
  routes?: RouteObject[];
  /** Accesos en el Portal del empleado y en el inicio del móvil. */
  portal?: PortalTile[];
  /** Entradas del botón "Crear" de la barra superior. */
  quickCreate?: QuickAction[];
  /** Pestañas adicionales en las fichas del núcleo. */
  entityTabs?: Partial<Record<'persona' | 'tercero' | 'articulo', EntityTab[]>>;
}

export function defineModule(m: ModuleWeb): ModuleWeb {
  return m;
}
