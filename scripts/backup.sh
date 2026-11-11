#!/usr/bin/env bash
# Copia de seguridad de KiteERP: base de datos (formato custom de pg_dump) + archivos adjuntos.
# Uso: bash scripts/backup.sh            (desde la raíz del repositorio)
# Programarla a diario (cron o Programador de tareas) y copiar la carpeta backups/ fuera del servidor.
set -euo pipefail
cd "$(dirname "$0")/.."
DIAS=${BACKUP_DIAS:-30}
FECHA=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
docker exec kite-db pg_dump -U "${DB_USER:-kite}" -d "${DB_NAME:-kite}" -Fc -Z 6 -f "/backups/kite-$FECHA.dump"
# Comprobación: el volcado debe poder leerse
docker exec kite-db pg_restore -l "/backups/kite-$FECHA.dump" > /dev/null
if [ -d apps/api/storage ]; then tar -czf "backups/archivos-$FECHA.tar.gz" -C apps/api storage; fi
if docker volume inspect kiteerp_kite-storage > /dev/null 2>&1; then
  docker run --rm -v kiteerp_kite-storage:/data -v "$PWD/backups:/out" alpine tar -czf "/out/archivos-$FECHA.tar.gz" -C /data .
fi
find backups -name 'kite-*.dump' -mtime +"$DIAS" -delete
find backups -name 'archivos-*.tar.gz' -mtime +"$DIAS" -delete
echo "Copia guardada: backups/kite-$FECHA.dump"
