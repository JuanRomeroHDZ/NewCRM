# Seguridad y manejo de datos

## Secretos de instalación

- `SERVER_SECRET_KEY`, credenciales de PostgreSQL y contraseña inicial del propietario se configuran en `.env`, excluido de Git.
- La configuración de una instalación existente debe coincidir con el usuario, contraseña y base de datos guardados en su volumen PostgreSQL; cambiar Compose no rota las credenciales internas.
- El servidor no tiene semillas ni contraseñas iniciales de respaldo en el código.
- `LEGACY_SERVER_SECRET_KEYS` acepta claves previas solo durante una rotación controlada. Conserva la clave antigua hasta verificar que los registros existentes siguen siendo legibles.
- Los certificados TLS y claves privadas se generan localmente en `nginx/certs/local/`. El proxy los monta en lectura; no se copian a la imagen.

## Bóveda y sesiones

- Las contraseñas maestras se procesan con Argon2id. Los valores cifrados usan AES-GCM con nonce aleatorio.
- La aplicación permite bloquear la bóveda por inactividad y limpiar el portapapeles.
- El backend incluye sesiones de usuario con tokens aleatorios, caducidad y protección por intentos fallidos. Las políticas de intentos y expiración son configurables.
- Mantén `SERVER_SECRET_KEY` y la contraseña maestra en gestores separados. Una no sustituye a la otra.

## Red y servicios externos

- El proxy publica `127.0.0.1` por defecto. Para acceso en LAN, cambia `HOST_BIND_IP` a `0.0.0.0` y restringe el puerto con el firewall.
- Nginx termina TLS y limita solicitudes de autenticación. No expongas los puertos del proxy a Internet sin diseñar una configuración de despliegue específica.
- La API sirve el frontend desde el mismo origen y no habilita CORS global. Si se agrega otro origen, decláralo de forma explícita en `CORS_ORIGINS`.
- La captación consulta Overpass y carga mosaicos de mapa bajo demanda. Los resultados se identifican como datos de OpenStreetMap y cada registro se guarda manualmente.

## Datos de prospectos

Los resultados de OpenStreetMap pueden estar incompletos o desactualizados. Antes de contactar un negocio, revisa el enlace fuente y confirma sus datos. Un número publicado no implica que acepte WhatsApp.

Los cambios de rol, acceso, red, certificados o claves deben documentarse con su motivo y conservar una copia de recuperación segura antes de modificar la instalación.
