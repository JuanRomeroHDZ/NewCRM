# Preparación de la entrega de LESSSO

La entrega prevista es una instalación privada en la red del cliente. Usa el [Runbook](../RUNBOOK.md) para la aceptación y guarda el identificador de la versión que se entregará.

## Inventario y avisos de terceros

Con la imagen candidata ejecutándose, guarda el inventario con `python3 scripts/distribution_inventory.py > inventario-terceros.tsv`. Incluye las dependencias de ejecución del lockfile de npm, las distribuciones Python y los paquetes Debian del backend activo, la versión de Typst y los archivos de licencia locales. La lista de npm incluye dependencias candidatas y no identifica qué código acaba en cada archivo del frontend. Las licencias sin metadatos requieren revisar el paquete original.

- Conserva las licencias de Leaflet, Lora y Poppins que ya están en `frontend/public`. La edición compartida añade `yjs`, `y-protocols` y `y-codemirror.next`, publicados bajo MIT; el inventario incluye sus versiones del lockfile. Revisa además los avisos de Excalidraw, sus fuentes y los paquetes que efectivamente entren en la compilación.
- Para redistribuir el binario de Typst, revisa los archivos [LICENSE](https://github.com/typst/typst/blob/v0.15.1/LICENSE) y [NOTICE](https://github.com/typst/typst/blob/v0.15.1/NOTICE) correspondientes a la versión incluida. Repite la revisión si cambia la versión.
- Si se entregan imágenes Docker, registra sus digests y revisa también las imágenes base y los paquetes de Nginx y PostgreSQL. El TSV cubre el backend activo y el lockfile. La composición final y los avisos que acompañarán al paquete se cierran sobre la versión candidata.

## Datos y responsables de la entrega

Registra el responsable del cliente para respaldo y recuperación, el contacto que atenderá incidencias y actualizaciones, y el resultado de la prueba de aceptación. Guarda una copia cifrada y su identidad de recuperación en ubicaciones separadas fuera del servidor de la aplicación.

Prospectos y Finanzas aún admiten acceso con la sesión de bóveda sin exigir una identidad de operador. Para una entrega que requiera permisos separados por persona, completa y verifica ese control en la API antes de ofrecer acceso de solo lectura. En una instalación de un operador, esa persona custodia la clave maestra.

Antes de enviar el paquete, el titular debe aprobar la licencia de LESSSO y los términos con el cliente. El repositorio conserva la decisión pendiente hasta que se identifiquen el titular y el modelo de licencia. Los avisos de terceros se entregan por separado de esos términos.
