#!/usr/bin/env bash
# Restaura una copia: bash scripts/restore.sh backups/kite-AAAAMMDD-HHMMSS.dump
# ATENCIÓN: sustituye todos los datos actuales.
set -euo pipefail
FICHERO=${1:?Indica el fichero .dump}
read -r -p "Se sustituirán TODOS los datos actuales por $FICHERO. Escribe RESTAURAR para continuar: " OK
[ "$OK" = "RESTAURAR" ] || { echo "Cancelado"; exit 1; }
docker cp "$FICHERO" kite-db:/tmp/restore.dump
docker exec kite-db pg_restore -U "${DB_USER:-kite}" -d "${DB_NAME:-kite}" --clean --if-exists --no-owner /tmp/restore.dump
echo "Restauración completada. Restaura también los archivos (archivos-*.tar.gz) en la carpeta de almacenamiento."
