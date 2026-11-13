# Informe de revisión de NewCRM

Fecha: 2026-11-13
Proyecto: /home/juanromero/Documents/Proyectos/NewCRM

## Estado

La API está corriendo y healthy en Docker en 127.0.0.1:8000. La interfaz sigue disponible en http://127.0.0.1:3001/. No se inició Compose ni se migró la base SQLite.

## Cambios revisados

- Navegación y vistas principales: correcciones en Inicio, Correos, Cuentas, Prospectos, mapa, conexiones, Finanzas, suscripciones, Seguridad, Historial, Papelera, Ajustes y Writeups.
- Se dividieron SubscriptionsView e InspectorDrawer en componentes más pequeños.
- Formularios principales recibieron límites y validación; los diálogos propios mejoraron foco, teclado, salida y tamaños reducidos.
- La moneda solo permite MXN y USD, con MXN como base y cambio de USD a MXN.
- La importación de ajustes, actualización de catálogos y cambios de usuario guardan los eventos de auditoría en la misma transacción.
- Captura de OpenStreetMap valida etiquetas antes de generar consultas y no sigue redirecciones.
- Health comprueba la conexión y las tablas requeridas, sin devolver mensajes internos.
- Se simplificó el vocabulario visible de informes y acceso; las alertas de sesión ya no exponen términos como “contraseña maestra” o “token”.
- No se encontraron emojis en frontend/src ni llamadas a window.alert, window.confirm o window.prompt.
- Impeccable detect dejó dos avisos de baja prioridad que se conservaron por ser parte del diseño configurable: gradiente del símbolo de marca y cuadrícula opcional.
- La pantalla de acceso a 250×250 no presenta desbordamiento horizontal. El encabezado usa títulos cortos y un único selector de ámbito a 320 px o menos.
- Pruebas frontend: 4/4. Pruebas backend: 145/145 usando SQLite en memoria. Compilación de producción correcta. git diff --check limpio.

## Incidente Docker corregido

La imagen anterior no tenía docx, nh3 ni weasyprint, aunque estaban fijados en backend/requirements.txt. La API se reiniciaba al importar la función de informes. Se reconstruyó solo la imagen backend, se verificaron los imports y se recreó newcrm-api conservando las variables, el puerto local, el usuario del contenedor y el bind mount de backend/lessso.db. El nuevo health check responde 200 y el contenedor permanece healthy.

## Pendientes conocidos

1. La revisión visual de las vistas protegidas espera que el usuario desbloquee la bóveda después del reinicio. Aún no se revisaron los datos ni los estados internos de finanzas y mapa.
2. No existe un flujo para crear la primera cuenta normal desde la interfaz. La cuenta de propietario se configura por entorno y es necesaria para crear otros usuarios.
3. Confirmar con respaldo la conversión de notas antiguas a cifrado. La función de migración existe, pero no se ejecutó sobre la base real.
4. main.py todavía suprime errores de creación/migración del esquema. Health evita marcar healthy si faltan tablas, pero el error de inicio debería quedar visible.
5. La migración completa a PostgreSQL/Redis requiere configurar secretos y validar respaldo; SQLite sigue en uso.
6. Probar búsqueda de mapa desde la interfaz, tiempos de respuesta y guardado sin crear datos reales.
7. Completar el barrido de límites en agenda, comunicaciones, taller, integraciones y cuentas.
8. Reducir el chunk ELK de aproximadamente 1.5 MB.

## Uso de Codex observado

Última consulta: 21% consumido en la ventana de 5 horas y 34% semanal; quedaba 79% y 66%, respectivamente.
