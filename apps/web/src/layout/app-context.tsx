import { createContext, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { AppInfo, AppItem } from './apps';

export interface AppCtx {
  /** Aplicaciones a las que puede entrar la persona. */
  apps: AppInfo[];
  /** Aplicación en la que está ahora. */
  app: AppInfo | null;
  /** Apartado de esa aplicación que corresponde a la dirección actual (null en fichas y detalles). */
  item: AppItem | null;
  /** Una pantalla sin apartado propio indica a qué aplicación pertenece (ver useClaimApp). */
  claim: (path: string, appId: string) => void;
}

const Ctx = createContext<AppCtx>({ apps: [], app: null, item: null, claim: () => {} });
export const AppContextProvider = Ctx.Provider;

/** Aplicación actual. Fuera del marco principal (páginas públicas, login) devuelve `app: null`. */
export const useCurrentApp = () => useContext(Ctx);

/**
 * Para pantallas cuya dirección no dice de qué aplicación son (un documento puede ser un
 * presupuesto, una factura o un pedido de compra): al conocer el dato, la pantalla lo indica y la
 * barra lateral enseña esa aplicación.
 */
export function useClaimApp(appId: string | null | undefined) {
  const { claim } = useContext(Ctx);
  const { pathname } = useLocation();
  useEffect(() => {
    if (appId) claim(pathname, appId);
  }, [appId, pathname, claim]);
}
