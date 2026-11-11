import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { config } from './config';
import { registerAuth } from './core/auth';
import { HttpError, moduleDisabled, pgErrorToHttp, validationError } from './core/errors';
import { registerEventHandlers } from './core/events';
import { registerEntity } from './core/entities';
import { registerRefTarget } from './core/refs';
import { moduleDefs } from './modules/registry';
import { coreRoutes } from './routes';
import { registerCoreRefTargets } from './routes/refs-core';
import { CORE_MODULE_CODES } from '@kite/shared';

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? { level: config.isProd ? 'info' : 'warn' },
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } });
  await app.register(cors, { origin: config.isProd ? false : true, credentials: true });
  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 10 } });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });

  // Respuestas de archivo devueltas como { __file, buffer, mime, name }
  app.addHook('preSerialization', async (_req, reply, payload: any) => {
    if (payload && payload.__file) {
      reply.header('content-type', payload.mime);
      reply.header('content-disposition', `${payload.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(payload.name)}`);
      return payload.buffer;
    }
    return payload;
  });

  app.setErrorHandler((err: any, req, reply) => {
    let e: HttpError | null = null;
    if (err instanceof HttpError) e = err;
    else if (err instanceof ZodError) e = validationError(err);
    else e = pgErrorToHttp(err);
    if (!e && err.statusCode && err.statusCode < 500) e = new HttpError(err.statusCode, err.message, err.code ?? 'error');
    if (!e) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Ha ocurrido un error inesperado. Si se repite, avisa al administrador.', code: 'internal' });
    }
    return reply.status(e.status).send({ error: e.message, code: e.code, details: e.details });
  });

  registerAuth(app);

  app.get('/api/health', { config: { public: true } }, async () => ({ ok: true, time: new Date().toISOString() }));

  // Destinos de referencia y entidades del núcleo
  registerCoreRefTargets();

  // Módulos
  registerEventHandlers(moduleDefs);
  for (const def of moduleDefs) {
    for (const [name, t] of Object.entries(def.refTargets ?? {})) registerRefTarget(name, { module: def.code, ...t });
    for (const [name, g] of Object.entries(def.entities ?? {})) registerEntity(name, g);
  }

  await app.register(coreRoutes, { prefix: '/api' });

  for (const def of moduleDefs) {
    if (!def.routes) continue;
    const routes = def.routes;
    await app.register(
      async (scope) => {
        if (!CORE_MODULE_CODES.includes(def.code as never))
          scope.addHook('preHandler', async (req) => {
            const cfg = (req.routeOptions?.config ?? {}) as { public?: boolean };
            if (cfg.public) return;
            if (!req.ctx?.modules.has(def.code)) throw moduleDisabled(def.code);
          });
        await routes(scope);
      },
      { prefix: `/api/${def.code}` },
    );
  }

  // En producción la API también puede servir la web compilada (despliegue de un solo proceso)
  const webDist = path.resolve(process.cwd(), process.env.WEB_DIST ?? '../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'No encontrado', code: 'not_found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
