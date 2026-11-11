import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { docRoutes } from './doc';
import { documentosRoutes } from './documentos';
import { filesRoutes } from './files';
import { hubRoutes } from './hub';
import { integracionesRoutes } from './integraciones';
import { msgRoutes } from './msg';
import { orgRoutes } from './org';
import { tercerosRoutes } from './terceros';
import { usuariosRoutes } from './usuarios';

/** Rutas del núcleo (siempre activas). Los módulos montan las suyas en /api/<código>. */
export async function coreRoutes(app: FastifyInstance) {
  await app.register(authRoutes);
  await app.register(orgRoutes);
  await app.register(usuariosRoutes);
  await app.register(tercerosRoutes);
  await app.register(filesRoutes);
  await app.register(msgRoutes);
  await app.register(docRoutes);
  await app.register(hubRoutes);
  await app.register(integracionesRoutes);
  await app.register(documentosRoutes);
}
