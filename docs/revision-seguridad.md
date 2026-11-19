# Perfil de seguridad de LESSSO en LAN

Alcance: CRM web, proxy HTTPS, persistencia, archivos de Reportes y dependencias incluidas en el despliegue. Esta revisión sirve para priorizar controles de la instalación con [NIST CSF 2.0](https://csrc.nist.gov/pubs/cswp/29/the-nist-cybersecurity-framework-csf-20/final) y [OWASP Top 10:2025](https://top10.owasp.org/2025/0x00_2025-Introduction/). Las pruebas de navegador y servicios no cubren toda la aplicación ni validan hardware de Red y Lab.

## NIST CSF 2.0

| Función | Evidencia en el proyecto | Trabajo operativo |
|---|---|---|
| Gobernar | Matriz de permisos, responsable de la instalación e instrucciones en el runbook. Trivy se integra en CI. | Asignar el responsable de incidentes, actualizaciones y excepciones. |
| Identificar | Inventario de dependencias, imágenes y servicios de Compose. Trivy revisa código e imágenes sin usar la base activa. | Inventariar equipos y copias externas. Revisar hallazgos de imágenes en cada publicación. |
| Proteger | HTTPS con CA local, cuentas, bóveda, control por recurso, contexto de sesión y límites de carga. | Mantener la CA y su clave fuera de equipos cliente. Revisar altas y bajas periódicamente. |
| Detectar | Registros del proxy, auditoría y comprobaciones de salud. | Enviar alertas a un responsable y verificar su recepción. |
| Responder | Runbook con diagnóstico del servicio y procedimientos de restauración. | Acordar contactos, escalado, preservación de evidencias y comunicación. |
| Recuperar | Respaldo completo y ensayo de restauración sobre una base independiente. | Programar copias fuera del host y medir el tiempo de restauración con los datos de la instalación. |

## OWASP Top 10:2025

| Riesgo | Evidencia o medida | Pendiente de validación |
|---|---|---|
| A01 Control de acceso | Las vistas previas y exportaciones aplican los permisos del documento y de cada lienzo referenciado. Matriz de roles en pruebas. | Revisar rutas nuevas y sus permisos por recurso en cada entrega. |
| A02 Configuración | El servidor de archivos estáticos corre como usuario nginx. El proxy TLS limita capacidades y bloquea la elevación de privilegios. Respuestas API con `Cache-Control: no-store`. | El proceso principal del proxy TLS inicia como root para leer la llave del host con modo 0600 y cambiar al usuario de sus procesos de trabajo. Revisar esa excepción al cambiar la gestión de certificados. |
| A03 Cadena de suministro | npm conserva el lockfile. CI ejecuta Trivy para dependencias y secretos y reporta configuración. | Escanear también todas las imágenes de la publicación y seguir avisos del proveedor. |
| A04 Criptografía | TLS local, bóveda y adjuntos cifrados. El escenario k6 usa la CA local. | Revisar distribución, expiración, respaldo y rotación de claves por instalación. |
| A05 Inyección | Consultas parametrizadas de SQLAlchemy y compilación Typst con una raíz temporal y límite de tiempo. | Revisar cada entrada a consultas, renderizadores y subprocesos. |
| A06 Diseño inseguro | Estado de colaboración sujeto a permisos y recuperación cifrada; validación de formatos y presupuesto de decodificación de imágenes. | Revisar amenazas y límites de compilación según carga y tamaño de los equipos. |
| A07 Autenticación | Se comprueban sesiones de cuenta y bóveda, y los tickets WebSocket son de un solo uso. | Comprobar periódicamente revocación de cuentas y sesiones de todos los perfiles. |
| A08 Integridad | Migraciones versionadas, revisiones y huellas SHA-256. El escáner de CI está fijado por digest. | Definir procedencia y firma de las imágenes distribuidas. |
| A09 Registros y alertas | Registros del proxy, auditoría y estados de salud. | Configurar retención, destinatario de alertas y ensayo de respuesta. |
| A10 Excepciones | API con errores normalizados, límites de archivos y respuesta HTTP 429 al superar la tasa de Nginx. | Medir saturación de operaciones costosas en un entorno aislado. |

## Comprobación de disponibilidad

`scripts/k6/crm-smoke.js` consulta únicamente la página de entrada y el estado de la base vía `/health`. Ejecuta cinco usuarios virtuales durante 15 segundos y exige que todas las comprobaciones pasen, sin errores y con p95 inferior a 750 ms. Pasa la CA que corresponde a la instalación mediante `SSL_CERT_FILE`.

```bash
docker run --rm \
  -e LESSSO_BASE_URL=https://IP_DEL_SERVIDOR:PUERTO \
  -e SSL_CERT_FILE=/review/ca.crt \
  -v "$PWD/nginx/certs/local/ca.crt:/review/ca.crt:ro" \
  -v "$PWD/scripts/k6/crm-smoke.js:/review/smoke.js:ro" \
  grafana/k6@sha256:3d8e5c7f1d53ec59408c2ffbd9943602a0985ffcbd4a2430ec00f3ffca89796e run /review/smoke.js
```

Mide disponibilidad y latencia básica de HTTPS. La compilación Typst, los permisos y la colaboración tienen suites funcionales separadas. La capacidad de esos flujos bajo carga requiere una medición específica con datos representativos.

## Resultados de esta revisión

- Trivy detectó siete avisos de dependencia alta o crítica en el lockfile antes del ajuste de `lodash-es` y `nanoid`. El nuevo escaneo de fuentes seleccionadas no encontró avisos de dependencia ni secretos de esas severidades. Conservó la observación sobre el proceso principal del proxy TLS.
- El escaneo de imágenes no encontró vulnerabilidades altas o críticas en Nginx. En el backend se aplicó la corrección de Debian a `zlib1g`. Quedaron 75 identificadores únicos de severidad alta o crítica en paquetes Debian sin corrección reportada por Trivy para la distribución examinada. Entre ellos está el aviso crítico CVE-2026-6653 en `libxml2`. Mantener este riesgo abierto para la decisión de publicación.
- El escenario HTTPS completó 150 solicitudes sin fallos tanto contra el despliegue en desarrollo como contra el frontend y el proxy estables de prueba. El p95 fue 9.56 ms y 4.83 ms, respectivamente. Ambos escenarios consultaron la salud del backend existente.
- Reportes, permisos y colaboración pasaron 23 pruebas contra PostgreSQL desechable. Pasó también la prueba de GIF y conversión de video. El frontend pasó 87 pruebas y compiló su imagen estable.
