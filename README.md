# Contact | LESSSO

Aplicación web autohospedada para administrar prospectos, cuentas, bóveda de credenciales, finanzas y operación desde una interfaz local.

## Componentes

- **Frontend:** React 18, TypeScript, Vite y Tailwind CSS.
- **API:** FastAPI, SQLAlchemy asíncrono y PostgreSQL.
- **Servicios:** Nginx con TLS local, PostgreSQL y Redis.
- **CRM:** prospectos, seguimiento, auditoría web, deduplicación y captación en mapa con OpenStreetMap.

La captación consulta OpenStreetMap bajo demanda. Los resultados conservan su referencia OSM y no se agregan a Prospectos hasta que el usuario los guarda.

## Preparar una instalación

Requisitos: Docker Engine con Docker Compose v2 y OpenSSL.

1. Copia `.env.example` como `.env`.
2. Genera valores distintos para `SERVER_SECRET_KEY`, `POSTGRES_PASSWORD` e `INITIAL_OWNER_PASSWORD`. Para las dos claves hexadecimales puedes usar `openssl rand -hex 32`; para la contraseña del propietario, usa una frase larga que no reutilices. `SERVER_SECRET_KEY` debe tener al menos 32 caracteres y `INITIAL_OWNER_PASSWORD` al menos 16.
3. Deja `HOST_BIND_IP=127.0.0.1` para acceso desde el propio servidor. Para acceso desde la red local, cámbialo a `0.0.0.0` y limita el acceso con el firewall de esa red.
4. Genera los certificados locales:

   ```bash
   ./scripts/generate_certs.sh
   ```

5. Construye y levanta los servicios:

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

6. Abre `https://localhost:8443` si mantuviste los puertos de ejemplo. Para evitar la advertencia del navegador, instala `nginx/certs/local/ca.crt` en los dispositivos que vayan a usar la aplicación. El certificado y las claves se generan localmente, se montan solo en el proxy y están excluidos de Git.

Configura la bóveda maestra desde la pantalla inicial. Si la base aún no tiene propietario, el backend crea la cuenta del núcleo con `INITIAL_OWNER_USERNAME`, `INITIAL_OWNER_EMAIL` e `INITIAL_OWNER_PASSWORD`; una cuenta existente no se reemplaza en cada arranque. Ya no hay una contraseña universal dentro del código.

## Actualizar una instalación previa

No reemplaces `.env` por el ejemplo antes de identificar las credenciales que corresponden al volumen PostgreSQL existente. Cambiar `POSTGRES_USER`, `POSTGRES_PASSWORD` o `POSTGRES_DB` en Compose no renombra ni cambia los datos del rol que ya vive dentro del volumen `emailsaver_postgres_data`; define en `.env` los valores que ya usa esa base. La contraseña por defecto de instalaciones anteriores quedó expuesta en el código histórico: si dependes de ella, úsala solo para recuperar el acceso y rótala dentro de PostgreSQL antes de dejar la instalación en servicio.

Si el sistema anterior usaba la clave de cifrado por defecto, configura esa clave previa en `LEGACY_SERVER_SECRET_KEYS` mientras verificas la lectura de los datos existentes. Conserva también cualquier clave propia que ya estuviera en el `.env` anterior. Haz una copia de respaldo antes de rotar y no uses `docker compose down -v`.

## Configuración

`.env` es local y está excluido de Git. Los valores más relevantes son:

- `SERVER_SECRET_KEY`: clave de firma y de cifrado de respaldo del servidor. Guárdala fuera del repositorio y conserva una copia segura.
- `LEGACY_SERVER_SECRET_KEYS`: lista separada por comas para una rotación deliberada. Si una base existente depende de una clave anterior, consérvala aquí mientras se completa la migración; no borres los volúmenes de PostgreSQL para resolver un error de clave.
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: acceso interno a la base.
- `PORT`, `HTTPS_PORT`, `HOST_BIND_IP`: publicación local del proxy.
- `VITE_API_PROXY_TARGET`, `VITE_DEV_HOST`, `VITE_DEV_PORT`: conexión local del servidor de desarrollo de Vite. Solo se usan al ejecutar el frontend fuera de Docker; las variables `VITE_*` son públicas y no deben contener secretos.
- `BACKUP_LOCAL_PATH`: destino persistente de los respaldos.
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
