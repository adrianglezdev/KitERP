import { PERMISSIONS, type Scope } from '@kite/shared';

/** Contexto de la petición: quién es, en qué empresa está y qué puede hacer. */
export interface Ctx {
  empresaId: string;
  usuarioId: string;
  usuarioEmpresaId: string;
  personaId: string | null;
  departamentoId: string | null;
  nombre: string;
  perms: Map<string, Scope>;
  modules: Set<string>;
  isAdmin: boolean;
  ip: string | null;
  /** Personas de su equipo (él mismo + quienes dependen de él, en cualquier nivel). */
  teamIds(): Promise<string[]>;
  /** Personas de su departamento. */
  deptIds(): Promise<string[]>;
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: Ctx;
    sessionId?: string;
  }
}

/** Contexto de sistema para tareas programadas, semillas y eventos internos. */
export function systemCtx(empresaId: string, modules: Iterable<string>): Ctx {
  return {
    empresaId,
    usuarioId: '00000000-0000-0000-0000-000000000000',
    usuarioEmpresaId: '00000000-0000-0000-0000-000000000000',
    personaId: null,
    departamentoId: null,
    nombre: 'Sistema',
    perms: new Map(PERMISSIONS.map((p) => [p.key, 'todo' as Scope])),
    modules: new Set(modules),
    isAdmin: true,
    ip: null,
    teamIds: async () => [],
    deptIds: async () => [],
  };
}
