# Funciones de KiteERP

Cada módulo tiene un código de tres letras que se usa en el código, en los permisos y en la auditoría. Los módulos de Plataforma forman el núcleo y siempre están activos; el resto se activa o desactiva en **Configuración → Módulos** (desactivar no borra datos).

## Plataforma (núcleo)

| Código | Módulo | Qué incluye |
|---|---|---|
| USR | Usuarios y permisos | Usuarios vinculados a su ficha de persona, roles por departamento con permisos por módulo y alcance (lo suyo / su equipo / su departamento / toda la empresa), permisos sueltos por usuario, acceso con caducidad, verificación en dos pasos, sesiones abiertas, bloqueo tras intentos fallidos y registro de auditoría inalterable. |
| CFG | Configuración | Datos fiscales y logo, ajustes de negocio (margen mínimo, umbral de compras, €/km, jornada máxima…), centros con geovalla, departamentos, calendario laboral, series de numeración sin huecos, formas de pago con plazos, activación de módulos con control de dependencias. |
| DOC | Documentos y firma | Adjuntos en cualquier ficha con carpetas, versiones y caducidad; plantillas con campos combinados; firma electrónica simple con página de evidencias (fecha, IP, huella SHA-256). |
| MSG | Comunicación interna | Comentarios con menciones en cualquier ficha, tareas, avisos en la app y por email, tablón con confirmación de lectura por departamento, encuestas (anónimas o no) y canal de denuncias de la Ley 2/2023. |
| API | Integraciones | Claves de API con permisos, webhooks firmados, importación desde Excel/CSV (clientes, artículos, personas) con comprobación previa, bandeja de emails salientes. |

También en el núcleo: **Directorio y organigrama**, **Clientes y proveedores** (una sola ficha por empresa, con contactos, direcciones de entrega, condiciones, riesgo y mandato SEPA, y aviso de duplicados al darlos de alta), **Catálogo** (artículos, servicios, kits, familias y tarifas) y el **motor de documentos comerciales**. Además: búsqueda global (Ctrl+K), bandeja única de aprobaciones, panel de inicio con indicadores de cada módulo activo y línea de tiempo en cada ficha.

## Personas

| Código | Módulo | Qué incluye |
|---|---|---|
| FIC | Ficha del trabajador | Datos personales y laborales, datos sensibles protegidos (salario, IBAN, salud), historial de cambios, formación, PRL y entregas de EPIs firmadas, avisos de fin de contrato, periodo de prueba y caducidades. |
| HOR | Control horario | Fichaje web, móvil (con geolocalización y geovalla) y quiosco con PIN; fichajes inalterables; correcciones con aprobación que conservan el original; turnos y cuadrantes; horas extra, nocturnas y en festivo; incidencias; resumen mensual firmado por el trabajador; exportación para la Inspección de Trabajo. |
| AUS | Vacaciones y ausencias | Tipos de ausencia, saldos por convenio con arrastre, solicitudes con justificante desde el móvil, aprobación en uno o dos niveles, calendario de equipo con solapes y mínimos por departamento. |
| NOM | Nóminas | Periodos y variables del mes (horas extra, dietas, comisiones, anticipos), exportación a la gestoría, importación y reparto automático de recibos por DNI, anticipos con aprobación, registro retributivo. |
| ALT | Altas, bajas y evaluación | Ofertas y candidatos, listas de incorporación y salida con tareas por departamento, evaluaciones y plan de formación. |
| POR | Portal del empleado | Vista sencilla para el móvil: fichar, horario, vacaciones, nóminas, gastos, avisos y documentos para firmar. |

## Comercial

| Código | Módulo | Qué incluye |
|---|---|---|
| CRM | Actividad comercial | Llamadas, visitas, emails y reuniones con próxima acción; agenda de seguimiento; clientes sin contacto en 90 días; línea de tiempo unificada en la ficha del cliente. |
| OPO | Oportunidades | Embudo por etapas (arrastrar en escritorio, selector en el móvil), importe y probabilidad, motivo de pérdida obligatorio, previsión ponderada por mes y comercial, presupuesto con un clic, formulario web público que crea el cliente potencial. Al aceptarse el presupuesto, la oportunidad pasa sola a ganada. |
| PRE | Presupuestos | Capítulos, texto libre, tarifas y descuentos, margen visible solo internamente, aprobación de dirección si el margen es bajo, versiones, envío por email con enlace para que el cliente acepte y firme, caducidad automática. |
| PED | Pedidos y albaranes | Pedido con reserva de stock, preparación para almacén, entregas parciales, albarán con firma del receptor, albaranes pendientes de facturar. |
| FAC | Facturación | Ordinarias, simplificadas, rectificativas y proformas; numeración correlativa; facturas emitidas inalterables; Verifactu con huella encadenada y QR; Facturae 3.2.2; facturación agrupada de albaranes; cuotas recurrentes. |

## Operaciones

| Código | Módulo | Qué incluye |
|---|---|---|
| STK | Artículos y stock | Almacenes y furgonetas, ubicaciones, lotes, números de serie y caducidades, movimientos inalterables con saldo mantenido por la base de datos, reservas, traspasos, inventarios desde el móvil, kits, valoración a precio medio, avisos de stock mínimo. |
| CPR | Compras y proveedores | Solicitudes internas con aprobación, propuesta de compra automática, pedidos con aprobación por importe, recepción desde el móvil con incidencias, factura de proveedor leída del PDF y cuadrada con lo recibido, precios por proveedor y valoración de proveedores. |
| PRY | Proyectos y partes | Proyectos desde un presupuesto, fases y tareas en tablero, imputación de horas y material, hitos de facturación y rentabilidad real frente a la prevista. |
| SAT | Servicio técnico | Tickets con SLA, órdenes de trabajo planificadas por técnico, app del técnico (ruta, cronómetro, checklist, fotos, material de su furgoneta y firma del cliente), equipos instalados con QR, contratos de mantenimiento con visitas y cuotas automáticas, portal del cliente. Al cerrar el parte se genera el albarán y se descuenta el stock. |
| ACT | Activos y flota | Activos y vehículos asignados a personas, vencimientos (ITV, seguros, revisiones) con avisos, mantenimientos y costes, amortización mensual. |
| DTC | Documentación técnica | Manuales, planos y procedimientos con versiones, revisión y aprobación, confidencialidad, vínculos a artículos, equipos, activos y proyectos, y confirmación de lectura obligatoria por departamento. |

## Finanzas

| Código | Módulo | Qué incluye |
|---|---|---|
| TES | Tesorería | Vencimientos creados por las facturas, cobros y pagos, remesas SEPA (adeudos y transferencias), conciliación con extractos Norma 43, previsión a 13 semanas y recordatorios de impago. |
| CNT | Contabilidad e impuestos | Plan General Contable, asientos automáticos desde ventas, compras, cobros, pagos, nóminas, gastos y amortizaciones, asientos cuadrados por la base de datos, libros, balance, pérdidas y ganancias, modelos 303, 390, 111, 115, 180, 190, 347 y 349, cierre del ejercicio y exportación para la gestoría. |
| GAS | Gastos y dietas | Ticket con foto desde el móvil, kilometraje, dietas, aprobación del responsable y liquidación en nómina o por transferencia. |
| BI | Informes y paneles | Panel de dirección, todos los indicadores en una pantalla e informes guardados con envío programado por email. Cada persona solo ve los datos de su alcance. |

## Cómo se conecta todo

```
Venta:    Oportunidad → Presupuesto → Pedido (reserva stock) → Albarán (descuenta stock) → Factura (Verifactu) → Vencimiento → Cobro → Asiento
Compra:   Stock mínimo / solicitud → Propuesta → Pedido a proveedor → Recepción (entra stock) → Factura de proveedor → Pago → Asiento
Persona:  Alta → Turno → Fichaje → Horas y ausencias → Variables de nómina → Recibo en el portal → Asiento
Técnico:  Ticket → Orden de trabajo → Parte firmado → Albarán (descuenta furgoneta) → Factura
```
