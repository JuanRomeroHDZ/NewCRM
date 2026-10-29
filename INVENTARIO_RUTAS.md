# Inventario de rutas HTTP

Generado por inspección estática de los decoradores. El nombre de la función identifica el comportamiento a revisar; no demuestra que funcione ni que la paridad esté completa. Todas las rutas requieren verificación individual. La ruta raíz `GET /` de `backend/app/main.py` también debe conservarse.

| Método | Ruta | Función y ubicación | Datos principales | Destino previsto | Estado |
|---|---|---|---|---|---|
| GET | `/api/v1/audit/logs` | `get_audit_logs` en `backend/app/api/v1/audit.py:19` | eventos de auditoría | Sistema/Actividad; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/auth/status` | `get_vault_status` en `backend/app/api/v1/auth.py:20` | sesiones y configuración de acceso | Sistema; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/auth/setup` | `setup_master_password` en `backend/app/api/v1/auth.py:51` | sesiones y configuración de acceso | Sistema; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/auth/unlock` | `unlock_vault` en `backend/app/api/v1/auth.py:85` | sesiones y configuración de acceso | Sistema; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/auth/lock` | `lock_vault` en `backend/app/api/v1/auth.py:119` | sesiones y configuración de acceso | Sistema; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/emails` | `list_emails` en `backend/app/api/v1/emails.py:93` | cuentas de correo y recuperación | Bóveda; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/emails/{email_id}` | `get_email_detail` en `backend/app/api/v1/emails.py:115` | cuentas de correo y recuperación | Bóveda; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/emails` | `create_email` en `backend/app/api/v1/emails.py:128` | cuentas de correo y recuperación | Bóveda; conservar o mejorar | Sin prueba individual |
| PUT | `/api/v1/emails/{email_id}` | `update_email` en `backend/app/api/v1/emails.py:201` | cuentas de correo y recuperación | Bóveda; conservar o mejorar | Sin prueba individual |
| DELETE | `/api/v1/emails/{email_id}` | `delete_email_soft` en `backend/app/api/v1/emails.py:283` | cuentas de correo y recuperación | Bóveda; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/exchange` | `get_exchange_rate` en `backend/app/api/v1/exchange.py:15` | tipos de cambio | Finanzas; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/exchange/manual` | `set_manual_exchange_rate` en `backend/app/api/v1/exchange.py:38` | tipos de cambio | Finanzas; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/exchange/sync` | `trigger_exchange_rate_sync` en `backend/app/api/v1/exchange.py:74` | tipos de cambio | Finanzas; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/finances/incomes` | `list_incomes` en `backend/app/api/v1/finances.py:227` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/finances/incomes` | `create_income` en `backend/app/api/v1/finances.py:238` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/finances/incomes/{income_id}/clone-next-month` | `clone_income_next_month` en `backend/app/api/v1/finances.py:280` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| PUT | `/api/v1/finances/incomes/{income_id}` | `update_income` en `backend/app/api/v1/finances.py:342` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| DELETE | `/api/v1/finances/incomes/{income_id}` | `delete_income` en `backend/app/api/v1/finances.py:394` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/finances/renewals` | `list_renewals` en `backend/app/api/v1/finances.py:422` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/finances/renewals` | `create_renewal` en `backend/app/api/v1/finances.py:433` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| PUT | `/api/v1/finances/renewals/{renewal_id}` | `update_renewal` en `backend/app/api/v1/finances.py:479` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/finances/renewals/{renewal_id}/advance-cycle` | `advance_renewal_cycle` en `backend/app/api/v1/finances.py:539` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| DELETE | `/api/v1/finances/renewals/{renewal_id}` | `delete_renewal` en `backend/app/api/v1/finances.py:630` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/finances/expenses` | `list_expenses` en `backend/app/api/v1/finances.py:658` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/finances/expenses` | `create_expense` en `backend/app/api/v1/finances.py:669` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| PUT | `/api/v1/finances/expenses/{expense_id}` | `update_expense` en `backend/app/api/v1/finances.py:706` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| DELETE | `/api/v1/finances/expenses/{expense_id}` | `delete_expense` en `backend/app/api/v1/finances.py:754` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/finances/projects` | `list_projects` en `backend/app/api/v1/finances.py:782` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/finances/projects` | `create_project` en `backend/app/api/v1/finances.py:795` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| PUT | `/api/v1/finances/projects/{project_id}` | `update_project` en `backend/app/api/v1/finances.py:835` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| DELETE | `/api/v1/finances/projects/{project_id}` | `delete_project` en `backend/app/api/v1/finances.py:887` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/finances/resources` | `list_resources` en `backend/app/api/v1/finances.py:915` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/finances/resources` | `create_resource` en `backend/app/api/v1/finances.py:926` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| PUT | `/api/v1/finances/resources/{resource_id}` | `update_resource` en `backend/app/api/v1/finances.py:961` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| DELETE | `/api/v1/finances/resources/{resource_id}` | `delete_resource` en `backend/app/api/v1/finances.py:1005` | ingresos, gastos, renovaciones, proyectos y recursos | Finanzas, CRM y Taller; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/graph` | `get_graph` en `backend/app/api/v1/graph.py:11` | relaciones entre registros | Sistema/Conexiones; conservar o mejorar | Sin prueba individual |
| GET | `/health` | `health_check` en `backend/app/api/v1/health.py:9` | estado de la base | Sistema; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/importer/batch` | `batch_import_vault` en `backend/app/api/v1/importer.py:29` | importación de cuentas | Bóveda; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/passwords/generate` | `generate_password` en `backend/app/api/v1/passwords.py:24` | contraseñas e historial | Bóveda; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/passwords/vault` | `get_all_vault_credentials` en `backend/app/api/v1/passwords.py:70` | contraseñas e historial | Bóveda; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/passwords/history/{target_id}` | `get_password_history` en `backend/app/api/v1/passwords.py:172` | contraseñas e historial | Bóveda; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/payments` | `list_payment_methods` en `backend/app/api/v1/payments.py:15` | medios de pago | Finanzas y Bóveda; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/payments` | `create_payment_method` en `backend/app/api/v1/payments.py:54` | medios de pago | Finanzas y Bóveda; conservar o mejorar | Sin prueba individual |
| PUT | `/api/v1/payments/{payment_id}` | `update_payment_method` en `backend/app/api/v1/payments.py:98` | medios de pago | Finanzas y Bóveda; conservar o mejorar | Sin prueba individual |
| DELETE | `/api/v1/payments/{payment_id}` | `delete_payment_method` en `backend/app/api/v1/payments.py:158` | medios de pago | Finanzas y Bóveda; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/platforms/billing-history` | `get_billing_history` en `backend/app/api/v1/platforms.py:200` | cuentas, credenciales y suscripciones | Bóveda y Finanzas; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/platforms/process-subscriptions` | `trigger_process_due_subscriptions` en `backend/app/api/v1/platforms.py:222` | cuentas, credenciales y suscripciones | Bóveda y Finanzas; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/platforms` | `list_platforms` en `backend/app/api/v1/platforms.py:230` | cuentas, credenciales y suscripciones | Bóveda y Finanzas; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/platforms/{platform_id}` | `get_platform_detail` en `backend/app/api/v1/platforms.py:268` | cuentas, credenciales y suscripciones | Bóveda y Finanzas; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/platforms` | `create_platform` en `backend/app/api/v1/platforms.py:281` | cuentas, credenciales y suscripciones | Bóveda y Finanzas; conservar o mejorar | Sin prueba individual |
| PUT | `/api/v1/platforms/{platform_id}` | `update_platform` en `backend/app/api/v1/platforms.py:382` | cuentas, credenciales y suscripciones | Bóveda y Finanzas; conservar o mejorar | Sin prueba individual |
| DELETE | `/api/v1/platforms/{platform_id}` | `delete_platform_soft` en `backend/app/api/v1/platforms.py:496` | cuentas, credenciales y suscripciones | Bóveda y Finanzas; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/platforms/{platform_id}/secret` | `get_single_secret` en `backend/app/api/v1/platforms.py:515` | cuentas, credenciales y suscripciones | Bóveda y Finanzas; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/platforms/{platform_id}/totp` | `setup_platform_totp` en `backend/app/api/v1/platforms.py:559` | cuentas, credenciales y suscripciones | Bóveda y Finanzas; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/platforms/{platform_id}/totp` | `get_platform_totp` en `backend/app/api/v1/platforms.py:584` | cuentas, credenciales y suscripciones | Bóveda y Finanzas; conservar o mejorar | Sin prueba individual |
| DELETE | `/api/v1/platforms/{platform_id}/totp` | `delete_platform_totp` en `backend/app/api/v1/platforms.py:604` | cuentas, credenciales y suscripciones | Bóveda y Finanzas; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/prospects` | `list_prospects` en `backend/app/api/v1/prospects.py:215` | prospectos y seguimiento | CRM; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/prospects/{prospect_id}` | `get_prospect_detail` en `backend/app/api/v1/prospects.py:265` | prospectos y seguimiento | CRM; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/prospects` | `create_prospect` en `backend/app/api/v1/prospects.py:286` | prospectos y seguimiento | CRM; conservar o mejorar | Sin prueba individual |
| PUT | `/api/v1/prospects/{prospect_id}` | `update_prospect` en `backend/app/api/v1/prospects.py:355` | prospectos y seguimiento | CRM; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/prospects/{prospect_id}/contact-attempt` | `record_prospect_contact_attempt` en `backend/app/api/v1/prospects.py:454` | prospectos y seguimiento | CRM; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/prospects/{prospect_id}/reactivate` | `reactivate_cold_prospect` en `backend/app/api/v1/prospects.py:507` | prospectos y seguimiento | CRM; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/prospects/{prospect_id}/recycle-demo` | `recycle_prospect_demo` en `backend/app/api/v1/prospects.py:537` | prospectos y seguimiento | CRM; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/prospects/{prospect_id}/respond` | `mark_prospect_responded` en `backend/app/api/v1/prospects.py:568` | prospectos y seguimiento | CRM; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/prospects/{prospect_id}/reset-timer` | `reset_prospect_timer` en `backend/app/api/v1/prospects.py:609` | prospectos y seguimiento | CRM; conservar o mejorar | Sin prueba individual |
| DELETE | `/api/v1/prospects/{prospect_id}` | `delete_prospect_soft` en `backend/app/api/v1/prospects.py:640` | prospectos y seguimiento | CRM; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/security/health` | `get_security_health_audit` en `backend/app/api/v1/security.py:34` | credenciales y evaluación de seguridad | Bóveda/Seguridad; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/security/emergency-kit` | `generate_emergency_kit` en `backend/app/api/v1/security.py:233` | credenciales y evaluación de seguridad | Bóveda/Seguridad; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/security/check-pwned` | `check_password_pwned` en `backend/app/api/v1/security.py:276` | credenciales y evaluación de seguridad | Bóveda/Seguridad; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/settings` | `get_settings` en `backend/app/api/v1/settings.py:19` | preferencias y configuración | Sistema/Configuración; conservar o mejorar | Sin prueba individual |
| PUT | `/api/v1/settings` | `update_settings` en `backend/app/api/v1/settings.py:54` | preferencias y configuración | Sistema/Configuración; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/settings/export` | `export_vault` en `backend/app/api/v1/settings.py:133` | preferencias y configuración | Sistema/Configuración; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/trash` | `list_trash` en `backend/app/api/v1/trash.py:23` | registros eliminados y actividad | Sistema/Papelera; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/trash/restore/{item_type}/{item_id}` | `restore_item` en `backend/app/api/v1/trash.py:108` | registros eliminados y actividad | Sistema/Papelera; conservar o mejorar | Sin prueba individual |
| DELETE | `/api/v1/trash/purge/{item_type}/{item_id}` | `purge_item_permanent` en `backend/app/api/v1/trash.py:202` | registros eliminados y actividad | Sistema/Papelera; conservar o mejorar | Sin prueba individual |
| GET | `/api/v1/trash/audit` | `list_audit_logs` en `backend/app/api/v1/trash.py:289` | registros eliminados y actividad | Sistema/Papelera; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/vault/export-encrypted` | `export_encrypted_vault` en `backend/app/api/v1/vault_backup.py:41` | exportación y restauración existentes | Bóveda; conservar o mejorar | Sin prueba individual |
| POST | `/api/v1/vault/restore-encrypted` | `restore_encrypted_vault` en `backend/app/api/v1/vault_backup.py:205` | exportación y restauración existentes | Bóveda; conservar o mejorar | Sin prueba individual |
