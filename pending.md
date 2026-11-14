# Estado y pendientes reales de NewCRM

Corte: 2026-11-13

## Estado actual

- Interfaz disponible en http://127.0.0.1:3001/; devuelve HTTP 200. La ruta de estado de la API también responde HTTP 200.
- El contenedor `newcrm-api` quedó saludable después del reinicio.
- TypeScript compila, las cuatro pruebas frontend pasan y el build de producción termina.
- La prueba backend del diagnóstico sin cuentas pasa dentro de Docker: 1/1.
- El build mantiene una advertencia: el módulo ELK ocupa aproximadamente 1.52 MB minificado.
- La revisión visual de esta vuelta se hizo en 487 × 901. Se recorrieron resumen, mapa, prospectos, correos, servicios, conexiones, finanzas, contraseñas y recursos, informes, auditoría, historial, ajustes y Papelera.
- No se modificaron registros del usuario. Los listados están vacíos; no se pudieron revisar detalles de prospectos, correos o servicios con datos reales.
- La paginación del historial muestra 25 registros por página; se comprobó la segunda página de 33.
- La Papelera requiere iniciar sesión con una cuenta del equipo, además de desbloquear la bóveda. Esa sesión no está iniciada en la pestaña de revisión.
- La revisión anterior reportó navegación de 13 vistas en 250 × 250, 375 × 812, 768 × 1024, 1024 × 768 y 1440 × 900. No se repitieron todos esos tamaños después de los últimos cambios.
- La revisión anterior comprobó seis resultados de mapa en caché y la apertura de un marcador; no se guardaron prospectos.
- No se obtuvo puntuación Lighthouse/Google DevTools. No se afirma un resultado de 100.
- No se inspeccionaron secretos reales de `.env.local` o `.env.runtime`.

## Cambios de esta revisión

- El aviso de tipo de cambio aparece solo si falta la cotización o supera 24 horas; puede ocultarse hasta que cambie el dato. El estado automático ya no dice «Actualizado» sin comprobar vigencia.
- Sin cuentas, la auditoría de seguridad devuelve `health_score: null` y muestra «Sin datos» en lugar de 100/100.
- Se quitó la acción global de alta que duplicaba los botones de prospectos y correos. Se retiraron llamadas repetidas en estados vacíos cuando ya existe una acción visible.
- En recursos y finanzas, los estados vacíos conservan el mensaje y dejan la acción en el encabezado de su sección.
- El título de contraseñas se acortó y el historial traduce nombres internos como `settings` y `vault` a etiquetas comprensibles.
- Las etiquetas de gasto en finanzas se acortaron para evitar cortes en pantallas estrechas.
- Se actualizó este archivo con lo revisado y lo que sigue pendiente.

## Verificación y limitaciones

- `tsc --noEmit`: aprobado.
- Pruebas frontend: 4/4 aprobadas.
- Build de Vite: aprobado, con la advertencia de tamaño de ELK indicada arriba.
- Prueba backend nueva de auditoría sin cuentas: 1/1 aprobada en el contenedor.
- `git diff --check` y `py_compile` de los archivos backend modificados: aprobados.
- Dos pruebas backend aisladas de la revisión anterior pasaron con SQLite en memoria. La suite completa no terminó dentro de los límites previos de ejecución.
- El shell actual no recibió el grupo `docker`; el contenedor se administró mediante permisos elevados. Para acceso directo a Docker desde una terminal nueva, cierra sesión y vuelve a entrar después de agregar el grupo.
- El certificado HTTPS local se generó, pero su CA aún no está instalada como confiable en el sistema. Esta sesión usa HTTP de loopback; la llave privada sigue protegida y fuera de Git.

## Pendientes prioritarios

1. Iniciar sesión con una cuenta ordinaria desde Ajustes y revisar Papelera, permisos y acciones destructivas por rol.
2. Repetir la revisión visual en 250 × 250 tras estos cambios y comprobar teclado, lector de pantalla y validaciones de formularios.
3. Crear datos de prueba desechables para comprobar detalle de prospectos, correos y servicios, además de ingresos, gastos, restauración y cierre de ventas.
4. Probar atomicidad de ventas, conservación de Papelera y concurrencia contra una base de pruebas temporal; no usar la base real.
5. Completar y documentar el alta inicial de una cuenta ordinaria para instalaciones en otra PC, sin compartir secretos.
6. Revisar notas heredadas posiblemente sin cifrar; definir respaldo y migración antes de tocar datos reales.
7. Mostrar errores de inicialización y migración del esquema; `main.py` todavía suprime algunos errores.
8. Diseñar y probar con respaldo una migración de SQLite a PostgreSQL/Redis.
9. Añadir paginación a listados grandes y limitar cargas antes de que el middleware escriba archivos temporales.
10. Reducir la carga diferida de ELK y comprobar redes lentas.
11. Repetir Lighthouse/Google DevTools cuando la integración esté disponible; el 100 aún no está verificado.
12. Si se requiere HTTPS confiable local, instalar la CA pública del proyecto y reiniciar Vite:
    - `sudo install -m 0644 nginx/certs/local/ca.crt /usr/local/share/ca-certificates/lessso-local.crt`
    - `sudo update-ca-certificates`

## Uso de Codex

Lectura al cierre: 53% de la ventana de cinco horas y 39% semanal.
