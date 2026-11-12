import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type { Preferencias } from '@kite/shared';
import { archivedAt, createdAt, day, flag, money, pct, pk, price, ts, updatedAt } from '../helpers';

/* ───────────────────────── Empresa y organización ───────────────────────── */

export const empresas = pgTable('empresas', {
  id: pk(),
  nombre: text().notNull(),
  razonSocial: text(),
  nif: text(),
  direccion: text(),
  codigoPostal: text(),
  localidad: text(),
  provincia: text(),
  pais: text().notNull().default('ES'),
  telefono: text(),
  email: text(),
  web: text(),
  logoArchivoId: uuid(),
  iban: text(),
  bic: text(),
  sufijoSepa: text().notNull().default('000'),
  colorMarca: text(),
  /** Ajustes de negocio (umbral de aprobación de compras, margen mínimo, €/km, etc.) */
  ajustes: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  creadoEn: createdAt(),
  actualizadoEn: updatedAt(),
});

export const centros = pgTable(
  'centros',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    direccion: text(),
    codigoPostal: text(),
    localidad: text(),
    provincia: text(),
    comunidad: text(),
    telefono: text(),
    lat: price(),
    lng: price(),
    radioGeovalla: integer().notNull().default(150),
    activo: flag(true),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.empresaId)],
);

export const departamentos = pgTable(
  'departamentos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    descripcion: text(),
    responsableId: uuid().references((): AnyPgColumn => personas.id),
    color: text().notNull().default('#7D2CDD'),
    email: text(),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.empresaId)],
);

export const personas = pgTable(
  'personas',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    apellidos: text(),
    email: text(),
    telefono: text(),
    fotoArchivoId: uuid(),
    codigoEmpleado: text(),
    puesto: text(),
    departamentoId: uuid().references(() => departamentos.id),
    centroId: uuid().references(() => centros.id),
    responsableId: uuid().references((): AnyPgColumn => personas.id),
    activo: flag(true),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    index().on(t.empresaId, t.activo),
    index().on(t.responsableId),
    index().on(t.departamentoId),
    index('personas_nombre_trgm').using('gin', sql`(coalesce(${t.nombre},'') || ' ' || coalesce(${t.apellidos},'')) gin_trgm_ops`),
  ],
);

/* ───────────────────────── Usuarios, roles y sesiones ───────────────────────── */

export const usuarios = pgTable(
  'usuarios',
  {
    id: pk(),
    email: text().notNull(),
    passwordHash: text().notNull(),
    totpSecreto: text(),
    totpActivo: flag(false),
    activo: flag(true),
    intentosFallidos: integer().notNull().default(0),
    bloqueadoHasta: ts(),
    ultimoAcceso: ts(),
    debeCambiarPassword: flag(false),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
  },
  (t) => [uniqueIndex('usuarios_email_uq').on(sql`lower(${t.email})`)],
);

export const roles = pgTable(
  'roles',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    clave: text(),
    nombre: text().notNull(),
    descripcion: text(),
    sistema: flag(false),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId)],
);

export const rolPermisos = pgTable(
  'rol_permisos',
  {
    rolId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permiso: text().notNull(),
    alcance: text().notNull().default('todo'),
  },
  (t) => [primaryKey({ columns: [t.rolId, t.permiso] })],
);

/** Acceso de un usuario a una empresa: con qué persona se corresponde y con qué rol. */
export const usuarioEmpresas = pgTable(
  'usuario_empresas',
  {
    id: pk(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    empresaId: uuid().notNull().references(() => empresas.id),
    personaId: uuid().references(() => personas.id),
    rolId: uuid().references(() => roles.id),
    activo: flag(true),
    accesoHasta: day(),
    /** Preferencias de la persona en esta empresa (aplicaciones favoritas del lanzador…). */
    preferencias: jsonb().$type<Preferencias>().notNull().default({}),
    creadoEn: createdAt(),
  },
  (t) => [uniqueIndex().on(t.usuarioId, t.empresaId), index().on(t.personaId)],
);

export const usuarioPermisos = pgTable(
  'usuario_permisos',
  {
    usuarioEmpresaId: uuid()
      .notNull()
      .references(() => usuarioEmpresas.id, { onDelete: 'cascade' }),
    permiso: text().notNull(),
    alcance: text().notNull().default('todo'),
  },
  (t) => [primaryKey({ columns: [t.usuarioEmpresaId, t.permiso] })],
);

export const sesiones = pgTable(
  'sesiones',
  {
    id: text().primaryKey(), // sha256 del token
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    empresaId: uuid().notNull().references(() => empresas.id),
    expiraEn: ts().notNull(),
    ultimoUso: ts().notNull().defaultNow(),
    ip: text(),
    userAgent: text(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.usuarioId)],
);

export const modulosEmpresa = pgTable(
  'modulos_empresa',
  {
    empresaId: uuid().notNull().references(() => empresas.id),
    modulo: text().notNull(),
    activo: flag(true),
    cambiadoEn: ts().notNull().defaultNow(),
    cambiadoPor: uuid(),
  },
  (t) => [primaryKey({ columns: [t.empresaId, t.modulo] })],
);

/* ───────────────────────── Terceros (clientes, proveedores) y contactos ───────────────────────── */

export const formasPago = pgTable('formas_pago', {
  id: pk(),
  empresaId: uuid().notNull().references(() => empresas.id),
  nombre: text().notNull(),
  tipo: text().notNull().default('transferencia'),
  plazos: jsonb().$type<{ dias: number; porcentaje: number }[]>().notNull().default([{ dias: 30, porcentaje: 100 }]),
  activo: flag(true),
  creadoEn: createdAt(),
});

export const tarifas = pgTable('tarifas', {
  id: pk(),
  empresaId: uuid().notNull().references(() => empresas.id),
  nombre: text().notNull(),
  tipo: text().notNull().default('descuento'),
  porcentaje: pct(),
  activo: flag(true),
  creadoEn: createdAt(),
});

export const terceros = pgTable(
  'terceros',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text(),
    nombre: text().notNull(),
    razonSocial: text(),
    nif: text(),
    esCliente: flag(true),
    esProveedor: flag(false),
    estado: text().notNull().default('cliente'),
    email: text(),
    telefono: text(),
    web: text(),
    direccion: text(),
    codigoPostal: text(),
    localidad: text(),
    provincia: text(),
    pais: text().notNull().default('ES'),
    comercialId: uuid().references(() => personas.id),
    formaPagoId: uuid().references(() => formasPago.id),
    diaPago: integer(),
    tarifaId: uuid().references(() => tarifas.id),
    descuento: pct(),
    riesgoMax: money(),
    regimenIva: text().notNull().default('general'),
    retencion: pct(),
    iban: text(),
    mandatoSepa: text(),
    mandatoFecha: day(),
    cuentaCliente: text(),
    cuentaProveedor: text(),
    etiquetas: text().array().notNull().default(sql`'{}'::text[]`),
    notas: text(),
    rgpdConsentimiento: flag(false),
    portalToken: text(),
    creadoPor: uuid(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    index().on(t.empresaId, t.estado),
    index().on(t.comercialId),
    index().on(t.empresaId, t.nif),
    index('terceros_busqueda_trgm').using(
      'gin',
      sql`(coalesce(${t.nombre},'') || ' ' || coalesce(${t.razonSocial},'') || ' ' || coalesce(${t.nif},'') || ' ' || coalesce(${t.email},'')) gin_trgm_ops`,
    ),
    index().using('gin', t.etiquetas),
  ],
);

export const direcciones = pgTable(
  'direcciones',
  {
    id: pk(),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id, { onDelete: 'cascade' }),
    nombre: text().notNull(),
    direccion: text(),
    codigoPostal: text(),
    localidad: text(),
    provincia: text(),
    pais: text().notNull().default('ES'),
    telefono: text(),
    lat: price(),
    lng: price(),
    principal: flag(false),
  },
  (t) => [index().on(t.terceroId)],
);

export const contactos = pgTable(
  'contactos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    terceroId: uuid()
      .notNull()
      .references(() => terceros.id),
    nombre: text().notNull(),
    apellidos: text(),
    cargo: text(),
    rol: text().notNull().default('general'),
    email: text(),
    telefono: text(),
    movil: text(),
    principal: flag(false),
    notas: text(),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    index().on(t.terceroId),
    index('contactos_busqueda_trgm').using(
      'gin',
      sql`(coalesce(${t.nombre},'') || ' ' || coalesce(${t.apellidos},'') || ' ' || coalesce(${t.email},'')) gin_trgm_ops`,
    ),
  ],
);

/* ───────────────────────── Catálogo ───────────────────────── */

export const familias = pgTable('familias', {
  id: pk(),
  empresaId: uuid().notNull().references(() => empresas.id),
  nombre: text().notNull(),
  padreId: uuid().references((): AnyPgColumn => familias.id),
  cuentaVentas: text(),
  cuentaCompras: text(),
  creadoEn: createdAt(),
  archivadoEn: archivedAt(),
});

export const articulos = pgTable(
  'articulos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    referencia: text().notNull(),
    nombre: text().notNull(),
    tipo: text().notNull().default('producto'),
    familiaId: uuid().references(() => familias.id),
    descripcion: text(),
    unidad: text().notNull().default('ud'),
    precioVenta: price().notNull().default(0),
    coste: price().notNull().default(0),
    ivaTipo: pct().notNull().default(21),
    ean: text(),
    proveedorId: uuid().references(() => terceros.id),
    marca: text(),
    modelo: text(),
    controlaStock: flag(true),
    activo: flag(true),
    imagenArchivoId: uuid(),
    creadoEn: createdAt(),
    actualizadoEn: updatedAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [
    uniqueIndex('articulos_ref_uq').on(t.empresaId, t.referencia),
    index().on(t.empresaId, t.ean),
    index().on(t.familiaId),
    index('articulos_busqueda_trgm').using(
      'gin',
      sql`(coalesce(${t.referencia},'') || ' ' || coalesce(${t.nombre},'') || ' ' || coalesce(${t.marca},'') || ' ' || coalesce(${t.modelo},'')) gin_trgm_ops`,
    ),
  ],
);

export const tarifaPrecios = pgTable(
  'tarifa_precios',
  {
    tarifaId: uuid()
      .notNull()
      .references(() => tarifas.id, { onDelete: 'cascade' }),
    articuloId: uuid()
      .notNull()
      .references(() => articulos.id, { onDelete: 'cascade' }),
    precio: price().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tarifaId, t.articuloId] })],
);

/* ───────────────────────── Configuración común ───────────────────────── */

/** Numeración correlativa sin huecos: se bloquea la fila al asignar número. */
export const series = pgTable(
  'series',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    tipo: text().notNull(), // tipo de documento o clave (p. ej. "sat_orden")
    codigo: text().notNull(), // p. ej. "F"
    nombre: text().notNull(),
    anio: integer().notNull(),
    siguiente: integer().notNull().default(1),
    digitos: integer().notNull().default(5),
    porDefecto: flag(true),
    activo: flag(true),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.tipo, t.codigo, t.anio)],
);

export const festivos = pgTable(
  'festivos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    fecha: day().notNull(),
    nombre: text().notNull(),
    ambito: text().notNull().default('nacional'),
    centroId: uuid().references(() => centros.id),
  },
  (t) => [index().on(t.empresaId, t.fecha)],
);

/* ───────────────────────── Archivos y documentos adjuntos (DOC) ───────────────────────── */

/** Archivos guardados en disco por su huella SHA-256 (sin duplicados, con verificación de integridad). */
export const archivos = pgTable(
  'archivos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    nombre: text().notNull(),
    mime: text().notNull(),
    tamano: bigint({ mode: 'number' }).notNull(),
    sha256: text().notNull(),
    ruta: text().notNull(),
    subidoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.sha256)],
);

export const adjuntos = pgTable(
  'adjuntos',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    entidad: text().notNull(),
    entidadId: uuid().notNull(),
    archivoId: uuid()
      .notNull()
      .references(() => archivos.id),
    carpeta: text(),
    descripcion: text(),
    caduca: day(),
    grupoId: uuid(),
    version: integer().notNull().default(1),
    subidoPor: uuid(),
    creadoEn: createdAt(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.entidad, t.entidadId), index().on(t.empresaId, t.caduca)],
);

export const plantillas = pgTable('plantillas', {
  id: pk(),
  empresaId: uuid().notNull().references(() => empresas.id),
  nombre: text().notNull(),
  tipo: text().notNull().default('documento'),
  entidad: text().notNull().default('persona'),
  contenido: text().notNull(),
  activo: flag(true),
  creadoEn: createdAt(),
  actualizadoEn: updatedAt(),
});

export const firmas = pgTable(
  'firmas',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    titulo: text().notNull(),
    archivoId: uuid().references(() => archivos.id),
    contenido: text(),
    entidad: text(),
    entidadId: uuid(),
    firmanteNombre: text().notNull(),
    firmanteEmail: text(),
    personaId: uuid().references(() => personas.id),
    tokenHash: text().notNull(),
    estado: text().notNull().default('pendiente'),
    expiraEn: ts(),
    firmadoEn: ts(),
    ip: text(),
    userAgent: text(),
    firmaImagen: text(),
    evidenciaHash: text(),
    archivoFirmadoId: uuid().references(() => archivos.id),
    creadoPor: uuid(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.estado), index().on(t.entidad, t.entidadId), uniqueIndex().on(t.tokenHash)],
);

/* ───────────────────────── Comunicación (MSG) ───────────────────────── */

export const comentarios = pgTable(
  'comentarios',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    entidad: text().notNull(),
    entidadId: uuid().notNull(),
    usuarioId: uuid().notNull(),
    personaId: uuid(),
    texto: text().notNull(),
    menciones: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    creadoEn: createdAt(),
    editadoEn: ts(),
  },
  (t) => [index().on(t.entidad, t.entidadId, t.creadoEn)],
);

export const tareas = pgTable(
  'tareas',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    titulo: text().notNull(),
    descripcion: text(),
    asignadoA: uuid().references(() => personas.id),
    creadoPor: uuid(),
    entidad: text(),
    entidadId: uuid(),
    vence: day(),
    prioridad: text().notNull().default('normal'),
    estado: text().notNull().default('pendiente'),
    completadaEn: ts(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.empresaId, t.asignadoA, t.estado), index().on(t.entidad, t.entidadId)],
);

export const notificaciones = pgTable(
  'notificaciones',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    modulo: text().notNull(),
    tipo: text().notNull(),
    titulo: text().notNull(),
    cuerpo: text(),
    enlace: text(),
    leidaEn: ts(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.usuarioId, t.leidaEn, t.creadoEn)],
);

export const anuncios = pgTable(
  'anuncios',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    titulo: text().notNull(),
    cuerpo: text().notNull(),
    departamentos: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    requiereConfirmacion: flag(false),
    fijado: flag(false),
    publicadoPor: uuid(),
    publicadoEn: createdAt(),
    caduca: day(),
    archivadoEn: archivedAt(),
  },
  (t) => [index().on(t.empresaId, t.publicadoEn)],
);

export const anuncioLecturas = pgTable(
  'anuncio_lecturas',
  {
    anuncioId: uuid()
      .notNull()
      .references(() => anuncios.id, { onDelete: 'cascade' }),
    personaId: uuid()
      .notNull()
      .references(() => personas.id),
    leidoEn: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.anuncioId, t.personaId] })],
);

export const denuncias = pgTable(
  'denuncias',
  {
    id: pk(),
    empresaId: uuid().notNull().references(() => empresas.id),
    codigo: text().notNull(),
    tokenHash: text().notNull(),
    categoria: text().notNull(),
    asunto: text().notNull(),
    descripcion: text().notNull(),
    anonima: flag(true),
    nombre: text(),
    email: text(),
    estado: text().notNull().default('recibida'),
    gestorId: uuid(),
    resolucion: text(),
    acuseEn: ts(),
    creadoEn: createdAt(),
    cerradaEn: ts(),
  },
  (t) => [uniqueIndex().on(t.codigo), index().on(t.empresaId, t.estado)],
);

export const denunciaMensajes = pgTable('denuncia_mensajes', {
  id: pk(),
  denunciaId: uuid()
    .notNull()
    .references(() => denuncias.id, { onDelete: 'cascade' }),
  autor: text().notNull(), // denunciante | gestor
  texto: text().notNull(),
  creadoEn: createdAt(),
});

export const encuestas = pgTable('encuestas', {
  id: pk(),
  empresaId: uuid().notNull().references(() => empresas.id),
  titulo: text().notNull(),
  descripcion: text(),
  preguntas: jsonb().$type<{ id: string; texto: string; tipo: 'escala' | 'opcion' | 'texto'; opciones?: string[] }[]>().notNull(),
  anonima: flag(true),
  abierta: flag(true),
  cierre: day(),
  creadoPor: uuid(),
  creadoEn: createdAt(),
});

export const encuestaParticipantes = pgTable(
  'encuesta_participantes',
  {
    encuestaId: uuid()
      .notNull()
      .references(() => encuestas.id, { onDelete: 'cascade' }),
    personaId: uuid().notNull(),
    respondidoEn: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.encuestaId, t.personaId] })],
);

export const encuestaRespuestas = pgTable('encuesta_respuestas', {
  id: pk(),
  encuestaId: uuid()
    .notNull()
    .references(() => encuestas.id, { onDelete: 'cascade' }),
  personaId: uuid(), // null si es anónima
  respuestas: jsonb().$type<Record<string, string | number>>().notNull(),
  creadoEn: createdAt(),
});

/* ───────────────────────── Integraciones (API) ───────────────────────── */

export const apiClaves = pgTable('api_claves', {
  id: pk(),
  empresaId: uuid().notNull().references(() => empresas.id),
  nombre: text().notNull(),
  prefijo: text().notNull(),
  hash: text().notNull(),
  permisos: jsonb().$type<Record<string, string>>().notNull().default({}),
  creadoPor: uuid(),
  ultimoUso: ts(),
  revocadaEn: ts(),
  creadoEn: createdAt(),
});

export const webhooks = pgTable('webhooks', {
  id: pk(),
  empresaId: uuid().notNull().references(() => empresas.id),
  url: text().notNull(),
  eventos: text().array().notNull(),
  secreto: text().notNull(),
  activo: flag(true),
  ultimoEstado: text(),
  ultimoEnvio: ts(),
  creadoEn: createdAt(),
});

/* ───────────────────────── Trazabilidad e infraestructura ───────────────────────── */

/** Registro de auditoría inalterable (un disparador impide modificarlo o borrarlo). */
export const auditoria = pgTable(
  'auditoria',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    empresaId: uuid(),
    usuarioId: uuid(),
    accion: text().notNull(),
    entidad: text().notNull(),
    entidadId: text(),
    cambios: jsonb(),
    ip: text(),
    creadoEn: createdAt(),
  },
  (t) => [index().on(t.entidad, t.entidadId), index('auditoria_creado_brin').using('brin', t.creadoEn), index().on(t.empresaId, t.usuarioId)],
);

/** Bandeja de salida de emails: se reintenta hasta enviarse; nunca se pierde un correo. */
export const emailsSalida = pgTable(
  'emails_salida',
  {
    id: pk(),
    empresaId: uuid(),
    para: text().notNull(),
    asunto: text().notNull(),
    html: text().notNull(),
    adjuntos: jsonb().$type<{ archivoId: string; nombre: string }[]>().notNull().default([]),
    estado: text().notNull().default('pendiente'),
    intentos: integer().notNull().default(0),
    error: text(),
    creadoEn: createdAt(),
    enviadoEn: ts(),
  },
  (t) => [index().on(t.estado, t.creadoEn)],
);

/** Control de tareas programadas: evita ejecutar dos veces la misma tarea del mismo periodo. */
export const tareasProgramadas = pgTable(
  'tareas_programadas',
  {
    tarea: text().notNull(),
    clave: text().notNull(),
    ejecutadoEn: createdAt(),
    resultado: text(),
  },
  (t) => [primaryKey({ columns: [t.tarea, t.clave] })],
);
