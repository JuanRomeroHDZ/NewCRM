# Inventario Exhaustivo de Funciones | Contact LESSSO

Fecha de auditoría: 2026-10-28.
Estado: Completo y verificado contra el código fuente.
Criterio: Toda pantalla, ruta de API, componente modal, widget, servicio, script y acción de usuario documentada con su disposición formal.

## Reglas de Disposición
- **Conservar en su lugar**: Mantiene su ubicación actual dentro del módulo asignado.
- **Mover a otro módulo**: Se reubica en el módulo temático adecuado (por ejemplo, cargos de cuentas a Finanzas).
- **Mejorar**: Conserva la funcionalidad completa añadiendo validación, accesibilidad, seguridad o experiencia de uso.
- **Fusionar**: Se integra con otra función afín sin perder capacidades únicas.
- **Dividir**: Se separa en componentes modulares independientes.
- **Retirar**: Solo aplica a código muerto o duplicados exactos sin función visible.

---

## 1. Pantallas y Vistas Principales

| Nombre de Función | Qué hace (comportamiento real en código) | Ubicación actual | Datos que usa | Estado | Disposición |
|---|---|---|---|---|---|
| Panel General (Dashboard) | Muestra tarjetas de resumen de finanzas (gastos mensuales, suscripciones activas), métricas de correos, prospectos en seguimiento y accesos rápidos | `frontend/src/components/views/DashboardView.tsx` | Finanzas, correos, prospectos, divisas USD/MXN | Funciona | Mejorar; actualizar métricas unificadas y diseño visual |
| Bóveda de Correos (EmailsView) | Listado y administración de cuentas de correo raíz, proveedores, URL de buzón, contraseñas, notas y cadena de recuperación jerárquica | `frontend/src/components/views/EmailsView.tsx` | `EmailAccount`, contraseñas cifradas, códigos de respaldo | Funciona | Mejorar en Bóveda; enmascaramiento por defecto y auditoría al revelar |
| Cuentas y Servicios (PlatformsView) | Catálogo de plataformas asociadas a correos y prospectos, credenciales, TOTP en vivo, llaves de API, variables de entorno y costos de suscripción | `frontend/src/components/views/PlatformsView.tsx` | `PlatformAccount`, `PaymentMethod`, credenciales | Funciona | Dividir; credenciales y TOTP a Bóveda, cargos a Finanzas |
| Prospectos y Demos (ProspectsView) | Lista, filtro por estado, cronómetro de SLA, contador de seguimiento, registro de contacto, enlace a WhatsApp/correo y notas | `frontend/src/components/views/ProspectsView.tsx` | `Prospect`, SLAs, historial de contacto, canales | Funciona | Mejorar en CRM LESSSO con pipeline comercial y cadencias |
| Contraseñas y Llaves (PasswordsView) | Vista agregada de contraseñas de correos y plataformas, historial de rotaciones, generador de contraseñas y recursos seguros | `frontend/src/components/views/PasswordsView.tsx` | `PasswordHistory`, `SecureResource`, credenciales | Funciona | Mejorar en Bóveda con verificación de contraseñas repetidas/débiles |
| Auditoría de Seguridad (SecurityAuditView) | Análisis de entropía de contraseñas, reutilización de claves, antiguedad de rotación y consulta de filtraciones | `frontend/src/components/views/SecurityAuditView.tsx` | Metadatos de contraseñas, hashes K-anonimato HIBP | Funciona | Mejorar en Bóveda/Seguridad; modo local sin fugas de datos |
| Historial de Actividad (AuditLogsView) | Bitácora de eventos del sistema (creación, edición, eliminación, desbloqueo), paginación y exportación | `frontend/src/components/views/AuditLogsView.tsx` | `AuditLog`, timestamps, IPs, entidades | Funciona | Mejorar en Sistema/Actividad; separar vista amigable de auditoría estricta |
| Mapa de Conexiones (GraphView) | Lienzo interactivo en grafo con nodos de correos, servicios, prospectos y métodos de pago; detección de ciclos y nodos críticos | `frontend/src/components/views/GraphView.tsx` | Referencias cruzadas de grafo, relaciones de recuperación | Funciona | Mejorar en Sistema/Conexiones; zoom, filtros por módulo y vista de lista |
| Finanzas e Ingresos (SubscriptionsView) | Resumen de suscripciones, cobros recurrentes, gastos únicos, proyectos internos, renovaciones de dominio y presupuestos | `frontend/src/components/views/SubscriptionsView.tsx` | `BillingRecord`, `ClientIncome`, `DomainRenewal`, `OneTimeExpense` | Funciona | Mejorar en Finanzas personales; aislar datos de clientes y CRM |
| Papelera del Sistema (TrashView) | Listado de elementos en baja lógica (correos, plataformas, prospectos, finanzas), restauración y vaciado definitivo | `frontend/src/components/views/TrashView.tsx` | Registros con bandera `is_deleted=True` | Funciona | Conservar en Sistema/Papelera con comprobación transaccional |
| Ajustes y Configuración (SettingsView) | Cambio de contraseña maestra, sal de derivación, temporizador de bloqueo, borrado de portapapeles, políticas de negocio y respaldo | `frontend/src/components/views/SettingsView.tsx` | `UserSettings`, políticas, configuración | Funciona | Mejorar en Sistema/Configuración modular |

---

## 2. Modales, Widgets y Herramientas

| Nombre de Función | Qué hace (comportamiento real en código) | Ubicación actual | Datos que usa | Estado | Disposición |
|---|---|---|---|---|---|
| Desbloqueo de Bóveda (VaultUnlockModal) | Solicita contraseña maestra, valida hash Argon2id y activa clave de descifrado en sesión en memoria | `frontend/src/components/common/VaultUnlockModal.tsx` | Hash maestro, sal, tokens de sesión | Funciona | Mejorar en Bóveda; sesiones respaldadas en base de datos |
| Generador de Contraseñas (PasswordGeneratorModal) | Genera cadenas aleatorias criptoseguras con longitud, símbolos, números, mayúsculas y opción de pronunciables | `frontend/src/components/common/PasswordGeneratorModal.tsx` | Parámetros de generación aleatoria | Funciona | Mover al Taller (Área Utilidades) y reutilizar en Bóveda |
| Paleta de Comandos (CommandPalette) | Navegación rápida por teclado (Ctrl+K), búsqueda de registros y ejecución de atajos rápidos | `frontend/src/components/common/CommandPalette.tsx` | Índice local de rutas y entidades | Funciona | Conservar en Sistema/Navegación; soporte de accesibilidad completa |
| Widget de Códigos TOTP (TotpWidget) | Renderiza códigos 2FA de 6 dígitos con cuenta regresiva visual a partir de secreto Base32 descifrado | `frontend/src/components/common/TotpWidget.tsx` | Secreto TOTP descifrado | Funciona | Conservar en Bóveda |
| Tarjeta de Icono Dinámico (PlatformIcon) | Muestra logotipo de servicio extraído de catálogo local o SVG generado sin dependencias de red | `frontend/src/components/common/PlatformIcon.tsx` | URL o iniciales | Funciona | Conservar en Bóveda/Taller |
| Campo de Secreto Enmascarado (SecretField) | Oculta valores con puntos de contraseña, botón de revelado temporal y botón de copiado con vaciado de portapapeles | `frontend/src/components/common/SecretField.tsx` | Texto sensible, temporizador de portapapeles | Funciona | Mejorar en Bóveda; exigir reautenticación para revelar |
| Hoja de Recuperación (EmergencyKitModal) | Genera documento imprimible con datos esenciales de la bóveda, claves de emergencia y hash | `frontend/src/components/modals/EmergencyKitModal.tsx` | Claves maestras y metadatos | Funciona | Mover al Taller (Área Utilidades) / Bóveda |
| Exportación de Entorno (EnvExportModal) | Exporta variables de entorno y llaves de API en formato `.env` para proyectos locales | `frontend/src/components/modals/EnvExportModal.tsx` | `PlatformAccount.env_variables`, `api_keys` | Funciona | Mover al Taller (Área Código) |
| Importador por Lote (ImportModal) | Importa cuentas y credenciales desde archivos CSV/JSON estructurados | `frontend/src/components/modals/ImportModal.tsx` | Archivos CSV/JSON | Funciona | Mejorar en Sistema/Importaciones; sanitización y validación estricta |
| Modal de Medios de Pago (PaymentModal) | Crea y edita tarjetas con alias, banco, últimos 4 dígitos, fecha de vencimiento y notas | `frontend/src/components/modals/PaymentModal.tsx` | `PaymentMethod` | Funciona | Mover a Finanzas; aplicar Opción B (sin CVV bajo ninguna circunstancia) |

---

## 3. Rutas de Backend (API v1) y Servicios

| Nombre de Función | Qué hace (comportamiento real en código) | Ubicación actual | Datos que usa | Estado | Disposición |
|---|---|---|---|---|---|
| `POST /api/v1/auth/unlock` | Valida credencial maestra mediante Argon2id, deriva clave AES y emite token jti | `backend/app/api/v1/auth.py` | `master_password`, sesiones en memoria | Funciona | Mejorar; sesiones en PostgreSQL con revocación remota |
| `POST /api/v1/auth/lock` | Invalida el identificador de sesión y purga la clave volátil de memoria | `backend/app/api/v1/auth.py` | Token activo | Funciona | Mejorar; invalidación inmediata en base de datos |
| `GET /api/v1/auth/status` | Retorna si la sesión actual está activa y el tiempo remanente en segundos | `backend/app/api/v1/auth.py` | Token jti | Funciona | Conservar en Núcleo/Sistema |
| `POST /api/v1/auth/change-password` | Valida clave anterior, actualiza hash maestro y recifra todos los registros cifrados en una transacción | `backend/app/api/v1/auth.py`, `rekey.py` | Contraseña maestra, registros cifrados | Funciona | Conservar en Núcleo/Bóveda |
| CRUD Correos (`/api/v1/emails`) | Gestiona cuentas de correo, contraseñas, notas y cadena de recuperación jerárquica | `backend/app/api/v1/emails.py` | `EmailAccount` | Funciona | Conservar en Bóveda |
| CRUD Plataformas (`/api/v1/platforms`) | Gestiona servicios, credenciales, TOTP, llaves API, variables y suscripciones | `backend/app/api/v1/platforms.py` | `PlatformAccount` | Funciona | Dividir; suscripciones a Finanzas, credenciales a Bóveda |
| CRUD Prospectos (`/api/v1/prospects`) | Alta, edición, seguimiento, SLA, notas, canal de contacto y cambio de estados | `backend/app/api/v1/prospects.py` | `Prospect` | Funciona | Mejorar en CRM LESSSO; incorporar cadencias y propuestas |
| CRUD Pagos (`/api/v1/payments`) | Gestiona métodos de pago y tarjetas con validación de máscara | `backend/app/api/v1/payments.py` | `PaymentMethod` | Funciona | Mover a Finanzas personales con política Opción B |
| CRUD Finanzas (`/api/v1/finances`) | Gestiona ingresos, renovaciones de dominios, gastos únicos, proyectos y recursos | `backend/app/api/v1/finances.py` | Incomes, Renewals, Expenses, Projects, Resources | Funciona | Dividir; Finanzas personales vs CRM (cobros clientes) vs Taller (proyectos) |
| Grafo Relacional (`/api/v1/graph`) | Construye modelo de nodos y aristas para detección de dependencias y ciclos | `backend/app/api/v1/graph.py`, `services/graph.py` | Conexiones de grafo | Funciona | Mejorar en Núcleo/Conexiones con adaptadores por módulo |
| Papelera (`/api/v1/trash`) | Listado de bajas lógicas, restauración atómica y borrado definitivo protegido | `backend/app/api/v1/trash.py` | Entidades con `is_deleted=True` | Funciona | Conservar en Núcleo/Sistema |
| Auditoría (`/api/v1/audit`) | Consulta y paginación de eventos de modificación del sistema | `backend/app/api/v1/audit.py` | `AuditLog` | Funciona | Mejorar en Núcleo/Sistema con vista dual |
| Divisas (`/api/v1/exchange`) | Consulta y ajuste manual de tasas de conversión USD/MXN | `backend/app/api/v1/exchange.py`, `services/currency.py` | `ExchangeRate` | Funciona | Conservar en Finanzas en modo local estricto |
| Evaluación de Seguridad (`/api/v1/security`) | Evalúa fortaleza de contraseñas y consulta filtraciones HIBP con K-anonimato | `backend/app/api/v1/security.py`, `security/pwned.py` | Hashes de contraseñas | Funciona | Mejorar en Bóveda; bloqueo local cuando `LOCAL_MODE=True` |
| Importación de Cuentas (`/api/v1/importer`) | Procesa volcados estructurados y crea registros en lote con transacciones | `backend/app/api/v1/importer.py` | Datos estructurados | Funciona | Mejorar en Núcleo/Sistema con previsualización |
| Salud del Sistema (`/health`) | Comprueba conectividad de base de datos y estado de arranque | `backend/app/api/v1/health.py` | PostgreSQL engine | Funciona | Mejorar en Núcleo/Sistema con comprobaciones ampliadas |

---

## 4. Scripts y Utilidades de Infraestructura

| Nombre de Script / Trabajo | Qué hace | Ubicación actual | Datos que usa | Estado | Disposición |
|---|---|---|---|---|---|
| `scripts/inventariar_rutas.py` | Analiza el árbol AST de rutas FastAPI para generar catálogos de endpoints | `scripts/inventariar_rutas.py` | Código fuente backend | Funciona | Conservar en Taller/Código |
| Datos de Demostración (`seed_data.py`) | Pobla la base de datos con cuentas y configuraciones iniciales de prueba | `backend/app/seed_data.py` | Datos ficticios seguros | Funciona | Mejorar; asegurar que ningún valor sea credencial real |
| Migraciones Aditivas en Arranque | Ejecuta alteraciones SQL no destructivas en el ciclo de vida de la aplicación | `backend/app/main.py:lifespan` | Conexión PostgreSQL | Parcial | Migrar a revisiones de Alembic versionadas y reversibles |

---

## 5. Tabla de Retiros Aprobados

| Función / Elemento a Retirar | Motivo Técnico del Retiro | Reemplazo Seguro / Preservación de Capacidad |
|---|---|---|
| Campos de código de seguridad (CVV/CVC) | Comportamiento inseguro por diseño y violación de PCI DSS; no se deben guardar en ningún sistema personal | Se conserva alias, emisor, últimos 4 dígitos y fecha de vencimiento cifrada (Opción B aprobada) |
| Variable fija de cotización de divisa sin advertencia | Los valores fijos en código simulan datos reales no confirmados | Se conserva el selector manual de tipo de cambio y se marca estado "requiere configuración" |
| Sesiones exclusivas en memoria de proceso único | No soportan reanudación tras reinicio ni escalamiento | Se reemplazan con sesiones en base de datos PostgreSQL con expiración y revocación remota |
