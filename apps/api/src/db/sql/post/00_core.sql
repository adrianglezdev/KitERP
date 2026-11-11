-- ════════════════════════════════════════════════════════════════════
-- Reglas de integridad del núcleo. Este archivo se ejecuta en cada
-- migración: todo es idempotente (CREATE OR REPLACE / DROP IF EXISTS).
-- ════════════════════════════════════════════════════════════════════

-- Auditoría inalterable
CREATE OR REPLACE FUNCTION kite_bloquear_cambios() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de % no se pueden modificar ni borrar', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditoria_inmutable ON auditoria;
CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION kite_bloquear_cambios();

-- Facturas emitidas: no se pueden borrar ni cambiar sus datos fiscales
CREATE OR REPLACE FUNCTION kite_documento_bloqueado() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.bloqueado THEN
      RAISE EXCEPTION 'El documento % está emitido y no se puede borrar. Emite una rectificativa.', OLD.codigo;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.bloqueado AND (
       NEW.numero IS DISTINCT FROM OLD.numero OR NEW.codigo IS DISTINCT FROM OLD.codigo
    OR NEW.serie_id IS DISTINCT FROM OLD.serie_id OR NEW.fecha IS DISTINCT FROM OLD.fecha
    OR NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.tercero_id IS DISTINCT FROM OLD.tercero_id
    OR NEW.datos_tercero IS DISTINCT FROM OLD.datos_tercero
    OR NEW.base_imponible IS DISTINCT FROM OLD.base_imponible OR NEW.total_iva IS DISTINCT FROM OLD.total_iva
    OR NEW.total_recargo IS DISTINCT FROM OLD.total_recargo OR NEW.total_retencion IS DISTINCT FROM OLD.total_retencion
    OR NEW.total IS DISTINCT FROM OLD.total OR NEW.rectifica_id IS DISTINCT FROM OLD.rectifica_id
    OR NEW.bloqueado IS DISTINCT FROM OLD.bloqueado OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
  ) THEN
    RAISE EXCEPTION 'El documento % está emitido: sus datos fiscales no se pueden cambiar. Emite una rectificativa.', OLD.codigo;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documentos_bloqueo ON documentos;
CREATE TRIGGER documentos_bloqueo BEFORE UPDATE OR DELETE ON documentos
  FOR EACH ROW EXECUTE FUNCTION kite_documento_bloqueado();

CREATE OR REPLACE FUNCTION kite_lineas_bloqueadas() RETURNS trigger AS $$
DECLARE doc_id uuid; bloq boolean; cod text;
BEGIN
  doc_id := COALESCE(NEW.documento_id, OLD.documento_id);
  SELECT bloqueado, codigo INTO bloq, cod FROM documentos WHERE id = doc_id;
  IF bloq THEN
    RAISE EXCEPTION 'El documento % está emitido: sus líneas no se pueden cambiar.', cod;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documento_lineas_bloqueo ON documento_lineas;
CREATE TRIGGER documento_lineas_bloqueo BEFORE INSERT OR UPDATE OR DELETE ON documento_lineas
  FOR EACH ROW EXECUTE FUNCTION kite_lineas_bloqueadas();

DROP TRIGGER IF EXISTS documento_impuestos_bloqueo ON documento_impuestos;
CREATE TRIGGER documento_impuestos_bloqueo BEFORE INSERT OR UPDATE OR DELETE ON documento_impuestos
  FOR EACH ROW EXECUTE FUNCTION kite_lineas_bloqueadas();

-- Registros Verifactu: solo se puede actualizar el estado del envío
CREATE OR REPLACE FUNCTION kite_verifactu_inmutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los registros Verifactu no se pueden borrar';
  END IF;
  IF NEW.huella IS DISTINCT FROM OLD.huella OR NEW.huella_anterior IS DISTINCT FROM OLD.huella_anterior
     OR NEW.xml IS DISTINCT FROM OLD.xml OR NEW.secuencia IS DISTINCT FROM OLD.secuencia
     OR NEW.importe_total IS DISTINCT FROM OLD.importe_total OR NEW.cuota_total IS DISTINCT FROM OLD.cuota_total
     OR NEW.num_serie IS DISTINCT FROM OLD.num_serie OR NEW.documento_id IS DISTINCT FROM OLD.documento_id THEN
    RAISE EXCEPTION 'Los registros Verifactu no se pueden modificar';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fac_verifactu_inmutable ON fac_verifactu;
CREATE TRIGGER fac_verifactu_inmutable BEFORE UPDATE OR DELETE ON fac_verifactu
  FOR EACH ROW EXECUTE FUNCTION kite_verifactu_inmutable();
