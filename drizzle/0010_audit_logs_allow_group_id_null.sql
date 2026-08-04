-- Permite que la baja de un grupo (ON DELETE SET NULL sobre
-- audit_logs.group_id -> groups.id) pueda completarse sin violar la
-- inmutabilidad del contenido de auditoria. La accion de FK "SET NULL"
-- se ejecuta internamente como un UPDATE, que hasta ahora disparaba el
-- mismo trigger BEFORE UPDATE que bloquea cualquier modificacion
-- (Fase 5, drizzle/0003_audit_logs_immutable.sql), impidiendo borrar
-- un grupo si tenia alguna fila de auditoria asociada (siempre las
-- tiene: createGroup ya escribe una en el momento de crearlo).
--
-- La nueva version del trigger de UPDATE solo permite que cambie
-- `group_id` (unicamente hacia NULL, nunca hacia otro valor ni desde
-- NULL a un valor); cualquier otro cambio (accion, entidad, actor,
-- datos antes/despues, fecha) sigue bloqueado exactamente igual que
-- antes. El trigger de DELETE no se toca: sigue bloqueando
-- incondicionalmente cualquier borrado directo de audit_logs.
CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation_content()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.action IS DISTINCT FROM OLD.action
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.before_data IS DISTINCT FROM OLD.before_data
     OR NEW.after_data IS DISTINCT FROM OLD.after_data
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NOT (OLD.group_id IS NOT NULL AND NEW.group_id IS NULL)
  THEN
    RAISE EXCEPTION 'audit_logs es una tabla de solo insercion (append-only): no se permite modificar su contenido; group_id solo puede pasar a NULL cuando se borra el grupo referenciado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_logs_prevent_update ON audit_logs;
--> statement-breakpoint
CREATE TRIGGER audit_logs_prevent_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_logs_mutation_content();
