# Operación y recuperación

## Arrancar o reiniciar

Desde la raíz de NewCRM, con `.env` configurado y los certificados creados:

```bash
docker compose up -d
docker compose ps
docker compose logs --tail 80 backend
```

Para detener los servicios sin borrar los datos persistentes:

```bash
docker compose down
```

No uses `docker compose down -v` salvo que realmente quieras eliminar las bases y los volúmenes.

## Reutilizar una base existente

El volumen PostgreSQL conserva el usuario, contraseña y nombre de base con que se inicializó. Para actualizar una instalación anterior, copia primero los valores efectivos a `.env`; los cambios en las variables de Compose no modifican automáticamente esos datos dentro del volumen. Los defaults de contraseña de la versión anterior estaban publicados en el código y deben rotarse al recuperar una instalación que dependía de ellos. Cambia la contraseña del rol desde PostgreSQL y actualiza `.env` en el mismo mantenimiento.

Si los datos cifrados se escribieron con una clave anterior, agrégala a `LEGACY_SERVER_SECRET_KEYS` y verifica su lectura antes de retirar esa clave. Haz un respaldo antes de rotar y conserva los volúmenes durante la operación.

## Certificados locales

`./scripts/generate_certs.sh` crea una CA privada y el certificado del servidor dentro de `nginx/certs/local/`. Copia únicamente `ca.crt` a los dispositivos cliente e instálalo como autoridad de confianza. Nunca compartas `ca.key` ni `server.key`. Los certificados se vuelven a generar en el servidor y no se incluyen en la imagen ni en Git.

Si cambia `SERVER_NAME`, vuelve a generar el certificado del servidor y asegúrate de que el nombre resuelva al equipo dentro de la red local.

## Datos y respaldos

- PostgreSQL conserva sus datos en el volumen `postgres_data`; los respaldos locales usan `backup_data`.
- La exportación cifrada de la bóveda requiere la contraseña de exportación. Guárdala separada del archivo.
- Protege cualquier respaldo de PostgreSQL con cifrado antes de moverlo fuera del servidor.
- Antes de restaurar, conserva una copia del volumen actual y comprueba que tienes la clave maestra y `SERVER_SECRET_KEY`.
- No elimines volúmenes para resolver fallos de arranque o errores de descifrado.

## Rotación de claves

- **Contraseña maestra:** usa el flujo de seguridad de la aplicación y verifica que las credenciales puedan revelarse después del cambio.
- **`SERVER_SECRET_KEY`:** conserva la clave anterior en `LEGACY_SERVER_SECRET_KEYS` durante una rotación. La configuración antigua puede necesitar su clave original para leer datos existentes.
- **Contraseña del propietario:** cambia `INITIAL_OWNER_PASSWORD` en `.env` para instalaciones nuevas. El arranque no reemplaza las credenciales de un propietario que ya existe en la base.

Después de un reinicio o cambio, confirma `docker compose ps`, revisa los logs del backend y abre la aplicación desde un navegador autorizado.
