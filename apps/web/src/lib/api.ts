/** Cliente HTTP de la API. Siempre envía la cookie de sesión y traduce los errores a mensajes legibles. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: { fields?: Record<string, string>; [k: string]: unknown },
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown, opts: { raw?: boolean } = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(url.startsWith('/api') ? url : `/api${url}`, {
    method,
    credentials: 'include',
    headers: body !== undefined && !isForm ? { 'content-type': 'application/json' } : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  if (opts.raw) {
    if (!res.ok) throw new ApiError(res.status, 'No se ha podido descargar');
    return res as unknown as T;
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    if (res.status === 401 && !url.includes('/auth/login')) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? `Error ${res.status}`, data?.code, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T = any>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T = any>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T = any>(url: string) => request<T>('DELETE', url),
  raw: (url: string) => request<Response>('GET', url, undefined, { raw: true }),
};

/** Construye una query string ignorando valores vacíos. */
export function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Descarga un archivo de la API (Excel, PDF, XML…) respetando el nombre que envía el servidor. */
export async function download(url: string, fallbackName = 'descarga') {
  const res = await api.raw(url);
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const name = m ? decodeURIComponent(m[1]!) : fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Sube archivos y devuelve sus ids. */
export async function uploadFiles(files: File[] | FileList) {
  const fd = new FormData();
  Array.from(files).forEach((f) => fd.append('file', f, f.name));
  return api.post<{ id: string; nombre: string; mime: string; tamano: number; url: string }[]>('/archivos', fd);
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Ha ocurrido un error';
}
