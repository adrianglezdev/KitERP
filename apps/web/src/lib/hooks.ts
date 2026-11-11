import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from './api';

/** GET con caché. La clave es la propia URL, así que invalidar por prefijo es sencillo. */
export function useApi<T = any>(url: string | null, opts: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> = {}) {
  return useQuery<T>({
    queryKey: [url],
    queryFn: () => api.get<T>(url!),
    enabled: !!url && (opts.enabled ?? true),
    ...opts,
  });
}

/**
 * Mutación con aviso de éxito/error e invalidación de las consultas cuyo URL empiece por alguno de `invalidate`.
 */
export function useMut<TVars = any, TRes = any>(
  fn: (vars: TVars) => Promise<TRes>,
  opts: { ok?: string | ((r: TRes) => string | null); invalidate?: string[]; onSuccess?: (r: TRes, v: TVars) => void; onError?: (e: unknown) => void; silent?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation<TRes, unknown, TVars>({
    mutationFn: fn,
    onSuccess: (r, v) => {
      const msg = typeof opts.ok === 'function' ? opts.ok(r) : opts.ok;
      if (msg) toast.success(msg);
      for (const prefix of opts.invalidate ?? []) invalidatePrefix(qc, prefix);
      opts.onSuccess?.(r, v);
    },
    onError: (e) => {
      if (!opts.silent) toast.error(errorMessage(e));
      opts.onError?.(e);
    },
  });
}

export function invalidatePrefix(qc: ReturnType<typeof useQueryClient>, prefix: string) {
  qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith(prefix) });
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [q]);
  return m;
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');

/** Estado persistido en localStorage (conveniencias del usuario: filtros, vistas…). */
export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* sin almacenamiento */
    }
  }, [key, v]);
  return [v, setV] as const;
}

export type { QueryKey };
export { api };
