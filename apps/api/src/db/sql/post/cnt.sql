-- ════════════════════════════════════════════════════════════════════
-- Contabilidad (CNT): reglas de integridad. Idempotente.
--  1. Un asiento siempre cuadra (debe = haber). Se comprueba al confirmar la
--     transacción (disparador de restricción DEFERRABLE), así se pueden insertar
--     las líneas de una en una.
--  2. Los asientos de un ejercicio cerrado no se pueden crear, modificar ni borrar.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cnt_asiento_cuadrado() RETURNS trigger AS $$
DECLARE aid uuid; d numeric; h numeric; num integer;
BEGIN
  aid := COALESCE(NEW.asiento_id, OLD.asiento_id);
  SELECT numero INTO num FROM cnt_asientos WHERE id = aid;
  IF NOT FOUND THEN
    RETURN NULL; -- el asiento se ha borrado entero
  END IF;
  SELECT coalesce(sum(debe), 0), coalesce(sum(haber), 0) INTO d, h FROM cnt_apuntes WHERE asiento_id = aid;
  IF d <> h THEN
    RAISE EXCEPTION 'El asiento % no cuadra: debe % y haber % (diferencia %)', num, d, h, d - h;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cnt_apuntes_cuadre ON cnt_apuntes;
CREATE CONSTRAINT TRIGGER cnt_apuntes_cuadre AFTER INSERT OR UPDATE OR DELETE ON cnt_apuntes
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cnt_asiento_cuadrado();

-- Un apunte va al debe o al haber, nunca a los dos
CREATE OR REPLACE FUNCTION cnt_apunte_valido() RETURNS trigger AS $$
BEGIN
  IF NEW.debe <> 0 AND NEW.haber <> 0 THEN
    RAISE EXCEPTION 'Un apunte no puede tener importe en el debe y en el haber a la vez (cuenta %)', NEW.cuenta;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cnt_apuntes_valido ON cnt_apuntes;
CREATE TRIGGER cnt_apuntes_valido BEFORE INSERT OR UPDATE ON cnt_apuntes
  FOR EACH ROW EXECUTE FUNCTION cnt_apunte_valido();

-- Ejercicios cerrados: inalterables
CREATE OR REPLACE FUNCTION cnt_ejercicio_abierto() RETURNS trigger AS $$
DECLARE est text; an integer; eids uuid[];
BEGIN
  IF TG_TABLE_NAME = 'cnt_asientos' THEN
    IF TG_OP = 'INSERT' THEN eids := ARRAY[NEW.ejercicio_id];
    ELSIF TG_OP = 'DELETE' THEN eids := ARRAY[OLD.ejercicio_id];
    ELSE eids := ARRAY[OLD.ejercicio_id, NEW.ejercicio_id];
    END IF;
  ELSE
    SELECT array_agg(a.ejercicio_id) INTO eids FROM cnt_asientos a
      WHERE a.id IN (CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.asiento_id END, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.asiento_id END);
  END IF;
  IF eids IS NOT NULL THEN
    SELECT estado, anio INTO est, an FROM cnt_ejercicios WHERE id = ANY(eids) AND estado = 'cerrado' LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'El ejercicio % está cerrado: sus asientos no se pueden crear, modificar ni borrar', an;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cnt_asientos_ejercicio ON cnt_asientos;
CREATE TRIGGER cnt_asientos_ejercicio BEFORE INSERT OR UPDATE OR DELETE ON cnt_asientos
  FOR EACH ROW EXECUTE FUNCTION cnt_ejercicio_abierto();

DROP TRIGGER IF EXISTS cnt_apuntes_ejercicio ON cnt_apuntes;
CREATE TRIGGER cnt_apuntes_ejercicio BEFORE INSERT OR UPDATE OR DELETE ON cnt_apuntes
  FOR EACH ROW EXECUTE FUNCTION cnt_ejercicio_abierto();
