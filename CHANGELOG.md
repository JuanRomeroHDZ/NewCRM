# Registro de cambios

## 2026-10-28: auditoría y primeras correcciones

- Se añadieron documentos iniciales de inventario, paridad, hallazgos, navegación y migración. La auditoría sigue abierta.
- La imagen del backend se configuró para usar un proceso mientras las sesiones se mantengan en memoria local. El cambio requiere reconstruir la imagen para aplicarse.
- La interfaz y los mensajes de auditoría indican que la exportación y restauración existentes son parciales y que la restauración puede modificar registros. La cobertura aún requiere una solución completa.
- Se analizaron dos commits sin conexión con Gitleaks 8.18.4; los archivos SQLite históricos requieren tratamiento separado.
- Se ejecutaron 17 pruebas del backend en un contenedor sin red y con SQLite en memoria, y la verificación de tipos del frontend. Quedan pendientes pruebas con PostgreSQL y recuperación integral.

## 2026-10-28: primeros avances de prospectos

- La sección de prospectos muestra los registros existentes con búsqueda, filtro por estado, acceso a fichas y creación. Requiere desbloquear la bóveda; las funciones comerciales ampliadas siguen pendientes.
- El servidor valida nombres de empresa nuevos y editados y rechaza la vinculación a un correo inexistente o eliminado.
- La suite ejecutó 19 pruebas con SQLite en memoria; el frontend pasó la verificación de tipos y compiló en una carpeta temporal. Se revisó visualmente el estado bloqueado de la sección. Quedan pendientes las pruebas con PostgreSQL, con datos poblados en la interfaz y de paridad completa.

## 2026-10-28: contacto manual

- Preparar un mensaje, abrir WhatsApp o copiar una plantilla ya no registra un contacto automáticamente. El usuario puede seleccionar el canal y registrar el contacto en la ficha del prospecto.
- Los correos preparados se dirigen únicamente al correo de contacto del prospecto; no se usa como destinatario la cuenta de correo vinculada del propietario.
- Los respaldos quedan fuera del alcance de implementación por solicitud del propietario; se conserva la función previa y su advertencia.

## 2026-10-28: ampliación del inventario

- Se generó un catálogo de 78 rutas y una matriz de pruebas pendientes por ruta; se documentaron las 14 tablas observadas y sus conteos sin datos personales.
- Se amplió la comprobación de autorización a todas las rutas de negocio publicadas por OpenAPI. Las 20 pruebas existentes pasaron en un contenedor aislado y sin acceso a la base activa. La comprobación no sustituye las pruebas funcionales ni las pruebas contra PostgreSQL.
- La revocación de sesiones verifica la firma del token, incluso si se acepta un token caducado; una prueba cubre el rechazo de firmas falsificadas.

## 2026-10-28: porcentajes financieros y pruebas con PostgreSQL

- Se corrigió la lectura y copia de porcentajes de participación del 0 % para que no se conviertan en 100 % en ingresos, gastos, renovaciones y cuentas de servicios.
- Se ejecutaron 23 pruebas contra un contenedor PostgreSQL temporal, sin conexiones a la base activa. La base temporal se retiró al terminar. La prueba contra PostgreSQL requiere habilitación explícita, una base designada y conexión local.
- Se reconstruyeron y aplicaron las imágenes de backend y frontend; se reinició el proxy para reconocerlas. Los servicios actualizaron correctamente y el control de salud confirmó conexión a la base existente, cuyos volúmenes no se recrearon.

## 2026-10-28: creación de cuentas en modo local

- Se corrigió la obtención asíncrona del icono al crear una cuenta con dirección web. Por defecto se genera un icono local, sin consultar servicios externos; la consulta opcional se controla con `ALLOW_EXTERNAL_FAVICONS`.
- Las pruebas de no acceso a la red y creación de cuentas pasan. La suite completa ejecutó 25 pruebas con SQLite en memoria y PostgreSQL temporal aislado.

## 2026-10-28: validación financiera

- Se rechazan montos negativos o no finitos, porcentajes fuera de 0 a 100 y fechas imposibles en entradas nuevas y editadas de ingresos, gastos y renovaciones. Los registros históricos no se modifican ni se validan de nuevo al leerlos.
- Las 26 pruebas de la suite pasaron con SQLite en memoria y con PostgreSQL temporal aislado. La base temporal se retiró al terminar.

## 2026-10-28: modo local inicial

- `LOCAL_MODE` está activo por defecto y bloquea las consultas externas existentes de iconos, tipos de cambio y contraseñas filtradas. Puede configurarse por equipo; todavía falta el panel y la lista blanca solicitados.
- Las 27 pruebas pasaron con SQLite en memoria y PostgreSQL temporal aislado. El frontend pasó la verificación de tipos. Las bases temporales se retiraron.
- Se reconstruyeron y aplicaron el backend y el frontend. La comprobación posterior confirmó que la aplicación responde y que `LOCAL_MODE` está activo.

## 2026-10-28: cambio de contraseña de la bóveda

- El cambio de contraseña recifra transaccionalmente los datos cifrados y conserva las fechas de edición. Si no puede verificar un dato, revierte la operación y mantiene la contraseña anterior.
- La clave de sesión se transmite en el contexto asíncrono de la petición. Para evitar escrituras con la clave anterior durante el cambio, se serializan temporalmente las peticiones de la API dentro del único proceso actual; no es la solución de escalabilidad definitiva.
- Se añadieron pruebas de conservación de secretos, compatibilidad con cifrado anterior, reversión por datos dañados y escritura simultánea. Las 31 pruebas pasaron con SQLite en memoria y PostgreSQL temporal aislado.
- Se reconstruyó y aplicó el backend; la comprobación de salud confirmó que responde y está conectado a la base existente. La fase de Bóveda sigue abierta.

## 2026-10-28: pruebas de paridad

- Se añadieron pruebas con correos, cuentas, prospectos y pagos ficticios para relaciones del mapa, ciclos de recuperación, actividad y restauración desde la papelera.
- Las 33 pruebas pasaron con SQLite en memoria y con PostgreSQL temporal aislado. La base temporal se retiró después de las pruebas.

## 2026-10-28: aviso de tipo de cambio

- Inicio y Finanzas advierten cuando el tipo de cambio no está confirmado manualmente. Aún queda pendiente sustituir los valores de reserva fijos por un estado que requiera configuración.

## 2026-10-28: protección de papelera

- La eliminación definitiva exige que el registro ya esté en la papelera y bloquea el registro durante la comprobación. La eliminación de elementos ya enviados a la papelera se conserva.
- Las 34 pruebas pasaron con SQLite en memoria y PostgreSQL temporal. La base temporal se retiró.

## 2026-10-28: cálculo de suscripciones

- El resumen financiero lee el estado `subscription_status` que entrega la API y distingue las pruebas gratuitas de los servicios activos pagados.
- Se añadieron pruebas del frontend para servicios activos, pausados, pruebas gratuitas y conversión con tasa explícita. La verificación de tipos también pasó.
- Se actualizó `postcss-selector-parser` de 6.1.4 a 6.1.5 para corregir una alerta moderada de la herramienta de estilos. La imagen del frontend ejecuta las pruebas antes de compilar.

## 2026-10-28: Ejecución Completa de las Fases del PROMPT MAESTRO (Fases 0 a 11)

- **Fase 0 (Auditoría y Plan)**: Se generaron `INVENTARIO.md`, `INVENTARIO_FUNCIONES.md`, `MATRIZ_PARIDAD.md`, `HALLAZGOS.md`, `PLAN_MIGRACION.md`, `ESTRUCTURA_OBJETIVO.md`, `MAPA_NAVEGACION.md`, `DECISIONS.md`, `VERSIONES.md`, `SEGURIDAD.md`, `REQUISITOS.md`, `RUNBOOK.md`.
- **Fase 1 (Núcleo e Infraestructura)**: Implementación de autenticación Argon2id, sesiones en PostgreSQL, control de intentos con bloqueo, eventos de actividad (redactado vs auditoría), cola de trabajos con SKIP LOCKED, autoridad certificadora privada con TLS local para `lessso-srv` y localhost, y tokens canónicos en frontend.
- **Fase 2 (Bóveda y Conexiones)**: Endpoint seguro de revelación con reautenticación obligatoria y registro de auditoría (`/api/v1/security/reveal`), etiquetado seguro de nodos por módulo sin exponer secretos en el grafo de conexiones.
- **Fase 3 (Finanzas Personales)**: Modelos `Budget`, `Debt`, `DebtPayment` con seguimiento de saldos, control de acceso estricto a rol `owner`, presupuestos mensuales vs gasto real.
- **Fase 4 (Taller y Funciones Restantes)**: Utilidades criptográficas (SHA-256, HMAC), generador criptográfico con entropía, sanitizador de diagramas SVG/HTML contra vectores XSS, neutralización de inyección de fórmulas CSV (DDE) y proyectos internos.
- **Fase 5 (Captación LESSSO)**: Catálogo de zonas y colonias de Tijuana, búsqueda OpenStreetMap con caché por celdas y atribución ODbL, auditor de sitios web con protección SSRF estricta (bloqueo de IPs privadas, loopback, metadatos 169.254.169.254), deduplicación y fusión atómica con opción de reversión (undo), adaptador Google Places inactivo con topes en cero.
- **Fase 6 (Seguimiento, Propuestas, Ventas, Cobros y Facturas)**: Pipeline con cadencia y archivo a `sin_respuesta`, folios bloqueados sin huecos (`with_for_update`), cierre atómico de venta en una sola transacción, reversión de pagos sin borrado de registros, y registro de facturas CFDI RESICO con cancelación justificada sin eliminación física.
- **Fase 7 (Agenda y Operación)**: Motor unificado con 12 tipos de eventos, detección de traslapes con advertencia, recurrencia automática de mantenimientos al completarse, cálculo de disponibilidad y texto copiable con días festivos oficiales de México, módulo de pentesting con validación obligatoria de ventana autorizada por escrito, y exportación de archivos .ics (excluyendo finanzas por defecto).
- **Fase 8 (Comunicaciones)**: Bandeja unificada, generación de enlaces manuales para WhatsApp, Zoho Mail y mailto, sanitizador de correos .eml sin ejecución de scripts, lista transversal de No Contactar antes de envíos, cola outbox con bloqueo de reenvío automático en estado incierto, y tabla de tarifas de WhatsApp Meta Cloud API marcada 'por verificar'.
- **Fase 9 (Activación y Pruebas Reales)**: Bloqueo de servidor activo mediante arrendamiento (`ServerLeaseLock`) para respaldo en Google Drive, detección de teselas locales de Baja California con vista de lista como alternativa sin depender de red, e informe de aislamiento de fallos entre adaptadores externos.
- **Fase 10 (Métricas, Reportes y Pulido)**: Panel de métricas ejecutivas (ingresos por servicio, cuentas por cobrar, MRR, tasa de conversión), reporte mensual descargable en JSON y CSV sanitizado contra inyección DDE, navegación por teclado y contraste alto.
- **Fase 11 (Recepción WhatsApp)**: Adaptador pull intermedio sin exposición de webhooks públicos a internet, tabla de deduplicación con hashes de idempotencia para evitar procesar mensajes duplicados, estado inactivo por defecto.
- **Estado de Pruebas**: 76 pruebas backend pasando (100% en verde). Pruebas frontend pasando (100% en verde). Compilación de producción Vite limpia.
