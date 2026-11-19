# Operación y recuperación

## Arrancar o reiniciar

Desde la raíz de NewCRM, ejecuta `./lessso` con tu cuenta habitual. **Inicio** ofrece **CRM estable** y **CRM en desarrollo**. El menú construye primero las imágenes modificadas, detiene la API anterior antes de migrar y luego espera a que la base, el job de migración, la API, el frontend y el proxy queden listos.

El servicio único `migrate` aplica revisiones Alembic y tareas de datos idempotentes antes de iniciar las réplicas de API. Las revisiones `20261118_0004` y `20261118_0005` añaden el historial de envío y respuesta de propuestas, la copia del PDF emitido y la fecha de próximo seguimiento del prospecto. La revisión `20261119_0006` agrega permisos, sincronización, revisiones, comentarios, solicitudes de aprobación y presencia de Reportes. Los registros existentes se conservan. La imagen estable ejecuta el código incluido en la imagen, sin montar el árbol del backend del host. Desarrollo monta el código como solo lectura y activa la recarga automática. No borres volúmenes para actualizar.

En desarrollo, React Refresh carga su módulo de inicio desde el mismo origen y la recarga automática se conecta por WebSocket al puerto HTTPS del proxy. Si la pestaña estaba abierta al cambiar de modo, recárgala para cargar la versión elegida.

Usa **Configuración → Ver estado** para consultar los servicios y **Configuración → Detener CRM** para detenerlos. Para consultar los registros del backend:

```bash
docker compose logs --tail 80 backend
```

## Reutilizar una base existente

El volumen PostgreSQL conserva el usuario, contraseña y nombre de base con que se inicializó. Para actualizar una instalación anterior, copia primero los valores efectivos a `.env`; los cambios en las variables de Compose no modifican automáticamente esos datos dentro del volumen. Los defaults de contraseña de la versión anterior estaban publicados en el código y deben rotarse al recuperar una instalación que dependía de ellos. Cambia la contraseña del rol desde PostgreSQL y actualiza `.env` en el mismo mantenimiento.

Si los datos cifrados se escribieron con una clave anterior, agrégala a `LEGACY_SERVER_SECRET_KEYS` y verifica su lectura antes de retirar esa clave. Haz un respaldo antes de rotar y conserva los volúmenes durante la operación.

Las bases antiguas sin `alembic_version` se adoptan de forma aditiva: se completan las tablas que faltan, se agregan columnas históricas faltantes, se registra el baseline y se actualiza a la revisión actual. No se eliminan ni recrean tablas o filas. El baseline es irreversible con Alembic porque su `downgrade` eliminaría el esquema adoptado. La reversión se hace restaurando una copia verificada, nunca con `alembic downgrade`.

### Actualizar una instalación

1. Genera una copia cifrada completa, cópiala fuera del host y verifica la restauración en PostgreSQL aislado con el procedimiento de este runbook.
2. Conserva `.env`, las credenciales efectivas del volumen PostgreSQL, `SERVER_SECRET_KEY` y la identidad privada age en su ubicación segura. No los sustituyas por valores de `.env.example`.
3. Ejecuta `./lessso` → **Inicio** → **CRM estable**. El contenedor `migrate` aplica el esquema y prepara la base antes de que Compose arranque la API.
4. Revisa `docker compose logs migrate` y `docker compose ps`: `migrate` debe terminar con `Exited (0)` y la API debe estar sana. Inicia sesión con la cuenta existente y valida una exportación representativa.
5. Si falla, conserva el volumen original y los logs. Recupera en una base separada desde la copia verificada antes de decidir si sustituyes los datos del servicio.

En desarrollo, guarda los cambios en `backend/app` para que se recargue la API. Después de añadir una revisión Alembic, vuelve a elegir **CRM en desarrollo** en el menú para construir la imagen que contiene la revisión y aplicarla antes de iniciar la API.

Las migraciones de datos de una sola ejecución registran su identificador en `core_data_migrations`; si una ejecución falla antes de terminar, la siguiente la reanuda sin volver a cifrar las filas ya procesadas. No ejecutes migraciones de prueba contra el volumen con datos reales.

Una instalación de un solo host puede ejecutar varias réplicas API cuando PostgreSQL tenga capacidad suficiente. Por ejemplo, después de iniciar el modo estable:

```bash
docker compose up -d --scale backend=2
```

Las sesiones de bóveda y los bloqueos de re-cifrado se comparten mediante PostgreSQL; la clave derivada no se guarda en la base. Nginx vuelve a resolver el servicio backend para detectar réplicas. El límite de conexiones del pool principal es `réplicas × (DB_POOL_SIZE + DB_MAX_OVERFLOW)`; reserva capacidad adicional en PostgreSQL para el job de migración, respaldos, conexiones administrativas y mantenimiento. Las solicitudes protegidas se limitan por proceso a la mitad de la capacidad del pool, ya que cada una mantiene una conexión para el bloqueo distribuido y otra para su sesión de base de datos. La capacidad combinada debe ser de al menos dos conexiones. No aumentes el pool sin revisar `max_connections` y las solicitudes simultáneas esperadas.

La edición simultánea de Typst y Excalidraw usa PostgreSQL como registro común y WebSocket a través del proxy TLS. No requiere un contenedor aparte ni un proveedor externo. Antes de invitar operadores, actualiza a la revisión `20261119_0006`, prueba cada permiso con cuentas separadas y sigue la [guía de colaboración en Reportes](docs/colaboracion-reportes.md). No configures el canal WebSocket para omitir el proxy HTTPS ni expongas directamente el puerto interno de la API.

## Entrega de una instalación a un cliente

La primera entrega se opera como una instancia propia del cliente en una red privada. Registra la revisión entregada, el equipo responsable y el acceso seguro a las claves, sin incluirlas en el acta de entrega.

1. Arranca en modo estable y ejecuta `./lessso --check`. Desde un dispositivo cliente, abre la misma dirección HTTPS con la CA local instalada y termina el alta desde una red controlada.
2. Con una cuenta de operación, comprueba el alta y seguimiento de un prospecto, el vínculo de un servicio con su registro financiero y la exportación de un PDF representativo con un lienzo o imagen. Con una cuenta de solo lectura, verifica el acceso que le corresponde.
3. Crea un respaldo cifrado completo, copia un snapshot fuera del servidor y restaura esa copia en PostgreSQL aislado. Registra la fecha y el resultado, y deja acordado quién atiende fallos y aplica actualizaciones.

## Certificados locales

`./lessso` genera automáticamente una CA privada y el certificado del servidor dentro de `nginx/certs/local/`. Copia únicamente `ca.crt` a los dispositivos cliente e instálalo como autoridad de confianza. Nunca compartas `ca.key` ni `server.key`. Los certificados se vuelven a generar en el servidor y no se incluyen en la imagen ni en Git.

En **Configuración → Cambiar IP y puertos**, elige una IPv4 privada asignada al servidor o `127.0.0.1` para acceso local. El menú guarda las preferencias en `.env.runtime`. Al iniciar de nuevo, el proxy aplica la dirección y los puertos elegidos y renueva el certificado del servidor si hace falta, usando la CA existente.

En **Configuración → Certificado HTTPS**, consulta las fechas de vencimiento del servidor y de la CA y solicita la renovación del certificado del servidor. Si el proxy está activo, comprueba su configuración y recárgalo desde el mismo menú. Ejecuta `./lessso --check` para confirmar el acceso. El arranque renueva el certificado del servidor si quedan menos de 30 días. Si vence la CA, su sustitución requiere instalar la nueva CA en los equipos cliente.

Si cambia `SERVER_NAME`, vuelve a generar el certificado del servidor y asegúrate de que el nombre resuelva al equipo dentro de la red local.

## Datos y respaldos

- PostgreSQL conserva los datos de la aplicación en `postgres_data`. Los writeups, revisiones, hallazgos, pizarras y evidencias cifradas (`writeup_assets.encrypted_blob`) están en esa base. El respaldo también incluye el volumen `vault_media` montado para compatibilidad.
- `backup_data` es un volumen montado para respaldos locales, pero el despliegue actual no incluye un programador ni un proceso que genere y rote un respaldo completo allí.
- El archivo `.emailsaver` es una exportación parcial. Incluye correos, cuentas de plataforma, pagos, ingresos, renovaciones, gastos, proyectos, recursos, preferencias seleccionadas y tipo de cambio. Omite prospectos, writeups y sus revisiones/hallazgos/pizarras/evidencias, actividad y configuración del servidor. Su restauración tampoco aplica gastos, proyectos, recursos, preferencias ni tipo de cambio.
- El programador de respaldo completo es optativo y está apagado por defecto. Requiere `age` en el servicio aislado y guarda resultados cifrados en el volumen dedicado `full_backup_data`; captura al iniciar y luego cada día a las 02:00 UTC, con retención de 14 días. `backup_data` no se utiliza para este flujo.
- Para activarlo, genera una identidad age en otro equipo confiable con `age-keygen -o lessso-backup-identity.txt`. Guarda el archivo privado fuera del servidor. Copia únicamente el valor público que sigue a `# public key:` y añádelo a `.env` como `BACKUP_AGE_RECIPIENT=age1...`; nunca copies la identidad privada al servidor ni a una variable de entorno. Si falta una clave pública válida, el servicio no crea respaldos.
- Con los servicios normales ya iniciados, activa el perfil opcional con `docker compose --profile full-backup up -d --build full_backup`. El contenedor captura primero el manifiesto de archivos, exporta PostgreSQL y archiva `vault_media`, la aplicación, migraciones y pruebas backend/frontend, configuración de pytest, documentación de producto y seguridad, `docs/**`, scripts, nginx y certificados. Incluye el archivo de ejemplo `.env.example` exacto para facilitar una reconstrucción; no incluye `.env`, `.env.runtime` ni ningún otro `.env.*`. Todos los mounts de origen son solo lectura. La lista permitida también excluye `.git`, `node_modules`, `dist`, `build`, `.venv`, caches y archivos compilados; un patrón común de secreto en textos incluidos detiene el respaldo. Se vuelven a comparar las huellas antes y después de ambas capturas. Si cambian, descarta el intento y reintenta hasta tres veces. Conserva valores secretos como `SERVER_SECRET_KEY` y las credenciales de PostgreSQL en un gestor separado. El manifiesto y los artefactos se cifran con la clave pública age.
- El sidecar necesita leer las claves TLS que permanecen con permisos `600`. Corre como UID 0 con solo `DAC_READ_SEARCH` además de su sistema de archivos de solo lectura; los mounts de origen siguen siendo `:ro` y no se cambian permisos de certificados. El volumen nuevo se inicializa como `root:root`, modo `0700`; si `full_backup_data` ya existe y no es escribible, el servicio se detiene con un error claro. No cambies permisos de CA ni claves del servidor para corregirlo.
- La comprobación de huellas solo confirma que los árboles de archivos montados no cambiaron durante la ventana de captura; no coordina una transacción entre PostgreSQL y un sistema de archivos. En la implementación actual, los bytes de las evidencias de informes se guardan en PostgreSQL (`writeup_assets.encrypted_blob`); `vault_media` se incluye por compatibilidad. Si una versión futura guarda datos referenciados fuera de PostgreSQL, hará falta un protocolo de snapshot coordinado antes de afirmar consistencia entre ambos almacenes.
- Para listar snapshots cifrados desde el host donde corre Compose, ejecuta `docker compose exec full_backup find /var/backups/full -mindepth 1 -maxdepth 1 -type d -name 'full-*' -printf '%f\n'`. Copia uno al directorio seguro que elijas fuera del proyecto con `docker compose cp full_backup:/var/backups/full/<snapshot> <directorio-seguro>/<snapshot>`; este comando copia únicamente los archivos cifrados. En un equipo confiable con Docker local, `age` y `pg_restore`, ejecuta `python3 scripts/restore_full_backup_test.py --backup-dir <directorio-seguro>/<snapshot> --identity-file <identidad-privada> --confirm-isolated-docker`. El script extrae a un directorio temporal, restaura a un contenedor PostgreSQL aislado con red deshabilitada y un directorio temporal propio; no carga Compose ni monta volúmenes del CRM. El directorio temporal puede contener datos descifrados durante la prueba y se elimina al salir; una interrupción forzada puede dejarlo en `/tmp` para limpieza manual en ese equipo.
- El manifiesto versión 2 verifica la aplicación, las pruebas, la documentación de operación, los archivos cifrados y la estructura restaurada. En la instalación de pruebas, el snapshot del 19 de noviembre de 2026 a las 04:18 UTC se restauró en PostgreSQL aislado. Se verificaron siete tablas críticas y el inventario de 761 elementos. La base recuperada se actualizó de la revisión `20261118_0003` a `20261118_0005` y conservó sus siete informes. Ni una exportación `.emailsaver` ni la existencia del volumen `backup_data` equivalen a una copia completa.
- En esta instalación de pruebas, la identidad se guardó en `~/.local/share/lessso-test-recovery/test-identity.txt` con permisos `600`, fuera del repositorio y de los orígenes que lee el respaldo. El menú `./lessso` arranca el programador cuando `BACKUP_AGE_RECIPIENT` está configurado. Custodia en otro equipo la identidad de una instalación con información real.
- La exportación cifrada de la bóveda requiere su contraseña de exportación. Guárdala separada del archivo.
- El respaldo completo se cifra en tránsito hacia el volumen aislado. Conserva una copia cifrada fuera del servidor y custodia la identidad privada age por separado.
- Antes de restaurar, conserva una copia del volumen actual y comprueba que tienes la clave maestra y `SERVER_SECRET_KEY`.
- No elimines volúmenes para resolver fallos de arranque o errores de descifrado.

## Rotación de claves

- **Contraseña maestra:** usa el flujo de seguridad de la aplicación y verifica que las credenciales puedan revelarse después del cambio.
- **`SERVER_SECRET_KEY`:** conserva la clave anterior en `LEGACY_SERVER_SECRET_KEYS` durante una rotación. La configuración antigua puede necesitar su clave original para leer datos existentes.
- **Contraseña del propietario:** cambia `INITIAL_OWNER_PASSWORD` en `.env` para instalaciones nuevas. El arranque no reemplaza las credenciales de un propietario que ya existe en la base.

Después de un reinicio o cambio, confirma `docker compose ps`, revisa los logs del backend y abre la aplicación desde un navegador autorizado.

## Auditoría operativa

Usa `./scripts/audit.sh guide` y sigue la rama que corresponda al hallazgo en la [auditoría operativa](docs/auditoria-lessso.md).
