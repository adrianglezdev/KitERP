CREATE TABLE "adjuntos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid NOT NULL,
	"archivo_id" uuid NOT NULL,
	"carpeta" text,
	"descripcion" text,
	"caduca" date,
	"grupo_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"subido_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "anuncio_lecturas" (
	"anuncio_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"leido_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anuncio_lecturas_anuncio_id_persona_id_pk" PRIMARY KEY("anuncio_id","persona_id")
);
--> statement-breakpoint
CREATE TABLE "anuncios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"cuerpo" text NOT NULL,
	"departamentos" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"requiere_confirmacion" boolean DEFAULT false NOT NULL,
	"fijado" boolean DEFAULT false NOT NULL,
	"publicado_por" uuid,
	"publicado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"caduca" date,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_claves" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"prefijo" text NOT NULL,
	"hash" text NOT NULL,
	"permisos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_por" uuid,
	"ultimo_uso" timestamp with time zone,
	"revocada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "archivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"mime" text NOT NULL,
	"tamano" bigint NOT NULL,
	"sha256" text NOT NULL,
	"ruta" text NOT NULL,
	"subido_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articulos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"referencia" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'producto' NOT NULL,
	"familia_id" uuid,
	"descripcion" text,
	"unidad" text DEFAULT 'ud' NOT NULL,
	"precio_venta" numeric(14, 4) DEFAULT 0 NOT NULL,
	"coste" numeric(14, 4) DEFAULT 0 NOT NULL,
	"iva_tipo" numeric(6, 2) DEFAULT 21 NOT NULL,
	"ean" text,
	"proveedor_id" uuid,
	"marca" text,
	"modelo" text,
	"controla_stock" boolean DEFAULT true NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"imagen_archivo_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"empresa_id" uuid,
	"usuario_id" uuid,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" text,
	"cambios" jsonb,
	"ip" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"codigo_postal" text,
	"localidad" text,
	"provincia" text,
	"comunidad" text,
	"telefono" text,
	"lat" numeric(14, 4),
	"lng" numeric(14, 4),
	"radio_geovalla" integer DEFAULT 150 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "comentarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"persona_id" uuid,
	"texto" text NOT NULL,
	"menciones" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"editado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contactos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"apellidos" text,
	"cargo" text,
	"rol" text DEFAULT 'general' NOT NULL,
	"email" text,
	"telefono" text,
	"movil" text,
	"principal" boolean DEFAULT false NOT NULL,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "denuncia_mensajes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"denuncia_id" uuid NOT NULL,
	"autor" text NOT NULL,
	"texto" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "denuncias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"token_hash" text NOT NULL,
	"categoria" text NOT NULL,
	"asunto" text NOT NULL,
	"descripcion" text NOT NULL,
	"anonima" boolean DEFAULT true NOT NULL,
	"nombre" text,
	"email" text,
	"estado" text DEFAULT 'recibida' NOT NULL,
	"gestor_id" uuid,
	"resolucion" text,
	"acuse_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrada_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "departamentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"responsable_id" uuid,
	"color" text DEFAULT '#7D2CDD' NOT NULL,
	"email" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "direcciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tercero_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"codigo_postal" text,
	"localidad" text,
	"provincia" text,
	"pais" text DEFAULT 'ES' NOT NULL,
	"telefono" text,
	"lat" numeric(14, 4),
	"lng" numeric(14, 4),
	"principal" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails_salida" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid,
	"para" text NOT NULL,
	"asunto" text NOT NULL,
	"html" text NOT NULL,
	"adjuntos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"error" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"razon_social" text,
	"nif" text,
	"direccion" text,
	"codigo_postal" text,
	"localidad" text,
	"provincia" text,
	"pais" text DEFAULT 'ES' NOT NULL,
	"telefono" text,
	"email" text,
	"web" text,
	"logo_archivo_id" uuid,
	"iban" text,
	"bic" text,
	"sufijo_sepa" text DEFAULT '000' NOT NULL,
	"color_marca" text,
	"ajustes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encuesta_participantes" (
	"encuesta_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"respondido_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encuesta_participantes_encuesta_id_persona_id_pk" PRIMARY KEY("encuesta_id","persona_id")
);
--> statement-breakpoint
CREATE TABLE "encuesta_respuestas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"encuesta_id" uuid NOT NULL,
	"persona_id" uuid,
	"respuestas" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encuestas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"preguntas" jsonb NOT NULL,
	"anonima" boolean DEFAULT true NOT NULL,
	"abierta" boolean DEFAULT true NOT NULL,
	"cierre" date,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "familias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"padre_id" uuid,
	"cuenta_ventas" text,
	"cuenta_compras" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "festivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"nombre" text NOT NULL,
	"ambito" text DEFAULT 'nacional' NOT NULL,
	"centro_id" uuid
);
--> statement-breakpoint
CREATE TABLE "firmas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"archivo_id" uuid,
	"contenido" text,
	"entidad" text,
	"entidad_id" uuid,
	"firmante_nombre" text NOT NULL,
	"firmante_email" text,
	"persona_id" uuid,
	"token_hash" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"expira_en" timestamp with time zone,
	"firmado_en" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"firma_imagen" text,
	"evidencia_hash" text,
	"archivo_firmado_id" uuid,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formas_pago" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'transferencia' NOT NULL,
	"plazos" jsonb DEFAULT '[{"dias":30,"porcentaje":100}]'::jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modulos_empresa" (
	"empresa_id" uuid NOT NULL,
	"modulo" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"cambiado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cambiado_por" uuid,
	CONSTRAINT "modulos_empresa_empresa_id_modulo_pk" PRIMARY KEY("empresa_id","modulo")
);
--> statement-breakpoint
CREATE TABLE "notificaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"modulo" text NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"cuerpo" text,
	"enlace" text,
	"leida_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"apellidos" text,
	"email" text,
	"telefono" text,
	"foto_archivo_id" uuid,
	"codigo_empleado" text,
	"puesto" text,
	"departamento_id" uuid,
	"centro_id" uuid,
	"responsable_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plantillas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'documento' NOT NULL,
	"entidad" text DEFAULT 'persona' NOT NULL,
	"contenido" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rol_permisos" (
	"rol_id" uuid NOT NULL,
	"permiso" text NOT NULL,
	"alcance" text DEFAULT 'todo' NOT NULL,
	CONSTRAINT "rol_permisos_rol_id_permiso_pk" PRIMARY KEY("rol_id","permiso")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"clave" text,
	"nombre" text NOT NULL,
	"descripcion" text,
	"sistema" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"anio" integer NOT NULL,
	"siguiente" integer DEFAULT 1 NOT NULL,
	"digitos" integer DEFAULT 5 NOT NULL,
	"por_defecto" boolean DEFAULT true NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"ultimo_uso" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tareas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"asignado_a" uuid,
	"creado_por" uuid,
	"entidad" text,
	"entidad_id" uuid,
	"vence" date,
	"prioridad" text DEFAULT 'normal' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"completada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tareas_programadas" (
	"tarea" text NOT NULL,
	"clave" text NOT NULL,
	"ejecutado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resultado" text,
	CONSTRAINT "tareas_programadas_tarea_clave_pk" PRIMARY KEY("tarea","clave")
);
--> statement-breakpoint
CREATE TABLE "tarifa_precios" (
	"tarifa_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"precio" numeric(14, 4) NOT NULL,
	CONSTRAINT "tarifa_precios_tarifa_id_articulo_id_pk" PRIMARY KEY("tarifa_id","articulo_id")
);
--> statement-breakpoint
CREATE TABLE "tarifas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'descuento' NOT NULL,
	"porcentaje" numeric(6, 2),
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terceros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text,
	"nombre" text NOT NULL,
	"razon_social" text,
	"nif" text,
	"es_cliente" boolean DEFAULT true NOT NULL,
	"es_proveedor" boolean DEFAULT false NOT NULL,
	"estado" text DEFAULT 'cliente' NOT NULL,
	"email" text,
	"telefono" text,
	"web" text,
	"direccion" text,
	"codigo_postal" text,
	"localidad" text,
	"provincia" text,
	"pais" text DEFAULT 'ES' NOT NULL,
	"comercial_id" uuid,
	"forma_pago_id" uuid,
	"dia_pago" integer,
	"tarifa_id" uuid,
	"descuento" numeric(6, 2),
	"riesgo_max" numeric(14, 2),
	"regimen_iva" text DEFAULT 'general' NOT NULL,
	"retencion" numeric(6, 2),
	"iban" text,
	"mandato_sepa" text,
	"mandato_fecha" date,
	"cuenta_cliente" text,
	"cuenta_proveedor" text,
	"etiquetas" text[] DEFAULT '{}'::text[] NOT NULL,
	"notas" text,
	"rgpd_consentimiento" boolean DEFAULT false NOT NULL,
	"portal_token" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usuario_empresas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid,
	"rol_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"acceso_hasta" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario_permisos" (
	"usuario_empresa_id" uuid NOT NULL,
	"permiso" text NOT NULL,
	"alcance" text DEFAULT 'todo' NOT NULL,
	CONSTRAINT "usuario_permisos_usuario_empresa_id_permiso_pk" PRIMARY KEY("usuario_empresa_id","permiso")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secreto" text,
	"totp_activo" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"ultimo_acceso" timestamp with time zone,
	"debe_cambiar_password" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"url" text NOT NULL,
	"eventos" text[] NOT NULL,
	"secreto" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_estado" text,
	"ultimo_envio" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documento_impuestos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"documento_id" uuid NOT NULL,
	"iva_tipo" numeric(6, 2) NOT NULL,
	"base" numeric(14, 2) NOT NULL,
	"cuota" numeric(14, 2) NOT NULL,
	"recargo_pct" numeric(6, 2) DEFAULT 0 NOT NULL,
	"cuota_recargo" numeric(14, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documento_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"documento_id" uuid NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"tipo_linea" text DEFAULT 'articulo' NOT NULL,
	"articulo_id" uuid,
	"referencia" text,
	"descripcion" text DEFAULT '' NOT NULL,
	"cantidad" numeric(14, 4) DEFAULT 1 NOT NULL,
	"unidad" text,
	"precio" numeric(14, 4) DEFAULT 0 NOT NULL,
	"descuento" numeric(6, 2) DEFAULT 0 NOT NULL,
	"iva_tipo" numeric(6, 2) DEFAULT 21 NOT NULL,
	"retencion" numeric(6, 2) DEFAULT 0 NOT NULL,
	"coste" numeric(14, 4) DEFAULT 0 NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT 0 NOT NULL,
	"almacen_id" uuid,
	"lote" text,
	"caducidad" date,
	"series" text[],
	"linea_origen_id" uuid
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"circuito" text NOT NULL,
	"tipo" text NOT NULL,
	"serie_id" uuid,
	"numero" integer,
	"codigo" text,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"fecha" date NOT NULL,
	"fecha_validez" date,
	"fecha_entrega" date,
	"fecha_operacion" date,
	"tercero_id" uuid NOT NULL,
	"contacto_id" uuid,
	"comercial_id" uuid,
	"datos_tercero" jsonb,
	"direccion_envio" jsonb,
	"forma_pago_id" uuid,
	"tarifa_id" uuid,
	"almacen_id" uuid,
	"proyecto_id" uuid,
	"origen_tipo" text,
	"origen_id" uuid,
	"documento_origen_id" uuid,
	"rectifica_id" uuid,
	"tipo_rectificativa" text,
	"motivo_rectificacion" text,
	"regimen_iva" text DEFAULT 'general' NOT NULL,
	"recargo_equivalencia" boolean DEFAULT false NOT NULL,
	"descuento_global" numeric(6, 2) DEFAULT 0 NOT NULL,
	"suma_lineas" numeric(14, 2) DEFAULT 0 NOT NULL,
	"base_imponible" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total_iva" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total_recargo" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total_retencion" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"coste" numeric(14, 2) DEFAULT 0 NOT NULL,
	"margen" numeric(14, 2) DEFAULT 0 NOT NULL,
	"moneda" text DEFAULT 'EUR' NOT NULL,
	"tipo_cambio" numeric(14, 4) DEFAULT 1 NOT NULL,
	"referencia_externa" text,
	"titulo" text,
	"observaciones" text,
	"notas_internas" text,
	"condiciones" text,
	"version" integer DEFAULT 1 NOT NULL,
	"grupo_id" uuid,
	"token_publico" text,
	"enviado_en" timestamp with time zone,
	"visto_en" timestamp with time zone,
	"aceptado_en" timestamp with time zone,
	"aceptado_por" text,
	"firma_imagen" text,
	"rechazo_motivo" text,
	"aprobado_por" uuid,
	"emitido_en" timestamp with time zone,
	"bloqueado" boolean DEFAULT false NOT NULL,
	"estado_pago" text,
	"archivo_id" uuid,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "documentos_recurrentes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tercero_id" uuid NOT NULL,
	"serie_id" uuid,
	"forma_pago_id" uuid,
	"periodicidad" text DEFAULT 'mensual' NOT NULL,
	"proxima_fecha" date NOT NULL,
	"fin_fecha" date,
	"lineas" jsonb NOT NULL,
	"emitir_automaticamente" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"origen_tipo" text,
	"origen_id" uuid,
	"ultimo_documento_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fac_verifactu" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"secuencia" bigint NOT NULL,
	"documento_id" uuid NOT NULL,
	"tipo_registro" text NOT NULL,
	"nif_emisor" text NOT NULL,
	"num_serie" text NOT NULL,
	"fecha_expedicion" text NOT NULL,
	"tipo_factura" text NOT NULL,
	"cuota_total" numeric(14, 2) NOT NULL,
	"importe_total" numeric(14, 2) NOT NULL,
	"huella" text NOT NULL,
	"huella_anterior" text,
	"fecha_hora_gen" text NOT NULL,
	"url_qr" text NOT NULL,
	"xml" text NOT NULL,
	"estado_envio" text DEFAULT 'pendiente' NOT NULL,
	"respuesta" text,
	"enviado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anuncio_lecturas" ADD CONSTRAINT "anuncio_lecturas_anuncio_id_anuncios_id_fk" FOREIGN KEY ("anuncio_id") REFERENCES "public"."anuncios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anuncio_lecturas" ADD CONSTRAINT "anuncio_lecturas_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anuncios" ADD CONSTRAINT "anuncios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_claves" ADD CONSTRAINT "api_claves_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_familia_id_familias_id_fk" FOREIGN KEY ("familia_id") REFERENCES "public"."familias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articulos" ADD CONSTRAINT "articulos_proveedor_id_terceros_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centros" ADD CONSTRAINT "centros_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncia_mensajes" ADD CONSTRAINT "denuncia_mensajes_denuncia_id_denuncias_id_fk" FOREIGN KEY ("denuncia_id") REFERENCES "public"."denuncias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departamentos" ADD CONSTRAINT "departamentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departamentos" ADD CONSTRAINT "departamentos_responsable_id_personas_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direcciones" ADD CONSTRAINT "direcciones_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encuesta_participantes" ADD CONSTRAINT "encuesta_participantes_encuesta_id_encuestas_id_fk" FOREIGN KEY ("encuesta_id") REFERENCES "public"."encuestas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encuesta_respuestas" ADD CONSTRAINT "encuesta_respuestas_encuesta_id_encuestas_id_fk" FOREIGN KEY ("encuesta_id") REFERENCES "public"."encuestas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encuestas" ADD CONSTRAINT "encuestas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "familias" ADD CONSTRAINT "familias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "familias" ADD CONSTRAINT "familias_padre_id_familias_id_fk" FOREIGN KEY ("padre_id") REFERENCES "public"."familias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festivos" ADD CONSTRAINT "festivos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festivos" ADD CONSTRAINT "festivos_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_archivo_firmado_id_archivos_id_fk" FOREIGN KEY ("archivo_firmado_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formas_pago" ADD CONSTRAINT "formas_pago_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modulos_empresa" ADD CONSTRAINT "modulos_empresa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_responsable_id_personas_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas" ADD CONSTRAINT "plantillas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_rol_id_roles_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_asignado_a_personas_id_fk" FOREIGN KEY ("asignado_a") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifa_precios" ADD CONSTRAINT "tarifa_precios_tarifa_id_tarifas_id_fk" FOREIGN KEY ("tarifa_id") REFERENCES "public"."tarifas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifa_precios" ADD CONSTRAINT "tarifa_precios_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_comercial_id_personas_id_fk" FOREIGN KEY ("comercial_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_forma_pago_id_formas_pago_id_fk" FOREIGN KEY ("forma_pago_id") REFERENCES "public"."formas_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_tarifa_id_tarifas_id_fk" FOREIGN KEY ("tarifa_id") REFERENCES "public"."tarifas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_empresas" ADD CONSTRAINT "usuario_empresas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_empresas" ADD CONSTRAINT "usuario_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_empresas" ADD CONSTRAINT "usuario_empresas_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_empresas" ADD CONSTRAINT "usuario_empresas_rol_id_roles_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_permisos" ADD CONSTRAINT "usuario_permisos_usuario_empresa_id_usuario_empresas_id_fk" FOREIGN KEY ("usuario_empresa_id") REFERENCES "public"."usuario_empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_impuestos" ADD CONSTRAINT "documento_impuestos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_lineas" ADD CONSTRAINT "documento_lineas_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_lineas" ADD CONSTRAINT "documento_lineas_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_lineas" ADD CONSTRAINT "documento_lineas_linea_origen_id_documento_lineas_id_fk" FOREIGN KEY ("linea_origen_id") REFERENCES "public"."documento_lineas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_serie_id_series_id_fk" FOREIGN KEY ("serie_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_comercial_id_personas_id_fk" FOREIGN KEY ("comercial_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_forma_pago_id_formas_pago_id_fk" FOREIGN KEY ("forma_pago_id") REFERENCES "public"."formas_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_tarifa_id_tarifas_id_fk" FOREIGN KEY ("tarifa_id") REFERENCES "public"."tarifas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_documento_origen_id_documentos_id_fk" FOREIGN KEY ("documento_origen_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_rectifica_id_documentos_id_fk" FOREIGN KEY ("rectifica_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_recurrentes" ADD CONSTRAINT "documentos_recurrentes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_recurrentes" ADD CONSTRAINT "documentos_recurrentes_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_recurrentes" ADD CONSTRAINT "documentos_recurrentes_serie_id_series_id_fk" FOREIGN KEY ("serie_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_recurrentes" ADD CONSTRAINT "documentos_recurrentes_forma_pago_id_formas_pago_id_fk" FOREIGN KEY ("forma_pago_id") REFERENCES "public"."formas_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fac_verifactu" ADD CONSTRAINT "fac_verifactu_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fac_verifactu" ADD CONSTRAINT "fac_verifactu_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adjuntos_entidad_entidad_id_index" ON "adjuntos" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "adjuntos_empresa_id_caduca_index" ON "adjuntos" USING btree ("empresa_id","caduca");--> statement-breakpoint
CREATE INDEX "anuncios_empresa_id_publicado_en_index" ON "anuncios" USING btree ("empresa_id","publicado_en");--> statement-breakpoint
CREATE INDEX "archivos_empresa_id_sha256_index" ON "archivos" USING btree ("empresa_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "articulos_ref_uq" ON "articulos" USING btree ("empresa_id","referencia");--> statement-breakpoint
CREATE INDEX "articulos_empresa_id_ean_index" ON "articulos" USING btree ("empresa_id","ean");--> statement-breakpoint
CREATE INDEX "articulos_familia_id_index" ON "articulos" USING btree ("familia_id");--> statement-breakpoint
CREATE INDEX "articulos_busqueda_trgm" ON "articulos" USING gin ((coalesce("referencia",'') || ' ' || coalesce("nombre",'') || ' ' || coalesce("marca",'') || ' ' || coalesce("modelo",'')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "auditoria_entidad_entidad_id_index" ON "auditoria" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "auditoria_creado_brin" ON "auditoria" USING brin ("creado_en");--> statement-breakpoint
CREATE INDEX "auditoria_empresa_id_usuario_id_index" ON "auditoria" USING btree ("empresa_id","usuario_id");--> statement-breakpoint
CREATE INDEX "centros_empresa_id_index" ON "centros" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "comentarios_entidad_entidad_id_creado_en_index" ON "comentarios" USING btree ("entidad","entidad_id","creado_en");--> statement-breakpoint
CREATE INDEX "contactos_tercero_id_index" ON "contactos" USING btree ("tercero_id");--> statement-breakpoint
CREATE INDEX "contactos_busqueda_trgm" ON "contactos" USING gin ((coalesce("nombre",'') || ' ' || coalesce("apellidos",'') || ' ' || coalesce("email",'')) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "denuncias_codigo_index" ON "denuncias" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "denuncias_empresa_id_estado_index" ON "denuncias" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "departamentos_empresa_id_index" ON "departamentos" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "direcciones_tercero_id_index" ON "direcciones" USING btree ("tercero_id");--> statement-breakpoint
CREATE INDEX "emails_salida_estado_creado_en_index" ON "emails_salida" USING btree ("estado","creado_en");--> statement-breakpoint
CREATE INDEX "festivos_empresa_id_fecha_index" ON "festivos" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "firmas_empresa_id_estado_index" ON "firmas" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "firmas_entidad_entidad_id_index" ON "firmas" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "firmas_token_hash_index" ON "firmas" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "notificaciones_usuario_id_leida_en_creado_en_index" ON "notificaciones" USING btree ("usuario_id","leida_en","creado_en");--> statement-breakpoint
CREATE INDEX "personas_empresa_id_activo_index" ON "personas" USING btree ("empresa_id","activo");--> statement-breakpoint
CREATE INDEX "personas_responsable_id_index" ON "personas" USING btree ("responsable_id");--> statement-breakpoint
CREATE INDEX "personas_departamento_id_index" ON "personas" USING btree ("departamento_id");--> statement-breakpoint
CREATE INDEX "personas_nombre_trgm" ON "personas" USING gin ((coalesce("nombre",'') || ' ' || coalesce("apellidos",'')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "roles_empresa_id_index" ON "roles" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "series_empresa_id_tipo_codigo_anio_index" ON "series" USING btree ("empresa_id","tipo","codigo","anio");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_id_index" ON "sesiones" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "tareas_empresa_id_asignado_a_estado_index" ON "tareas" USING btree ("empresa_id","asignado_a","estado");--> statement-breakpoint
CREATE INDEX "tareas_entidad_entidad_id_index" ON "tareas" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "terceros_empresa_id_estado_index" ON "terceros" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "terceros_comercial_id_index" ON "terceros" USING btree ("comercial_id");--> statement-breakpoint
CREATE INDEX "terceros_empresa_id_nif_index" ON "terceros" USING btree ("empresa_id","nif");--> statement-breakpoint
CREATE INDEX "terceros_busqueda_trgm" ON "terceros" USING gin ((coalesce("nombre",'') || ' ' || coalesce("razon_social",'') || ' ' || coalesce("nif",'') || ' ' || coalesce("email",'')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "terceros_etiquetas_index" ON "terceros" USING gin ("etiquetas");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_empresas_usuario_id_empresa_id_index" ON "usuario_empresas" USING btree ("usuario_id","empresa_id");--> statement-breakpoint
CREATE INDEX "usuario_empresas_persona_id_index" ON "usuario_empresas" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_uq" ON "usuarios" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "documento_impuestos_documento_id_index" ON "documento_impuestos" USING btree ("documento_id");--> statement-breakpoint
CREATE INDEX "documento_lineas_documento_id_orden_index" ON "documento_lineas" USING btree ("documento_id","orden");--> statement-breakpoint
CREATE INDEX "documento_lineas_linea_origen_id_index" ON "documento_lineas" USING btree ("linea_origen_id");--> statement-breakpoint
CREATE INDEX "documento_lineas_articulo_id_index" ON "documento_lineas" USING btree ("articulo_id");--> statement-breakpoint
CREATE INDEX "documentos_empresa_id_tipo_fecha_index" ON "documentos" USING btree ("empresa_id","tipo","fecha");--> statement-breakpoint
CREATE INDEX "documentos_empresa_id_tipo_estado_index" ON "documentos" USING btree ("empresa_id","tipo","estado");--> statement-breakpoint
CREATE INDEX "documentos_tercero_id_fecha_index" ON "documentos" USING btree ("tercero_id","fecha");--> statement-breakpoint
CREATE INDEX "documentos_comercial_id_index" ON "documentos" USING btree ("comercial_id");--> statement-breakpoint
CREATE INDEX "documentos_documento_origen_id_index" ON "documentos" USING btree ("documento_origen_id");--> statement-breakpoint
CREATE INDEX "documentos_origen_tipo_origen_id_index" ON "documentos" USING btree ("origen_tipo","origen_id");--> statement-breakpoint
CREATE INDEX "documentos_proyecto_id_index" ON "documentos" USING btree ("proyecto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_serie_numero_uq" ON "documentos" USING btree ("serie_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_token_uq" ON "documentos" USING btree ("token_publico");--> statement-breakpoint
CREATE INDEX "documentos_codigo_trgm" ON "documentos" USING gin ((coalesce("codigo",'') || ' ' || coalesce("titulo",'') || ' ' || coalesce("referencia_externa",'')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "documentos_recurrentes_empresa_id_activo_proxima_fecha_index" ON "documentos_recurrentes" USING btree ("empresa_id","activo","proxima_fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "fac_verifactu_empresa_id_secuencia_index" ON "fac_verifactu" USING btree ("empresa_id","secuencia");--> statement-breakpoint
CREATE INDEX "fac_verifactu_documento_id_index" ON "fac_verifactu" USING btree ("documento_id");--> statement-breakpoint
CREATE INDEX "fac_verifactu_estado_envio_index" ON "fac_verifactu" USING btree ("estado_envio");