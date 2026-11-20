# Seguridad de la aplicación web

## Propósito y alcance

Este documento define el flujo de desarrollo seguro, revisión y pruebas autorizadas para LESSSO: aplicación React/Vite, API FastAPI, PostgreSQL, servicios Docker Compose, proxy TLS y servicios opcionales de captura o laboratorio. La información incluye credenciales, datos financieros y personales, informes de seguridad, respaldos y datos operativos.

El alcance de una revisión se limita al repositorio, los servicios locales y los dominios o direcciones expresamente autorizados por la persona propietaria. Cada informe registra objetivo, entorno, fecha, permisos, cuentas de prueba, herramientas y áreas que no pudieron comprobarse. No se afirma que una aplicación sea invulnerable ni que un escaneo demuestre ausencia total de exposición.

Las pruebas con efectos de estado usan un entorno aislado y datos sintéticos. En producción se limitan a comprobaciones pasivas y solicitudes de lectura autorizadas. No se ejecutan pruebas de carga, fuerza bruta, explotación, persistencia, borrado, modificación de datos, evasión de controles ni acceso a redes internas sin una autorización explícita y un entorno preparado para ello. Los módulos de pentesting requieren alcance y autorización de engagement independientes; no amplían por sí solos el alcance de una auditoría.

## Referencias de seguridad

- [OWASP Top 10:2025](https://top10.owasp.org/2025/): mapa de riesgos web y criterios de revisión.
- [OWASP ASVS 5.0.0](https://asvs.owasp.org/): catálogo verificable de requisitos. Se toma como referencia el nivel 2 para controles aplicables a una aplicación con datos sensibles; esto no representa certificación ni conformidad automática.
- [OWASP API Security Top 10:2023](https://api-security.owasp.org/editions/2023/en/0x00-header/): autorización por objeto y función, exposición de propiedades, consumo de recursos, SSRF y manejo de servicios externos.
- [OWASP Web Security Testing Guide, versión estable](https://owasp.github.io/www-project-web-security-testing-guide/stable/): metodología para pruebas manuales y automatizadas. Las referencias a pruebas concretas se fijan a una versión.
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/): guía para autenticación, autorización, sesión, CSRF, XSS, SSRF, cargas de archivos, secretos, logging y contenedores.
- [NIST SSDF SP 800-218 v1.1](https://csrc.nist.gov/pubs/sp/800/218/final): ciclo de desarrollo seguro, protección de artefactos y respuesta a vulnerabilidades.

El Top 10 se utiliza para orientar la cobertura; ASVS y WSTG estructuran la verificación. Ninguno sustituye el modelo de amenazas propio ni la revisión de código y configuración.

## Activos y fronteras de confianza

La revisión contempla, según el cambio, estos activos y límites:

- Credenciales de usuarios, datos de bóveda, sesiones, claves de cifrado y códigos de configuración inicial.
- Datos CRM, financieros, auditorías de sitios, informes, adjuntos, exportaciones, bitácoras y respaldos.
- Roles `owner`, `business_admin`, `operator`, `seller` y `readonly`; permisos por registro, función y propiedad de datos.
- Navegador y frontend frente a la API; API frente a PostgreSQL; proxy TLS frente a servicios Docker; instalación frente a integraciones externas.
- URLs y contenido aportado por usuarios frente a los procesos de auditoría web, mapas, Markdown, Typst, Mermaid, imágenes y archivos importados.
- Servicio opcional C2 frente a la red y al engagement autorizado. La operación real debe fallar cerrada cuando no se pueda validar el alcance.

## Reglas obligatorias

### Secretos y configuración

- Los valores secretos se mantienen fuera del repositorio, de los registros, de las respuestas HTTP, de los artefactos frontend y de las salidas de herramientas.
- `.env.example` contiene nombres necesarios y valores ficticios o neutros. No contiene claves, contraseñas reutilizables, hosts de producción, códigos activos, certificados privados, rutas personales, correos reales ni coordenadas/zonas que identifiquen una ubicación privada. Los nombres de variables no equivalen por sí mismos a secretos; los valores y su uso determinan la exposición.
- Toda variable `VITE_*` se considera pública porque puede incorporarse al JavaScript entregado al navegador. Nunca almacena credenciales ni claves privadas.
- Las claves de aplicación, credenciales de PostgreSQL, secretos de workers, códigos iniciales, llaves privadas TLS y llaves privadas de cifrado de respaldos se generan por instalación, se restringen a los procesos que las necesitan y se rotan ante una exposición sospechada.
- Al detectar una credencial posiblemente activa, el hallazgo se trata como comprometido hasta verificarlo: primero se revoca o rota en el proveedor y después se coordina cualquier limpieza del historial. Borrar el archivo actual no elimina el secreto de commits, clones, respaldos ni artefactos.
- Los archivos de diagnóstico, exportación, respaldo y resultados de escáner se mantienen fuera del control de versiones y se redactan antes de compartirse.

### Identidad, autorización y sesiones

- La autenticación se exige en cada ruta privada con dependencias o límites de router consistentes; las rutas públicas se identifican deliberadamente.
- La autorización se verifica en el servidor por usuario, rol, organización/ámbito, función y objeto en cada lectura o escritura basada en identificadores controlados por el cliente. Ocultar botones en el frontend no constituye autorización.
- Los esquemas de entrada permiten solo propiedades explícitas; los esquemas de respuesta excluyen secretos, campos internos y datos ajenos al permiso del solicitante.
- El almacenamiento de contraseñas usa una función de derivación adecuada, no cifrado reversible ni hashes rápidos. Los tokens se validan con algoritmos permitidos, caducidad y audiencia/emisor cuando corresponda.
- Las sesiones tienen expiración, renovación y revocación definidas. Cuando se usan cookies, se revisan `Secure`, `HttpOnly`, `SameSite` y CSRF según el transporte real. CORS no sustituye autorización ni CSRF.
- Los límites de intentos, recuperación de cuentas, desbloqueo de bóveda, cambios de rol y operaciones sensibles se validan en servidor y dejan eventos de auditoría sin credenciales.

### Datos, entradas y salidas

- Consultas SQL usan parámetros u ORM seguro; no interpolan datos no confiables en SQL, comandos de shell, plantillas, rutas ni expresiones dinámicas.
- El HTML de Markdown, Typst, Mermaid, SVG y contenido de usuario se considera no confiable. Las rutas de renderizado/exportación validan, escapan o sanitizan según el formato y evitan `dangerouslySetInnerHTML` sin control probado.
- La carga de archivos aplica límites de tamaño, formato permitido, validación en servidor, nombres generados y almacenamiento no ejecutable. HTML y SVG activos no se sirven inline sin sanitización específica.
- Las funciones que consultan URLs externas validan protocolo, destino y resolución DNS; bloquean loopback, redes privadas, link-local y direcciones de metadatos; vuelven a validar cada redirección; aplican límites de respuesta, tiempo y tamaño. Se consideran DNS rebinding y cambios de resolución.
- Descargas, informes y exportaciones no filtran secretos, IDs de sesión, metadatos internos, rutas locales ni archivos de otros usuarios. Las respuestas privadas usan controles de caché apropiados.
- Los mensajes de error para el cliente no revelan stack traces, consultas, rutas internas, valores de configuración ni topología innecesaria. Los detalles técnicos quedan en registros con acceso restringido.

### Infraestructura, cadena de suministro y operación

- La configuración de producción desactiva debug, recarga de desarrollo, credenciales de ejemplo y endpoints de diagnóstico públicos. Documentación OpenAPI se protege o se deshabilita si revela superficie interna.
- TLS termina en el proxy previsto; se comprueban certificados, cookies, encabezados, puertos publicados y acceso directo a servicios internos. HSTS se habilita solo después de validar dominio, subdominios y estrategia de recuperación.
- Las respuestas no revelan versiones de servidor. La CSP evita comodines y `unsafe-inline` cuando la arquitectura lo permite; los recursos externos se autorizan por origen concreto. HSTS se entrega para el dominio público válido; COOP, COEP y CORP se habilitan de acuerdo con los flujos reales.
- Antes de publicar, se confirma que no están accesibles endpoints Vite/HMR como `/@vite/client`, preambles de React Refresh, módulos fuente de `/src/` ni artefactos de depuración. Los puertos del servidor de desarrollo permanecen limitados a interfaces confiables.
- Contenedores exponen solo puertos necesarios, usan permisos mínimos, evitan secretos en `ARG`, `ENV`, capas o logs, y ejecutan procesos con privilegios mínimos cuando el servicio lo permite.
- CI utiliza lockfiles y comandos reproducibles (`npm ci`); los permisos de workflows son mínimos, las acciones externas se fijan a versiones revisadas y los secretos no se entregan a código de pull requests no confiable.
- Dependencias e imágenes se revisan por avisos conocidos y procedencia. Una alerta del escáner se confirma contra versión afectada, uso real y alcance antes de cerrar o aceptar riesgo.
- Los respaldos se cifran, sus claves se separan de los archivos y la restauración se verifica en un entorno de prueba.
- Los logs registran el evento y el actor necesarios para investigar, sin contraseñas, tokens, cookies, secretos, cuerpos completos sensibles ni datos financieros innecesarios.

### Comentarios de código y texto de la página

- Los comentarios técnicos se redactan en español descriptivo e impersonal, en tercera persona: «Se valida el alcance antes de iniciar la solicitud» o «La respuesta excluye campos protegidos».
- Los comentarios explican una decisión, una frontera o una razón de seguridad que no sea obvia. No repiten literalmente la instrucción siguiente ni contienen secretos, valores reales, datos personales o detalles que faciliten abusos.
- Los comentarios no se redactan como órdenes o instrucciones al lector. Se evitan expresiones en segunda persona como «puedes», «haz» o «asegúrate».
- El texto visible para las personas usuarias conserva la voz de producto ya establecida. Esta regla se aplica a comentarios del código y documentación técnica, no reescribe la interfaz.

## Skills y herramientas

### Skills locales de Codex

Estas skills se instalaron en el perfil local de Codex y quedan disponibles para próximas sesiones:

- `$security-best-practices`: revisión de seguridad específica para Python/FastAPI y TypeScript/React.
- `$security-threat-model`: activos, fronteras de confianza, capacidades, rutas de abuso y mitigaciones fundamentadas en el repositorio.
- `$security-ownership-map`: análisis puntual de responsables y concentración de cambios en código sensible; no se ejecuta en cada revisión.

Se usan cuando el alcance coincide con su propósito. Una skill ayuda a la revisión, pero no reemplaza evidencia de código, escáneres ni validación del entorno.

### Herramientas del entorno local

| Herramienta | Uso | Estado en este entorno |
|---|---|---|
| Semgrep CE | Análisis estático de Python y TypeScript | Instalado en `.tools/security/venv`; versión 1.186.0 |
| pip-audit | Vulnerabilidades conocidas en dependencias Python | Instalado en `.tools/security/venv`; versión 2.10.1 |
| `npm audit` | Dependencias npm según `package-lock.json` | Incluido con npm; usa el registro configurado para consultar avisos |
| Trivy | Vulnerabilidades, secretos y configuración de fuentes e imágenes | Integrado en `scripts/audit.sh` mediante imagen fijada por digest |
| TruffleHog OSS | Revisión del historial Git sin validar credenciales contra proveedores | Integrado en `scripts/audit.sh` mediante imagen fijada por digest |
| OWASP ZAP Baseline | Exploración web limitada con análisis pasivo | Imagen oficial fijada a `sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af` |

Trivy y TruffleHog ya cubren detección de secretos en fuentes e historial; no se añade otro escáner equivalente por defecto. `npm audit`, Semgrep y ZAP pueden consultar servicios externos para obtener reglas o avisos; no se habilitan cargas de código a plataformas de análisis administradas.

La instalación local aislada no altera dependencias de la aplicación:

```bash
python3 -m venv .tools/security/venv
.tools/security/venv/bin/python -m pip install --upgrade pip
.tools/security/venv/bin/python -m pip install semgrep==1.186.0 pip-audit==2.10.1
docker pull ghcr.io/zaproxy/zaproxy@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af
```

La carpeta `.tools/security/` está excluida de Git.

### Herramientas de ChatGPT

- `@Impeccable init` registra el contexto durable del producto en el proyecto que se esté auditando. Se ejecuta en la raíz de ese proyecto; si ya existe `PRODUCT.md`, se actualiza únicamente con información confirmada y faltante.
- `@Impeccable audit`, `critique` y `polish` cubren calidad técnica visual, accesibilidad, claridad, consistencia y adaptación de interfaz. No equivalen a SAST, DAST, revisión de secretos ni auditoría de infraestructura.
- `@Codex Security` realiza revisiones estándar y profundas del código desde ChatGPT cuando el plugin está conectado. Algunos resultados protegidos requieren acceso Daybreak; el estado se comprueba en [chatgpt.com/cyber](https://chatgpt.com/cyber?source=codex_security_plugin). Sus hallazgos se verifican en el código y con herramientas locales.
- `@GitHub`, si está conectado, puede ayudar a revisar alertas de Secret Scanning, Push Protection, Dependabot, Code Scanning y reglas de rama. El estado se confirma en GitHub; no se infiere por la existencia de una skill.

Las skills locales se invocan por su nombre de skill; no son plugins `@`. OWASP es un conjunto de estándares y guías, no un plugin.

## Flujo de auditoría

1. **Fijar el alcance.** Identificar commit y cambios sin guardar, entorno, dominio/IP exactos, dueño, límites, roles y datos permitidos. Cualquier host no confirmado queda fuera.
2. **Entender el sistema.** Revisar `PRODUCT.md`, arquitectura, rutas, permisos, variables, contenedores, CI, integraciones y activos. Construir o actualizar un modelo de amenazas breve antes de cambiar controles.
3. **Buscar secretos.** Revisar archivos actuales y todo el historial Git. La salida se redacta para omitir valores. Un hallazgo se revoca/rota antes de limpiar historial.
4. **Revisar código y dependencias.** Ejecutar Semgrep, Trivy, `pip-audit` y `npm audit`; comprobar lockfiles, versiones afectadas y exposición real. El análisis automático no valida reglas de negocio.
5. **Revisar despliegue.** Validar configuración Compose, imágenes, puertos, certificados, encabezados, caché, documentación, directorios estáticos, logs y rutas sin autenticación.
6. **Comprobar controles manualmente.** Probar con cuentas sintéticas los límites entre roles y objetos, sesiones, recuperación, carga/descarga, exportación, importación, rate limits y respuestas de error. Los casos que cambian estado usan solo staging.
7. **Aplicar DAST pasivo.** ZAP Baseline se ejecuta contra staging. Producción requiere autorización específica, ventana acordada y un recorrido pasivo, de bajo volumen y sin enviar formularios. Las pruebas activas se reservan a un entorno aislado.
8. **Informar y volver a verificar.** Registrar evidencia reproducible, remediación, validación, limitaciones, falsos positivos aceptados y deuda restante. Cada corrección se vuelve a escanear en su alcance.

### Comandos locales

```bash
# Código de la API y del frontend
./.tools/security/venv/bin/semgrep scan --config auto backend/app frontend/src

# Dependencias Python declaradas
./.tools/security/venv/bin/pip-audit -r backend/requirements.txt
./.tools/security/venv/bin/pip-audit -r backend/requirements-test.txt

# Dependencias JavaScript del lockfile
npm audit --prefix frontend --audit-level=high

# Fuentes, historial, imágenes y comprobaciones runtime ya soportadas
bash scripts/audit.sh guide
bash scripts/audit.sh source
bash scripts/audit.sh history
bash scripts/audit.sh image newcrm-backend:latest
bash scripts/audit.sh runtime https://staging.example.test /ruta/a/ca.crt

# Archivo de entorno local: se muestran conteos, nunca los valores detectados
if test -r .env; then
  docker run --rm --network none --volume "$PWD/.env:/review/.env:ro" \
    aquasec/trivy@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb \
    fs --scanners secret --format json /review |
    python3 -c 'import collections,json,sys; d=json.load(sys.stdin); rows=[x for r in d.get("Results",[]) for x in r.get("Secrets",[])]; print("Candidatos:",len(rows)); [print(k,v) for k,v in sorted(collections.Counter(x.get("Severity","UNKNOWN") for x in rows).items())]'
fi
```

ZAP Baseline corre con el contenedor oficial y su modo pasivo. El destino, certificado y volumen de informes se ajustan al entorno autorizado. Los informes se escriben en una carpeta temporal excluida de Git. Para una CA local, el certificado se añade al trust store del contenedor de revisión; la validación TLS no se desactiva. No se usa `zap-full-scan.py` en producción: incluye pruebas activas. Los hallazgos de rutas autenticadas requieren un contexto de pruebas y una cuenta sintética; nunca se exportan sesiones reales al escáner.

Ejemplo para un destino de staging accesible desde la red local, con CA privada. Los informes quedan fuera del repositorio:

```bash
mkdir -p /tmp/lessso-zap
docker run --rm --network host \
  --volume /ruta/a/ca.crt:/tmp/target-ca.crt:ro \
  --volume /tmp/lessso-zap:/zap/wrk:rw \
  --workdir /zap/wrk \
  --entrypoint /bin/sh \
  ghcr.io/zaproxy/zaproxy@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af \
  -lc 'set -eu; java_bin=$(readlink -f "$(command -v java)"); java_home=$(dirname "$(dirname "$java_bin")"); cp "$java_home/lib/security/cacerts" /zap/wrk/cacerts; keytool -importcert -noprompt -alias target-audit-ca -file /tmp/target-ca.crt -keystore /zap/wrk/cacerts -storepass changeit >/dev/null; JAVA_TOOL_OPTIONS="-Djavax.net.ssl.trustStore=/zap/wrk/cacerts -Djavax.net.ssl.trustStorePassword=changeit" /zap/zap-baseline.py -t https://staging.example.test -m 2 -J zap-baseline.json -r zap-baseline.html -s'
```

## Prioridad y formato de hallazgos

La prioridad combina impacto, probabilidad, exposición, datos afectados y controles existentes. CVSS ayuda a comparar vulnerabilidades técnicas, pero no sustituye el contexto del producto.

Cada hallazgo incluye:

- ID y severidad: Crítica, Alta, Media o Baja.
- Ruta, endpoint o componente y líneas verificadas.
- Evidencia mínima redactada; nunca el valor del secreto.
- Precondiciones, activo afectado e impacto concreto.
- Estado de autenticación y autorización requerido para reproducirlo.
- Corrección y comprobación de cierre.
- Confianza, falsos positivos y límites de cobertura.

Se prioriza como bloqueo de publicación cualquier secreto activo expuesto, acceso no autorizado a bóveda o datos ajenos, bypass de rol, ejecución remota, SSRF a redes internas, lectura de respaldos, error criptográfico que revele datos o dependencia explotable desde una ruta accesible. Las excepciones documentan responsable, razón, mitigación temporal y fecha de revisión.

## Estado de revisiones previas

Hay candidatos históricos de credenciales que no se han confirmado ni descartado en el proveedor. Permanecen abiertos hasta verificar su validez y, si corresponde, revocarlos o rotarlos. Los detalles de revisión se conservan en el registro interno del equipo, no en esta política. La ausencia de alertas actuales en GitHub no cierra por sí sola un candidato histórico.

## Reporte responsable de vulnerabilidades

Los detalles de una vulnerabilidad no se publican en issues, capturas, logs compartidos ni documentación pública mientras no exista mitigación. El repositorio debe tener habilitado GitHub Private Vulnerability Reporting o designar un canal privado de contacto antes de aceptar reportes externos. El reporte conserva solo evidencia necesaria y redactada. El canal y el tiempo de respuesta se confirman antes de publicar esta política fuera del equipo.

## Criterio de salida para producción

La revisión no queda cerrada por un `0/0` de un escáner. El registro final debe confirmar alcance y cobertura; secretos actuales e históricos revisados; dependencias e imágenes evaluadas; autorización por rol y objeto probada; configuración de producción inspeccionada; hallazgos graves corregidos o con excepción aprobada; respaldos restaurables; y límites o pruebas pendientes claramente identificados.
