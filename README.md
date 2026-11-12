# KiteERP

ERP web modular para empresas medianas: personas y control horario, clientes y ventas, stock y compras, servicio técnico, documentación técnica, tesorería y contabilidad. Funciona en el ordenador y en el móvil (se puede instalar como aplicación).

- **Un solo sitio para toda la empresa**: todos los módulos comparten la misma base de datos, así que un presupuesto aceptado acaba en pedido, albarán, factura, vencimiento, cobro y asiento contable sin volver a teclear nada.
- **Módulos que se activan y desactivan** por empresa sin perder datos.
- **Cada persona ve lo que necesita**: roles por departamento y permisos con alcance (lo suyo, su equipo, su departamento o toda la empresa). Por ejemplo, Comercial y Administración no ven los tickets del servicio técnico.
- **Datos seguros**: PostgreSQL, transacciones, registro de auditoría inalterable, facturas emitidas y fichajes protegidos en la propia base de datos, Verifactu encadenado y copias de seguridad automatizables.

La arquitectura y las convenciones están en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). El listado de funciones por módulo está en [docs/FUNCIONES.md](docs/FUNCIONES.md).

## Requisitos

- Node.js 20 o superior y pnpm (`corepack enable`)
- Docker (para PostgreSQL)

## Puesta en marcha en local

```bash
cp .env.example .env          # revisa SESSION_SECRET
docker compose up -d db       # PostgreSQL 17 en el puerto DB_PORT de .env (5433 por defecto)
pnpm install
pnpm db:reset                 # crea las tablas y carga datos de ejemplo
pnpm dev                      # API en http://localhost:4000 · web en http://localhost:5173
```

### Cuentas de demostración

Todas usan la contraseña `Kite2026demo` (solo para la base de datos de ejemplo; cámbiala o borra los datos antes de usar el sistema de verdad).

| Email | Rol | Qué ve |
|---|---|---|
| admin@kite.test | Administrador | Todo, incluida la configuración |
| direccion@kite.test | Dirección | Todo el negocio |
| administracion@kite.test | Administración | Facturación, compras, tesorería y contabilidad (sin SAT) |
| rrhh@kite.test | RRHH | Personas, fichajes, ausencias y nóminas |
| comercial@kite.test | Comercial (jefa) | Su cartera y la de su equipo (sin SAT) |
| comercial2@kite.test | Comercial | Solo su cartera |
| almacen@kite.test | Almacén | Stock, preparación de pedidos y recepciones |
| empleado@kite.test | Empleado | Fichar, vacaciones, nóminas y gastos propios |
| sat@kite.test | Responsable técnico | Servicio técnico y documentación técnica |
| tecnico@kite.test | Técnico | Sus órdenes de trabajo y su furgoneta |

## Producción

```bash
cp .env.example .env    # define SESSION_SECRET (cadena larga aleatoria), DB_PASSWORD, APP_URL y SMTP_*
docker compose --profile prod up -d --build
```

La web queda en el puerto 8080 (`WEB_PORT`) con nginx delante de la API. Pon un proxy con HTTPS (Caddy, Traefik o nginx con Let's Encrypt) delante. Las migraciones se aplican solas al arrancar la API.

Variables importantes:

| Variable | Para qué |
|---|---|
| `SESSION_SECRET` | Firma de cookies y enlaces de descarga. Obligatoria y secreta. |
| `APP_URL` | Dirección pública de la web (enlaces en emails, presupuestos y firmas). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Envío de correo. Sin ellos, los emails quedan en cola (Configuración → Emails enviados) y se envían al configurarlo. |
| `VERIFACTU_ENTORNO` | `pruebas` o `produccion` (URL del QR de la AEAT). |

## Copias de seguridad

```bash
bash scripts/backup.sh                         # base de datos + archivos, con rotación de 30 días
bash scripts/restore.sh backups/kite-XXXX.dump # restaurar (pide confirmación)
```

Programa `backup.sh` a diario y copia la carpeta `backups/` fuera del servidor. Para no perder ni las últimas horas, activa además el archivado continuo de WAL de PostgreSQL (el contenedor ya arranca con `wal_level=replica`).

## Desarrollo

```bash
pnpm typecheck      # comprueba tipos de los tres paquetes
pnpm test           # pruebas de la API (usan la base de datos de DATABASE_URL)
pnpm db:generate    # tras cambiar un schema.ts: crea la migración SQL versionada
```

Cada módulo vive en `apps/api/src/modules/<código>` y `apps/web/src/modules/<código>`. Consulta [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) antes de añadir uno.

## Pendiente de configurar por cada empresa

- **Certificado electrónico** para remitir los registros Verifactu a la AEAT y firmar los Facturae. Mientras tanto, los registros se generan, se encadenan y quedan listos para enviar; el QR de cada factura ya es válido.
- **Servidor de correo (SMTP)**.
