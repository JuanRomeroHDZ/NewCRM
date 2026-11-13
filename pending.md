# Pendientes de NewCRM

Corte: 2026-11-13

## Estado verificado

- NewCRM está disponible en [http://127.0.0.1:3001/](http://127.0.0.1:3001/). Se recargó la pestaña para verificar la versión actual; la bóveda quedó bloqueada y hay que desbloquearla de nuevo en la app.
- El contenedor `newcrm-api` está en ejecución y saludable. La base activa sigue siendo la configurada para esta instalación; no se migraron datos.
- Compilación TypeScript/Vite correcta; pruebas frontend 4/4 y backend 162/162 aprobadas con SQLite en memoria. `git diff --check` limpio.
- Revisión visual de las 13 vistas de navegación en 250×250, 375×812, 768×1024, 1024×768 y 1440×900: no se observó desbordamiento horizontal de página.
- Se ajustaron controles de moneda en Ajustes, filtros móviles de contraseñas y recursos, el registro de actividad hasta escritorio amplio, y el campo SLA del formulario de prospecto.
- El mapa devolvió seis resultados públicos de OpenStreetMap desde caché. Revisé atribución y cambio entre mapa y resultados; no guardé prospectos. Falta verificar la ruta de consulta en vivo cuando la fuente tarda y el guardado desde el mapa.
- Monedas disponibles: MXN y USD, con MXN como base.
- La cuenta temporal de propietario ya no puede administrar cuentas mientras deba cambiar su contraseña. La actualización de usuario usa PATCH, igual que la API.
- No se detectaron emojis ni llamadas a alertas o cuadros nativos del navegador en el frontend revisado.

## Pendientes prioritarios

1. Crear el primer usuario normal desde una instalación nueva. Hoy el propietario se provisiona con variables de entorno y luego puede crear usuarios; la bóveda y el inicio de sesión de usuario son accesos distintos.
2. Revisar con respaldo la migración de notas antiguas que pudieran estar en texto sin cifrar. No se ejecutó sobre los datos reales.
3. Hacer visibles los errores de creación y migración del esquema al iniciar la API; el arranque todavía los suprime.
4. Preparar y probar, con respaldo, la migración de SQLite a PostgreSQL/Redis. SQLite permanece en uso.
5. Probar búsqueda real del mapa ante respuestas lentas y fallidas, el control de cancelación/tiempo límite y guardar resultados sin duplicados.
6. Añadir paginación a listados grandes de agenda y comunicaciones; revisar que los límites multipart se apliquen antes de almacenar temporalmente una carga grande.
7. Reducir o dividir la dependencia de diagramas ELK: Vite todavía advierte que el chunk diferido ronda 1.5 MB sin comprimir.
8. Completar un barrido funcional de todas las rutas con datos representativos y revisar teclado/lector de pantalla, errores de validación y flujos de recuperación.

## Operación y diseño

- Se mantuvo el estilo visual de NewCRM y la estructura de navegación en árbol.
- Para volver a entrar, abre el enlace de arriba y desbloquea la bóveda desde la app; la contraseña no debe compartirse por chat.
- No se comprobó un puntaje de Lighthouse de 100. La revisión de esta sesión fue visual y funcional en navegador; no estuvo disponible la integración de Google DevTools MCP.
- Impeccable detect conserva dos observaciones de estilo de baja prioridad: el degradado de marca y la cuadrícula opcional.

## Uso de Codex observado

- Ventana de 5 horas: 29% usado, 71% disponible.
- Semana: 35% usado, 65% disponible.
