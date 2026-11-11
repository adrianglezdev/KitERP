-- ════════════════════════════════════════════════════════════════════
-- FIC · Ficha del trabajador. Idempotente.
-- Los cambios de centro o de puesto en la persona (núcleo) se anotan
-- solos en el historial laboral, si la persona tiene ficha laboral.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fic_historial_persona() RETURNS trigger AS $$
DECLARE
  emp uuid;
  antes text;
  despues text;
BEGIN
  SELECT empresa_id INTO emp FROM fic_trabajadores WHERE persona_id = NEW.id;
  IF emp IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.centro_id IS DISTINCT FROM OLD.centro_id THEN
    SELECT nombre INTO antes FROM centros WHERE id = OLD.centro_id;
    SELECT nombre INTO despues FROM centros WHERE id = NEW.centro_id;
    INSERT INTO fic_historial (id, empresa_id, persona_id, fecha, tipo, descripcion, valor_anterior, valor_nuevo, origen, campo)
    VALUES (gen_random_uuid(), emp, NEW.id, (now() AT TIME ZONE 'Europe/Madrid')::date, 'centro', 'Cambio de centro de trabajo', antes, despues, 'auto', 'centroId');
  END IF;
  IF NEW.puesto IS DISTINCT FROM OLD.puesto THEN
    INSERT INTO fic_historial (id, empresa_id, persona_id, fecha, tipo, descripcion, valor_anterior, valor_nuevo, origen, campo)
    VALUES (gen_random_uuid(), emp, NEW.id, (now() AT TIME ZONE 'Europe/Madrid')::date, 'puesto', 'Cambio de puesto', OLD.puesto, NEW.puesto, 'auto', 'puesto');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fic_personas_historial ON personas;
CREATE TRIGGER fic_personas_historial AFTER UPDATE OF centro_id, puesto ON personas
  FOR EACH ROW WHEN (OLD.centro_id IS DISTINCT FROM NEW.centro_id OR OLD.puesto IS DISTINCT FROM NEW.puesto)
  EXECUTE FUNCTION fic_historial_persona();

-- El historial automático no se edita; el manual sí (lo corrige RRHH)
CREATE OR REPLACE FUNCTION fic_historial_auto_inmutable() RETURNS trigger AS $$
BEGIN
  IF OLD.origen = 'auto' THEN
    RAISE EXCEPTION 'Las entradas automáticas del historial laboral no se pueden modificar';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fic_historial_auto ON fic_historial;
CREATE TRIGGER fic_historial_auto BEFORE UPDATE OR DELETE ON fic_historial
  FOR EACH ROW EXECUTE FUNCTION fic_historial_auto_inmutable();
