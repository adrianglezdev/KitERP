import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { scopeRank, type Scope, type SessionInfo } from '@kite/shared';
import { api, setUnauthorizedHandler } from './api';

interface SessionCtx {
  session: SessionInfo | null;
  loading: boolean;
  /** ¿Tiene el permiso (con al menos ese alcance)? */
  can: (perm: string | string[], min?: Scope) => boolean;
  /** Alcance concedido para un permiso. */
  scope: (perm: string) => Scope | undefined;
  /** ¿Está activo el módulo? */
  has: (module: string) => boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<SessionInfo>('/auth/me'),
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.setQueryData(['session'], null);
      if (!location.pathname.startsWith('/login') && !isPublicPath(location.pathname)) {
        location.href = `/login?volver=${encodeURIComponent(location.pathname + location.search)}`;
      }
    });
  }, [qc]);

  const value = useMemo<SessionCtx>(() => {
    const s = q.data ?? null;
    const mods = new Set(s?.modulos ?? []);
    return {
      session: s,
      loading: q.isLoading,
      can: (perm, min = 'propio') => {
        if (!s) return false;
        const list = Array.isArray(perm) ? perm : [perm];
        return list.some((p) => scopeRank(s.permisos[p]) >= scopeRank(min));
      },
      scope: (perm) => s?.permisos[perm],
      has: (m) => m === 'core' || mods.has(m),
      refresh: () => q.refetch(),
      logout: async () => {
        await api.post('/auth/logout');
        qc.clear();
        location.href = '/login';
      },
    };
  }, [q.data, q.isLoading, qc, q]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession fuera de SessionProvider');
  return c;
}

export function isPublicPath(p: string) {
  return /^\/(p|firmar|canal|publico)\//.test(p);
}
