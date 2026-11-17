# Continuidad del proyecto

Actualizado: 16 de noviembre de 2026.

## Implementado en el código fuente

- El laboratorio de informes guarda bloques de evidencia con objetivo, fecha, comando, resultado, capturas y hallazgos asociados. Los campos de objetivo, comando y resultado se pueden censurar en exportaciones para cliente.
- El seguimiento por máquina almacena estado, preguntas, respuestas y pasos pendientes dentro del informe.
- La biblioteca de fragmentos se comparte entre equipos y almacena sus plantillas cifradas. Admite variables de IP, puerto y dominio, con validación antes de insertar el texto; la aplicación no ejecuta los comandos.
- Las relaciones entre evidencia y hallazgos permiten abrir el hallazgo desde el bloque y volver a la evidencia desde el informe. La API valida que los identificadores pertenezcan al mismo informe.
- La revisión de publicación cuenta enlaces vacíos, imágenes ausentes o externas, secciones vacías, posibles secretos no marcados, censuras y tareas pendientes. Incluye Markdown, referencias HTML a imágenes/enlaces y cambios que aún no se han guardado.
- Los datos del laboratorio se cifran con la misma clave del servidor que el resto del contenido del informe. El esquema se amplía de forma aditiva y la rotación de clave incluye el laboratorio y la biblioteca.
- Se reemplazó la confirmación nativa del navegador al borrar fragmentos por el diálogo accesible de LESSSO. El laboratorio se carga bajo demanda para reducir el tamaño de la vista inicial.

## Verificaciones realizadas

- `npm test`: 19 suites y 79 pruebas de frontend pasaron, incluyendo validación de variables, censura, tareas pendientes, enlaces y referencias de imágenes.
- `npm run build`: compilación de TypeScript y Vite completada.
- Suite completa del backend dentro del contenedor, con SQLite en memoria: 332 pruebas pasaron, 1 omitida; incluye integración de evidencias, fragmentos, progreso, censura y migraciones.
- Prueba focalizada de writeups, exportación, recifrado y migraciones: 34 pasaron, 1 omitida.
- `python3 -m compileall`: compilación sintáctica del backend completada.
- Detector de interfaz Impeccable sobre los componentes modificados: sin hallazgos.
- `git diff --check`: sin errores de espacios o parches.
- Búsqueda estática: no encontró `shell=True` ni `os.system`; las entradas de fragmentos se persisten mediante SQLAlchemy y nunca se ejecutan como comandos. Las cadenas SQL dinámicas detectadas corresponden a migraciones fijas y bloqueo de tablas con nombres definidos por los modelos.
- Se retiró `docs/avance-recomendaciones.md`, un registro histórico de avance que duplicaba este archivo y mantenía pendientes y conteos de pruebas de una revisión anterior. Se conservaron las guías activas de operación, sesiones, seguridad y alcance de C2.

## Publicación y revisión final

- La imagen de frontend se reconstruyó y publicó; el backend se reinició para cargar el código y correr la migración aditiva. No se recrearon PostgreSQL/Redis ni se bajó Compose.
- Tras el reinicio, backend, frontend, proxy, PostgreSQL y Redis aparecen saludables; el endpoint de salud del backend devolvió HTTP 200.
- La aplicación cargó tras desbloquear la bóveda. Revisé en el navegador las pestañas de Evidencias, Progreso, Fragmentos y Publicación; se acomodan correctamente y no alteré el informe abierto.
- La revisión publicada del informe TwoMillion marcó un posible secreto sin etiqueta; es una señal heurística. No edité el writeup. Conviene revisar y censurar cualquier dato sensible en Exportar antes de compartirlo.
- El reinicio mostró las copias locales recuperables del informe. Se cerró el aviso conservando las copias; no se restauraron, sobrescribieron ni eliminaron.
- La compilación informa que algunos paquetes heredados generan fragmentos JavaScript mayores de 500 kB; el laboratorio nuevo sí se divide y carga solo cuando se abre.
- No se borraron informes, adjuntos, respaldos ni datos de usuario. Se retiró únicamente la nota histórica redundante indicada arriba; las guías operativas y de seguridad siguen activas.

La detección de secretos es heurística y no sustituye una revisión manual. Conserva los informes, adjuntos, respaldos y volúmenes existentes.
