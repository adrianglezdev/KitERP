-- ════════════════════════════════════════════════════════════════════
-- HOR · Control horario. Registro de jornada inalterable (art. 34.9 ET).
-- Idempotente: se ejecuta en cada migración.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION hor_registro_inalterable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El registro de jornada (%) no se puede modificar ni borrar. Solicita una corrección: el fichaje original se conserva.', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

-- Fichajes: solo se insertan
DROP TRIGGER IF EXISTS hor_fichajes_inmutable ON hor_fichajes;
CREATE TRIGGER hor_fichajes_inmutable BEFORE UPDATE OR DELETE ON hor_fichajes
  FOR EACH ROW EXECUTE FUNCTION hor_registro_inalterable();
DROP TRIGGER IF EXISTS hor_fichajes_no_truncate ON hor_fichajes;
CREATE TRIGGER hor_fichajes_no_truncate BEFORE TRUNCATE ON hor_fichajes
  FOR EACH STATEMENT EXECUTE FUNCTION hor_registro_inalterable();

-- Anulaciones: también se conservan para siempre
DROP TRIGGER IF EXISTS hor_anulaciones_inmutable ON hor_anulaciones;
CREATE TRIGGER hor_anulaciones_inmutable BEFORE UPDATE OR DELETE ON hor_anulaciones
  FOR EACH ROW EXECUTE FUNCTION hor_registro_inalterable();
DROP TRIGGER IF EXISTS hor_anulaciones_no_truncate ON hor_anulaciones;
CREATE TRIGGER hor_anulaciones_no_truncate BEFORE TRUNCATE ON hor_anulaciones
  FOR EACH STATEMENT EXECUTE FUNCTION hor_registro_inalterable();

-- Resúmenes mensuales firmados
DROP TRIGGER IF EXISTS hor_firmas_mes_inmutable ON hor_firmas_mes;
CREATE TRIGGER hor_firmas_mes_inmutable BEFORE UPDATE OR DELETE ON hor_firmas_mes
  FOR EACH ROW EXECUTE FUNCTION hor_registro_inalterable();

-- Una corrección ya resuelta no cambia de estado
CREATE OR REPLACE FUNCTION hor_correccion_resuelta() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las solicitudes de corrección no se pueden borrar';
  END IF;
  IF OLD.estado <> 'pendiente' AND (NEW.estado IS DISTINCT FROM OLD.estado OR NEW.nuevo_momento IS DISTINCT FROM OLD.nuevo_momento OR NEW.fichaje_id IS DISTINCT FROM OLD.fichaje_id) THEN
    RAISE EXCEPTION 'La corrección ya está resuelta y no se puede cambiar';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hor_correcciones_resueltas ON hor_correcciones;
CREATE TRIGGER hor_correcciones_resueltas BEFORE UPDATE OR DELETE ON hor_correcciones
  FOR EACH ROW EXECUTE FUNCTION hor_correccion_resuelta();
