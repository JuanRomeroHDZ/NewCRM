# LESSSO

Aplicación web autohospedada para administrar prospectos, cuentas, bóveda de credenciales, finanzas y operación desde una interfaz local.

## Componentes

- **Frontend:** React 18, TypeScript, Vite y Tailwind CSS.
- **API:** FastAPI, SQLAlchemy asíncrono y PostgreSQL.
- **Servicios:** Nginx con TLS local, PostgreSQL y Redis.
- **CRM:** prospectos, seguimiento, auditoría web, deduplicación y captación en mapa con OpenStreetMap.

El CRM funciona por sí solo y no inicia C2. C2 es un servicio opcional, independiente del CRM, que se ejecuta en el equipo Linux de auditoría y se conecta mediante un socket local. Para acceder desde la web se necesita una sesión de propietario y la bóveda desbloqueada; el navegador no recibe permisos de administrador ni acceso a Docker.

## Menú de CRM y C2

Desde la carpeta `NewCRM`, ejecuta `./lessso` con tu usuario habitual, sin `sudo`.

- **Abrir CRM** enciende el CRM y lo deja disponible al salir del menú.
- **Abrir CRM en desarrollo (recarga automática)** inicia Vite y recarga la interfaz al guardar archivos; el backend también se recarga al modificar `backend/app`. Mantiene la misma dirección HTTPS. Úsalo mientras trabajas en el código; el modo **Abrir CRM** conserva el frontend de producción.
- **Abrir CRM temporal** muestra la dirección para el navegador. Pulsa Intro o Ctrl+C en la terminal para terminar.
- **Abrir CRM con C2 de demostración** inicia los dos juntos. Pulsa Ctrl+C en la terminal para terminar.
- **Abrir CRM y activar C2 real** inicia el CRM y solicita autorización con `sudo` en la terminal. Pulsa Ctrl+C para detener C2.
- **Administrar servicios** permite detener el CRM, consultar su estado, preparar C2 y elegir los puertos HTTP y HTTPS.

Para cambiar entre desarrollo y producción después de iniciar, abre `./lessso` y elige la opción correspondiente. La recarga automática queda activa mientras corre el modo de desarrollo; no hace falta volver a abrir el menú por cada cambio.

Las sesiones temporales detienen los servicios del CRM que encendieron. Si el CRM ya estaba activo, sigue abierto. Cerrar la pestaña del navegador no detiene los servicios. Detenerlos conserva los datos.

## Servicio C2 opcional

Ejecuta `./lessso` y elige **Abrir CRM y activar C2 real** o **Abrir CRM con C2 de demostración**. El programa prepara automáticamente C2 la primera vez. En la web entra en **Red y Lab** con tu cuenta de propietario y la bóveda desbloqueada. Para cerrar C2 pulsa Ctrl+C en la terminal donde lo iniciaste.

La demostración no requiere privilegios ni ejecuta operaciones reales sobre la red. No ejecutes a la vez el modo demo y el real. El modo real requiere Linux, hardware compatible y herramientas en el anfitrión, por ejemplo `ip`, `iw`, `iptables` e `ip6tables`; algunas funciones usan herramientas opcionales como `hcxpcapngtool` o `searchsploit`. La disponibilidad de Wi-Fi, servicios de red y cambios de identidad depende además del sistema y del hardware. La demostración no sustituye una prueba con esos dispositivos.

C2 conserva las áreas de hosts, puertos, topología, cámaras, Wi-Fi, captura y auditoría de tráfico, DNS, servicios de nombres, OPSEC y limpieza de emergencia. Úsalo únicamente en sistemas propios o con autorización expresa.

Para evitar agotar la memoria, las consultas de descubrimiento, topología y cámaras admiten hasta 4096 direcciones por solicitud. Divide las redes mayores en rangos más pequeños.

La captación consulta OpenStreetMap bajo demanda. Los resultados conservan su referencia OSM y no se agregan a Prospectos hasta que el usuario los guarda.

## Instalación desde cero

Necesitas Linux para el modo real de C2, Docker Engine con Compose v2, Python 3 con `venv`, OpenSSL y acceso a internet para instalar dependencias. El usuario que ejecuta los comandos debe poder usar Docker.

1. Clona el repositorio y entra en la carpeta:

   ```bash
   git clone https://github.com/JuanRomeroHDZ/NewCRM.git
   cd NewCRM
   ```

2. Ejecuta el programa:

   ```bash
   ./lessso
   ```

   La primera vez genera la configuración y los certificados locales. Conserva el archivo `.env` en un lugar seguro: contiene la clave necesaria para acceder a tus datos cifrados.

3. Elige **Abrir CRM**. El programa muestra la dirección HTTPS cuando está listo. Para elegir otros puertos, entra en **Administrar servicios → Elegir puertos e iniciar CRM**.

4. Abre la dirección HTTPS mostrada. Para que el navegador confíe en ella, instala el certificado `nginx/certs/local/ca.crt` en el dispositivo desde el que accederás.

5. Configura la contraseña de la bóveda. En **Cuentas del equipo**, crea tu cuenta administradora con una contraseña provisional y cámbiala cuando se solicite. Desde esa cuenta puedes agregar usuarios y asignar roles.

Para acceder desde otro equipo de la red privada, abre **Administrar servicios → Elegir acceso local o de red e iniciar CRM** y elige una IPv4 privada asignada al servidor, por ejemplo `192.168.1.20`. Abre desde el otro equipo la dirección HTTPS que muestra el programa e instala `nginx/certs/local/ca.crt` como autoridad de confianza en ese dispositivo. El acceso queda asociado a esa dirección concreta; para volver al acceso exclusivo desde el servidor, elige `127.0.0.1`. Compartir el acceso en la red permite a otros dispositivos alcanzar la pantalla de inicio de sesión, por lo que debe usarse en una red de confianza.

Para usar C2 real, ejecuta `./lessso` y selecciona **Abrir CRM y activar C2 real**. La primera vez se preparan sus dependencias. El sistema solicitará tu contraseña mediante `sudo` cuando corresponda. Mantén abierta esa terminal mientras uses C2 y pulsa Ctrl+C para cerrarlo.

Si ya tienes una sesión de Ventas y la cuenta administradora anterior sigue con su contraseña provisional, cierra la sesión de Ventas para crear tu cuenta administradora. Si ya existe un propietario que cambió su contraseña, inicia sesión con él para administrar las cuentas.

## Actualizar una instalación previa

No reemplaces `.env` por el ejemplo antes de identificar las credenciales que corresponden al volumen PostgreSQL existente. Cambiar `POSTGRES_USER`, `POSTGRES_PASSWORD` o `POSTGRES_DB` en Compose no renombra ni cambia los datos del rol que ya vive dentro del volumen `emailsaver_postgres_data`; define en `.env` los valores que ya usa esa base. La contraseña por defecto de instalaciones anteriores quedó expuesta en el código histórico: si dependes de ella, úsala solo para recuperar el acceso y rótala dentro de PostgreSQL antes de dejar la instalación en servicio.

Si el sistema anterior usaba la clave de cifrado por defecto, configura esa clave previa en `LEGACY_SERVER_SECRET_KEYS` mientras verificas la lectura de los datos existentes. Conserva también cualquier clave propia que ya estuviera en el `.env` anterior. Haz una copia de respaldo antes de rotar y no uses `docker compose down -v`.

## Configuración

`.env` es local y está excluido de Git. Los valores más relevantes son:

- `SERVER_SECRET_KEY`: clave de firma de sesiones y de cifrado de ciertos datos del servidor. Guárdala fuera del repositorio y conserva una copia segura; no sustituye la clave age para respaldos completos.
- `LEGACY_SERVER_SECRET_KEYS`: lista separada por comas para una rotación deliberada. Si una base existente depende de una clave anterior, consérvala aquí mientras se completa la migración; no borres los volúmenes de PostgreSQL para resolver un error de clave.
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: acceso interno a la base.
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

En **CRM → Captación en mapa** puedes buscar por giro en una zona de Tijuana o en el área visible. La lista conserva nombre, coordenadas y datos de contacto que OpenStreetMap tenga publicados. Puedes abrir cada referencia original y guardar negocios individualmente como prospectos nuevos. Un teléfono publicado no se interpreta automáticamente como WhatsApp.

Los resultados consultados se guardan en caché por área y búsqueda. Si Overpass limita o no responde, la pantalla muestra el error y permite reintentar. La aplicación no precarga ni guarda mosaicos del mapa para uso fuera de línea.

## Estructura

```text
backend/                 API, modelos, servicios y rutas
frontend/src/            Aplicación React y pantallas
frontend/public/vendor/  Leaflet local y su licencia
nginx/                   Proxy TLS y directorio local de certificados
scripts/                 Ayudas de operación
```

Consulta [RUNBOOK.md](RUNBOOK.md) para arranque, certificados y recuperación, y [SEGURIDAD.md](SEGURIDAD.md) para el manejo de claves y datos.
