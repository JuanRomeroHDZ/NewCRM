# Estado de Pendientes de NewCRM

## Completado y verificado

- **Configuración sin valores fijos en código (`config.py`, `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml`, `api.ts`, `prospectUtils.ts`, `MapCaptureView.tsx`, `EmailModal.tsx`, `PaymentModal.tsx`)**:
  - Parámetros de mapa (`MAP_DEFAULT_*`, `MAP_MAX_SEARCH_AREA_DEG`, `MAP_FULL_BOUNDS_ZONE_SLUG`, atribución OpenStreetMap/ODbL, `LOCAL_TILES_DIR`), API (`VITE_API_BASE_URL`), divisas (`DEFAULT_CURRENCY`), integraciones (`PWNED_*`, `FAVICON_FALLBACK_URL_TEMPLATE`, `WHATSAPP_SHARE_BASE_URL`, `ZOHO_MAIL_COMPOSE_URL`), agenda (`AGENDA_WORK_*`), políticas por defecto (`DEFAULT_*`) y costos estimados externalizados a configuración/variables de entorno.
  - Arranque fail-fast verificado ante ausencia de secretos obligatorios (`SERVER_SECRET_KEY`, `INITIAL_OWNER_PASSWORD`, `FALLBACK_USD_MXN_RATE`).

- **Validación profunda y autorización coherente en backend y frontend**:
  - Validador común en [validators.py](backend/app/schemas/validators.py) (`validate_calendar_date`, `validate_year_month`, `validate_single_phone`, `validate_phone_list`, `validate_rfc_input`, `normalize_and_validate_card_digits`, `validate_card_consistency`, `validate_service_dates_order`).
  - Esquemas y rutas endurecidos en `auth.py`, `users.py`, `platforms.py`, `payments.py`, `importer.py`, `settings.py`, `agenda.py`, `communications.py`, `workshop.py`, `integrations.py`, `vault_backup.py`, `crm_sales.py`, `crm_capture.py` y `personal_finances.py` (cifrado de notas en `Debt`/`DebtPayment` y migración de arranque en `main.py`).
  - Formularios de frontend sincronizados con validación consistente de teléfonos, fechas de servicio/calendario y tarjetas/expiración (`ProspectModal`, `PlatformModal`, `PaymentModal`).

- **Acceso de Operador y Roles separado de la Bóveda**:
  - Integrado en [OperatorAuthSection.tsx](frontend/src/components/settings/OperatorAuthSection.tsx) dentro de [SettingsView.tsx](frontend/src/components/views/SettingsView.tsx) y separado en [api.ts](frontend/src/lib/api.ts) (`X-Vault-Token` vs `Authorization: Bearer`): inicio/cierre de sesión, cambio de contraseña, activación/rotación 2FA (TOTP) y administración de usuarios/roles exclusiva para `owner`.

- **Interfaz, densidad visual, etiquetas e impresión/PDF**:
  - Estandarización de navegación (`Ver todos` / `Ver detalles`), simplificación de bordes en tarjetas anidadas (`SubscriptionsView`, `PasswordsView`) y reglas `@media print` en [index.css](frontend/src/index.css) con contraste negro sobre blanco para la hoja de recuperación.

- **Búsqueda en mapa OSM/Overpass y despliegue Compose verificados**:
  - Verificación completa en vivo contra stack Compose (`db` PostgreSQL, `redis`, `backend`, `frontend`, `proxy` HTTPS/Nginx), búsqueda real OSM (`6` resultados procesados en Zona Río) y guardado en Postgres, inspección headless en `250×250`, `542×800`, `390×844`, `768×1024` y `1440×900` sin desbordamiento horizontal, impresión PDF validada y escaneo `gitleaks` sin fugas.

## Notas operativas al desplegar

- Si el host conserva un volumen Docker previo (`emailsaver_postgres_data`) inicializado con otro usuario/contraseña de PostgreSQL o datos previos en SQLite (`backend/lessso.db`), respaldar/migrar esos datos antes de apuntar al volumen persistente definitivo.
- En sesiones donde `DOCKER_HOST` apunte a Podman, ejecutar `env -u DOCKER_HOST ./scripts/up.sh` para usar Docker Engine con Compose.
