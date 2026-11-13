# Estado y pendientes reales de NewCRM

Corte: 2026-11-13

## Estado comprobado

- Interfaz disponible en http://127.0.0.1:3001/; la API Docker seguía saludable en la última revisión operativa.
- La API se reinició para cargar cambios y su chequeo quedó saludable, con PostgreSQL conectado. Puede pedir desbloquear la bóveda otra vez.
- TypeScript compila, las cuatro pruebas frontend pasan y Vite genera el build de producción.
- Impeccable detect no encontró observaciones en las vistas principales revisadas.
- El build conserva una advertencia: el módulo ELK ocupa aproximadamente 1.52 MB sin comprimir.
- La revisión previa recorrió las 13 vistas en 250×250, 375×812, 768×1024, 1024×768 y 1440×900.
- En el mapa comprobé seis resultados de caché, atribución de OpenStreetMap y apertura del marcador. No guardé prospectos.
- Contraseñas, Ajustes, Papelera, Dashboard y navegación fueron revisados visualmente; la estructura del menú conserva categorías y subapartados.
- La Papelera exige sesión de bóveda y usuario. Ventas y solo lectura pueden restaurar; borrar definitivamente exige Propietario o Administrador.
- La conservación de la Papelera solo controla cuánto tiempo se muestran los elementos. No los borra; los elementos ocultos vuelven con «Sin límite».
- Cambiar la conservación ahora requiere rol Propietario o Administrador y deja registro de auditoría.
- Los folios se asignan con UPSERT y el cierre de ventas rechaza referencias ya cerradas. La concurrencia real aún requiere prueba de integración.
- El backend recoge 173 pruebas. La ejecución completa y la suite de Papelera excedieron el límite de 45–60 segundos antes de mostrar resultados; no se cuentan como aprobadas.
- La pestaña actual no tiene sesión de usuario normal. La app dirige a Ajustes para iniciar sesión antes de mostrar la Papelera.
- No se inspeccionaron ni modificaron secretos reales de `.env.local` o `.env.runtime`.
- No se obtuvo una puntuación Lighthouse/Google DevTools; no se afirma un 100.

## Pendientes prioritarios

1. Probar Papelera, permisos, conservación y ventas en una base de pruebas funcional; la conexión SQLite de pruebas se queda bloqueada en este entorno.
2. Iniciar sesión con una cuenta normal desde Ajustes para revisar visualmente la Papelera por rol. No se ingresaron contraseñas por chat.
3. Preparar el alta inicial de una cuenta ordinaria en instalaciones nuevas y documentar el acceso desde otra PC sin compartir secretos.
4. Revisar notas heredadas que pudieran estar sin cifrar; hacer respaldo y plan de migración antes de tocar la base real.
5. Mostrar errores de inicialización y migración del esquema en el arranque; `main.py` aún suprime algunos errores.
6. Diseñar y probar con respaldo la migración de SQLite a PostgreSQL/Redis; SQLite sigue siendo la base de esta instalación.
7. Añadir paginación a listados grandes y limitar cargas antes de que el middleware escriba archivos temporales.
8. Reducir la carga diferida de ELK y probar su comportamiento en redes lentas.
9. Recorrer todas las acciones de cada vista con datos de prueba y completar teclado, lector de pantalla y validación de errores.
10. Repetir DevTools/Lighthouse si la integración se habilita; este resultado no incluye ese análisis.

## Uso de Codex

Lectura al cierre: 46% usado en cinco horas y 37% semanal.
