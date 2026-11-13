# Pendientes de NewCRM

Corte: 2026-11-13

## Estado verificado

- API corriendo en Docker en 127.0.0.1:8000, estado healthy. La imagen se reconstruyó desde las dependencias fijadas en backend/requirements.txt porque la anterior no incluía módulos de exportación.
- Interfaz local disponible en http://127.0.0.1:3001/.
- Compilación frontend correcta; 4/4 pruebas frontend y 145/145 pruebas backend aprobadas. Backend probado con SQLite en memoria.
- Moneda limitada a MXN y USD; MXN es la base y la conversión es USD a MXN.
- Sin emojis ni diálogos nativos en frontend/src. Se simplificaron los textos de acceso y los nombres de informes.
- En 250×250, el estado bloqueado no tiene desbordamiento horizontal. El encabezado compacto ahora acorta el título y reúne los filtros en una lista. Las demás vistas siguen pendientes de revisión visual.
- La bóveda quedó bloqueada tras el reinicio de la API; se pidió al usuario desbloquearla para continuar con vistas protegidas.

## Pendientes prioritarios

1. Revisar visualmente todas las vistas a 250×250, 375×812, 768×1024, 1024×768 y escritorio. Comprobar desbordamiento, encabezado móvil, modales, navegación por teclado y estados con datos.
2. Repetir la búsqueda de prospectos desde el mapa y verificar resultados, cancelación por tiempo y atribución de OpenStreetMap. No guardar registros reales durante la revisión.
3. Añadir un flujo inicial para crear una cuenta de uso normal. Hoy la cuenta de propietario se provisiona mediante variables del entorno y la creación de otros usuarios requiere un propietario existente.
4. Revisar y diseñar una migración con respaldo para notas heredadas que pudieran permanecer en texto sin cifrar. No ejecutar la conversión sobre la base del usuario sin respaldo y verificación.
5. Hacer que errores de migración y creación de esquema en el arranque sean visibles; hoy main.py los suprime. El health check sí verifica disponibilidad y esquema y responde 503 cuando no está listo.
6. Preparar y probar la migración de SQLite a PostgreSQL/Redis por separado. No ejecutar Compose hasta preparar el archivo de entorno y validar la migración de datos.
7. Revisar límites de entradas en agenda, comunicaciones, taller, integraciones y administración de cuentas.
8. Optimizar la carga de diagramas: el chunk ELK alcanza aproximadamente 1.5 MB sin comprimir; la compilación termina correctamente, pero Vite advierte del tamaño.

## Seguridad y operación

- La API conserva el bind mount del backend, variables existentes y backend/lessso.db. No se ejecutaron migraciones de datos.
- .env.local y .env.runtime están ignorados por Git; no se expusieron sus contenidos.
- Crear/cambiar usuarios y la importación de configuración registran auditoría de forma transaccional.
- Impeccable detect conserva dos avisos de estilo de baja prioridad: degradado del símbolo de marca y patrón de cuadrícula opcional.
