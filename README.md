# LESSSO

Aplicación web autohospedada para administrar prospectos, cuentas, bóveda de credenciales, finanzas y operación desde una interfaz local.

## Componentes

- **Frontend:** React 18, TypeScript, Vite y Tailwind CSS.
- **API:** FastAPI, SQLAlchemy asíncrono y PostgreSQL.
- **Servicios:** Nginx con TLS local y PostgreSQL. Un job de migración Alembic prepara el esquema antes de iniciar la API.
- **CRM:** prospectos, seguimiento, auditoría web, deduplicación y captación en mapa con OpenStreetMap.

El CRM funciona por sí solo y no inicia C2. C2 es un servicio opcional, independiente del CRM, que se ejecuta en el equipo Linux de auditoría y se conecta mediante un socket local. Para acceder desde la web se necesita una sesión de propietario y la bóveda desbloqueada; el navegador no recibe permisos de administrador ni acceso a Docker.

## Instalación y arranque

En Ubuntu o Debian necesitas Docker Engine con Compose v2, Python 3, OpenSSL y `flock` (util-linux). Usa tu cuenta habitual con acceso a Docker.

1. Abre una terminal en la carpeta del proyecto y ejecuta `./lessso`.
2. En un equipo nuevo, elige **Instalación inicial**. El menú crea `.env` a partir de la plantilla y prepara los certificados locales. Conserva `.env` y una copia segura de sus claves.
3. En **Inicio**, elige **CRM estable** para usar la interfaz compilada o **CRM en desarrollo** para recargar el frontend y el backend cuando cambie el código. Ambos modos usan los mismos datos y permanecen activos al salir del menú.
4. Abre la dirección HTTPS que muestra el menú. Instala `nginx/certs/local/ca.crt` como autoridad de confianza en los dispositivos cliente. En la primera visita, configura la bóveda y crea la cuenta administradora.

En **Configuración** puedes consultar el estado, detener los contenedores o guardar otra IP y otros puertos. Los cambios de dirección se aplican al elegir un modo en **Inicio**. Usa `127.0.0.1` para acceso exclusivo desde el equipo o una IPv4 privada asignada para acceso desde la LAN.

El arranque comprueba la interfaz y la API por HTTPS con la CA local. Puedes repetir esa comprobación desde **Configuración → Verificar HTTPS y base de datos** o con `./lessso --check`. La comprobación funciona también en automatización y devuelve un código distinto de cero si falla.

### Windows

Puedes usar LESSSO desde un navegador en Windows. Para alojarlo en Windows, usa Docker Desktop en modo contenedores Linux con Ubuntu en WSL 2. Activa la integración con esa distribución, guarda el repositorio en su sistema de archivos Linux y ejecuta `./lessso` desde Ubuntu. [Guía de Docker para WSL 2](https://docs.docker.com/desktop/features/wsl/)

Para uso desde ese mismo equipo, prueba primero con `127.0.0.1`. Para compartirlo en la LAN, comprueba que WSL y Docker puedan publicar el puerto en la IPv4 privada elegida y que Windows permita conexiones entrantes desde la red local. Valida desde otro dispositivo antes de entregar el equipo. [Red y firewall de WSL](https://learn.microsoft.com/en-us/windows/wsl/networking)

## Acceso del equipo

Abre la bóveda e inicia sesión en **Ajustes → Accesos del equipo**. La cuenta de propietario y la administración de negocio pueden operar las áreas del CRM. Ventas puede captar prospectos, registrar seguimiento y cerrar propuestas. Solo lectura puede consultar prospectos. La API comprueba ambos accesos y reserva cuentas, credenciales y finanzas para los roles autorizados.

En **Prospección → Prospectos**, abre un prospecto y usa **Propuestas y venta**. Al cerrar una propuesta, LESSSO registra al cliente, la venta y el saldo pendiente. La administración puede registrar los datos de un CFDI que ya se emitió en otro sistema y anotar su baja local.

## Edición compartida de reportes

Varios operadores pueden editar el mismo documento Typst o lienzo Excalidraw desde sus propias cuentas. El acceso se comparte por reporte, las ediciones se sincronizan en vivo y el servidor guarda las versiones cifradas en PostgreSQL. El equipo puede seguir trabajando aunque el propietario cierre su navegador, mientras el host Docker permanezca activo. Consulta [Colaboración en reportes](docs/colaboracion-reportes.md) para permisos, sincronización, restauración y validación.

## Actualizar una instalación previa

No reemplaces `.env` por el ejemplo antes de identificar las credenciales que corresponden al volumen PostgreSQL existente. Cambiar `POSTGRES_USER`, `POSTGRES_PASSWORD` o `POSTGRES_DB` en Compose no renombra ni cambia los datos del rol que ya vive dentro del volumen `emailsaver_postgres_data`; define en `.env` los valores que ya usa esa base. La contraseña por defecto de instalaciones anteriores quedó expuesta en el código histórico: si dependes de ella, úsala solo para recuperar el acceso y rótala dentro de PostgreSQL antes de dejar la instalación en servicio.

Antes de actualizar, haz una copia cifrada completa fuera del host y verifica que puedas restaurarla en un entorno aislado. Conserva `.env`, `SERVER_SECRET_KEY`, la identidad age de respaldo y cualquier clave anterior requerida. Si el sistema anterior usaba la clave de cifrado por defecto, configura esa clave previa en `LEGACY_SERVER_SECRET_KEYS` mientras verificas la lectura de los datos existentes.

Luego ejecuta `./lessso` y elige **Inicio → CRM estable**. El menú detiene la API anterior durante la migración y la inicia después del job. Revisa `docker compose logs migrate` y `docker compose ps`; la migración debe terminar con código 0 y el backend debe quedar sano. Comprueba el acceso con una cuenta existente y abre un documento guardado. Si la actualización falla, conserva el volumen actual para diagnóstico y sigue el procedimiento de recuperación del [RUNBOOK.md](RUNBOOK.md); no ejecutes `alembic downgrade` ni `docker compose down -v` para intentar revertirla.

## Configuración

`.env` es local y está excluido de Git. Los valores más relevantes son:

- `SERVER_SECRET_KEY`: clave de firma de sesiones y de cifrado de ciertos datos del servidor. Guárdala fuera del repositorio y conserva una copia segura; no sustituye la clave age para respaldos completos.
- `LEGACY_SERVER_SECRET_KEYS`: lista separada por comas para una rotación deliberada. Si una base existente depende de una clave anterior, consérvala aquí mientras se completa la migración; no borres los volúmenes de PostgreSQL para resolver un error de clave.
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: acceso interno a la base.
- `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`: límite de conexiones por réplica del backend. Ajusta el total para mantenerlo dentro de `max_connections` de PostgreSQL.
- `PORT`, `HTTPS_PORT`, `HOST_BIND_IP`: publicación del proxy; el menú guarda las opciones elegidas en `.env.runtime`, que tiene prioridad sobre `.env` al iniciar con `./lessso`.
- `VITE_API_PROXY_TARGET`, `VITE_DEV_HOST`, `VITE_DEV_PORT`: conexión local del servidor de desarrollo de Vite. Solo se usan al ejecutar el frontend fuera de Docker; las variables `VITE_*` son públicas y no deben contener secretos.
- `BACKUP_LOCAL_PATH`: destino persistente para exportaciones locales de la bóveda; el archivo `.emailsaver` es parcial y no contiene writeups ni evidencias.
- `BACKUP_AGE_RECIPIENT`: clave pública age opcional para activar el respaldo cifrado completo, descrito en `RUNBOOK.md`. Mantén su identidad privada fuera del servidor.
- `OSM_OVERPASS_URL`, `OSM_TILE_URL_TEMPLATE`, `OSM_OBJECT_URL_TEMPLATE`: servicios cartográficos configurables. La atribución a OpenStreetMap se mantiene visible en el mapa.
- `OSM_MAX_RESULTS`, `OSM_REQUEST_TIMEOUT_SECONDS`: límites de cada consulta.
- `FALLBACK_USD_MXN_RATE`: valor inicial cuando la base aún no tiene una tasa guardada.
- `CORS_ORIGINS`: lista JSON de orígenes adicionales. El frontend servido por el mismo proxy no requiere CORS.

No compartas `.env`, `nginx/certs/local/ca.key` ni `nginx/certs/local/server.key`. Si rotas `SERVER_SECRET_KEY`, mantén la clave anterior en `LEGACY_SERVER_SECRET_KEYS` hasta confirmar que los datos previos se pueden leer.

## Captación en mapa

En **Prospección → Captación en mapa** puedes buscar por giro en una zona de Tijuana o en el área visible. La lista conserva nombre, coordenadas y datos de contacto que OpenStreetMap tenga publicados. Puedes abrir cada referencia original y guardar negocios individualmente como prospectos nuevos. Un teléfono publicado no se interpreta automáticamente como WhatsApp.

Los resultados consultados se guardan en caché por área y búsqueda. Si Overpass limita o no responde, la pantalla muestra el error y permite reintentar. La aplicación no precarga ni guarda mosaicos del mapa para uso fuera de línea.

## Estructura

```text
backend/                 API, modelos, servicios y rutas
frontend/src/            Aplicación React y pantallas
frontend/public/vendor/  Leaflet local y su licencia
nginx/                   Proxy TLS y directorio local de certificados
scripts/                 Ayudas de operación
```

Consulta [RUNBOOK.md](RUNBOOK.md) para arranque, certificados y recuperación, [SEGURIDAD.md](SEGURIDAD.md) para el manejo de claves y datos, [Colaboración en reportes](docs/colaboracion-reportes.md) para la edición compartida, y la [guía de distribución](docs/distribucion.md) para el inventario de terceros.
