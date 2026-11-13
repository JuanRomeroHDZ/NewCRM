# Pendientes de NewCRM

## Continuar con la interfaz

- Revisar visualmente la nueva hoja de recuperación en 250 × 250, 542 px y escritorio, y comprobar la impresión o guardado en PDF. La hoja ya no muestra identificadores ni códigos fijos que no sirven para recuperar datos.
- Revisar con datos reales o ficticios poblados todas las vistas y formularios restantes a 250 × 250, móvil, tableta y escritorio. Se compactaron Inicio, Finanzas, Prospectos, Correos, Cuentas, Ajustes, Seguridad, Historial y Papelera, pero aún no se ha verificado visualmente cada estado y cada diálogo.
- Continuar reduciendo texto, espacios y tarjetas anidadas en Contraseñas, mapa de conexiones y módulos que todavía conserven diseños densos. Mantener los apartados y funciones.
- Completar la revisión de textos y mantener «Ver todos» para listas y «Ver detalles» para un registro.

## Validación de datos

- Se añadieron límites y validación de alta y edición para prospectos, correos, servicios, tarjetas, finanzas, recursos privados, TOTP y ajustes. Revisar todavía importadores, cuentas de usuario y rutas de agenda, comunicaciones, taller, integraciones, ventas y finanzas personales.
- Profundizar las reglas de fechas de servicios, consistencia de tarjeta y listas de teléfonos; conservar la lectura de registros históricos.

## Búsqueda en mapa

- La instancia regional de Overpass está configurada en el entorno local y el contenedor se reinició. Una prueba aislada real de dentistas en Zona Río produjo seis resultados procesados. Falta repetir la búsqueda desde la interfaz después de desbloquear la bóveda y comprobar guardar un prospecto real con autorización del usuario.
- Hay respaldo configurable y un límite de tiempo compartido; no se guardan respuestas incompletas. Mantener la atribución de OpenStreetMap.

## Acceso y despliegue

- La bóveda y las cuentas de usuario son mecanismos distintos. Falta integrar inicio de sesión, creación y cambio de contraseña de cuentas, autorización coherente y pruebas de acceso antes de ofrecer multiusuario o acceso desde otra PC. No presentar el usuario interno existente como una cuenta completa de la interfaz.
- El backend `newcrm-api` corre en Docker con SQLite existente en `backend/lessso.db`; el frontend sigue servido como vista local. No es todavía el despliegue completo con Compose, PostgreSQL y Redis. Preparar y probar una migración verificable antes de cambiar de base; conservar `backend/lessso.db`, su respaldo `backend/lessso.pre-docker.sqlite3`, `.env.local` y las claves locales.
- Docker Engine funciona con `sg docker -c 'env -u DOCKER_HOST docker ...'`: la variable `DOCKER_HOST` de la sesión apuntaba al socket de Podman. El reinicio del backend cierra las sesiones de bóveda en memoria.

## Verificación reciente

- Compilación de producción y prueba frontend aprobadas. Pasaron 47 pruebas del backend en SQLite de memoria, incluidas validaciones y búsqueda; no usaron la base del usuario.
- La API respondió saludable tras el reinicio. La última revisión visual completa de la hoja nueva quedó pendiente porque el usuario estaba probando el formulario y no se interrumpió su trabajo.
