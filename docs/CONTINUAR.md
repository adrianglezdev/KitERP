# Cómo continuar el desarrollo

Notas actualizadas el **11/11/2026**. Léelas junto con [ARQUITECTURA.md](ARQUITECTURA.md) (convenciones) y [FUNCIONES.md](FUNCIONES.md) (qué debe hacer cada módulo).

## 1. Estado

Los **25 módulos** tienen servidor y pantallas, y todo está en la rama `main` de GitHub.

- **Núcleo**: base de datos, sesiones y 2FA, permisos con alcance, módulos activables, adjuntos, comentarios, tareas, avisos, tablón, encuestas, canal de denuncias, firma electrónica, plantillas, importación, API y webhooks, búsqueda global, bandeja de aprobaciones y auditoría.
- **Motor de documentos**: presupuesto → pedido → albarán → factura, rectificativas, compras, Verifactu, Facturae, PDF, enlace público y facturas recurrentes.
- **Comercial**: CRM, oportunidades, presupuestos, pedidos y facturación.
- **Operaciones**: stock, compras, proyectos y activos.
- **Personas**: ficha laboral, control horario (con quiosco), ausencias, nóminas, altas, bajas, selección y evaluación, y portal del empleado.
- **Servicio técnico**: SAT (con portal del cliente y QR de equipos) y documentación técnica con versiones aprobadas.
- **Finanzas**: tesorería (SEPA, Norma 43, conciliación, previsión), contabilidad (PGC, libros, modelos), gastos y BI (panel de dirección e informes con envío programado).
- **Base de datos**: migraciones `0000_nucleo.sql` y `0001_modulos.sql`, más los disparadores de `apps/api/src/db/sql/post`.
- **Pruebas**: 34 en `apps/api/test` (núcleo, comercial, técnico y personas/finanzas). Todas pasan sobre una base creada con las migraciones.
- **Revisado en el navegador**: todas las listas y fichas cargan con el administrador. Flujo de gasto completo en móvil como empleado y aprobación por su responsable. Límites entre departamentos (comercial no ve SAT ni contabilidad).

## 2. Arrancar

1. Docker Desktop y la base de datos: `docker compose up -d db`. Docker Desktop se para a veces solo: vuelve a abrirlo.
2. `pnpm db:reset` (borra y carga datos de ejemplo) y `pnpm dev`. La web queda en http://localhost:5173. Las cuentas de demostración están en el README.
3. Pruebas en una base aparte:
   ```bash
   cd apps/api
   DATABASE_URL=postgres://kite:kite_dev_password@localhost:5433/kite_prueba npx tsx src/db/reset.ts
   DATABASE_URL=postgres://kite:kite_dev_password@localhost:5433/kite_prueba npx vitest run
   ```
4. Si cambias tablas, `pnpm db:generate` crea la siguiente migración. No edites las ya publicadas.

## 3. Pendiente y mejoras posibles

Nada bloquea el uso, pero queda por hacer o por comprobar en real:

- **Probado solo en local**: el fichero SEPA con un banco real, el envío de Verifactu a la AEAT en producción (falta el certificado), los correos (configura SMTP en `.env`) y las copias de seguridad programadas en el servidor.
- **Gastos**: la lectura automática del ticket funciona con PDF. Las fotos se rellenan a mano; habría que añadir OCR.
- **Pruebas en navegador**: se han revisado a mano. Convendría automatizarlas (Playwright) para los flujos principales y los roles.
- **Accesibilidad**: las etiquetas de los formularios ya se enlazan solas con su campo. Falta una revisión completa con lector de pantalla.
- El código del módulo de contabilidad es **`cnt`**, no `con`: Windows no admite carpetas llamadas `con`, `aux` o `nul`.

## 4. Qué hace cada módulo (referencia)

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
