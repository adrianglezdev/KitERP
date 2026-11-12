# Arquitectura de KiteERP

KiteERP es un ERP web modular para empresas medianas. Todos los módulos comparten una única base de datos PostgreSQL, y cada empresa puede activar o desactivar los módulos opcionales.

## Estructura del repositorio

```
apps/api        API (Node + Fastify + Drizzle ORM + PostgreSQL)
apps/web        Web (React + Vite + Tailwind), responsive y PWA
packages/shared Código común a la API y la web: catálogo de módulos, permisos,
                definiciones de recursos (validación + formularios), cálculo de documentos,
                validadores españoles (NIF/CIF/NIE, IBAN), formato y contratos de eventos
docs/           Documentación
```

## Principios

1. **Un núcleo siempre activo** con lo que todos los módulos necesitan: personas, terceros (clientes y proveedores), catálogo de artículos, documentos comerciales, usuarios y permisos, adjuntos, comentarios, tareas, avisos, auditoría.
2. **Cada módulo es una carpeta** en `apps/api/src/modules/<código>` y `apps/web/src/modules/<código>`, con sus tablas prefijadas (`sat_ordenes`, `stk_movimientos`…). Un módulo lee las tablas del núcleo pero nunca escribe en las de otro módulo.
3. **Los módulos se comunican por eventos** (`packages/shared/src/events.ts`). El evento se procesa en la misma transacción que lo provoca: o se guarda todo o no se guarda nada. Si el módulo receptor está desactivado, el evento no tiene efecto.
4. **Desactivar no borra datos**: solo oculta menús, rutas y permisos.
5. **Una sola definición por entidad** (`defineResource` en `packages/shared`): la usa la API para validar y la web para pintar listados y formularios.
6. **Los datos legales son inalterables**: facturas emitidas, registros Verifactu, fichajes y auditoría están protegidos por disparadores de PostgreSQL, no solo por la aplicación.

## Datos: seguridad y volumen

- Identificadores UUID v7 (ordenados en el tiempo: índices compactos con millones de filas).
- Importes en `numeric(14,2)` y cantidades/precios unitarios en `numeric(14,4)`. Nunca coma flotante en la base de datos.
- Índices trigram (`pg_trgm`) para búsquedas por nombre, NIF o referencia sin recorrer tablas enteras; índices BRIN en tablas de series temporales (auditoría, fichajes, movimientos).
- Toda escritura va en una transacción y deja rastro en `auditoria` (quién, qué, cuándo, antes y después).
- Numeración legal sin huecos: la fila de la serie se bloquea (`SELECT … FOR UPDATE`) al asignar número.
- Archivos guardados por su huella SHA-256 (sin duplicados y con verificación de integridad). Las descargas usan URLs firmadas que caducan.
- Borrado lógico (`archivado_en`) en datos maestros; los documentos emitidos nunca se borran.
- Copias de seguridad: `scripts/backup.sh` (pg_dump diario con rotación + archivos). Ver README.

## Permisos

Cada permiso pertenece a un módulo y algunos llevan **alcance**: `propio` (lo suyo), `equipo` (lo suyo y lo de quien depende de él, a cualquier nivel), `departamento` o `todo`. Los roles de partida están en `packages/shared/src/permissions.ts`.

- Quien tiene personas a su cargo amplía automáticamente “lo suyo” a “su equipo” (salvo nóminas y datos sensibles).
- Todo trabajador con usuario tiene una base común: fichar, pedir vacaciones, ver sus nóminas, registrar gastos, solicitar compras.
- Ejemplo: Comercial y Administración no tienen permisos del servicio técnico, así que no ven tickets ni órdenes, ni en menús, ni en búsquedas, ni en fichas de cliente.

En la API: `guard('perm')`, `need(ctx, 'perm')`, `scopeWhere(ctx, 'perm', columnaDueño)`, `canOnOwner(ctx, 'perm', personaId)`.
En la web: `const { can, has } = useSession()`.

## Cómo se construye un módulo

### API (`apps/api/src/modules/<código>/`)

- `schema.ts`: tablas Drizzle con prefijo `<código>_`. Importar el núcleo desde `../../db/schema/core` y `../../db/schema/documentos` (no desde `../../db/schema`, para evitar importaciones circulares). Usar los ayudantes de `../../db/helpers` (`pk`, `money`, `price`, `qty`, `pct`, `createdAt`, `day`, `flag`…).
- `index.ts`: `export default defineModule({ code, routes, events, refTargets, entities, dashboard, approvals, timeline, search, jobs, seed })`.
- Rutas: se montan en `/api/<código>` y responden 403 si el módulo está desactivado. `registerCrud(app, {...})` da listado paginado con búsqueda, filtros, orden, exportación a Excel, alta, edición y archivado auditados.
- Integridad extra (disparadores) en `apps/api/src/db/sql/post/<código>.sql`, idempotente.
- Servicios del núcleo: `audit`, `notify`, `emit`, `nextNumber`/`nextCode`, `saveFile`/`fileUrl`, `getAjustes`, `queueEmail`, `crearDocumento`/`ejecutarAccion`/`convertir` (motor de documentos), `calcVencimientos`.

### Web (`apps/web/src/modules/<código>/`)

- `index.tsx`: `export default defineModule({ code, nav, routes, portal, quickCreate, entityTabs })`. `nav` son los apartados de su aplicación en la barra lateral. Las rutas son relativas (`'sat/ordenes'`) y se cargan bajo demanda con `page(() => import('./pages/X'))`. Las rutas públicas (sin sesión) empiezan por `/publico/`.
- Componentes comunes: `@/components/ui` (botones, tablas que se convierten en tarjetas en el móvil, diálogos, selectores con búsqueda, firma…), `@/components/resource` (listados y formularios automáticos), `@/components/entity` (adjuntos, comentarios, tareas, actividad), `@/components/docs` (documentos comerciales), `@/components/charts/Widget`.
- `entityTabs` añade pestañas a las fichas de persona, tercero o artículo.

## Aplicaciones y lanzador

En la web cada módulo activo se presenta como una **aplicación** (`apps/web/src/layout/apps.ts`): tiene icono, color de su pilar y sus apartados, que son los de `nav` del módulo. Algunas juntan pantallas del núcleo con las de un módulo (Equipo = directorio + ficha; Clientes = terceros + CRM; Almacén = catálogo + stock) y Configuración es una aplicación más.

- La barra lateral enseña solo los apartados de la aplicación abierta. Cuál es se deduce de la dirección (`locate`, gana el prefijo más largo); las pantallas sin apartado propio la indican con `useClaimApp` (un documento dice si es de Facturas, Presupuestos o Compras) y, si no, se mantiene la última.
- El lanzador (`AppLauncher.tsx`) es la cuadrícula de la cabecera: favoritas arriba, editables con el lápiz (añadir, quitar y ordenar arrastrando), y el resto debajo. Las favoritas también están en la parte alta de la barra lateral. Se guardan por persona y empresa en `usuario_empresas.preferencias` (`PATCH /api/auth/preferencias`).
- Para añadir una aplicación basta una entrada en `APPS`; un módulo nuevo aparece al declarar su `nav`.

## Apariencia por empresa

Cada empresa guarda su apariencia en `empresas.ajustes.apariencia` (tipo `Apariencia` de `packages/shared/src/apariencia.ts`, validado con `aparienciaSchema`): tema de partida, cinco colores con un papel fijo (principal, acento, información, alerta y estructura), tipografías de títulos y texto, esquinas, forma de los botones, estilo de las tarjetas, barra lateral, densidad, modo al abrir y nombre de la aplicación. Se edita en Configuración → Apariencia, con vista previa en claro y oscuro.

- `apps/web/src/lib/theme.ts` convierte esa apariencia en variables CSS (claro y oscuro, tonos suaves, tintas legibles, sombras, radios, tipografías). **Ningún componente lleva colores fijos**: Tailwind (`tailwind.config.js`) solo da nombre a las variables (`bg-primary`, `text-ok`, `bg-side`, `rounded-pill`, `shadow-card`…). Para un color nuevo, añade la variable en `buildTokens` y su valor por defecto en `index.css`.
- `rounded-pill` es la forma de botones, pestañas e insignias (píldora, redondeado o recto según el tema); el resto de radios se multiplican por `--radius`. `text-primary` usa la versión tinta del color principal para que siempre se lea.
- La apariencia viaja en `/api/auth/me` y se aplica al entrar o al cambiar de empresa. Se guarda en `localStorage` para pintarla antes de cargar la aplicación (`index.html`) y para la pantalla de entrada, que además la pide a `GET /api/public/marca`.
- Fuera de la aplicación también manda la empresa: los PDF de presupuestos y facturas y los correos usan `marcaDe(ajustes)` (`apps/api/src/core/marca.ts`), y las páginas públicas (portal del cliente, documentos, firmas, canal de denuncias, quiosco) reciben `marca` del servidor (`marcaPublica`).
- Los temas de partida están en `TEMAS`. Añadir uno es añadir un objeto a esa lista.

## Documentos comerciales

Presupuestos, pedidos, albaranes, facturas (y rectificativas, simplificadas, proformas) y los pedidos, recepciones y facturas de proveedor comparten las tablas `documentos`, `documento_lineas` y `documento_impuestos`. Cada línea recuerda de qué línea procede, lo que permite entregas y facturación parciales sin duplicar datos:

```
Oportunidad → Presupuesto → Pedido (reserva stock) → Albarán (descuenta stock) → Factura (Verifactu) → Vencimientos → Cobro → Asiento
Stock mínimo → Propuesta → Pedido a proveedor → Recepción (entra stock) → Factura de proveedor → Pago → Asiento
```

Al emitir una factura se asigna número correlativo, se copia la ficha fiscal del cliente, se bloquea (disparador), se genera el registro Verifactu encadenado con huella SHA-256 y QR, y se publica `ventas.factura_emitida`.

## Desarrollo

```
docker compose up -d db          # PostgreSQL en el puerto DB_PORT de .env (5433 por defecto)
pnpm install
pnpm db:reset                    # migraciones + datos de ejemplo
pnpm dev                         # API en :4000 y web en :5173
pnpm test                        # pruebas de la API
```

Para cambiar el esquema: editar los `schema.ts` y ejecutar `pnpm db:generate` (crea la migración SQL versionada en `apps/api/drizzle/`).
