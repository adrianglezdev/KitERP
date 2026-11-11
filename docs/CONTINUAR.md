# Cómo continuar el desarrollo

Notas tomadas al pausar el trabajo el **11/11/2026**. Léelas junto con [ARQUITECTURA.md](ARQUITECTURA.md) (convenciones) y [FUNCIONES.md](FUNCIONES.md) (qué debe hacer cada módulo).

## 1. Estado

### Terminado y guardado en git (rama `main`, solo en local)

- **Núcleo**: base de datos, sesiones y 2FA, permisos con alcance, módulos activables, adjuntos, comentarios, tareas, avisos, tablón, encuestas, canal de denuncias, firma electrónica, plantillas, importación, API y webhooks, búsqueda global, bandeja de aprobaciones, auditoría.
- **Motor de documentos comerciales** (`apps/api/src/services/documentos.ts`): presupuesto → pedido → albarán → factura, rectificativas, compras, Verifactu, Facturae, PDF, enlace público para el cliente, facturas recurrentes.
- **Web base**: diseño con la paleta, menú por pilares, móvil, componentes comunes y pantallas del núcleo y de Configuración.
- **Comercial**: CRM, OPO, PRE, PED y FAC (servidor y web).
- Pruebas: `apps/api/test/core.test.ts` (6, pasaban). `apps/api/test/comercial.test.ts` está escrito pero **no se ha llegado a ejecutar con éxito**: la carga de datos fallaba dentro de módulos a medias.

Nada se ha subido todavía a GitHub (`https://github.com/adrianglezdev/KitERP.git`, repositorio vacío).

### A medias (sin guardar en git)

Se construían en paralelo y se pararon antes de terminar. Mientras estén incompletos, **la API no arranca entera y `pnpm db:reset` falla**.

| Grupo | Módulos | Servidor | Web |
|---|---|---|---|
| Personas | fic, hor, aus, nom, alt, por | Avanzado (esquemas, rutas, cálculo de horas, datos de ejemplo) | Solo la página de fichar (`hor/pages/Fichar.tsx`) |
| Operaciones | stk, cpr, pry, act | stk y cpr avanzados; pry y act con rutas y servicio | stk casi completo; cpr, pry y act sin pantallas |
| Servicio técnico | sat, dtc | sat avanzado (incluye portal público); dtc con rutas y servicio | sat: tickets, mis órdenes, detalle y parte; dtc sin pantallas |
| Finanzas | tes, cnt, gas, bi | tes y cnt avanzados (SEPA, Norma 43, PGC, libros, modelos); gas y bi parciales | Sin pantallas |

Hay además un `apps/api/test/tecnico.test.ts` a medias.

## 2. Primeros pasos al retomar

1. Arranca Docker Desktop (se para a veces solo) y la base de datos: `docker compose up -d db`.
2. Comprueba qué falla al cargar los módulos:
   ```bash
   cd apps/api
   npx tsx -e "import('./src/modules/registry').then(()=>console.log('ok'))"
   npx tsc -p . --noEmit
   cd ../web && npx tsc -p . --noEmit
   ```
3. Termina los módulos uno a uno, por este orden (cada uno desbloquea al siguiente): **stk → cpr → fic/hor/aus → sat → tes → cnt → gas → nom → pry → act → dtc → alt → por → bi**. Para probar un módulo aislado se puede crear una base de datos propia:
   ```bash
   DATABASE_URL=postgres://kite:kite_dev_password@localhost:5433/kite_prueba npx tsx src/db/push-reset.ts
   DATABASE_URL=postgres://kite:kite_dev_password@localhost:5433/kite_prueba npx vitest run test/<archivo>.test.ts
   ```
4. Cuando todo cargue: `pnpm db:generate` (crea la migración `apps/api/drizzle/0001_*.sql` con todas las tablas de los módulos), `pnpm db:reset`, `pnpm test`.
5. Revisa en el navegador (`pnpm dev`, web en http://localhost:5173) con varias cuentas de demostración (ver README), en escritorio y en móvil.
6. `git add -A`, commit y `git push -u origin main`.

## 3. Problemas conocidos

- **Tablero de oportunidades** (`GET /api/opo/tablero`): en una prueba no devolvió datos. No se pudo investigar porque la API no arrancaba. Revisar primero.
- La carga de datos de ejemplo de un módulo a medias falló con `ReferenceError: cColegio is not defined`. Buscar `cColegio` en `apps/api/src/modules`.
- Las aprobaciones de la bandeja envían `{ motivo }` al rechazar: los endpoints de rechazo de cada módulo deben aceptarlo.
- El código del módulo de contabilidad es **`cnt`**, no `con`: Windows no admite carpetas llamadas `con`, `aux` o `nul`.

## 4. Qué debe hacer cada módulo pendiente

Requisitos resumidos (lo completo está en FUNCIONES.md). Reglas comunes:

- Tablas con prefijo del módulo, importando el núcleo desde `db/schema/core` y `db/schema/documentos`.
- Definiciones de recursos en `packages/shared/src/modules/<código>.ts`.
- Toda escritura en transacción y con `audit`; permisos comprobados en el servidor.
- Pantallas cargadas bajo demanda con `page()`, pensadas primero para el móvil.
- Los eventos entre módulos están en `packages/shared/src/events.ts`.

**Personas**
- **FIC**: ficha laboral 1:1 con la persona. Datos sensibles bajo `fic.sensible`. Historial automático de cambios, formación, PRL y EPIs firmados. Avisos de fin de contrato, periodo de prueba y caducidades. Pestañas en la ficha de persona. El material asignado NO va aquí: lo aporta ACT.
- **HOR**:
  - Fichajes con la hora del servidor, inalterables (disparador), con geovalla.
  - Correcciones aprobadas que conservan el original.
  - Turnos y cuadrantes; cálculo de horas, extras e incidencias, excluyendo las ausencias aprobadas.
  - Resumen mensual firmado y exportación para la Inspección.
  - Quiosco público `/publico/kiosco/:token` con PIN.
  - La página `/fichar`, perfecta en el móvil.
- **AUS**: tipos y saldos por convenio con arrastre. Solicitudes con justificante y aprobación en uno o dos niveles. Calendario de equipo con mínimos por departamento.
- **NOM**:
  - Periodos y variables, incluidas las de `gas.gasto_liquidado` vía nómina.
  - Exportación a la gestoría.
  - Importación de PDF de recibos troceados por DNI (`unpdf` + `pdf-lib`, ya instalados).
  - Anticipos y registro retributivo.
  - Al cerrar un periodo emite `nom.periodo_cerrado`.
- **ALT**: ofertas y candidatos. Altas y bajas con listas de tareas que crean `tareas` del núcleo. Evaluaciones y plan de formación.
- **POR**: página `/portal` con los accesos de cada módulo activo.

**Operaciones**
- **STK**:
  - Almacenes y furgonetas; registra el destino `almacenes`.
  - Movimientos inalterables con saldo mantenido por disparador, valorado a precio medio; reservas.
  - Escucha los eventos de pedidos, albaranes, recepciones y consumos de proyecto.
  - Traspasos, inventarios, kits, aviso de stock mínimo y pestaña Stock en el artículo.
- **CPR**:
  - Solicitudes internas con aprobación.
  - Aprobaciones de pedidos de compra (las acciones de `/api/documentos/:id/accion/...`).
  - Precios por proveedor y propuesta de compra.
  - Listados en `compras/pedidos`, `compras/recepciones` y `compras/facturas` con `<DocumentList>`.
  - Lectura del PDF de la factura de proveedor.
- **PRY**:
  - Proyectos (registra `proyectos`), fases, tareas en tablero y partidas creadas desde un presupuesto.
  - Horas imputadas y material (emite `pry.material_consumido`).
  - Hitos que crean facturas en borrador y rentabilidad.
- **ACT**: activos y vehículos asignados, vencimientos con avisos, registros de costes. Amortización mensual (emite `act.amortizacion`). Pestaña "Activos asignados" en la persona.
- **SAT**:
  - Tickets con SLA y órdenes planificadas por técnico.
  - App del técnico: parte con material, tiempos, fotos y firma que funciona sin cobertura.
  - Al cerrar el parte crea y entrega un albarán, lo que descuenta la furgoneta.
  - Equipos con QR, contratos que generan cuotas recurrentes y visitas, y portal del cliente `/publico/sat/:token`.
  - Comercial y Administración NO tienen permisos SAT.
- **DTC**: documentos con versiones, revisión y aprobación, confidencialidad restringida, vínculos y lecturas obligatorias por departamento.

**Finanzas**
- **TES**:
  - Vencimientos a partir de `ventas.factura_emitida` y `compras.factura_registrada`.
  - Cobros y pagos que actualizan `documentos.estado_pago` y emiten `tes.*`.
  - Remesas SEPA (pain.008 y pain.001), Norma 43 y conciliación.
  - Previsión a 13 semanas y recordatorios de impago.
- **CNT**:
  - PGC creado bajo demanda y asientos automáticos idempotentes desde todos los eventos.
  - Asientos cuadrados por disparador diferido.
  - Libros, balance, PyG, libros de IVA y modelos 303/390/111/115/180/190/347/349.
  - Cierre del ejercicio y exportación para la gestoría.
- **GAS**: ticket con foto desde el móvil, kilometraje y dietas. Aprobación del responsable y liquidación (emite `gas.gasto_liquidado`).
- **BI**: panel de dirección con datos del núcleo respetando el alcance del usuario, todos los indicadores juntos e informes guardados con envío programado.

## 5. Cuentas y datos de prueba

Las cuentas de demostración y su contraseña están en el README y en `apps/api/src/seed/index.ts`.
