# Sesiones y contenido importado

La bóveda y la cuenta de usuario son sesiones independientes. El token de bóveda actual se conserva en `localStorage`; el de usuario en `sessionStorage`. Ambos son accesibles a JavaScript del mismo origen. Los permisos de usuario y de bóveda se comprueban por separado en el servidor. No se debe interpretar que desbloquear la bóveda inicia sesión en la cuenta.

El bloqueo envía `/auth/lock` para revocar la sesión de bóveda y elimina el token local aun si la petición falla. En caso de fallo, la interfaz indica que la revocación del servidor no pudo confirmarse; el token remoto permanece sujeto a su expiración y revocación de servidor. El cierre de cuenta tiene un ciclo independiente.

Los informes Markdown se saneaan con DOMPurify antes de renderizar HTML; Mermaid usa modo estricto y saneamiento SVG. Los fragmentos HTML se ejecutan en un iframe sin permisos de sandbox. Estas defensas no constituyen una garantía general contra XSS: cualquier nueva ruta de HTML importado debe revisarse junto con su política de recursos y pruebas de regresión.

Una migración a cookies `HttpOnly` y `Secure` reduciría el acceso directo de JavaScript a los tokens, pero requiere cambiar emisión, autenticación de todas las rutas y pasarela C2, protección CSRF en operaciones mutables, políticas `SameSite` y manejo de HTTPS/proxy, expiración, bloqueo y cierre en múltiples pestañas. Antes de activarla se requieren pruebas de compatibilidad y revocación con un entorno desechable; cambiar solo el almacenamiento del navegador rompería las sesiones existentes. No se introdujo un cambio parcial del contrato de autenticación.
