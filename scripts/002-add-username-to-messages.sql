ALTER TABLE messages
ADD COLUMN username TEXT;

-- Opcional: Si ya tienes mensajes y quieres rellenar el campo 'username'
-- con los nombres de usuario existentes, ejecuta esta línea DESPUÉS de la anterior.
-- UPDATE messages
-- SET username = (SELECT u.username FROM users u WHERE u.id = messages.user_id)
-- WHERE username IS NULL;
