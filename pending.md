# Comprobaciones pendientes

- Completar el recorrido de cada apartado y probar sus acciones; en esta revisión se comprobaron resumen, mapa e historial, pero no el resto de las vistas ni la nueva sección Herramientas de Ajustes.
- Revisar visualmente y con teclado todas las vistas en 250 × 250, 375 × 812, 768 × 1024, 1024 × 768 y 1440 × 900; comprobar lector de pantalla y contraste.
- Verificar en navegador el ciclo completo de informes y sus cambios sin guardar usando una base desechable, incluida la respuesta a fallos y acciones rápidas.
- Revisar el ciclo de prospectos, correos, servicios, ingresos, gastos y restauración en una base temporal; comprobar Papelera con una cuenta ordinaria y cada rol.
- Revisar notas heredadas posiblemente sin cifrar y preparar respaldo antes de cualquier migración de datos reales.
- Completar la revisión de configuración y secretos; la búsqueda de posibles claves literales en el código no detectó coincidencias reales, pero no sustituye una auditoría completa.
- Reducir la carga diferida de ELK y medir Lighthouse/Google DevTools cuando esté disponible la integración. La CA local todavía requiere instalación en el sistema para HTTPS confiable.
- Investigar el bloqueo del fixture SQLite en el Python local; las pruebas pasan en el contenedor.

Última revisión: el mapa se comprobó en 1075 px y 250 × 250; el historial se revisó con datos existentes a 1075 px y en 250 × 250. El filtro opcional del mapa abre correctamente. Pasaron 5 pruebas frontend, TypeScript, build y `git diff --check`. La suite backend completa pasó 191 pruebas en Docker con SQLite en memoria y secretos desechables, sin seeds ni acceso a la base real. El build conserva la advertencia de ELK (1,52 MB minificado).

Revisión posterior: se restauró Vite en el puerto 3001; la API seguía saludable y el proxy respondió. Se rediseñó el mapa, se recuperó la tabla del historial en tamaños medianos y se movieron las herramientas a Ajustes. `.gitignore` ahora cubre variantes `.env.*`; no se encontraron claves ni bases rastreadas. Queda pendiente confirmar la persistencia del servidor y revisar visualmente todos los apartados y las acciones trasladadas.
