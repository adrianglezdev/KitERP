CREATE TABLE "fic_cambios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"datos" jsonb NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"comentario" text,
	"revisado_por" uuid,
	"revisado_en" timestamp with time zone,
	"motivo_rechazo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fic_formacion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"curso" text NOT NULL,
	"tipo" text DEFAULT 'tecnica' NOT NULL,
	"entidad" text,
	"fecha" date NOT NULL,
	"horas" numeric(6, 1),
	"caduca" date,
	"coste" numeric(14, 2),
	"bonificada" boolean DEFAULT false NOT NULL,
	"archivo_id" uuid,
	"notas" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fic_historial" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"tipo" text NOT NULL,
	"descripcion" text NOT NULL,
	"valor_anterior" text,
	"valor_nuevo" text,
	"origen" text DEFAULT 'manual' NOT NULL,
	"campo" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fic_prl" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"descripcion" text NOT NULL,
	"fecha" date NOT NULL,
	"caduca" date,
	"resultado" text,
	"entidad" text,
	"horas" numeric(6, 1),
	"epis" jsonb,
	"archivo_id" uuid,
	"notas" text,
	"firma_imagen" text,
	"firmado_en" timestamp with time zone,
	"firma_ip" text,
	"firma_hash" text,
	"evidencia_archivo_id" uuid,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fic_trabajadores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"dni" text,
	"nss" text,
	"fecha_nacimiento" date,
	"sexo" text,
	"nacionalidad" text,
	"direccion" text,
	"codigo_postal" text,
	"localidad" text,
	"provincia" text,
	"telefono_personal" text,
	"email_personal" text,
	"iban" text,
	"contacto_emergencia" text,
	"telefono_emergencia" text,
	"convenio" text,
	"categoria" text,
	"grupo_cotizacion" text,
	"tipo_contrato" text DEFAULT 'indefinido',
	"jornada_horas" numeric(5, 2) DEFAULT 40,
	"salario_bruto" numeric(14, 2),
	"fecha_alta" date,
	"fin_periodo_prueba" date,
	"fin_contrato" date,
	"fecha_baja" date,
	"motivo_baja" text,
	"discapacidad" numeric(6, 2),
	"datos_salud" text,
	"notas" text,
	"validado" boolean DEFAULT false NOT NULL,
	"validado_por" uuid,
	"validado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hor_anulaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fichaje_id" uuid NOT NULL,
	"correccion_id" uuid,
	"motivo" text NOT NULL,
	"anulado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hor_asignaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"desde" date NOT NULL,
	"hasta" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hor_bolsa" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"horas" numeric(7, 2) NOT NULL,
	"concepto" text NOT NULL,
	"origen" text DEFAULT 'manual' NOT NULL,
	"periodo" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hor_correcciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"fecha" date NOT NULL,
	"fichaje_id" uuid,
	"nuevo_tipo" text,
	"nuevo_momento" timestamp with time zone,
	"motivo" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"solicitado_por" uuid,
	"revisado_por" uuid,
	"revisado_en" timestamp with time zone,
	"motivo_rechazo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hor_cuadrante" (
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"turno_id" uuid,
	"libre" boolean DEFAULT false NOT NULL,
	"nota" text,
	"actualizado_por" uuid,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hor_cuadrante_persona_id_fecha_pk" PRIMARY KEY("persona_id","fecha")
);
--> statement-breakpoint
CREATE TABLE "hor_fichajes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"momento" timestamp with time zone DEFAULT now() NOT NULL,
	"origen" text DEFAULT 'web' NOT NULL,
	"lat" numeric(14, 4),
	"lng" numeric(14, 4),
	"precision" integer,
	"dentro_geovalla" boolean,
	"centro_id" uuid,
	"kiosco_id" uuid,
	"correccion_id" uuid,
	"ip" text,
	"user_agent" text,
	"nota" text,
	"registrado_por" uuid,
	"registrado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hor_firmas_mes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"anio" integer NOT NULL,
	"mes" integer NOT NULL,
	"hash" text NOT NULL,
	"resumen" jsonb NOT NULL,
	"firma_imagen" text NOT NULL,
	"firmado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "hor_kioscos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"centro_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_uso" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hor_pines" (
	"persona_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pin_hash" text NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hor_turnos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"hora_inicio" text NOT NULL,
	"hora_fin" text NOT NULL,
	"pausa_minutos" integer DEFAULT 60 NOT NULL,
	"dias" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"color" text DEFAULT '#7D2CDD' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "aus_minimos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"departamento_id" uuid NOT NULL,
	"minimo" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aus_saldos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"tipo_id" uuid NOT NULL,
	"anio" integer NOT NULL,
	"dias" numeric(6, 1) NOT NULL,
	"arrastre" numeric(6, 1) DEFAULT 0 NOT NULL,
	"ajuste" numeric(6, 1) DEFAULT 0 NOT NULL,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aus_solicitudes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"tipo_id" uuid NOT NULL,
	"desde" date NOT NULL,
	"hasta" date NOT NULL,
	"medio_dia" text,
	"dias" numeric(6, 1) NOT NULL,
	"motivo" text,
	"justificante_archivo_id" uuid,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"aprobado_responsable_por" uuid,
	"aprobado_responsable_en" timestamp with time zone,
	"revisado_por" uuid,
	"revisado_en" timestamp with time zone,
	"motivo_rechazo" text,
	"registrada_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aus_tipos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"codigo" text,
	"clave" text,
	"color" text DEFAULT '#35AE29' NOT NULL,
	"retribuido" boolean DEFAULT true NOT NULL,
	"descuenta_saldo" boolean DEFAULT false NOT NULL,
	"dias_anuales" numeric(6, 1),
	"unidad" text DEFAULT 'laborables' NOT NULL,
	"requiere_justificante" boolean DEFAULT false NOT NULL,
	"permite_medio_dia" boolean DEFAULT true NOT NULL,
	"dos_niveles" boolean DEFAULT false NOT NULL,
	"solo_rrhh" boolean DEFAULT false NOT NULL,
	"max_arrastre" numeric(6, 1) DEFAULT 0,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nom_anticipos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"motivo" text,
	"fecha_deseada" date,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"periodo_id" uuid,
	"revisado_por" uuid,
	"revisado_en" timestamp with time zone,
	"motivo_rechazo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nom_periodos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"anio" integer NOT NULL,
	"mes" integer NOT NULL,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"totales" jsonb,
	"notas" text,
	"cerrado_por" uuid,
	"cerrado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nom_recibos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"periodo_id" uuid,
	"persona_id" uuid,
	"tipo" text DEFAULT 'nomina' NOT NULL,
	"titulo" text NOT NULL,
	"anio" integer NOT NULL,
	"mes" integer,
	"archivo_id" uuid NOT NULL,
	"origen_archivo_id" uuid,
	"paginas" text,
	"dni_detectado" text,
	"bruto" numeric(14, 2),
	"neto" numeric(14, 2),
	"publicado_por" uuid,
	"publicado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"leido_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nom_variables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"periodo_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"concepto" text NOT NULL,
	"descripcion" text,
	"cantidad" numeric(10, 2),
	"importe" numeric(14, 2) NOT NULL,
	"origen" text DEFAULT 'manual' NOT NULL,
	"origen_id" uuid,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alt_candidatos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"oferta_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"apellidos" text,
	"email" text,
	"telefono" text,
	"localidad" text,
	"fuente" text,
	"estado" text DEFAULT 'nuevo' NOT NULL,
	"valoracion" integer,
	"pretension" numeric(14, 2),
	"disponibilidad" text,
	"cv_archivo_id" uuid,
	"notas" text,
	"consentimiento" boolean DEFAULT false NOT NULL,
	"persona_id" uuid,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alt_evaluaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"evaluador_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"fecha" date NOT NULL,
	"objetivos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"puntuacion" numeric(4, 2),
	"fortalezas" text,
	"mejoras" text,
	"comentarios" text,
	"comentarios_evaluado" text,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"compartida_en" timestamp with time zone,
	"firmada_en" timestamp with time zone,
	"firma_imagen" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alt_ofertas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"plazas" integer DEFAULT 1 NOT NULL,
	"departamento_id" uuid,
	"centro_id" uuid,
	"responsable_id" uuid,
	"tipo_contrato" text,
	"jornada_horas" numeric(5, 1),
	"salario_desde" numeric(14, 2),
	"salario_hasta" numeric(14, 2),
	"fecha_cierre" date,
	"descripcion" text,
	"requisitos" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alt_plan_formacion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"anio" integer NOT NULL,
	"accion" text NOT NULL,
	"objetivo" text,
	"departamento_id" uuid,
	"personas" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"trimestre" text,
	"modalidad" text,
	"proveedor" text,
	"horas" numeric(6, 1),
	"coste_estimado" numeric(14, 2),
	"bonificable" boolean DEFAULT false NOT NULL,
	"estado" text DEFAULT 'planificada' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alt_plantillas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"tareas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alt_proceso_tareas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proceso_id" uuid NOT NULL,
	"tarea_id" uuid,
	"titulo" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alt_procesos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"plantilla_id" uuid,
	"fecha" date NOT NULL,
	"estado" text DEFAULT 'en_curso' NOT NULL,
	"motivo" text,
	"notas" text,
	"candidato_id" uuid,
	"bloquear_acceso" boolean DEFAULT true NOT NULL,
	"acceso_bloqueado_en" timestamp with time zone,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"completado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_actividades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text DEFAULT 'llamada' NOT NULL,
	"asunto" text NOT NULL,
	"descripcion" text,
	"tercero_id" uuid NOT NULL,
	"contacto_id" uuid,
	"oportunidad_id" uuid,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"duracion_min" integer,
	"estado" text DEFAULT 'realizada' NOT NULL,
	"proxima_accion" text,
	"proxima_fecha" date,
	"persona_id" uuid,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "opo_etapas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 1 NOT NULL,
	"probabilidad" numeric(6, 2) DEFAULT 20 NOT NULL,
	"tipo" text DEFAULT 'abierta' NOT NULL,
	"color" text DEFAULT '#7D2CDD' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opo_oportunidades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"tercero_id" uuid NOT NULL,
	"contacto_id" uuid,
	"etapa_id" uuid,
	"importe" numeric(14, 2),
	"probabilidad" numeric(6, 2),
	"cierre_previsto" date,
	"comercial_id" uuid,
	"origen" text DEFAULT 'telefono' NOT NULL,
	"descripcion" text,
	"motivo_perdida" text,
	"comentario_perdida" text,
	"ganada_en" timestamp with time zone,
	"perdida_en" timestamp with time zone,
	"presupuesto_id" uuid,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stk_almacenes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'almacen' NOT NULL,
	"centro_id" uuid,
	"persona_id" uuid,
	"por_defecto" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stk_articulo_config" (
	"articulo_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"stock_min" numeric(14, 4),
	"punto_pedido" numeric(14, 4),
	"cantidad_pedido" numeric(14, 4),
	"controla_lotes" boolean DEFAULT false NOT NULL,
	"controla_series" boolean DEFAULT false NOT NULL,
	"ubicacion_id" uuid,
	"ultimo_recuento" date,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stk_avisos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"almacen_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"fecha" date NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stk_inventario_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventario_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"lote" text DEFAULT '' NOT NULL,
	"teorico" numeric(14, 4) DEFAULT 0 NOT NULL,
	"contado" numeric(14, 4),
	"diferencia" numeric(14, 4),
	"contado_por" uuid,
	"contado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stk_inventarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"almacen_id" uuid NOT NULL,
	"tipo" text DEFAULT 'total' NOT NULL,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"fecha" date NOT NULL,
	"notas" text,
	"creado_por" uuid,
	"confirmado_en" timestamp with time zone,
	"confirmado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stk_kit_componentes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"kit_id" uuid NOT NULL,
	"componente_id" uuid NOT NULL,
	"cantidad" numeric(14, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stk_lotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"lote" text NOT NULL,
	"caducidad" date,
	"proveedor_id" uuid,
	"documento_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stk_movimientos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"momento" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo" text NOT NULL,
	"articulo_id" uuid NOT NULL,
	"almacen_id" uuid NOT NULL,
	"lote" text DEFAULT '' NOT NULL,
	"cantidad" numeric(14, 4) NOT NULL,
	"coste_unitario" numeric(14, 4),
	"saldo" numeric(14, 4),
	"documento_id" uuid,
	"linea_id" uuid,
	"origen_tipo" text,
	"origen_id" uuid,
	"series" text[],
	"motivo" text,
	"usuario_id" uuid,
	"persona_id" uuid
);
--> statement-breakpoint
CREATE TABLE "stk_reservas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	"linea_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"almacen_id" uuid NOT NULL,
	"cantidad" numeric(14, 4) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stk_saldos" (
	"empresa_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"almacen_id" uuid NOT NULL,
	"lote" text DEFAULT '' NOT NULL,
	"cantidad" numeric(14, 4) DEFAULT 0 NOT NULL,
	"reservado" numeric(14, 4) DEFAULT 0 NOT NULL,
	"coste_medio" numeric(14, 4) DEFAULT 0 NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stk_saldos_articulo_id_almacen_id_lote_pk" PRIMARY KEY("articulo_id","almacen_id","lote")
);
--> statement-breakpoint
CREATE TABLE "stk_series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"numero_serie" text NOT NULL,
	"estado" text DEFAULT 'en_stock' NOT NULL,
	"almacen_id" uuid,
	"lote" text,
	"tercero_id" uuid,
	"documento_entrada_id" uuid,
	"documento_salida_id" uuid,
	"fecha_entrada" date,
	"fecha_salida" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stk_traspasos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"fecha" date NOT NULL,
	"origen_id" uuid NOT NULL,
	"destino_id" uuid NOT NULL,
	"notas" text,
	"lineas" integer DEFAULT 0 NOT NULL,
	"usuario_id" uuid,
	"persona_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stk_ubicaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"almacen_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"descripcion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpr_articulo_proveedor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"referencia_proveedor" text,
	"precio" numeric(14, 4) DEFAULT 0 NOT NULL,
	"descuento" numeric(6, 2),
	"plazo_dias" integer DEFAULT 3,
	"cantidad_minima" numeric(14, 4),
	"preferente" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpr_incidencias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	"linea_id" uuid,
	"tercero_id" uuid,
	"articulo_id" uuid,
	"tipo" text DEFAULT 'danado' NOT NULL,
	"cantidad" numeric(14, 4),
	"descripcion" text NOT NULL,
	"archivo_id" uuid,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelta_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cpr_solicitudes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"solicitante_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"articulo_id" uuid,
	"cantidad" numeric(14, 4) DEFAULT 1 NOT NULL,
	"importe_estimado" numeric(14, 2),
	"proveedor_id" uuid,
	"proyecto_id" uuid,
	"fecha_necesaria" date,
	"motivo" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"aprobador_id" uuid,
	"resuelto_en" timestamp with time zone,
	"motivo_rechazo" text,
	"documento_id" uuid,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pry_consumos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"partida_id" uuid,
	"articulo_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" numeric(14, 4) NOT NULL,
	"coste_unitario" numeric(14, 4) DEFAULT 0 NOT NULL,
	"almacen_id" uuid,
	"lote" text,
	"fecha" date NOT NULL,
	"persona_id" uuid,
	"devuelto_de_id" uuid,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pry_costes_persona" (
	"persona_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"coste_hora" numeric(14, 4) NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pry_fases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"fecha_inicio" date,
	"fecha_fin" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pry_hitos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"fecha" date,
	"porcentaje" numeric(6, 2),
	"importe" numeric(14, 2) DEFAULT 0 NOT NULL,
	"iva_tipo" numeric(6, 2) DEFAULT 21 NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"documento_id" uuid,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pry_imputaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"tarea_id" uuid,
	"partida_id" uuid,
	"persona_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"horas" numeric(14, 4) NOT NULL,
	"coste_hora" numeric(14, 4) DEFAULT 0 NOT NULL,
	"descripcion" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pry_partidas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'mano_obra' NOT NULL,
	"horas_previstas" numeric(14, 4),
	"coste_previsto" numeric(14, 2) DEFAULT 0 NOT NULL,
	"venta_prevista" numeric(14, 2) DEFAULT 0 NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"linea_presupuesto_id" uuid,
	"alertada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pry_proyectos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"cliente_id" uuid,
	"responsable_id" uuid,
	"estado" text DEFAULT 'planificado' NOT NULL,
	"tipo_facturacion" text DEFAULT 'hitos' NOT NULL,
	"fecha_inicio" date,
	"fecha_fin" date,
	"presupuesto_id" uuid,
	"presupuesto_venta" numeric(14, 2),
	"presupuesto_coste" numeric(14, 2),
	"miembros" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"color" text DEFAULT '#35AE29' NOT NULL,
	"descripcion" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pry_tareas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"fase_id" uuid,
	"partida_id" uuid,
	"titulo" text NOT NULL,
	"descripcion" text,
	"asignado_id" uuid,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"prioridad" text DEFAULT 'normal' NOT NULL,
	"fecha_inicio" date,
	"fecha_fin" date,
	"estimacion_horas" numeric(14, 4),
	"depende_de_id" uuid,
	"orden" integer DEFAULT 0 NOT NULL,
	"completada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sat_checklists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sat_contratos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"tercero_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"inicio" date NOT NULL,
	"fin" date,
	"periodicidad_meses" integer DEFAULT 6 NOT NULL,
	"proxima_visita" date,
	"tecnico_id" uuid,
	"checklist_id" uuid,
	"sla_respuesta_horas" integer,
	"sla_resolucion_horas" integer,
	"cuota" numeric(14, 2),
	"cuota_periodicidad" text DEFAULT 'trimestral' NOT NULL,
	"recurrente_id" uuid,
	"notas" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sat_equipos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"articulo_id" uuid,
	"nombre" text NOT NULL,
	"marca" text,
	"modelo" text,
	"numero_serie" text,
	"ubicacion" text,
	"direccion_id" uuid,
	"fecha_instalacion" date,
	"garantia_hasta" date,
	"contrato_id" uuid,
	"notas" text,
	"portal_token" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sat_orden_materiales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orden_id" uuid NOT NULL,
	"articulo_id" uuid NOT NULL,
	"descripcion" text,
	"cantidad" numeric(14, 4) NOT NULL,
	"almacen_id" uuid,
	"precio" numeric(14, 4),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sat_orden_tiempos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orden_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone,
	"minutos" integer,
	"origen" text DEFAULT 'cronometro' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sat_ordenes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"ticket_id" uuid,
	"tercero_id" uuid NOT NULL,
	"direccion_id" uuid,
	"direccion" jsonb,
	"equipo_id" uuid,
	"contrato_id" uuid,
	"tecnico_id" uuid,
	"tipo" text DEFAULT 'correctivo' NOT NULL,
	"prioridad" text DEFAULT 'normal' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"descripcion" text,
	"planificada_inicio" timestamp with time zone,
	"planificada_fin" timestamp with time zone,
	"visita_fecha" date,
	"checklist_id" uuid,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trabajo_realizado" text,
	"facturable" boolean DEFAULT true NOT NULL,
	"desplazamiento" boolean DEFAULT true NOT NULL,
	"firma_archivo_id" uuid,
	"firma_nombre" text,
	"en_ruta_en" timestamp with time zone,
	"iniciada_en" timestamp with time zone,
	"finalizada_en" timestamp with time zone,
	"cancelada_motivo" text,
	"cierre_uid" text,
	"albaran_id" uuid,
	"presupuesto_id" uuid,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sat_tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"tercero_id" uuid NOT NULL,
	"contacto_id" uuid,
	"equipo_id" uuid,
	"contrato_id" uuid,
	"asunto" text NOT NULL,
	"descripcion" text,
	"prioridad" text DEFAULT 'normal' NOT NULL,
	"canal" text DEFAULT 'telefono' NOT NULL,
	"estado" text DEFAULT 'nuevo' NOT NULL,
	"responsable_id" uuid,
	"reportado_por" text,
	"reportado_contacto" text,
	"sla_respuesta_horas" integer NOT NULL,
	"sla_resolucion_horas" integer NOT NULL,
	"vence_respuesta" timestamp with time zone NOT NULL,
	"vence_resolucion" timestamp with time zone NOT NULL,
	"primera_respuesta_en" timestamp with time zone,
	"resuelto_en" timestamp with time zone,
	"cerrado_en" timestamp with time zone,
	"sla_incumplido" boolean DEFAULT false NOT NULL,
	"valoracion" integer,
	"valoracion_comentario" text,
	"valorado_en" timestamp with time zone,
	"portal_token" text NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "act_activos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'vehiculo' NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"marca" text,
	"modelo" text,
	"numero_serie" text,
	"matricula" text,
	"km" integer,
	"asignado_id" uuid,
	"centro_id" uuid,
	"proyecto_id" uuid,
	"proveedor_id" uuid,
	"fecha_compra" date,
	"valor_compra" numeric(14, 2),
	"vida_util_meses" integer,
	"valor_residual" numeric(14, 2) DEFAULT 0,
	"cuenta_activo" text,
	"cuenta_amortizacion" text DEFAULT '281',
	"cuenta_gasto" text DEFAULT '681',
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "act_amortizaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"activo_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"fecha" date NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"acumulado" numeric(14, 2) NOT NULL,
	"contabilizada" text DEFAULT 'evento' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "act_asignaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"activo_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"desde" date NOT NULL,
	"hasta" date,
	"km_entrega" integer,
	"km_devolucion" integer,
	"notas_entrega" text,
	"notas_devolucion" text,
	"firma_entrega" text,
	"firma_devolucion" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "act_registros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"activo_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"fecha" date NOT NULL,
	"descripcion" text,
	"coste" numeric(14, 2),
	"proveedor_id" uuid,
	"km" integer,
	"litros" numeric(14, 4),
	"archivo_id" uuid,
	"vencimiento_id" uuid,
	"persona_id" uuid,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "act_vencimientos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"activo_id" uuid NOT NULL,
	"tipo" text DEFAULT 'itv' NOT NULL,
	"descripcion" text,
	"fecha" date NOT NULL,
	"aviso_dias" integer DEFAULT 15 NOT NULL,
	"periodicidad_meses" integer,
	"coste_estimado" numeric(14, 2),
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"avisado_en" timestamp with time zone,
	"completado_en" date,
	"registro_id" uuid,
	"anterior_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dtc_distribucion" (
	"documento_id" uuid NOT NULL,
	"departamento_id" uuid NOT NULL,
	CONSTRAINT "dtc_distribucion_documento_id_departamento_id_pk" PRIMARY KEY("documento_id","departamento_id")
);
--> statement-breakpoint
CREATE TABLE "dtc_documentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"titulo" text NOT NULL,
	"tipo" text DEFAULT 'manual' NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"confidencialidad" text DEFAULT 'interno' NOT NULL,
	"descripcion" text,
	"departamento_id" uuid,
	"responsable_id" uuid,
	"revisor_id" uuid,
	"version_vigente_id" uuid,
	"version_vigente" text,
	"revision_meses" integer DEFAULT 12 NOT NULL,
	"proxima_revision" date,
	"aviso_revision_en" date,
	"etiquetas" text[] DEFAULT '{}'::text[] NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dtc_lecturas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"documento_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"leido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dtc_versiones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"documento_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"archivo_id" uuid NOT NULL,
	"resumen_cambios" text,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"autor_id" uuid,
	"autor_usuario_id" uuid,
	"enviado_en" timestamp with time zone,
	"aprobado_por" uuid,
	"aprobado_en" timestamp with time zone,
	"rechazo_motivo" text,
	"obsoleta_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dtc_vinculos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tes_conciliaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"pago_id" uuid,
	"vencimiento_id" uuid,
	"importe" numeric(14, 2) NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tes_cuentas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'banco' NOT NULL,
	"iban" text,
	"bic" text,
	"cuenta_contable" text NOT NULL,
	"saldo_inicial" numeric(14, 2) DEFAULT 0 NOT NULL,
	"fecha_saldo" date,
	"sufijo_sepa" text DEFAULT '000' NOT NULL,
	"por_defecto" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tes_movimientos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"fecha_valor" date,
	"importe" numeric(14, 2) NOT NULL,
	"concepto" text DEFAULT '' NOT NULL,
	"referencia" text,
	"concepto_comun" text,
	"origen" text DEFAULT 'manual' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"nota" text,
	"hash" text NOT NULL,
	"importacion_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tes_pagos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"vencimiento_id" uuid NOT NULL,
	"cuenta_id" uuid,
	"fecha" date NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"medio" text DEFAULT 'transferencia' NOT NULL,
	"remesa_id" uuid,
	"notas" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tes_remesas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"tipo" text NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"fecha_cargo" date NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"num_operaciones" integer DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'generada' NOT NULL,
	"msg_id" text NOT NULL,
	"archivo_id" uuid,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrada_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tes_vencimientos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"circuito" text NOT NULL,
	"documento_id" uuid,
	"tercero_id" uuid,
	"plazo" integer DEFAULT 1 NOT NULL,
	"concepto" text,
	"fecha" date NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"importe_pagado" numeric(14, 2) DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"forma_pago_tipo" text,
	"remesa_id" uuid,
	"cuenta_contrapartida" text,
	"recordatorios" integer DEFAULT 0 NOT NULL,
	"ultimo_recordatorio" date,
	"motivo_devolucion" text,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cnt_apuntes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asiento_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"cuenta" text NOT NULL,
	"concepto" text,
	"debe" numeric(14, 2) DEFAULT 0 NOT NULL,
	"haber" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tercero_id" uuid,
	"centro_coste_id" uuid
);
--> statement-breakpoint
CREATE TABLE "cnt_asientos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ejercicio_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" date NOT NULL,
	"concepto" text NOT NULL,
	"origen" text DEFAULT 'manual' NOT NULL,
	"ref_clave" text,
	"ref_tipo" text,
	"ref_id" uuid,
	"documento_id" uuid,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cnt_centros_coste" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cnt_cuentas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"grupo" text NOT NULL,
	"naturaleza" text DEFAULT 'mixta' NOT NULL,
	"subcuenta" boolean DEFAULT false NOT NULL,
	"sistema" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"archivado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cnt_ejercicios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"anio" integer NOT NULL,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"siguiente_numero" integer DEFAULT 1 NOT NULL,
	"cerrado_en" timestamp with time zone,
	"cerrado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cnt_subcuentas_terceros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"cuenta_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cnt_terceros_fiscal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"tipo_retencion" text DEFAULT 'ninguna' NOT NULL,
	"excluir347" boolean DEFAULT false NOT NULL,
	"cuenta_gasto" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gas_gastos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"tipo" text DEFAULT 'ticket' NOT NULL,
	"categoria" text,
	"fecha" date NOT NULL,
	"comercio" text,
	"nif_comercio" text,
	"concepto" text DEFAULT '' NOT NULL,
	"base" numeric(14, 2) DEFAULT 0 NOT NULL,
	"iva_tipo" numeric(6, 2),
	"iva" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"km" numeric(14, 4),
	"precio_km" numeric(14, 4),
	"origen" text,
	"destino" text,
	"pais" text DEFAULT 'ES' NOT NULL,
	"proyecto_id" uuid,
	"activo_id" uuid,
	"tercero_id" uuid,
	"archivo_id" uuid,
	"tarjeta_id" uuid,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"enviado_en" timestamp with time zone,
	"aprobado_por" uuid,
	"aprobado_en" timestamp with time zone,
	"motivo_rechazo" text,
	"liquidacion_id" uuid,
	"liquidacion_via" text,
	"fecha_liquidacion" date,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gas_liquidaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"fecha" date NOT NULL,
	"via" text NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"num_gastos" integer DEFAULT 0 NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gas_tarjeta_movimientos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tarjeta_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"comercio" text DEFAULT '' NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"gasto_id" uuid,
	"hash" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gas_tarjetas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"ultimos4" text NOT NULL,
	"persona_id" uuid NOT NULL,
	"cuenta_contable" text DEFAULT '5720001' NOT NULL,
	"limite_mensual" numeric(14, 2),
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bi_informes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"dataset" text NOT NULL,
	"filtros" jsonb NOT NULL,
	"columnas" text[] NOT NULL,
	"agrupar_por" text,
	"orden" text,
	"compartido" boolean DEFAULT false NOT NULL,
	"programacion" text DEFAULT 'ninguna' NOT NULL,
	"destinatarios" text[] DEFAULT '{}'::text[] NOT NULL,
	"ultimo_envio" date,
	"propietario_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fic_cambios" ADD CONSTRAINT "fic_cambios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_cambios" ADD CONSTRAINT "fic_cambios_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_formacion" ADD CONSTRAINT "fic_formacion_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_formacion" ADD CONSTRAINT "fic_formacion_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_formacion" ADD CONSTRAINT "fic_formacion_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_historial" ADD CONSTRAINT "fic_historial_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_historial" ADD CONSTRAINT "fic_historial_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_prl" ADD CONSTRAINT "fic_prl_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_prl" ADD CONSTRAINT "fic_prl_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_prl" ADD CONSTRAINT "fic_prl_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_prl" ADD CONSTRAINT "fic_prl_evidencia_archivo_id_archivos_id_fk" FOREIGN KEY ("evidencia_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_trabajadores" ADD CONSTRAINT "fic_trabajadores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fic_trabajadores" ADD CONSTRAINT "fic_trabajadores_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_anulaciones" ADD CONSTRAINT "hor_anulaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_anulaciones" ADD CONSTRAINT "hor_anulaciones_fichaje_id_hor_fichajes_id_fk" FOREIGN KEY ("fichaje_id") REFERENCES "public"."hor_fichajes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_asignaciones" ADD CONSTRAINT "hor_asignaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_asignaciones" ADD CONSTRAINT "hor_asignaciones_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_asignaciones" ADD CONSTRAINT "hor_asignaciones_turno_id_hor_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."hor_turnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_bolsa" ADD CONSTRAINT "hor_bolsa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_bolsa" ADD CONSTRAINT "hor_bolsa_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_correcciones" ADD CONSTRAINT "hor_correcciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_correcciones" ADD CONSTRAINT "hor_correcciones_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_correcciones" ADD CONSTRAINT "hor_correcciones_fichaje_id_hor_fichajes_id_fk" FOREIGN KEY ("fichaje_id") REFERENCES "public"."hor_fichajes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_cuadrante" ADD CONSTRAINT "hor_cuadrante_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_cuadrante" ADD CONSTRAINT "hor_cuadrante_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_cuadrante" ADD CONSTRAINT "hor_cuadrante_turno_id_hor_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."hor_turnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_fichajes" ADD CONSTRAINT "hor_fichajes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_fichajes" ADD CONSTRAINT "hor_fichajes_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_fichajes" ADD CONSTRAINT "hor_fichajes_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_firmas_mes" ADD CONSTRAINT "hor_firmas_mes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_firmas_mes" ADD CONSTRAINT "hor_firmas_mes_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_kioscos" ADD CONSTRAINT "hor_kioscos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_kioscos" ADD CONSTRAINT "hor_kioscos_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_pines" ADD CONSTRAINT "hor_pines_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_pines" ADD CONSTRAINT "hor_pines_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hor_turnos" ADD CONSTRAINT "hor_turnos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aus_minimos" ADD CONSTRAINT "aus_minimos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aus_minimos" ADD CONSTRAINT "aus_minimos_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aus_saldos" ADD CONSTRAINT "aus_saldos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aus_saldos" ADD CONSTRAINT "aus_saldos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aus_saldos" ADD CONSTRAINT "aus_saldos_tipo_id_aus_tipos_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."aus_tipos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aus_solicitudes" ADD CONSTRAINT "aus_solicitudes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aus_solicitudes" ADD CONSTRAINT "aus_solicitudes_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aus_solicitudes" ADD CONSTRAINT "aus_solicitudes_tipo_id_aus_tipos_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."aus_tipos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aus_solicitudes" ADD CONSTRAINT "aus_solicitudes_justificante_archivo_id_archivos_id_fk" FOREIGN KEY ("justificante_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aus_tipos" ADD CONSTRAINT "aus_tipos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nom_anticipos" ADD CONSTRAINT "nom_anticipos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nom_anticipos" ADD CONSTRAINT "nom_anticipos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nom_periodos" ADD CONSTRAINT "nom_periodos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nom_recibos" ADD CONSTRAINT "nom_recibos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nom_recibos" ADD CONSTRAINT "nom_recibos_periodo_id_nom_periodos_id_fk" FOREIGN KEY ("periodo_id") REFERENCES "public"."nom_periodos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nom_recibos" ADD CONSTRAINT "nom_recibos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nom_recibos" ADD CONSTRAINT "nom_recibos_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nom_variables" ADD CONSTRAINT "nom_variables_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nom_variables" ADD CONSTRAINT "nom_variables_periodo_id_nom_periodos_id_fk" FOREIGN KEY ("periodo_id") REFERENCES "public"."nom_periodos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nom_variables" ADD CONSTRAINT "nom_variables_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_candidatos" ADD CONSTRAINT "alt_candidatos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_candidatos" ADD CONSTRAINT "alt_candidatos_oferta_id_alt_ofertas_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."alt_ofertas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_candidatos" ADD CONSTRAINT "alt_candidatos_cv_archivo_id_archivos_id_fk" FOREIGN KEY ("cv_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_candidatos" ADD CONSTRAINT "alt_candidatos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_evaluaciones" ADD CONSTRAINT "alt_evaluaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_evaluaciones" ADD CONSTRAINT "alt_evaluaciones_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_evaluaciones" ADD CONSTRAINT "alt_evaluaciones_evaluador_id_personas_id_fk" FOREIGN KEY ("evaluador_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_ofertas" ADD CONSTRAINT "alt_ofertas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_ofertas" ADD CONSTRAINT "alt_ofertas_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_ofertas" ADD CONSTRAINT "alt_ofertas_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_ofertas" ADD CONSTRAINT "alt_ofertas_responsable_id_personas_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_plan_formacion" ADD CONSTRAINT "alt_plan_formacion_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_plan_formacion" ADD CONSTRAINT "alt_plan_formacion_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_plantillas" ADD CONSTRAINT "alt_plantillas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_proceso_tareas" ADD CONSTRAINT "alt_proceso_tareas_proceso_id_alt_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."alt_procesos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_proceso_tareas" ADD CONSTRAINT "alt_proceso_tareas_tarea_id_tareas_id_fk" FOREIGN KEY ("tarea_id") REFERENCES "public"."tareas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_procesos" ADD CONSTRAINT "alt_procesos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_procesos" ADD CONSTRAINT "alt_procesos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alt_procesos" ADD CONSTRAINT "alt_procesos_plantilla_id_alt_plantillas_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."alt_plantillas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_actividades" ADD CONSTRAINT "crm_actividades_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_actividades" ADD CONSTRAINT "crm_actividades_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_actividades" ADD CONSTRAINT "crm_actividades_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_actividades" ADD CONSTRAINT "crm_actividades_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opo_etapas" ADD CONSTRAINT "opo_etapas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opo_oportunidades" ADD CONSTRAINT "opo_oportunidades_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opo_oportunidades" ADD CONSTRAINT "opo_oportunidades_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opo_oportunidades" ADD CONSTRAINT "opo_oportunidades_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opo_oportunidades" ADD CONSTRAINT "opo_oportunidades_etapa_id_opo_etapas_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."opo_etapas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opo_oportunidades" ADD CONSTRAINT "opo_oportunidades_comercial_id_personas_id_fk" FOREIGN KEY ("comercial_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_almacenes" ADD CONSTRAINT "stk_almacenes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_almacenes" ADD CONSTRAINT "stk_almacenes_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_almacenes" ADD CONSTRAINT "stk_almacenes_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_articulo_config" ADD CONSTRAINT "stk_articulo_config_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_articulo_config" ADD CONSTRAINT "stk_articulo_config_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_articulo_config" ADD CONSTRAINT "stk_articulo_config_ubicacion_id_stk_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."stk_ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_avisos" ADD CONSTRAINT "stk_avisos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_inventario_lineas" ADD CONSTRAINT "stk_inventario_lineas_inventario_id_stk_inventarios_id_fk" FOREIGN KEY ("inventario_id") REFERENCES "public"."stk_inventarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_inventario_lineas" ADD CONSTRAINT "stk_inventario_lineas_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_inventario_lineas" ADD CONSTRAINT "stk_inventario_lineas_contado_por_usuarios_id_fk" FOREIGN KEY ("contado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_inventarios" ADD CONSTRAINT "stk_inventarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_inventarios" ADD CONSTRAINT "stk_inventarios_almacen_id_stk_almacenes_id_fk" FOREIGN KEY ("almacen_id") REFERENCES "public"."stk_almacenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_inventarios" ADD CONSTRAINT "stk_inventarios_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_inventarios" ADD CONSTRAINT "stk_inventarios_confirmado_por_usuarios_id_fk" FOREIGN KEY ("confirmado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_kit_componentes" ADD CONSTRAINT "stk_kit_componentes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_kit_componentes" ADD CONSTRAINT "stk_kit_componentes_kit_id_articulos_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_kit_componentes" ADD CONSTRAINT "stk_kit_componentes_componente_id_articulos_id_fk" FOREIGN KEY ("componente_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_lotes" ADD CONSTRAINT "stk_lotes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_lotes" ADD CONSTRAINT "stk_lotes_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_lotes" ADD CONSTRAINT "stk_lotes_proveedor_id_terceros_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_movimientos" ADD CONSTRAINT "stk_movimientos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_movimientos" ADD CONSTRAINT "stk_movimientos_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_movimientos" ADD CONSTRAINT "stk_movimientos_almacen_id_stk_almacenes_id_fk" FOREIGN KEY ("almacen_id") REFERENCES "public"."stk_almacenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_movimientos" ADD CONSTRAINT "stk_movimientos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_movimientos" ADD CONSTRAINT "stk_movimientos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_reservas" ADD CONSTRAINT "stk_reservas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_reservas" ADD CONSTRAINT "stk_reservas_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_reservas" ADD CONSTRAINT "stk_reservas_almacen_id_stk_almacenes_id_fk" FOREIGN KEY ("almacen_id") REFERENCES "public"."stk_almacenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_saldos" ADD CONSTRAINT "stk_saldos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_saldos" ADD CONSTRAINT "stk_saldos_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_saldos" ADD CONSTRAINT "stk_saldos_almacen_id_stk_almacenes_id_fk" FOREIGN KEY ("almacen_id") REFERENCES "public"."stk_almacenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_series" ADD CONSTRAINT "stk_series_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_series" ADD CONSTRAINT "stk_series_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_series" ADD CONSTRAINT "stk_series_almacen_id_stk_almacenes_id_fk" FOREIGN KEY ("almacen_id") REFERENCES "public"."stk_almacenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_series" ADD CONSTRAINT "stk_series_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_traspasos" ADD CONSTRAINT "stk_traspasos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_traspasos" ADD CONSTRAINT "stk_traspasos_origen_id_stk_almacenes_id_fk" FOREIGN KEY ("origen_id") REFERENCES "public"."stk_almacenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_traspasos" ADD CONSTRAINT "stk_traspasos_destino_id_stk_almacenes_id_fk" FOREIGN KEY ("destino_id") REFERENCES "public"."stk_almacenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_traspasos" ADD CONSTRAINT "stk_traspasos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_traspasos" ADD CONSTRAINT "stk_traspasos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_ubicaciones" ADD CONSTRAINT "stk_ubicaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_ubicaciones" ADD CONSTRAINT "stk_ubicaciones_almacen_id_stk_almacenes_id_fk" FOREIGN KEY ("almacen_id") REFERENCES "public"."stk_almacenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_articulo_proveedor" ADD CONSTRAINT "cpr_articulo_proveedor_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_articulo_proveedor" ADD CONSTRAINT "cpr_articulo_proveedor_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_articulo_proveedor" ADD CONSTRAINT "cpr_articulo_proveedor_proveedor_id_terceros_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_incidencias" ADD CONSTRAINT "cpr_incidencias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_incidencias" ADD CONSTRAINT "cpr_incidencias_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_incidencias" ADD CONSTRAINT "cpr_incidencias_linea_id_documento_lineas_id_fk" FOREIGN KEY ("linea_id") REFERENCES "public"."documento_lineas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_incidencias" ADD CONSTRAINT "cpr_incidencias_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_incidencias" ADD CONSTRAINT "cpr_incidencias_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_incidencias" ADD CONSTRAINT "cpr_incidencias_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_incidencias" ADD CONSTRAINT "cpr_incidencias_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_solicitudes" ADD CONSTRAINT "cpr_solicitudes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_solicitudes" ADD CONSTRAINT "cpr_solicitudes_solicitante_id_personas_id_fk" FOREIGN KEY ("solicitante_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_solicitudes" ADD CONSTRAINT "cpr_solicitudes_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_solicitudes" ADD CONSTRAINT "cpr_solicitudes_proveedor_id_terceros_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_solicitudes" ADD CONSTRAINT "cpr_solicitudes_aprobador_id_personas_id_fk" FOREIGN KEY ("aprobador_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_solicitudes" ADD CONSTRAINT "cpr_solicitudes_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpr_solicitudes" ADD CONSTRAINT "cpr_solicitudes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_consumos" ADD CONSTRAINT "pry_consumos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_consumos" ADD CONSTRAINT "pry_consumos_proyecto_id_pry_proyectos_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."pry_proyectos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_consumos" ADD CONSTRAINT "pry_consumos_partida_id_pry_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."pry_partidas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_consumos" ADD CONSTRAINT "pry_consumos_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_consumos" ADD CONSTRAINT "pry_consumos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_consumos" ADD CONSTRAINT "pry_consumos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_costes_persona" ADD CONSTRAINT "pry_costes_persona_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_costes_persona" ADD CONSTRAINT "pry_costes_persona_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_fases" ADD CONSTRAINT "pry_fases_proyecto_id_pry_proyectos_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."pry_proyectos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_hitos" ADD CONSTRAINT "pry_hitos_proyecto_id_pry_proyectos_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."pry_proyectos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_hitos" ADD CONSTRAINT "pry_hitos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_imputaciones" ADD CONSTRAINT "pry_imputaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_imputaciones" ADD CONSTRAINT "pry_imputaciones_proyecto_id_pry_proyectos_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."pry_proyectos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_imputaciones" ADD CONSTRAINT "pry_imputaciones_tarea_id_pry_tareas_id_fk" FOREIGN KEY ("tarea_id") REFERENCES "public"."pry_tareas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_imputaciones" ADD CONSTRAINT "pry_imputaciones_partida_id_pry_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."pry_partidas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_imputaciones" ADD CONSTRAINT "pry_imputaciones_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_imputaciones" ADD CONSTRAINT "pry_imputaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_partidas" ADD CONSTRAINT "pry_partidas_proyecto_id_pry_proyectos_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."pry_proyectos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_proyectos" ADD CONSTRAINT "pry_proyectos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_proyectos" ADD CONSTRAINT "pry_proyectos_cliente_id_terceros_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_proyectos" ADD CONSTRAINT "pry_proyectos_responsable_id_personas_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_proyectos" ADD CONSTRAINT "pry_proyectos_presupuesto_id_documentos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_proyectos" ADD CONSTRAINT "pry_proyectos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_tareas" ADD CONSTRAINT "pry_tareas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_tareas" ADD CONSTRAINT "pry_tareas_proyecto_id_pry_proyectos_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."pry_proyectos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_tareas" ADD CONSTRAINT "pry_tareas_fase_id_pry_fases_id_fk" FOREIGN KEY ("fase_id") REFERENCES "public"."pry_fases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_tareas" ADD CONSTRAINT "pry_tareas_partida_id_pry_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."pry_partidas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_tareas" ADD CONSTRAINT "pry_tareas_asignado_id_personas_id_fk" FOREIGN KEY ("asignado_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pry_tareas" ADD CONSTRAINT "pry_tareas_depende_de_id_pry_tareas_id_fk" FOREIGN KEY ("depende_de_id") REFERENCES "public"."pry_tareas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_checklists" ADD CONSTRAINT "sat_checklists_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_contratos" ADD CONSTRAINT "sat_contratos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_contratos" ADD CONSTRAINT "sat_contratos_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_contratos" ADD CONSTRAINT "sat_contratos_tecnico_id_personas_id_fk" FOREIGN KEY ("tecnico_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_contratos" ADD CONSTRAINT "sat_contratos_checklist_id_sat_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."sat_checklists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_equipos" ADD CONSTRAINT "sat_equipos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_equipos" ADD CONSTRAINT "sat_equipos_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_equipos" ADD CONSTRAINT "sat_equipos_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_equipos" ADD CONSTRAINT "sat_equipos_direccion_id_direcciones_id_fk" FOREIGN KEY ("direccion_id") REFERENCES "public"."direcciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_equipos" ADD CONSTRAINT "sat_equipos_contrato_id_sat_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."sat_contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_orden_materiales" ADD CONSTRAINT "sat_orden_materiales_orden_id_sat_ordenes_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."sat_ordenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_orden_materiales" ADD CONSTRAINT "sat_orden_materiales_articulo_id_articulos_id_fk" FOREIGN KEY ("articulo_id") REFERENCES "public"."articulos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_orden_tiempos" ADD CONSTRAINT "sat_orden_tiempos_orden_id_sat_ordenes_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."sat_ordenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_orden_tiempos" ADD CONSTRAINT "sat_orden_tiempos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_ordenes" ADD CONSTRAINT "sat_ordenes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_ordenes" ADD CONSTRAINT "sat_ordenes_ticket_id_sat_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."sat_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_ordenes" ADD CONSTRAINT "sat_ordenes_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_ordenes" ADD CONSTRAINT "sat_ordenes_direccion_id_direcciones_id_fk" FOREIGN KEY ("direccion_id") REFERENCES "public"."direcciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_ordenes" ADD CONSTRAINT "sat_ordenes_equipo_id_sat_equipos_id_fk" FOREIGN KEY ("equipo_id") REFERENCES "public"."sat_equipos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_ordenes" ADD CONSTRAINT "sat_ordenes_contrato_id_sat_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."sat_contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_ordenes" ADD CONSTRAINT "sat_ordenes_tecnico_id_personas_id_fk" FOREIGN KEY ("tecnico_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_ordenes" ADD CONSTRAINT "sat_ordenes_checklist_id_sat_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."sat_checklists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_ordenes" ADD CONSTRAINT "sat_ordenes_firma_archivo_id_archivos_id_fk" FOREIGN KEY ("firma_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_ordenes" ADD CONSTRAINT "sat_ordenes_albaran_id_documentos_id_fk" FOREIGN KEY ("albaran_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_ordenes" ADD CONSTRAINT "sat_ordenes_presupuesto_id_documentos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_tickets" ADD CONSTRAINT "sat_tickets_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_tickets" ADD CONSTRAINT "sat_tickets_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_tickets" ADD CONSTRAINT "sat_tickets_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_tickets" ADD CONSTRAINT "sat_tickets_equipo_id_sat_equipos_id_fk" FOREIGN KEY ("equipo_id") REFERENCES "public"."sat_equipos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_tickets" ADD CONSTRAINT "sat_tickets_contrato_id_sat_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."sat_contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sat_tickets" ADD CONSTRAINT "sat_tickets_responsable_id_personas_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_activos" ADD CONSTRAINT "act_activos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_activos" ADD CONSTRAINT "act_activos_asignado_id_personas_id_fk" FOREIGN KEY ("asignado_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_activos" ADD CONSTRAINT "act_activos_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_activos" ADD CONSTRAINT "act_activos_proveedor_id_terceros_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_amortizaciones" ADD CONSTRAINT "act_amortizaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_amortizaciones" ADD CONSTRAINT "act_amortizaciones_activo_id_act_activos_id_fk" FOREIGN KEY ("activo_id") REFERENCES "public"."act_activos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_asignaciones" ADD CONSTRAINT "act_asignaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_asignaciones" ADD CONSTRAINT "act_asignaciones_activo_id_act_activos_id_fk" FOREIGN KEY ("activo_id") REFERENCES "public"."act_activos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_asignaciones" ADD CONSTRAINT "act_asignaciones_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_asignaciones" ADD CONSTRAINT "act_asignaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_registros" ADD CONSTRAINT "act_registros_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_registros" ADD CONSTRAINT "act_registros_activo_id_act_activos_id_fk" FOREIGN KEY ("activo_id") REFERENCES "public"."act_activos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_registros" ADD CONSTRAINT "act_registros_proveedor_id_terceros_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_registros" ADD CONSTRAINT "act_registros_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_registros" ADD CONSTRAINT "act_registros_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_registros" ADD CONSTRAINT "act_registros_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_vencimientos" ADD CONSTRAINT "act_vencimientos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "act_vencimientos" ADD CONSTRAINT "act_vencimientos_activo_id_act_activos_id_fk" FOREIGN KEY ("activo_id") REFERENCES "public"."act_activos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_distribucion" ADD CONSTRAINT "dtc_distribucion_documento_id_dtc_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."dtc_documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_distribucion" ADD CONSTRAINT "dtc_distribucion_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_documentos" ADD CONSTRAINT "dtc_documentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_documentos" ADD CONSTRAINT "dtc_documentos_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_documentos" ADD CONSTRAINT "dtc_documentos_responsable_id_personas_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_documentos" ADD CONSTRAINT "dtc_documentos_revisor_id_personas_id_fk" FOREIGN KEY ("revisor_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_lecturas" ADD CONSTRAINT "dtc_lecturas_documento_id_dtc_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."dtc_documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_lecturas" ADD CONSTRAINT "dtc_lecturas_version_id_dtc_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."dtc_versiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_lecturas" ADD CONSTRAINT "dtc_lecturas_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_versiones" ADD CONSTRAINT "dtc_versiones_documento_id_dtc_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."dtc_documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_versiones" ADD CONSTRAINT "dtc_versiones_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_versiones" ADD CONSTRAINT "dtc_versiones_autor_id_personas_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_versiones" ADD CONSTRAINT "dtc_versiones_aprobado_por_personas_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_vinculos" ADD CONSTRAINT "dtc_vinculos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dtc_vinculos" ADD CONSTRAINT "dtc_vinculos_documento_id_dtc_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."dtc_documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_conciliaciones" ADD CONSTRAINT "tes_conciliaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_conciliaciones" ADD CONSTRAINT "tes_conciliaciones_movimiento_id_tes_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."tes_movimientos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_conciliaciones" ADD CONSTRAINT "tes_conciliaciones_pago_id_tes_pagos_id_fk" FOREIGN KEY ("pago_id") REFERENCES "public"."tes_pagos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_conciliaciones" ADD CONSTRAINT "tes_conciliaciones_vencimiento_id_tes_vencimientos_id_fk" FOREIGN KEY ("vencimiento_id") REFERENCES "public"."tes_vencimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_cuentas" ADD CONSTRAINT "tes_cuentas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_movimientos" ADD CONSTRAINT "tes_movimientos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_movimientos" ADD CONSTRAINT "tes_movimientos_cuenta_id_tes_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."tes_cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_pagos" ADD CONSTRAINT "tes_pagos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_pagos" ADD CONSTRAINT "tes_pagos_vencimiento_id_tes_vencimientos_id_fk" FOREIGN KEY ("vencimiento_id") REFERENCES "public"."tes_vencimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_pagos" ADD CONSTRAINT "tes_pagos_cuenta_id_tes_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."tes_cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_pagos" ADD CONSTRAINT "tes_pagos_remesa_id_tes_remesas_id_fk" FOREIGN KEY ("remesa_id") REFERENCES "public"."tes_remesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_remesas" ADD CONSTRAINT "tes_remesas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_remesas" ADD CONSTRAINT "tes_remesas_cuenta_id_tes_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."tes_cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_remesas" ADD CONSTRAINT "tes_remesas_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_remesas" ADD CONSTRAINT "tes_remesas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_vencimientos" ADD CONSTRAINT "tes_vencimientos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_vencimientos" ADD CONSTRAINT "tes_vencimientos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_vencimientos" ADD CONSTRAINT "tes_vencimientos_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tes_vencimientos" ADD CONSTRAINT "tes_vencimientos_remesa_id_tes_remesas_id_fk" FOREIGN KEY ("remesa_id") REFERENCES "public"."tes_remesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_apuntes" ADD CONSTRAINT "cnt_apuntes_asiento_id_cnt_asientos_id_fk" FOREIGN KEY ("asiento_id") REFERENCES "public"."cnt_asientos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_apuntes" ADD CONSTRAINT "cnt_apuntes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_apuntes" ADD CONSTRAINT "cnt_apuntes_cuenta_id_cnt_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cnt_cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_apuntes" ADD CONSTRAINT "cnt_apuntes_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_apuntes" ADD CONSTRAINT "cnt_apuntes_centro_coste_id_cnt_centros_coste_id_fk" FOREIGN KEY ("centro_coste_id") REFERENCES "public"."cnt_centros_coste"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_asientos" ADD CONSTRAINT "cnt_asientos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_asientos" ADD CONSTRAINT "cnt_asientos_ejercicio_id_cnt_ejercicios_id_fk" FOREIGN KEY ("ejercicio_id") REFERENCES "public"."cnt_ejercicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_asientos" ADD CONSTRAINT "cnt_asientos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_centros_coste" ADD CONSTRAINT "cnt_centros_coste_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_cuentas" ADD CONSTRAINT "cnt_cuentas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_ejercicios" ADD CONSTRAINT "cnt_ejercicios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_subcuentas_terceros" ADD CONSTRAINT "cnt_subcuentas_terceros_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_subcuentas_terceros" ADD CONSTRAINT "cnt_subcuentas_terceros_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_subcuentas_terceros" ADD CONSTRAINT "cnt_subcuentas_terceros_cuenta_id_cnt_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cnt_cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_terceros_fiscal" ADD CONSTRAINT "cnt_terceros_fiscal_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnt_terceros_fiscal" ADD CONSTRAINT "cnt_terceros_fiscal_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_gastos" ADD CONSTRAINT "gas_gastos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_gastos" ADD CONSTRAINT "gas_gastos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_gastos" ADD CONSTRAINT "gas_gastos_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_gastos" ADD CONSTRAINT "gas_gastos_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_gastos" ADD CONSTRAINT "gas_gastos_tarjeta_id_gas_tarjetas_id_fk" FOREIGN KEY ("tarjeta_id") REFERENCES "public"."gas_tarjetas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_gastos" ADD CONSTRAINT "gas_gastos_aprobado_por_personas_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_gastos" ADD CONSTRAINT "gas_gastos_liquidacion_id_gas_liquidaciones_id_fk" FOREIGN KEY ("liquidacion_id") REFERENCES "public"."gas_liquidaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_liquidaciones" ADD CONSTRAINT "gas_liquidaciones_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_liquidaciones" ADD CONSTRAINT "gas_liquidaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_tarjeta_movimientos" ADD CONSTRAINT "gas_tarjeta_movimientos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_tarjeta_movimientos" ADD CONSTRAINT "gas_tarjeta_movimientos_tarjeta_id_gas_tarjetas_id_fk" FOREIGN KEY ("tarjeta_id") REFERENCES "public"."gas_tarjetas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_tarjeta_movimientos" ADD CONSTRAINT "gas_tarjeta_movimientos_gasto_id_gas_gastos_id_fk" FOREIGN KEY ("gasto_id") REFERENCES "public"."gas_gastos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_tarjetas" ADD CONSTRAINT "gas_tarjetas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_tarjetas" ADD CONSTRAINT "gas_tarjetas_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bi_informes" ADD CONSTRAINT "bi_informes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bi_informes" ADD CONSTRAINT "bi_informes_propietario_id_usuarios_id_fk" FOREIGN KEY ("propietario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fic_cambios_empresa_id_estado_index" ON "fic_cambios" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "fic_formacion_persona_id_index" ON "fic_formacion" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "fic_formacion_empresa_id_caduca_index" ON "fic_formacion" USING btree ("empresa_id","caduca");--> statement-breakpoint
CREATE INDEX "fic_historial_persona_id_fecha_index" ON "fic_historial" USING btree ("persona_id","fecha");--> statement-breakpoint
CREATE INDEX "fic_prl_persona_id_index" ON "fic_prl" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "fic_prl_empresa_id_caduca_index" ON "fic_prl" USING btree ("empresa_id","caduca");--> statement-breakpoint
CREATE UNIQUE INDEX "fic_trabajadores_persona_uq" ON "fic_trabajadores" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "fic_trabajadores_empresa_id_dni_index" ON "fic_trabajadores" USING btree ("empresa_id","dni");--> statement-breakpoint
CREATE INDEX "fic_trabajadores_empresa_id_fin_contrato_index" ON "fic_trabajadores" USING btree ("empresa_id","fin_contrato");--> statement-breakpoint
CREATE UNIQUE INDEX "hor_anulaciones_fichaje_uq" ON "hor_anulaciones" USING btree ("fichaje_id");--> statement-breakpoint
CREATE INDEX "hor_asignaciones_persona_id_desde_index" ON "hor_asignaciones" USING btree ("persona_id","desde");--> statement-breakpoint
CREATE INDEX "hor_bolsa_persona_id_fecha_index" ON "hor_bolsa" USING btree ("persona_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "hor_bolsa_mes_uq" ON "hor_bolsa" USING btree ("persona_id","periodo","origen");--> statement-breakpoint
CREATE INDEX "hor_correcciones_empresa_id_estado_index" ON "hor_correcciones" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "hor_correcciones_persona_id_fecha_index" ON "hor_correcciones" USING btree ("persona_id","fecha");--> statement-breakpoint
CREATE INDEX "hor_cuadrante_empresa_id_fecha_index" ON "hor_cuadrante" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "hor_fichajes_persona_id_momento_index" ON "hor_fichajes" USING btree ("persona_id","momento");--> statement-breakpoint
CREATE INDEX "hor_fichajes_momento_brin" ON "hor_fichajes" USING brin ("momento");--> statement-breakpoint
CREATE INDEX "hor_fichajes_empresa_id_momento_index" ON "hor_fichajes" USING btree ("empresa_id","momento");--> statement-breakpoint
CREATE UNIQUE INDEX "hor_firmas_mes_uq" ON "hor_firmas_mes" USING btree ("persona_id","anio","mes");--> statement-breakpoint
CREATE INDEX "hor_turnos_empresa_id_index" ON "hor_turnos" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aus_minimos_dep_uq" ON "aus_minimos" USING btree ("departamento_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aus_saldos_uq" ON "aus_saldos" USING btree ("persona_id","tipo_id","anio");--> statement-breakpoint
CREATE INDEX "aus_solicitudes_empresa_id_estado_index" ON "aus_solicitudes" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "aus_solicitudes_persona_id_desde_index" ON "aus_solicitudes" USING btree ("persona_id","desde");--> statement-breakpoint
CREATE INDEX "aus_solicitudes_empresa_id_desde_hasta_index" ON "aus_solicitudes" USING btree ("empresa_id","desde","hasta");--> statement-breakpoint
CREATE INDEX "aus_tipos_empresa_id_index" ON "aus_tipos" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "nom_anticipos_empresa_id_estado_index" ON "nom_anticipos" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "nom_anticipos_persona_id_index" ON "nom_anticipos" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nom_periodos_uq" ON "nom_periodos" USING btree ("empresa_id","anio","mes");--> statement-breakpoint
CREATE INDEX "nom_recibos_persona_id_anio_index" ON "nom_recibos" USING btree ("persona_id","anio");--> statement-breakpoint
CREATE INDEX "nom_recibos_periodo_id_index" ON "nom_recibos" USING btree ("periodo_id");--> statement-breakpoint
CREATE INDEX "nom_variables_periodo_id_persona_id_index" ON "nom_variables" USING btree ("periodo_id","persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nom_variables_origen_uq" ON "nom_variables" USING btree ("origen","origen_id");--> statement-breakpoint
CREATE INDEX "alt_candidatos_oferta_id_estado_index" ON "alt_candidatos" USING btree ("oferta_id","estado");--> statement-breakpoint
CREATE INDEX "alt_evaluaciones_persona_id_index" ON "alt_evaluaciones" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "alt_evaluaciones_evaluador_id_index" ON "alt_evaluaciones" USING btree ("evaluador_id");--> statement-breakpoint
CREATE INDEX "alt_ofertas_empresa_id_estado_index" ON "alt_ofertas" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "alt_plan_formacion_empresa_id_anio_index" ON "alt_plan_formacion" USING btree ("empresa_id","anio");--> statement-breakpoint
CREATE INDEX "alt_proceso_tareas_proceso_id_index" ON "alt_proceso_tareas" USING btree ("proceso_id");--> statement-breakpoint
CREATE INDEX "alt_procesos_empresa_id_estado_index" ON "alt_procesos" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "alt_procesos_persona_id_index" ON "alt_procesos" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "crm_actividades_tercero_id_fecha_index" ON "crm_actividades" USING btree ("tercero_id","fecha");--> statement-breakpoint
CREATE INDEX "crm_actividades_persona_id_proxima_fecha_index" ON "crm_actividades" USING btree ("persona_id","proxima_fecha");--> statement-breakpoint
CREATE INDEX "crm_actividades_busqueda_trgm" ON "crm_actividades" USING gin ((coalesce("asunto",'') || ' ' || coalesce("descripcion",'')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "opo_etapas_empresa_id_orden_index" ON "opo_etapas" USING btree ("empresa_id","orden");--> statement-breakpoint
CREATE INDEX "opo_oportunidades_empresa_id_etapa_id_index" ON "opo_oportunidades" USING btree ("empresa_id","etapa_id");--> statement-breakpoint
CREATE INDEX "opo_oportunidades_comercial_id_index" ON "opo_oportunidades" USING btree ("comercial_id");--> statement-breakpoint
CREATE INDEX "opo_oportunidades_tercero_id_index" ON "opo_oportunidades" USING btree ("tercero_id");--> statement-breakpoint
CREATE INDEX "stk_almacenes_empresa_id_tipo_index" ON "stk_almacenes" USING btree ("empresa_id","tipo");--> statement-breakpoint
CREATE INDEX "stk_almacenes_persona_id_index" ON "stk_almacenes" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stk_avisos_articulo_id_almacen_id_tipo_fecha_index" ON "stk_avisos" USING btree ("articulo_id","almacen_id","tipo","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "stk_inventario_lineas_inventario_id_articulo_id_lote_index" ON "stk_inventario_lineas" USING btree ("inventario_id","articulo_id","lote");--> statement-breakpoint
CREATE INDEX "stk_inventarios_empresa_id_estado_index" ON "stk_inventarios" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "stk_kit_componentes_kit_id_componente_id_index" ON "stk_kit_componentes" USING btree ("kit_id","componente_id");--> statement-breakpoint
CREATE INDEX "stk_kit_componentes_componente_id_index" ON "stk_kit_componentes" USING btree ("componente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stk_lotes_articulo_id_lote_index" ON "stk_lotes" USING btree ("articulo_id","lote");--> statement-breakpoint
CREATE INDEX "stk_lotes_empresa_id_caducidad_index" ON "stk_lotes" USING btree ("empresa_id","caducidad");--> statement-breakpoint
CREATE INDEX "stk_movimientos_momento_brin" ON "stk_movimientos" USING brin ("momento");--> statement-breakpoint
CREATE INDEX "stk_movimientos_articulo_id_momento_index" ON "stk_movimientos" USING btree ("articulo_id","momento");--> statement-breakpoint
CREATE INDEX "stk_movimientos_almacen_id_momento_index" ON "stk_movimientos" USING btree ("almacen_id","momento");--> statement-breakpoint
CREATE INDEX "stk_movimientos_documento_id_index" ON "stk_movimientos" USING btree ("documento_id");--> statement-breakpoint
CREATE INDEX "stk_movimientos_origen_tipo_origen_id_index" ON "stk_movimientos" USING btree ("origen_tipo","origen_id");--> statement-breakpoint
CREATE INDEX "stk_movimientos_empresa_id_lote_index" ON "stk_movimientos" USING btree ("empresa_id","lote");--> statement-breakpoint
CREATE UNIQUE INDEX "stk_reservas_linea_id_articulo_id_index" ON "stk_reservas" USING btree ("linea_id","articulo_id");--> statement-breakpoint
CREATE INDEX "stk_reservas_documento_id_index" ON "stk_reservas" USING btree ("documento_id");--> statement-breakpoint
CREATE INDEX "stk_reservas_articulo_id_index" ON "stk_reservas" USING btree ("articulo_id");--> statement-breakpoint
CREATE INDEX "stk_saldos_empresa_id_almacen_id_index" ON "stk_saldos" USING btree ("empresa_id","almacen_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stk_series_articulo_id_numero_serie_index" ON "stk_series" USING btree ("articulo_id","numero_serie");--> statement-breakpoint
CREATE INDEX "stk_series_numero_trgm" ON "stk_series" USING gin ("numero_serie" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "stk_traspasos_empresa_id_fecha_index" ON "stk_traspasos" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "stk_traspasos_origen_id_index" ON "stk_traspasos" USING btree ("origen_id");--> statement-breakpoint
CREATE INDEX "stk_traspasos_destino_id_index" ON "stk_traspasos" USING btree ("destino_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stk_ubicaciones_almacen_id_codigo_index" ON "stk_ubicaciones" USING btree ("almacen_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "cpr_articulo_proveedor_articulo_id_proveedor_id_index" ON "cpr_articulo_proveedor" USING btree ("articulo_id","proveedor_id");--> statement-breakpoint
CREATE INDEX "cpr_articulo_proveedor_proveedor_id_index" ON "cpr_articulo_proveedor" USING btree ("proveedor_id");--> statement-breakpoint
CREATE INDEX "cpr_incidencias_documento_id_index" ON "cpr_incidencias" USING btree ("documento_id");--> statement-breakpoint
CREATE INDEX "cpr_incidencias_tercero_id_creado_en_index" ON "cpr_incidencias" USING btree ("tercero_id","creado_en");--> statement-breakpoint
CREATE INDEX "cpr_solicitudes_empresa_id_estado_index" ON "cpr_solicitudes" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "cpr_solicitudes_solicitante_id_index" ON "cpr_solicitudes" USING btree ("solicitante_id");--> statement-breakpoint
CREATE INDEX "cpr_solicitudes_documento_id_index" ON "cpr_solicitudes" USING btree ("documento_id");--> statement-breakpoint
CREATE INDEX "pry_consumos_proyecto_id_fecha_index" ON "pry_consumos" USING btree ("proyecto_id","fecha");--> statement-breakpoint
CREATE INDEX "pry_consumos_partida_id_index" ON "pry_consumos" USING btree ("partida_id");--> statement-breakpoint
CREATE INDEX "pry_fases_proyecto_id_orden_index" ON "pry_fases" USING btree ("proyecto_id","orden");--> statement-breakpoint
CREATE INDEX "pry_hitos_proyecto_id_index" ON "pry_hitos" USING btree ("proyecto_id");--> statement-breakpoint
CREATE INDEX "pry_imputaciones_proyecto_id_fecha_index" ON "pry_imputaciones" USING btree ("proyecto_id","fecha");--> statement-breakpoint
CREATE INDEX "pry_imputaciones_persona_id_fecha_index" ON "pry_imputaciones" USING btree ("persona_id","fecha");--> statement-breakpoint
CREATE INDEX "pry_imputaciones_partida_id_index" ON "pry_imputaciones" USING btree ("partida_id");--> statement-breakpoint
CREATE INDEX "pry_partidas_proyecto_id_orden_index" ON "pry_partidas" USING btree ("proyecto_id","orden");--> statement-breakpoint
CREATE INDEX "pry_proyectos_empresa_id_estado_index" ON "pry_proyectos" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "pry_proyectos_responsable_id_index" ON "pry_proyectos" USING btree ("responsable_id");--> statement-breakpoint
CREATE INDEX "pry_proyectos_cliente_id_index" ON "pry_proyectos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "pry_proyectos_miembros_index" ON "pry_proyectos" USING gin ("miembros");--> statement-breakpoint
CREATE INDEX "pry_proyectos_busqueda_trgm" ON "pry_proyectos" USING gin ((coalesce("codigo",'') || ' ' || coalesce("nombre",'')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "pry_tareas_proyecto_id_estado_orden_index" ON "pry_tareas" USING btree ("proyecto_id","estado","orden");--> statement-breakpoint
CREATE INDEX "pry_tareas_asignado_id_estado_index" ON "pry_tareas" USING btree ("asignado_id","estado");--> statement-breakpoint
CREATE INDEX "sat_checklists_empresa_id_index" ON "sat_checklists" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "sat_contratos_empresa_id_estado_proxima_visita_index" ON "sat_contratos" USING btree ("empresa_id","estado","proxima_visita");--> statement-breakpoint
CREATE INDEX "sat_contratos_tercero_id_index" ON "sat_contratos" USING btree ("tercero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sat_contratos_empresa_id_codigo_index" ON "sat_contratos" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "sat_equipos_empresa_id_index" ON "sat_equipos" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "sat_equipos_tercero_id_index" ON "sat_equipos" USING btree ("tercero_id");--> statement-breakpoint
CREATE INDEX "sat_equipos_contrato_id_index" ON "sat_equipos" USING btree ("contrato_id");--> statement-breakpoint
CREATE INDEX "sat_equipos_articulo_id_index" ON "sat_equipos" USING btree ("articulo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sat_equipos_token_uq" ON "sat_equipos" USING btree ("portal_token");--> statement-breakpoint
CREATE INDEX "sat_equipos_busqueda_trgm" ON "sat_equipos" USING gin ((coalesce("nombre",'') || ' ' || coalesce("numero_serie",'') || ' ' || coalesce("modelo",'')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "sat_orden_materiales_orden_id_index" ON "sat_orden_materiales" USING btree ("orden_id");--> statement-breakpoint
CREATE INDEX "sat_orden_tiempos_orden_id_index" ON "sat_orden_tiempos" USING btree ("orden_id");--> statement-breakpoint
CREATE INDEX "sat_orden_tiempos_persona_id_inicio_index" ON "sat_orden_tiempos" USING btree ("persona_id","inicio");--> statement-breakpoint
CREATE INDEX "sat_ordenes_empresa_id_estado_index" ON "sat_ordenes" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "sat_ordenes_tecnico_id_planificada_inicio_index" ON "sat_ordenes" USING btree ("tecnico_id","planificada_inicio");--> statement-breakpoint
CREATE INDEX "sat_ordenes_tercero_id_creado_en_index" ON "sat_ordenes" USING btree ("tercero_id","creado_en");--> statement-breakpoint
CREATE INDEX "sat_ordenes_ticket_id_index" ON "sat_ordenes" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "sat_ordenes_equipo_id_index" ON "sat_ordenes" USING btree ("equipo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sat_ordenes_empresa_id_codigo_index" ON "sat_ordenes" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "sat_ordenes_visita_uq" ON "sat_ordenes" USING btree ("contrato_id","visita_fecha");--> statement-breakpoint
CREATE INDEX "sat_ordenes_busqueda_trgm" ON "sat_ordenes" USING gin ((coalesce("codigo",'') || ' ' || coalesce("descripcion",'')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "sat_tickets_empresa_id_estado_index" ON "sat_tickets" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "sat_tickets_tercero_id_creado_en_index" ON "sat_tickets" USING btree ("tercero_id","creado_en");--> statement-breakpoint
CREATE INDEX "sat_tickets_responsable_id_index" ON "sat_tickets" USING btree ("responsable_id");--> statement-breakpoint
CREATE INDEX "sat_tickets_equipo_id_index" ON "sat_tickets" USING btree ("equipo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sat_tickets_empresa_id_codigo_index" ON "sat_tickets" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "sat_tickets_token_uq" ON "sat_tickets" USING btree ("portal_token");--> statement-breakpoint
CREATE INDEX "sat_tickets_busqueda_trgm" ON "sat_tickets" USING gin ((coalesce("codigo",'') || ' ' || coalesce("asunto",'')) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "act_activos_codigo_uq" ON "act_activos" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "act_activos_empresa_id_tipo_index" ON "act_activos" USING btree ("empresa_id","tipo");--> statement-breakpoint
CREATE INDEX "act_activos_asignado_id_index" ON "act_activos" USING btree ("asignado_id");--> statement-breakpoint
CREATE INDEX "act_activos_busqueda_trgm" ON "act_activos" USING gin ((coalesce("codigo",'') || ' ' || coalesce("nombre",'') || ' ' || coalesce("matricula",'') || ' ' || coalesce("numero_serie",'')) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "act_amortizaciones_activo_id_periodo_index" ON "act_amortizaciones" USING btree ("activo_id","periodo");--> statement-breakpoint
CREATE INDEX "act_amortizaciones_empresa_id_periodo_index" ON "act_amortizaciones" USING btree ("empresa_id","periodo");--> statement-breakpoint
CREATE INDEX "act_asignaciones_activo_id_desde_index" ON "act_asignaciones" USING btree ("activo_id","desde");--> statement-breakpoint
CREATE INDEX "act_asignaciones_persona_id_index" ON "act_asignaciones" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "act_registros_activo_id_fecha_index" ON "act_registros" USING btree ("activo_id","fecha");--> statement-breakpoint
CREATE INDEX "act_registros_empresa_id_tipo_index" ON "act_registros" USING btree ("empresa_id","tipo");--> statement-breakpoint
CREATE INDEX "act_vencimientos_empresa_id_estado_fecha_index" ON "act_vencimientos" USING btree ("empresa_id","estado","fecha");--> statement-breakpoint
CREATE INDEX "act_vencimientos_activo_id_index" ON "act_vencimientos" USING btree ("activo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dtc_documentos_empresa_id_codigo_index" ON "dtc_documentos" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "dtc_documentos_empresa_id_estado_index" ON "dtc_documentos" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "dtc_documentos_empresa_id_proxima_revision_index" ON "dtc_documentos" USING btree ("empresa_id","proxima_revision");--> statement-breakpoint
CREATE INDEX "dtc_documentos_busqueda_trgm" ON "dtc_documentos" USING gin ((coalesce("codigo",'') || ' ' || coalesce("titulo",'')) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "dtc_lecturas_version_id_persona_id_index" ON "dtc_lecturas" USING btree ("version_id","persona_id");--> statement-breakpoint
CREATE INDEX "dtc_lecturas_persona_id_index" ON "dtc_lecturas" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "dtc_versiones_documento_id_creado_en_index" ON "dtc_versiones" USING btree ("documento_id","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "dtc_versiones_documento_id_numero_index" ON "dtc_versiones" USING btree ("documento_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "dtc_versiones_vigente_uq" ON "dtc_versiones" USING btree ("documento_id") WHERE estado = 'aprobada';--> statement-breakpoint
CREATE UNIQUE INDEX "dtc_vinculos_documento_id_entidad_entidad_id_index" ON "dtc_vinculos" USING btree ("documento_id","entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "dtc_vinculos_entidad_entidad_id_index" ON "dtc_vinculos" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "tes_conciliaciones_movimiento_id_index" ON "tes_conciliaciones" USING btree ("movimiento_id");--> statement-breakpoint
CREATE INDEX "tes_conciliaciones_pago_id_index" ON "tes_conciliaciones" USING btree ("pago_id");--> statement-breakpoint
CREATE INDEX "tes_cuentas_empresa_id_index" ON "tes_cuentas" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "tes_movimientos_cuenta_id_fecha_index" ON "tes_movimientos" USING btree ("cuenta_id","fecha");--> statement-breakpoint
CREATE INDEX "tes_movimientos_empresa_id_estado_index" ON "tes_movimientos" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "tes_movimientos_empresa_id_hash_index" ON "tes_movimientos" USING btree ("empresa_id","hash");--> statement-breakpoint
CREATE INDEX "tes_pagos_vencimiento_id_index" ON "tes_pagos" USING btree ("vencimiento_id");--> statement-breakpoint
CREATE INDEX "tes_pagos_empresa_id_fecha_index" ON "tes_pagos" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "tes_pagos_cuenta_id_fecha_index" ON "tes_pagos" USING btree ("cuenta_id","fecha");--> statement-breakpoint
CREATE INDEX "tes_remesas_empresa_id_estado_index" ON "tes_remesas" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "tes_remesas_empresa_id_codigo_index" ON "tes_remesas" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "tes_vencimientos_empresa_id_circuito_estado_fecha_index" ON "tes_vencimientos" USING btree ("empresa_id","circuito","estado","fecha");--> statement-breakpoint
CREATE INDEX "tes_vencimientos_tercero_id_index" ON "tes_vencimientos" USING btree ("tercero_id");--> statement-breakpoint
CREATE INDEX "tes_vencimientos_remesa_id_index" ON "tes_vencimientos" USING btree ("remesa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tes_vencimientos_doc_plazo_uq" ON "tes_vencimientos" USING btree ("documento_id","plazo") WHERE "tes_vencimientos"."documento_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cnt_apuntes_asiento_id_index" ON "cnt_apuntes" USING btree ("asiento_id");--> statement-breakpoint
CREATE INDEX "cnt_apuntes_empresa_id_cuenta_index" ON "cnt_apuntes" USING btree ("empresa_id","cuenta");--> statement-breakpoint
CREATE INDEX "cnt_apuntes_cuenta_id_index" ON "cnt_apuntes" USING btree ("cuenta_id");--> statement-breakpoint
CREATE INDEX "cnt_asientos_empresa_id_fecha_index" ON "cnt_asientos" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "cnt_asientos_ejercicio_id_numero_index" ON "cnt_asientos" USING btree ("ejercicio_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "cnt_asientos_ref_uq" ON "cnt_asientos" USING btree ("empresa_id","origen","ref_clave") WHERE "cnt_asientos"."ref_clave" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cnt_asientos_documento_id_index" ON "cnt_asientos" USING btree ("documento_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cnt_centros_coste_empresa_id_codigo_index" ON "cnt_centros_coste" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "cnt_cuentas_empresa_id_codigo_index" ON "cnt_cuentas" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE INDEX "cnt_cuentas_nombre_trgm" ON "cnt_cuentas" USING gin (("codigo" || ' ' || "nombre") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "cnt_ejercicios_empresa_id_anio_index" ON "cnt_ejercicios" USING btree ("empresa_id","anio");--> statement-breakpoint
CREATE UNIQUE INDEX "cnt_subcuentas_terceros_empresa_id_tercero_id_tipo_index" ON "cnt_subcuentas_terceros" USING btree ("empresa_id","tercero_id","tipo");--> statement-breakpoint
CREATE UNIQUE INDEX "cnt_terceros_fiscal_empresa_id_tercero_id_index" ON "cnt_terceros_fiscal" USING btree ("empresa_id","tercero_id");--> statement-breakpoint
CREATE INDEX "gas_gastos_empresa_id_estado_index" ON "gas_gastos" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "gas_gastos_persona_id_fecha_index" ON "gas_gastos" USING btree ("persona_id","fecha");--> statement-breakpoint
CREATE INDEX "gas_gastos_proyecto_id_index" ON "gas_gastos" USING btree ("proyecto_id");--> statement-breakpoint
CREATE INDEX "gas_gastos_tarjeta_id_index" ON "gas_gastos" USING btree ("tarjeta_id");--> statement-breakpoint
CREATE INDEX "gas_liquidaciones_empresa_id_fecha_index" ON "gas_liquidaciones" USING btree ("empresa_id","fecha");--> statement-breakpoint
CREATE INDEX "gas_tarjeta_movimientos_tarjeta_id_fecha_index" ON "gas_tarjeta_movimientos" USING btree ("tarjeta_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "gas_tarjeta_movimientos_empresa_id_hash_index" ON "gas_tarjeta_movimientos" USING btree ("empresa_id","hash");--> statement-breakpoint
CREATE INDEX "gas_tarjetas_empresa_id_index" ON "gas_tarjetas" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "gas_tarjetas_persona_id_index" ON "gas_tarjetas" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "bi_informes_empresa_id_propietario_id_index" ON "bi_informes" USING btree ("empresa_id","propietario_id");