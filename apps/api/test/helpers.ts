import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';

export const PASSWORD = 'Kite2026demo';
let app: FastifyInstance | null = null;

export async function getApp() {
  app ??= await buildApp({ logger: false });
  return app;
}

const cookies = new Map<string, string>();

/** Inicia sesión (una vez por usuario y ejecución) y devuelve un cliente con la cookie de sesión. */
export async function as(email: string) {
  const a = await getApp();
  let cookie = cookies.get(email);
  if (!cookie) {
    const r = await a.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } });
    if (r.statusCode !== 200) throw new Error(`login ${email}: ${r.statusCode} ${r.body}`);
    cookie = String(r.headers['set-cookie']).split(';')[0]!;
    cookies.set(email, cookie);
  }
  const call = async (method: string, url: string, payload?: unknown) => {
    const res = await a.inject({ method: method as any, url, payload: payload as any, headers: { cookie } });
    let body: any = null;
    try {
      body = res.json();
    } catch {
      body = res.body;
    }
    return { status: res.statusCode, body };
  };
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, p?: unknown) => call('POST', url, p ?? {}),
    put: (url: string, p?: unknown) => call('PUT', url, p),
    patch: (url: string, p?: unknown) => call('PATCH', url, p),
    del: (url: string) => call('DELETE', url),
  };
}
