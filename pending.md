# Estado de NewCRM y pendientes

Corte: 2026-11-13

## Disponible

- Aplicación local: http://127.0.0.1:3001/.
- Contenedor `newcrm-api`: saludable en la última comprobación.
- No se usaron seeds ni se guardaron registros durante la revisión de esta vuelta.
- La revisión visual más reciente de informes se hizo a 250 × 250. El título de 201 caracteres se recortó al límite de 200; 1 carácter y espacios no crearon informe. La lista siguió en cero.
- La bóveda estaba desbloqueada al iniciar esta revisión. No se copiaron ni compartieron contraseñas.
- No se obtuvo una puntuación de Lighthouse/Google DevTools; no se afirma un 100.

## Cambios revisados en esta vuelta

- Resumen: fondos opacos separan métricas y secciones de la cuadrícula; acciones y flechas se alinearon y se quitó el alta duplicada de correo.
- La fila de dominios se inspeccionó en 250 × 250: el texto y la cantidad se muestran completos. No se repitió el recorrido de todas las vistas.
- Títulos de informes: mínimo de 2 y máximo de 200 caracteres; límites de los campos alineados con el API.
- Etiquetas CWE/OWASP/MITRE: el informe guarda el identificador CWE, evitando enviar el texto completo del preset al servidor.
- La creación de informe confirma cambios sin guardar, evita envíos simultáneos y muestra el progreso.
- La carga de detalle muestra estado, error y reintento; respuestas atrasadas no deben sustituir la selección actual.
- Las respuestas de medios se invalidan al cambiar de informe o bloquear la bóveda; se revocan las URLs temporales.
- El borrado invalida cargas pendientes y libera medios locales solo después de confirmar el borrado en el servidor.
- Ajustes incluye opciones de 2, 4 y 8 horas para el bloqueo de la bóveda. En la revisión posterior la aplicación muestra 8 horas seleccionadas y la sesión activa refleja ese plazo.
- Crítica de `WriteupsView.tsx`: se detectaron pérdida de borradores al cambiar de informe, riesgo de carreras en la carga y etiquetas insuficientes. Se corrigieron los dos primeros flujos; quedan verificaciones manuales de accesibilidad y navegación.

## Verificaciones

- Pruebas frontend: 5/5 aprobadas después de los últimos cambios.
- TypeScript: aprobado después de los últimos cambios.
- Build de producción: aprobado después de los últimos cambios; ELK pesa 1.52 MB minificado y Vite mantiene la advertencia de chunks grandes.
- Tras los cambios principales del resumen: 5 pruebas frontend aprobadas. TypeScript y build aprobaron después del ajuste final de la fila; `git diff --check` aprobó.
- Suite backend completa: 191 pruebas aprobadas después de aislar el bloqueo asíncrono por bucle de eventos.
- Pruebas nuevas de informes y tiempo de bóveda usan SQLite en memoria, sin modificar la base del usuario.
- El formulario de título se probó en 250 × 250 con 1 carácter, espacios, 201 caracteres y límite de 200. Ninguna prueba dejó un registro.
- Falta repetir teclado, lector de pantalla y DevTools con la integración disponible.

## Pendientes prioritarios

Última revisión: se compactaron la ficha de prospecto y la auditoría, se reestructuró el formulario de mapa, se añadió búsqueda a conexiones, se alineó la acción de gasto, se compactaron controles del editor y se añadió «Ver detalles» al historial. El usuario mostró un informe creado en su captura; falta comprobar el flujo completo con datos desechables. Falta revisión visual y de interacción de estos cambios a 250 px y tamaños medianos y grandes, comprobar el espacio vacío junto al mapa, navegación por teclado y lector de pantalla. Sigue pendiente auditar valores configurables y secretos sin modificar datos reales; no se debe mover indiscriminadamente texto de interfaz a variables de entorno.

Revisión solicitada: comentarios del usuario sobre encabezado y navegación, mapa, finanzas, conexiones, ficha de prospecto, contraseñas, informes, auditoría e historial. Confirmar cada cambio visual y funcional; el usuario sigue sin poder crear informes y las pruebas previas no demostraron su creación completa en la interfaz.

Avance de la revisión: encabezado compacto, menú reorganizado y logo reducido; sugerencias del mapa retiradas y autocompletado conservado; controles de conexiones agrupados y acciones de finanzas alineadas. En informes se estabilizó el callback que reiniciaba el texto del diálogo, se habilitó cerrar la lista y se alineó la flecha del filtro. TypeScript y 5 pruebas frontend pasan. Falta probar visualmente y con teclado en 250 px, tamaños medianos y grandes; también verificar cada acción y la creación completa de un informe en base temporal. La prueba aislada de API se interrumpió sin resultado. Siguen pendientes los comentarios 9, 10, 14 y 15: ficha de prospecto, contraseñas, auditoría y tabla de actividad con detalles.

1. Mantener pruebas y build al día conforme se realicen nuevos cambios.
2. Probar formulario de informe sin seeds con entradas de 0, 1, 2, 200 y 201 caracteres, espacios, símbolos, acentos y dígitos largos; guardar solo en una base desechable y verificar que no queden filas parciales.
3. Probar guardado, descarte, cambio rápido entre informes, fallo/reintento de carga y doble clic; incluir respuestas lentas para comprobar carreras.
4. Repetir recorrido visual de todas las vistas en 250 × 250, 375 × 812, 768 × 1024, 1024 × 768 y 1440 × 900 después de los cambios recientes.
5. Validar teclado, foco de modales, lector de pantalla, contraste y controles táctiles en pantallas pequeñas.
6. Verificar la persistencia del plazo de 8 horas tras reiniciar y volver a desbloquear la bóveda.
7. Iniciar sesión con cuenta ordinaria para revisar Papelera, roles y acciones destructivas; revisar el alta inicial para instalaciones en otra PC sin exponer secretos.
8. Probar con base temporal el ciclo de prospectos, correos, servicios, ingresos, gastos, ventas, papelera, restauración y concurrencia. No usar la base real.
9. Revisar notas heredadas posiblemente sin cifrar; preparar respaldo y plan de migración antes de tocar datos reales.
10. Revisar el tratamiento de errores en otras rutinas de inicialización. La creación del esquema y las migraciones aditivas ya registran el error y detienen el arranque; existen pruebas para estas últimas.
11. Diseñar migración segura y probarla con respaldo antes de cambiar SQLite por PostgreSQL/Redis.
12. Reducir el módulo ELK diferido y revisar carga en redes lentas.
13. Repetir Lighthouse/Google DevTools cuando el conector esté disponible; optimizar, sin prometer una puntuación antes de medir.
14. HTTPS local: el certificado del proyecto existe, pero su CA no está instalada como confiable en el sistema. La app se revisó por HTTP en loopback.

## Uso de Codex al actualizar este archivo

- Ventana de 5 horas: 40% usado (última lectura).
- Ventana semanal: 47% usado.
- Al llegar a 10% debe quedar actualizado este archivo; desde 15% se debe cerrar trabajo y no iniciar tareas nuevas.
