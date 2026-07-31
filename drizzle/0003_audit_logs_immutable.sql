-- Fase 5: hace inmutable la tabla audit_logs a nivel de base de datos.
-- Un trigger BEFORE UPDATE/DELETE que lanza una excepcion es mas robusto
-- que confiar solo en la disciplina de la capa de aplicacion (nadie con
-- acceso directo a la base de datos, incluido un bug futuro en el propio
-- codigo de la app, puede alterar o borrar una fila ya escrita).
CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es una tabla de solo insercion (append-only): no se permite UPDATE ni DELETE';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_logs_prevent_update ON audit_logs;
--> statement-breakpoint
CREATE TRIGGER audit_logs_prevent_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_logs_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_logs_prevent_delete ON audit_logs;
--> statement-breakpoint
CREATE TRIGGER audit_logs_prevent_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_logs_mutation();
