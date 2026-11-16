# Estado y pendientes reales

Actualizado: 16 de noviembre de 2026.

## Implementado y comprobado

- El editor ofrece encabezados H1–H6 y 12 estilos de lista desde menús compactos; los desplegables de informe y pizarra muestran una flecha y abren paneles flotantes.
- El índice interno organiza secciones, tablas e imágenes tanto en Markdown como en HTML. La exportación permite elegir profundidad del índice de secciones y añadir índices de tablas e imágenes; Word y Markdown incluyen esos índices.
- La pizarra agrupa herramientas de dibujo, flechas, trazos y símbolos de red/seguridad en menús flotantes. Revisé el modo combinado con informe y pizarra después de recargar el servicio.
- El globo de ayuda de Finanzas se muestra bajo su título y queda dentro de la pantalla.
- La sesión autenticada continuó activa tras actualizar y recargar el frontend. Revisé Informes, Finanzas, Correo y servicios, Conexiones y los menús principales sin editar ni borrar registros.
- `npm test` pasó: 15/15 archivos de prueba; las 322 pruebas de backend pasaron en la ejecución anterior. La compilación de producción actual terminó correctamente. El detector Impeccable no encontró hallazgos nuevos y `git diff --check` quedó limpio.

## Verificaciones externas que aún no se pueden cerrar aquí

1. Confirmar el acceso desde una segunda PC de la red interna. La redirección HTTP a HTTPS está instalada; esta sesión no representa un cliente distinto.
2. Probar el intervalo completo de inactividad configurado. Las pruebas automatizadas cubren expiración y renovación, pero esperar el intervalo real requiere dejar la aplicación inactiva durante ese tiempo.
3. Probar funciones Wi‑Fi que necesitan una interfaz dedicada. No se conectó un adaptador USB ni se cambió el modo de la interfaz de red en uso; el límite está documentado en `Limites_hardware.md`.

No quedan implementaciones de código pendientes de esta lista. Conserva los informes y datos existentes; no limpiar mediante borrado de registros, volúmenes o archivos de usuario.
