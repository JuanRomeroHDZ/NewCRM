# Colaboración en reportes

## Uso

Cada persona usa su propia cuenta LESSSO y desbloquea la bóveda. La persona propietaria del reporte abre **Colaboración → Equipo**, agrega cuentas activas y les asigna un permiso:

- **Puede editar:** cambia el contenido Typst o el lienzo, crea versiones, comenta y solicita revisión.
- **Puede revisar:** consulta el reporte, comenta y responde solicitudes de aprobación.
- **Solo lectura:** consulta versiones y comentarios.

El permiso se asigna por documento o lienzo. La API vuelve a comprobarlo en cada operación; la interfaz no es el control de seguridad. Cambiar o retirar un permiso también invalida las conexiones de colaboración existentes.

El servidor Docker de la LAN es el host de la aplicación. El propietario no tiene que mantener una pestaña abierta para que las demás personas trabajen: el backend y PostgreSQL reciben y guardan los cambios mientras el servicio esté activo. Varias personas pueden editar simultáneamente desde cuentas distintas; la integración se verificó con cuatro sesiones concurrentes. Esta verificación no representa un límite máximo ni sustituye una prueba de carga para equipos mayores.

## Qué se sincroniza

- **Documentos Typst:** el texto fuente se sincroniza con Yjs y CodeMirror. Los cambios concurrentes se fusionan como texto. Typst sigue siendo el motor de compilación incluido en LESSSO; no se sustituye, modifica ni ejecuta desde el navegador.
- **Lienzos Excalidraw:** LESSSO conserva elementos y sus propiedades en estructuras Yjs. Las etiquetas de texto de los elementos también se fusionan como texto. Excalidraw conserva su motor y recibe las escenas mediante su API pública; no se mantiene un fork.
- **Presencia:** nombres, cursores y selección son temporales. Se eliminan al desconectarse o al vencer su TTL; no forman parte de las versiones.
- **Comentarios y revisión:** los comentarios pueden quedar anclados a una selección Typst o a elementos Excalidraw. Una solicitud de aprobación apunta a una versión inmutable y su huella SHA-256.

Las versiones guardan el contenido cifrado y su autoría. Restaurar una versión conserva el historial, registra una versión nueva e invalida las sesiones abiertas para que cada cliente vuelva a cargar ese estado. El historial no se sobrescribe al restaurar.

Cuando dos personas cambian propiedades distintas de una figura, ambas se conservan. Si cambian simultáneamente el mismo valor escalar —por ejemplo, la coordenada o el color de la misma forma— Yjs elige un resultado determinista para que todas las copias converjan; no muestra un diálogo para decidir entre ambos valores. Los rótulos sí se fusionan como texto. Restaurar una versión o perder acceso invalida la generación o sesión del canal; la API rechaza checkpoints que no incluyan la secuencia durable más reciente.

## Persistencia y despliegue

PostgreSQL es el registro durable de cambios y permite que distintas réplicas backend compartan el mismo reporte. El relay WebSocket consulta ese registro; no depende de memoria local ni exige Redis. Nginx expone el canal por el mismo HTTPS de la aplicación. Tras guardar un checkpoint, se compactan las cargas de los eventos; sus identificadores de reintento se conservan 30 días y luego se eliminan. Las versiones y comentarios no se eliminan con esa compactación. La migración `20261119_0006` crea el esquema de colaboración.

Para que todas las personas de la red compartan el mismo contenido:

1. Ejecuta LESSSO en el equipo host y permite el acceso a HTTPS desde la LAN.
2. Inicia sesión con cuentas distintas y comparte cada reporte desde **Colaboración → Equipo**.
3. Mantén PostgreSQL y la API encendidos mientras el equipo colabora. El propietario puede cerrar su navegador sin detener el servicio.
4. Para actualizar, usa **CRM estable**; el contenedor de migraciones debe terminar correctamente antes de iniciar la API.
5. Conserva PostgreSQL y los respaldos cifrados completos. Una exportación parcial `.emailsaver` no contiene el historial de reportes ni la cola de colaboración.

La copia de recuperación local del navegador se cifra con la clave de recuperación de la bóveda. Mientras una persona está sin conexión, sus cambios pueden continuar en ese navegador. Se envían al reconectar; un usuario que perdió el permiso no puede enviarlos hasta recuperar acceso. Antes de cerrar una sesión offline, espera a que el estado vuelva a **Sincronizado** si necesitas confirmar que ya está en el servidor.

## Verificación

Desde `frontend/`:

```bash
node --test tests/reportCollaboration.test.mjs
npm run build
```

La prueba focalizada crea tres réplicas Yjs independientes y comprueba convergencia de texto Typst, propiedades y texto de un mismo elemento Excalidraw, creación simultánea de formas y anclajes relativos.

La suite backend requiere PostgreSQL desechable llamada `emailcrm_disposable_test` y rechaza explícitamente otra base. Las pruebas de API cubren permisos, inicialización por editor, checkpoints con secuencia, versiones, restauración, comentarios y revisión. Nunca configures `TEST_DATABASE_URL` para la base activa del CRM.
