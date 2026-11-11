-- ════════════════════════════════════════════════════════════════════
-- STK · Integridad del stock. Idempotente (se ejecuta en cada migración).
--  · stk_movimientos es de solo inserción.
--  · Cada movimiento actualiza stk_saldos (cantidad y coste medio ponderado).
--  · Cada reserva actualiza stk_saldos.reservado.
-- Así las consultas de stock leen una fila por artículo/almacén/lote aunque haya millones de movimientos.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION stk_movimientos_inmutables() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de stock no se pueden modificar ni borrar: registra un ajuste o un movimiento de signo contrario';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stk_movimientos_inmutable ON stk_movimientos;
CREATE TRIGGER stk_movimientos_inmutable BEFORE UPDATE OR DELETE ON stk_movimientos
  FOR EACH ROW EXECUTE FUNCTION stk_movimientos_inmutables();

DROP TRIGGER IF EXISTS stk_movimientos_no_truncate ON stk_movimientos;
CREATE TRIGGER stk_movimientos_no_truncate BEFORE TRUNCATE ON stk_movimientos
  FOR EACH STATEMENT EXECUTE FUNCTION stk_movimientos_inmutables();

-- Aplica el movimiento al saldo y calcula el precio medio ponderado (PMP)
CREATE OR REPLACE FUNCTION stk_movimiento_aplicar() RETURNS trigger AS $$
DECLARE
  s_cant numeric(14,4);
  s_cm numeric(14,4);
  nueva numeric(14,4);
  cm numeric(14,4);
  coste_art numeric(14,4);
BEGIN
  NEW.lote := coalesce(NEW.lote, '');
  IF NEW.cantidad = 0 THEN
    RAISE EXCEPTION 'Un movimiento de stock no puede tener cantidad cero';
  END IF;

  INSERT INTO stk_saldos (empresa_id, articulo_id, almacen_id, lote, cantidad, reservado, coste_medio, actualizado_en)
  VALUES (NEW.empresa_id, NEW.articulo_id, NEW.almacen_id, NEW.lote, 0, 0, 0, now())
  ON CONFLICT (articulo_id, almacen_id, lote) DO NOTHING;

  SELECT cantidad, coste_medio INTO s_cant, s_cm
    FROM stk_saldos
   WHERE articulo_id = NEW.articulo_id AND almacen_id = NEW.almacen_id AND lote = NEW.lote
   FOR UPDATE;

  nueva := s_cant + NEW.cantidad;
  cm := s_cm;

  IF NEW.cantidad > 0 THEN
    IF NEW.coste_unitario IS NULL THEN
      -- entrada sin coste (ajuste, inventario): se valora al coste medio vigente o, si no hay, al coste del artículo
      IF s_cm > 0 THEN
        NEW.coste_unitario := s_cm;
      ELSE
        SELECT coste INTO coste_art FROM articulos WHERE id = NEW.articulo_id;
        NEW.coste_unitario := coalesce(coste_art, 0);
      END IF;
    END IF;
    IF s_cant <= 0 OR s_cm = 0 THEN
      cm := NEW.coste_unitario;
    ELSE
      cm := round((s_cant * s_cm + NEW.cantidad * NEW.coste_unitario) / nueva, 4);
    END IF;
  ELSE
    -- las salidas se valoran al coste medio vigente
    IF NEW.coste_unitario IS NULL THEN
      IF s_cm > 0 THEN
        NEW.coste_unitario := s_cm;
      ELSE
        SELECT coste INTO coste_art FROM articulos WHERE id = NEW.articulo_id;
        NEW.coste_unitario := coalesce(coste_art, 0);
      END IF;
    END IF;
  END IF;

  UPDATE stk_saldos
     SET cantidad = nueva, coste_medio = cm, actualizado_en = now()
   WHERE articulo_id = NEW.articulo_id AND almacen_id = NEW.almacen_id AND lote = NEW.lote;

  NEW.saldo := nueva;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stk_movimientos_saldo ON stk_movimientos;
CREATE TRIGGER stk_movimientos_saldo BEFORE INSERT ON stk_movimientos
  FOR EACH ROW EXECUTE FUNCTION stk_movimiento_aplicar();

-- Reservas → stk_saldos.reservado (las reservas no distinguen lote)
CREATE OR REPLACE FUNCTION stk_reserva_aplicar() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE stk_saldos SET reservado = reservado - OLD.cantidad, actualizado_en = now()
     WHERE articulo_id = OLD.articulo_id AND almacen_id = OLD.almacen_id AND lote = '';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO stk_saldos (empresa_id, articulo_id, almacen_id, lote, cantidad, reservado, coste_medio, actualizado_en)
    VALUES (NEW.empresa_id, NEW.articulo_id, NEW.almacen_id, '', 0, NEW.cantidad, 0, now())
    ON CONFLICT (articulo_id, almacen_id, lote) DO UPDATE SET reservado = stk_saldos.reservado + EXCLUDED.reservado, actualizado_en = now();
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stk_reservas_saldo ON stk_reservas;
CREATE TRIGGER stk_reservas_saldo AFTER INSERT OR UPDATE OR DELETE ON stk_reservas
  FOR EACH ROW EXECUTE FUNCTION stk_reserva_aplicar();
