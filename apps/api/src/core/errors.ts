import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'bad_request', details);
export const unauthorized = (msg = 'Tienes que iniciar sesión') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = 'No tienes permiso para hacer esto') => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'No encontrado') => new HttpError(404, msg, 'not_found');
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, 'conflict', details);
export const moduleDisabled = (code: string) => new HttpError(403, `El módulo ${code.toUpperCase()} no está activo en esta empresa`, 'module_disabled');

/** Valida con zod y devuelve un 400 con los campos erróneos en lenguaje claro. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw validationError(r.error);
  return r.data;
}

export function validationError(e: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = Object.entries(fields)[0];
  return badRequest(first ? `Revisa el campo ${first[0]}: ${first[1]}` : 'Datos no válidos', { fields });
}

/** Traduce errores de PostgreSQL a mensajes comprensibles. */
export function pgErrorToHttp(err: any): HttpError | null {
  const code = err?.code ?? err?.cause?.code;
  const detail = err?.detail ?? err?.cause?.detail;
  const message = err?.message ?? err?.cause?.message;
  if (!code) return null;
  switch (code) {
    case '23505':
      return conflict('Ya existe un registro con esos datos', { detail });
    case '23503':
      return conflict('Este registro está relacionado con otros y no se puede borrar o falta una referencia', { detail });
    case '23502':
      return badRequest('Falta un dato obligatorio', { detail: message });
    case '22P02':
      return badRequest('Formato de dato no válido');
    case 'P0001': // RAISE EXCEPTION desde disparadores
      return conflict(message);
    default:
      return null;
  }
}
