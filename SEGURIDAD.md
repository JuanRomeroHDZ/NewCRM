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
- La bóveda y la cuenta tienen revocación independiente. El navegador mantiene sus tokens en `localStorage` y `sessionStorage`, respectivamente. Aplica la política de contenido del proxy y revisa el saneamiento cuando se agreguen nuevas vistas de contenido importado. El contrato y sus límites están en `docs/sesiones-y-contenido.md`.
- Mantén `SERVER_SECRET_KEY` y la contraseña maestra en gestores separados. Una no sustituye a la otra.

## Primera cuenta propietaria y migración

- La contraseña de la bóveda y la contraseña de la cuenta son independientes. Un token de bóveda desbloqueada autoriza el alta inicial mientras no exista la marca de alta ni un propietario establecido; no identifica por sí solo a una persona. En una instalación compartida, controla quién puede acceder al servicio y conocer la contraseña de la bóveda durante la puesta en marcha.
- En una base nueva, el alta crea un propietario activo y exige cambiar su contraseña. La marca única de alta impide repetirla, también frente a solicitudes simultáneas.
- Para instalaciones anteriores se permite el alta si todos los propietarios tienen el nombre provisional configurado en `INITIAL_OWNER_USERNAME` y aún deben cambiar su contraseña. La cuenta provisional queda desactivada, no borrada, al completarse el alta. La marca, la cuenta, la desactivación, el registro y la sesión se guardan en la misma transacción; si falla antes de confirmarse, se revierte.
- Un propietario establecido, incluso desactivado, cierra el alta inicial. Desactivar una cuenta no abre una vía para reclamar la instalación; conserva medios administrativos y respaldos de recuperación. El cambio de contraseña provisional deja de cumplir la condición de migración.

## Red y servicios externos

- El proxy publica `127.0.0.1` por defecto. Para acceso desde la LAN, usa **Configuración → Cambiar IP y puertos** en `./lessso` y selecciona una IPv4 privada asignada a este equipo (10/172.16–31/192.168). El proxy se enlaza a esa dirección concreta; `0.0.0.0` no está permitido. Si la IP guardada deja de estar asignada, el arranque propone automáticamente la dirección privada de la ruta de salida y renueva el certificado local.
- Nginx termina TLS y limita solicitudes de autenticación. No expongas los puertos del proxy a Internet sin diseñar una configuración de despliegue específica.
- Usa el modo desarrollador para un entorno de pruebas confiable. En la auditoría de esta instalación, npm señaló una alerta sin versión corregida publicada para `picomatch`, utilizada por las herramientas de desarrollo. La auditoría del conjunto de producción devolvió cero alertas.
- Para usarlo desde otro dispositivo, instala `nginx/certs/local/ca.crt` como autoridad de confianza en ese dispositivo. Publicar una IP privada permite que otros equipos de esa red alcancen el inicio de sesión; mantén la red y las cuentas bajo control.
- La API sirve el frontend desde el mismo origen y no habilita CORS global. Si se agrega otro origen, decláralo de forma explícita en `CORS_ORIGINS`.
- La captación consulta Overpass y carga mosaicos de mapa bajo demanda. Los resultados se identifican como datos de OpenStreetMap y cada registro se guarda manualmente.

## Operaciones C2 y cambios locales de red

- Las operaciones reales del C2 requieren una sesión de propietario y un ámbito de autorización vigente. La pasarela comprueba los objetivos y la ventana antes de enviar cada operación al worker.
- LESSSO nunca detiene NetworkManager, wpa_supplicant, clientes DHCP ni otros servicios globales. El endpoint antiguo `/wifi/kill` solo muestra esta política y no ejecuta cambios.
- El modo monitor requiere un adaptador Wi-Fi dedicado, desconectado, abajo, sin ruta por defecto y sin otra interfaz compartiendo su radio. Si el sistema no permite verificarlo, LESSSO rechaza la operación. Al volver a modo managed, el adaptador queda abajo.
- Los cambios y restauraciones de MAC requieren una interfaz aislada y abajo, sin dirección IP enrutable ni ruta por defecto. LESSSO no renueva DHCP ni vuelve a conectar el adaptador automáticamente. Si una restauración no pasa las verificaciones, conserva la MAC original guardada y muestra el motivo.

## Datos de prospectos

Los resultados de OpenStreetMap pueden estar incompletos o desactualizados. Antes de contactar un negocio, revisa el enlace fuente y confirma sus datos. Un número publicado no implica que acepte WhatsApp.

Los cambios de rol, acceso, red, certificados o claves deben documentarse con su motivo y conservar una copia de recuperación segura antes de modificar la instalación.

## Respaldos completos

- El respaldo cifrado completo es opcional y no se activa hasta configurar `BACKUP_AGE_RECIPIENT`, una clave pública `age`. La identidad privada se conserva fuera del servidor. El proceso está documentado en `RUNBOOK.md`.
- La variable `SERVER_SECRET_KEY` protege sesiones y datos del servidor; no reemplaza la clave privada age necesaria para restaurar los respaldos completos.
