# Pendientes de producción y validación

Actualizado: 17 de noviembre de 2026. Este documento conserva solo trabajo o validación aún abiertos.

## Alcance

Revisión de código, componentes compartidos, pruebas automatizadas y estado de los contenedores. El servicio local responde correctamente. No pude confirmar el render posterior a los cambios: Codex rechazó abrir el origen en el navegador tras la denegación de aprobación. El despliegue activo usa una CA privada y una IP de red local; no es una publicación pública.

Los estados visuales, los flujos autenticados y las funciones con hardware real todavía necesitan validación en el entorno correspondiente.

## Prioridad 1 — resolver antes de confiar en el uso diario

### 0. Configurar y ensayar el respaldo cifrado completo

**Evidencia.** `BACKUP_AGE_RECIPIENT` no está configurado y el perfil `full-backup` no está activo. Hay informes y revisiones guardados en PostgreSQL.

**Impacto.** La instalación no genera actualmente copias cifradas completas de forma programada y no hay una restauración reciente que demuestre que el respaldo se puede recuperar.

**Recomendación.** Configurar una identidad age, activar el perfil de respaldo, verificar la ejecución y ensayar una restauración aislada antes de depender de la instalación para datos importantes.

**Ubicación.** `docker-compose.yml`, `scripts/full_backup/`, `RUNBOOK.md`.

### 1. Hacer comprensible la activación de Red y Lab

**Evidencia.** La aplicación, la bóveda, la cuenta de propietario y el servicio C2 tienen estados independientes. El servicio real se inicia con permisos elevados desde una terminal. El mensaje de servicio no disponible ya incluye instrucciones, pero el usuario debe salir de la aplicación y mantener abierta la terminal.

**Impacto.** Es fácil creer que C2 está activo cuando solo está abierto el CRM, o quedarse bloqueado por una cuenta con otro rol.

**Recomendación.** Diseñar un flujo único que muestre por separado «bóveda», «cuenta», «servicio» y la acción que falta. Evaluar un servicio local instalado una vez que permita iniciar y detener C2 desde la web, con autorización de propietario y sin entregar a la página acceso general a Docker o a la contraseña del sistema. Conservar el modo actual hasta verificar el sustituto.

**Ubicación.** `frontend/src/components/c2/C2WorkspaceShell.tsx`, `frontend/src/context/C2Context.tsx`, `scripts/c2.sh`, `backend/app/api/v1/c2_proxy.py`.

### 2. Revisar la seguridad del alta inicial de administrador

**Evidencia.** El alta inicial requiere una bóveda desbloqueada y está disponible cuando no hay propietario, o cuando coincide con la cuenta provisional de una instalación anterior. La lógica conserva variables opcionales para reconocer esa instalación.

**Impacto.** La bóveda se convierte en el requisito principal para crear el primer propietario. Debe quedar claro qué ocurre en una instalación compartida y durante la migración, especialmente si existe una cuenta provisional anterior.

**Recomendación.** Documentar el modelo de confianza y probar instalaciones nuevas, migraciones, solicitudes simultáneas, propietario desactivado, contraseña temporal y vuelta atrás ante fallos. Confirmar explícitamente que no se puede reclamar una instalación que ya tiene un administrador establecido.

**Ubicación.** `backend/app/api/v1/auth.py`, `backend/tests/test_auth_routes.py`.

### 3. Reducir exposición de la sesión de bóveda

**Evidencia.** El token de bóveda se guarda en `localStorage` y el token de usuario en `sessionStorage`.

**Impacto.** Un script ejecutado en el origen de la aplicación podría leer esos tokens. La presencia de `localStorage` no demuestra por sí sola una vulnerabilidad XSS.

**Recomendación.** Revisar si la sesión puede mantenerse en una cookie HttpOnly con protección CSRF y caducidad adecuada. Auditar también las rutas que representan contenido importado y verificar la revocación al cerrar sesión y al bloquear la bóveda.

**Ubicación.** `frontend/src/lib/api.ts`, `backend/app/security/tokens.py`.

## Prioridad 2 — mejorar los recorridos principales

### 4. Separar claramente bóveda y cuenta durante el primer acceso

**Evidencia.** La bóveda y la cuenta de usuario tienen contraseñas independientes, y la creación inicial del propietario está dentro de Ajustes. La experiencia anterior requirió varios intentos para distinguir ambas.

**Impacto.** Una persona puede desbloquear la bóveda y pensar que ya tiene una sesión autorizada para C2.

**Recomendación.** Presentar un recorrido inicial breve con pasos y estados visibles: crear bóveda, crear propietario, cambiar contraseña provisional e iniciar sesión. Explicar cuándo se usa cada contraseña y ofrecer recuperación clara si falla un paso.

**Ubicación.** `frontend/src/context/VaultContext.tsx`, `frontend/src/components/settings/OperatorAuthSection.tsx`, `frontend/src/components/common/VaultUnlockModal.tsx`.

### 5. Simplificar la navegación sin quitar módulos

**Evidencia.** En la pantalla inicial hay ocho grupos principales, algunos desplegados, además del buscador, el filtro de ámbito y el control de bóveda. El grupo C2 contiene 13 apartados.

**Impacto.** La localización de una tarea puede requerir explorar varios grupos, especialmente cuando una sección aparece bloqueada.

**Recomendación.** Probar con usuarios si encuentran prospectos, cuentas, puertos y ajustes de acceso sin ayuda. Conservar los módulos y reorganizar nombres, agrupación y búsqueda según los resultados. Mostrar claramente qué acción desbloquea cada apartado.

**Ubicación.** `frontend/src/components/layout/Sidebar.tsx`.

### 6. Mejorar legibilidad de elementos secundarios

**Evidencia.** La barra lateral utiliza varios textos de 10 y 11 px, incluidos títulos de grupo y estado de bóveda.

**Impacto.** Pueden resultar difíciles de leer en pantallas pequeñas o para usuarios con baja visión.

**Recomendación.** Revisar tamaños, contraste y espaciado con contenido real a 200 % de zoom y en móvil. Aumentar texto y áreas táctiles donde sea necesario sin depender solo de iconos o color.

**Ubicación.** `frontend/src/components/layout/Sidebar.tsx`.

### 7. Hacer más claro el estado de las operaciones de red

**Evidencia.** C2 tiene estados de servicio, conexión en vivo, interfaz, consola y acciones de red. Las consultas de descubrimiento, topología y cámaras limitan el rango a 4096 direcciones.

**Impacto.** El usuario necesita distinguir si una operación está pendiente, terminó sin resultados o falló, y saber cómo dividir un rango rechazado.

**Recomendación.** Revisar cada panel con los estados de carga, sin resultados, error, cancelación y éxito. Mostrar el objetivo, el alcance, el progreso cuando exista y una explicación concreta si el rango excede el límite. Mantener visibles las consecuencias de acciones que alteran la red.

**Ubicación.** `frontend/src/components/c2/panels/`, `backend/app/c2/core/targets.py`.

## Prioridad 3 — rendimiento y mantenimiento

### 8. Medir la carga de informes y diagramas

**Evidencia.** La compilación anterior advirtió de paquetes grandes asociados a diagramas. Mermaid se carga de forma diferida.

**Impacto.** La primera apertura de informes complejos puede tardar en equipos o conexiones lentas. La duración real no se midió en esta revisión.

**Recomendación.** Medir carga inicial y primera apertura de informes con datos reales. Optimizar los módulos que realmente afecten la experiencia y mostrar un estado de carga si el procesamiento tarda.

**Ubicación.** `frontend/src/components/writeups/mermaidExportHelper.ts`, `frontend/src/components/writeups/MarkdownRichPreview.tsx`.

### 9. Resolver la alerta de la herramienta de desarrollo frontend

**Evidencia.** `npm audit` informa 11 alertas altas en dependencias de desarrollo que llegan a `picomatch` 4.0.7. `npm audit --omit=dev` informa 0 vulnerabilidades en dependencias de producción. La auditoría de NPM no publica una versión corregida para esa alerta; forzar `npm audit fix --force` propone Tailwind 4, un cambio mayor.

**Impacto.** La alerta afecta al entorno de compilación y recarga de desarrollo. No aparece en el conjunto de dependencias que se entrega al navegador en producción.

**Recomendación.** Mantener Tailwind 3 hasta planificar y probar la migración visual; actualizar `picomatch` cuando exista una versión corregida compatible, o evaluar otra ruta de compilación con sus pruebas.

**Ubicación.** `frontend/package.json`, `frontend/package-lock.json`.

### 10. Revisar consultas periódicas de C2

**Evidencia.** Después de entrar en C2 se consulta el servicio cada 10 segundos y el estado de módulos cada 3 segundos mientras está disponible.

**Impacto.** Puede mantenerse tráfico periódico después de abandonar el apartado. Se debe comprobar si es necesario para conservar información de operaciones activas.

**Recomendación.** Medir el coste y decidir cuándo conviene suspender consultas, mantenerlas para operaciones activas o usar eventos del canal existente. Verificar reconexión y expiración de permisos.

**Ubicación.** `frontend/src/context/C2Context.tsx`.

## Validaciones pendientes

- Recorrer creación de bóveda y propietario, cambio de contraseña, gestión de roles y recuperación con una base de prueba desechable.
- Probar escritorio y móvil, zoom al 200 %, teclado, lector de pantalla, contraste y errores de formulario.
- Probar CRM y C2 en ejecución y detenidos, reinicios, revocación de sesiones, limpieza y restauración tras fallos.
- Verificar las funciones de C2 en un laboratorio autorizado con los permisos, interfaces y hardware correspondientes.
- Medir rendimiento real y tiempos de carga antes de priorizar cambios de paquetes.

## Aspectos positivos

- El CRM y el servicio C2 tienen procesos separados, y la pasarela comprueba la bóveda y el rol de propietario.
- La pantalla de bóveda bloqueada ofrece una acción visible y la navegación usa controles identificados.
- El proyecto incluye pruebas automatizadas y un modo demostración para explorar C2.

## Orden sugerido

1. Seguridad y recuperación del alta inicial y las sesiones.
2. Activación y estados de C2.
3. Primer acceso y navegación.
4. Accesibilidad y adaptación móvil con pruebas reales.
5. Rendimiento medido y reducción de consultas innecesarias.
