# Auditoría operativa de LESSSO

Ejecuta `./scripts/audit.sh guide`. Empieza por el síntoma o el cambio de esta entrega. Cada entrada produce evidencia que puede llevar a otra rama. Los resultados automáticos complementan la revisión de código, la experiencia real y las pruebas de recuperación.

## Elige una entrada

| Si observas esto | Empieza aquí | Si reaparece o la comprobación resulta ambigua |
|---|---|---|
| La exportación no llega, cambia de nombre o falla en un formato | Abre un documento de prueba, exporta en PDF y HTML y comprueba nombre, tamaño y que ambos archivos abran. Verifica la descarga directa y el estado del archivo en el editor. | Separa la generación de la entrega: revisa la respuesta del backend y después el evento de descarga. Compara con Typst CLI usando la misma versión y el mismo formato. Si ambos fallan en HTML, revisa las limitaciones documentadas del motor. |
| Un rol ve menos o más de lo esperado | Ejecuta `test_role_access_matrix.py`, `test_report_collaboration.py` y revisa [la matriz](permisos.md). | Sigue identidad → ruta → objeto → registros relacionados. Revisa listas, acceso directo, adjuntos, exportación y WebSocket. Un caso que funciona con propietario puede fallar con archivos compartidos. |
| Instalación, contraseña, 2FA o revocación fallan | Prueba primero instalación en base vacía y actualización desde una base de prueba antigua. Ejecuta `test_auth_routes.py`. | Distingue código de instalación, contraseña de bóveda, contraseña de cuenta, generación inicial, cambio obligatorio y segundo factor. Inspecciona bloqueo por intentos y revocación con varias sesiones. |
| El servicio tarda, devuelve 429 o pierde el estado | `./scripts/audit.sh runtime URL` y luego `./scripts/audit.sh load URL`. | Separa proxy y aplicación. k6 aquí mide HTTPS inicial y salud, no la compilación. Para el editor mide solicitudes duplicadas, compilación y sincronización con un conjunto de datos desechable. |
| Cambió una imagen, dependencia o instalador | `./scripts/audit.sh source` y `./scripts/audit.sh image IMAGEN` para cada imagen producida. | Cruza versión exacta del paquete, boletín del proveedor, exposición real y parche disponible. Revisa scripts de inicio, dependencias transitivas, bases Docker y las sumas de los binarios descargados. Reconstruye y vuelve a escanear. |
| Aparece una clave en un artefacto o GitHub | Ejecuta `./scripts/audit.sh history` y revisa alertas y protección de envíos de GitHub. | Un candidato de historial requiere clasificación privada. Si corresponde a una credencial real, revoca o rota en el proveedor, revisa el uso y coordina la limpieza de ramas, etiquetas, clones y referencias de PR. Conserva evidencia sin copiar el valor al informe. |
| El servicio o un respaldo falla | Sigue [el runbook](../RUNBOOK.md) y comprueba el último respaldo cifrado con `./scripts/audit.sh backups`. | Restaura una copia externa en un entorno separado y verifica tablas, adjuntos y versiones. Mide pérdida de datos admisible y tiempo de recuperación. |
| Un flujo es difícil de encontrar o entender | Carga Impeccable Audit sobre el componente y recorre escritorio, ventana angosta, teclado y estados reales. | Compara con [DESIGN.md](../DESIGN.md). Aplica Polish al problema observado y repite el flujo. Un detector vacío solo cubre sus reglas. |

## Controles y evidencia

| Control | Qué comprobar |
|---|---|
| API keys y datos sensibles | La aplicación no necesita claves públicas para consultar PostgreSQL. Las credenciales de servicios quedan en el servidor o en la bóveda cifrada. Revisa variables que entren al build Vite, logs, exportaciones y respaldos. El cifrado de notas, adjuntos y semillas 2FA usa AES-GCM. Verifica también la rotación y custodia de las claves. |
| PostgreSQL y acceso a filas | PostgreSQL está en la red interna de Docker, sin puerto publicado. Las rutas aplican controles de rol y permisos por objeto. Revisa la instalación con `./scripts/audit.sh database`. Desde la revisión 0008, Documentos y Lienzos tienen RLS por usuario autenticado, creador y permisos compartidos. El backend se conecta como `lessso_runtime`, sin privilegios de superusuario ni bypass de RLS. Las migraciones y la copia completa conservan su conexión administrativa. Los demás módulos mantienen la autorización de aplicación. |
| Autenticación y sesión | Las rutas protegidas validan cuenta y bóveda según su caso. Las nuevas sesiones de navegador usan una cookie `__Host-` con HttpOnly, Secure y SameSite=Strict. Las escrituras exigen CSRF vinculado a esa sesión. Los clientes de API conservan Bearer explícito. La credencial de desbloqueo de la bóveda es independiente. Comprueba vencimiento, revocación, cierre y cambio obligatorio. |
| Contraseñas y bots | Argon2id, código local de instalación para instalaciones guiadas, bloqueo por intentos de cuenta, 429 de Nginx por origen en rutas sensibles, 2FA y cambio obligatorio de contraseña temporal. La cuenta inicial tiene nombre elegido. Se exige un símbolo como política del producto y 15 caracteres como mínimo. No hay CAPTCHA. |
| Manipulación de campos | Los esquemas de administración de usuarios rechazan campos desconocidos. El servidor decide rol, estado de cuenta, contraseña temporal e identidad. Para módulos nuevos, verifica la lista de campos editables y los límites de tamaño. |
| CORS y cabeceras | CORS está vacío por defecto para el despliegue de mismo origen y admite orígenes explícitos sin comodines. Revisa CSP, `X-Content-Type-Options`, protección de marcos y `Cache-Control: no-store` en API, incluidos 4xx y 5xx. |
| Errores y registro | Las respuestas de validación omiten valores, contexto interno y excepciones. Los errores HTTP 5xx usan texto genérico. Revísalos junto con el registro local y nunca exportes secretos en trazas. |
| Copias automáticas | Al configurar `BACKUP_AGE_RECIPIENT`, `./lessso` inicia el programador cifrado. Verifica antigüedad del último respaldo, copia externa y restauración. La identidad privada de age queda fuera del servidor de respaldo. |
| Cadena de suministro | Trivy y CI cubren fuentes, lockfiles y configuración según el alcance de cada comando. El escaneo de imagen cubre paquetes del sistema. Las exclusiones de escaneo requieren evidencia y seguimiento. |

Para descargar archivos procesados por Typst usa un documento desechable. Para probar permisos o degradación de servicios usa PostgreSQL y contenedores de prueba. El comando `load` aplica cinco usuarios virtuales durante 15 segundos a la URL que se le indica.

## Cierra el hallazgo con evidencia

Registra ruta o pantalla, rol, revisión, condiciones reproducibles, resultado esperado, resultado observado, impacto y quién se encarga. Si dos herramientas discrepan, comprueba el entorno y el alcance de cada una. Separa controles comprobados, problemas corregidos, riesgos pendientes y casos que quedaron sin medir. Repite la rama afectada después de corregir; si una decisión del producto condiciona el resultado, déjala documentada.

- [Mapa NIST CSF 2.0 y OWASP Top 10:2025, con resultados previos](revision-seguridad.md)
- [Hallazgos de secretos históricos y respuesta en GitHub](auditoria-secretos.md)
- [Instalación, respaldo y restauración](../RUNBOOK.md)
- [Documentación oficial de exportación HTML en Typst](https://typst.app/docs/reference/html/)

## Evidencia de la revisión de cierre

- Exportación real de PDF y HTML en el navegador. Se observó el aviso «Archivo listo» y el enlace de descarga persistente para PDF. HTML conserva la etiqueta experimental.
- 87 pruebas frontend y compilación de producción correctas. 41 pruebas backend focalizadas; 30 se repitieron después del ajuste final de diagnósticos. El detector de Impeccable no reportó hallazgos para las vistas modificadas.
- La migración `20261119_0007` se ejecutó sobre PostgreSQL desechable con un registro 2FA creado en la revisión anterior. Se verificó que solo quedó cifrado y que la semilla se recuperó con la llave configurada.
- Backend y Nginx de prueba respondieron por HTTPS. Reportes respondió 401 sin credenciales, con CSP y `Cache-Control: no-store`. k6 completó 150 solicitudes HTTPS de disponibilidad sin errores, con p95 de 10.2 ms en la instalación de desarrollo.
- La instalación revisada tenía copias completas cifradas y cero tablas PostgreSQL con RLS. Su cuenta de conexión tenía privilegio de superusuario. La revisión de filas se realizó en los controles de aplicación.
- Trivy encontró cero candidatos en el escaneo de secretos de fuentes actuales seleccionadas. Conservó las observaciones de Nginx y del respaldo sobre el uso de root. Permanecen los avisos de paquetes Debian del backend sin parche reportado para esta base.
- GitHub Secret Scanning y Push Protection quedaron habilitados. Mantén abiertos los dos candidatos históricos hasta confirmar la rotación con los titulares de las credenciales y coordinar la limpieza del historial.


## Actualización de la sesión y RLS

`./lessso` prepara un secreto separado para `lessso_runtime` si falta. Migra primero con el servicio `migrate`; la API y el proxy se reconstruyen con el menú de inicio normal. Tras actualizar, vuelve a iniciar sesión para pasar de Bearer de navegador a la cookie protegida. Antes de una publicación, confirma el rol con `./scripts/audit.sh database` y el cifrado de los respaldos. Repite con dos usuarios y un archivo compartido para comprobar lectura, edición y revocación.


La vista de Documentos ofrece SVG, PDF y HTML. El visor PDF renderiza una página a la vez con PDF.js. HTML se muestra en un iframe aislado y conserva la etiqueta experimental de Typst. Los HTML de Writeups preservan el movimiento de las aristas Mermaid fast/slow y respetan la preferencia de movimiento reducido. La exportación PDF conserva el diagrama estático.
