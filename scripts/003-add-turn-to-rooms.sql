ALTER TABLE rooms
ADD COLUMN current_turn_user_id UUID REFERENCES users(id);

-- Opcional: Si quieres establecer un turno inicial para las salas existentes,
-- puedes ejecutar una sentencia UPDATE después de añadir la columna.
-- Por ejemplo, para asignar el turno al host por defecto:
-- UPDATE rooms
-- SET current_turn_user_id = host_user_id
-- WHERE current_turn_user_id IS NULL AND host_user_id IS NOT NULL;
