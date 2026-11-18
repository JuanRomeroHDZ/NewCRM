# Operación y recuperación

## Arrancar o reiniciar

Desde la raíz de NewCRM, con tu usuario habitual:

```bash
./scripts/up.sh
docker compose --env-file .env --env-file .env.runtime ps
docker compose --env-file .env --env-file .env.runtime logs --tail 80 backend
```

El arranque usa `.env.runtime` para conservar los puertos y la dirección elegidos. Para editar código con recarga automática, abre `./lessso` y selecciona **Abrir CRM en desarrollo (recarga automática)**; la dirección HTTPS no cambia. Para volver al frontend de producción, selecciona **Abrir CRM**.

Para detener los servicios sin borrar los datos persistentes:

```bash
docker compose down
```

No uses `docker compose down -v` salvo que realmente quieras eliminar las bases y los volúmenes.

## Reutilizar una base existente

El volumen PostgreSQL conserva el usuario, contraseña y nombre de base con que se inicializó. Para actualizar una instalación anterior, copia primero los valores efectivos a `.env`; los cambios en las variables de Compose no modifican automáticamente esos datos dentro del volumen. Los defaults de contraseña de la versión anterior estaban publicados en el código y deben rotarse al recuperar una instalación que dependía de ellos. Cambia la contraseña del rol desde PostgreSQL y actualiza `.env` en el mismo mantenimiento.

Si los datos cifrados se escribieron con una clave anterior, agrégala a `LEGACY_SERVER_SECRET_KEYS` y verifica su lectura antes de retirar esa clave. Haz un respaldo antes de rotar y conserva los volúmenes durante la operación.

## Certificados locales

`./lessso` genera automáticamente una CA privada y el certificado del servidor dentro de `nginx/certs/local/`. Copia únicamente `ca.crt` a los dispositivos cliente e instálalo como autoridad de confianza. Nunca compartas `ca.key` ni `server.key`. Los certificados se vuelven a generar en el servidor y no se incluyen en la imagen ni en Git.

Para publicar en una red privada, selecciona **Administrar servicios → Elegir acceso local o de red e iniciar CRM** e introduce una de las IPv4 privadas asignadas al servidor. El programa guarda la dirección en `.env.runtime`, incorpora esa IP al certificado del servidor usando la CA existente y muestra la URL para los clientes. Instala `ca.crt` en cada cliente. Si la IP cambia, repite la selección; si la dirección guardada ya no pertenece al equipo, el menú detecta la dirección privada activa de la ruta de salida y la propone. Para cerrar el acceso por red, selecciona `127.0.0.1`. La dirección elegida reemplaza el enlace local: utiliza la URL mostrada también en el servidor. La interfaz solo admite direcciones privadas concretas o `127.0.0.1`, no `0.0.0.0`.

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
- El manifiesto versión 2 exige la aplicación, pruebas, documentación y configuración de reconstrucción incluidas; verifica los archivos cifrados, el inventario y la estructura restaurada. La restauración de prueba no se ha ejecutado sobre este despliegue. Ni una exportación `.emailsaver` ni la existencia del volumen `backup_data` equivalen a una copia completa.
- La exportación cifrada de la bóveda requiere su contraseña de exportación. Guárdala separada del archivo.
- El respaldo completo se cifra en tránsito hacia el volumen aislado. Conserva una copia cifrada fuera del servidor y custodia la identidad privada age por separado.
- Antes de restaurar, conserva una copia del volumen actual y comprueba que tienes la clave maestra y `SERVER_SECRET_KEY`.
- No elimines volúmenes para resolver fallos de arranque o errores de descifrado.

## Rotación de claves

- **Contraseña maestra:** usa el flujo de seguridad de la aplicación y verifica que las credenciales puedan revelarse después del cambio.
- **`SERVER_SECRET_KEY`:** conserva la clave anterior en `LEGACY_SERVER_SECRET_KEYS` durante una rotación. La configuración antigua puede necesitar su clave original para leer datos existentes.
- **Contraseña del propietario:** cambia `INITIAL_OWNER_PASSWORD` en `.env` para instalaciones nuevas. El arranque no reemplaza las credenciales de un propietario que ya existe en la base.

Después de un reinicio o cambio, confirma `docker compose ps`, revisa los logs del backend y abre la aplicación desde un navegador autorizado.
