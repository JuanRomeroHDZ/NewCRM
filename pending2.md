# Informe de revisión y continuación de NewCRM

Fecha de corte: 2026-11-13
Proyecto: /home/juanromero/Documents/Proyectos/NewCRM

## Estado de operación

- La interfaz se comprobó en el navegador tras una recarga en `http://127.0.0.1:3001/` y mostró el panel protegido actualizado.
- El contenedor `newcrm-api` quedó `running` y `healthy`, publicado en `127.0.0.1:8000`.
- Tras el reinicio, la bóveda volvió a pedir desbloqueo. No se ingresó ni se solicitó la contraseña.
- No se recreó Compose, no se cambió el motor de base ni se migraron datos.

## Revisión de UI y UX

- Se visitaron las 13 vistas principales en cinco tamaños: 250×250, 375×812, 768×1024, 1024×768 y 1440×900. No apareció desbordamiento horizontal de página en esos tamaños.
- En Contraseñas y Recursos, los filtros móviles ahora son selectores nativos; en pantallas mayores las opciones se distribuyen en varias líneas.
- El Historial presenta filas tipo ficha en anchos menores y cambia a tabla en escritorio amplio. Se compactaron las celdas de la tabla.
- Ajustes limita el ancho del selector de moneda en móvil y permite que el campo de presupuesto se reduzca.
- El formulario de prospecto compacta el campo de SLA en móvil.
- El diálogo de recuperación se mantiene dentro del ancho de 250 px y permite desplazamiento vertical cuando el alto no alcanza. No se guardó ni copió contenido secreto.
- Los botones Mapa/Resultados funcionan en 250×250; seis resultados se mostraron sin desbordamiento horizontal. Se verificó atribución de OpenStreetMap. Los seis registros vinieron de caché; no se guardaron como prospectos.
- Navegación lateral accesible con categorías expandibles y acciones de expandir/contraer.
- No se detectaron emojis ni `window.alert`, `window.confirm` o `window.prompt` en el frontend inspeccionado.
- La revisión se hizo con el navegador y tamaños explícitos. No se afirmó un resultado Lighthouse de 100 ni se ejecutó Google DevTools MCP.

## Seguridad, validación y consistencia

- `require_role` bloquea operaciones de administración mientras la cuenta tenga pendiente el cambio de contraseña temporal; el endpoint de cambio sigue disponible.
- La actualización del perfil de usuario desde frontend usa PATCH, según el contrato del backend.
- Límites agregados o ajustados en agenda, comunicaciones, taller, integraciones y rutas de usuarios: duración máxima de eventos de 31 días; ventana de pruebas de 365 días; referencias relacionadas validadas; IDs de evento de hasta 36 caracteres; render de plantillas con límites de cantidad, longitud y tipo; archivos EML leídos hasta 10 MB más un byte antes de rechazarse; SVG acotado por bytes UTF-8; recursos de nube limitados a los implementados y servidor obtenido de configuración; IDs de usuario/hilo/mensaje acotados.
- Los cambios de esquema/configuración y algunas operaciones CRM ya tienen escritura de auditoría dentro de la misma transacción, de acuerdo con el código revisado previamente.
- No se leyeron ni imprimieron secretos de `.env.local` o `.env.runtime`.
- Monedas configurables limitadas a MXN y USD; MXN es la moneda base.

## Verificación automatizada

- Frontend: 4/4 pruebas (`node --test`), compilación de TypeScript y build de Vite correctos.
- Backend: 162/162 pruebas correctas en SQLite en memoria.
- `git diff --check`: limpio.
- Build advierte que el chunk diferido de ELK ronda 1.5 MB sin comprimir; debe reducirse o dividirse.

## Pendientes técnicos

1. Incorporar alta inicial de una cuenta normal en instalaciones nuevas. Actualmente la cuenta del propietario se configura por entorno; para crear usuarios adicionales debe existir ese propietario. El acceso a la bóveda no equivale a iniciar sesión como usuario.
2. Auditar con copia de seguridad las notas heredadas que pudieran permanecer sin cifrar. La migración no se ejecutó sobre la base real.
3. Quitar la supresión silenciosa de errores de esquema/migración en `main.py` y dejar mensajes operativos claros. El health check evita marcar el servicio saludable si faltan tablas.
4. Diseñar y validar por separado la migración de SQLite a PostgreSQL/Redis, incluidos respaldo y restauración.
5. Repetir una búsqueda de mapa contra el servicio en vivo cuando tarde, validar cancelación y mensajes de error y comprobar guardado/deduplicación en una instancia de prueba.
6. Paginación de listas grandes de agenda y comunicaciones. Evaluar límite multipart antes de que el middleware almacene el archivo temporalmente; hoy el límite del manejador no evita esa lectura previa.
7. Optimizar ELK, validar el comportamiento en redes lentas y revisar estrategia de carga de diagramas.
8. Extender validaciones y casos de accesibilidad al resto de formularios y estados de error; no se garantiza aquí que todo campo del sistema tenga ya límites adecuados.
9. Repetir DevTools/Lighthouse cuando la integración esté disponible; este corte no produce ni promete puntaje 100.

## Cuota observada

- Ventana de 5 horas: 29% consumido, 71% restante.
- Semana: 35% consumido, 65% restante.
