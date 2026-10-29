# Matriz de paridad de rutas

Inventario inicial generado de los decoradores. Ninguna entrada se declara migrada; la prueba de humo y la ubicación definitiva deben completarse antes de cerrar cada fase.

| Ruta original | Destino propuesto | Prueba de humo | Estado |
|---|---|---|---|
| `GET /api/v1/audit/logs` | Sistema/Actividad | Pendiente: verificar `get_audit_logs` | Pendiente |
| `GET /api/v1/auth/status` | Sistema | Pendiente: verificar `get_vault_status` | Pendiente |
| `POST /api/v1/auth/setup` | Sistema | Pendiente: verificar `setup_master_password` | Pendiente |
| `POST /api/v1/auth/unlock` | Sistema | Pendiente: verificar `unlock_vault` | Pendiente |
| `POST /api/v1/auth/lock` | Sistema | Pendiente: verificar `lock_vault` | Pendiente |
| `GET /api/v1/emails` | Bóveda | Pendiente: verificar `list_emails` | Pendiente |
| `GET /api/v1/emails/{email_id}` | Bóveda | Pendiente: verificar `get_email_detail` | Pendiente |
| `POST /api/v1/emails` | Bóveda | Pendiente: verificar `create_email` | Pendiente |
| `PUT /api/v1/emails/{email_id}` | Bóveda | Pendiente: verificar `update_email` | Pendiente |
| `DELETE /api/v1/emails/{email_id}` | Bóveda | Pendiente: verificar `delete_email_soft` | Pendiente |
| `GET /api/v1/exchange` | Finanzas | Pendiente: verificar `get_exchange_rate` | Pendiente |
| `POST /api/v1/exchange/manual` | Finanzas | Pendiente: verificar `set_manual_exchange_rate` | Pendiente |
| `POST /api/v1/exchange/sync` | Finanzas | Pendiente: verificar `trigger_exchange_rate_sync` | Pendiente |
| `GET /api/v1/finances/incomes` | Finanzas, CRM y Taller | Pendiente: verificar `list_incomes` | Pendiente |
| `POST /api/v1/finances/incomes` | Finanzas, CRM y Taller | Pendiente: verificar `create_income` | Pendiente |
| `POST /api/v1/finances/incomes/{income_id}/clone-next-month` | Finanzas, CRM y Taller | Pendiente: verificar `clone_income_next_month` | Pendiente |
| `PUT /api/v1/finances/incomes/{income_id}` | Finanzas, CRM y Taller | Pendiente: verificar `update_income` | Pendiente |
| `DELETE /api/v1/finances/incomes/{income_id}` | Finanzas, CRM y Taller | Pendiente: verificar `delete_income` | Pendiente |
| `GET /api/v1/finances/renewals` | Finanzas, CRM y Taller | Pendiente: verificar `list_renewals` | Pendiente |
| `POST /api/v1/finances/renewals` | Finanzas, CRM y Taller | Pendiente: verificar `create_renewal` | Pendiente |
| `PUT /api/v1/finances/renewals/{renewal_id}` | Finanzas, CRM y Taller | Pendiente: verificar `update_renewal` | Pendiente |
| `POST /api/v1/finances/renewals/{renewal_id}/advance-cycle` | Finanzas, CRM y Taller | Pendiente: verificar `advance_renewal_cycle` | Pendiente |
| `DELETE /api/v1/finances/renewals/{renewal_id}` | Finanzas, CRM y Taller | Pendiente: verificar `delete_renewal` | Pendiente |
| `GET /api/v1/finances/expenses` | Finanzas, CRM y Taller | Pendiente: verificar `list_expenses` | Pendiente |
| `POST /api/v1/finances/expenses` | Finanzas, CRM y Taller | Pendiente: verificar `create_expense` | Pendiente |
| `PUT /api/v1/finances/expenses/{expense_id}` | Finanzas, CRM y Taller | Pendiente: verificar `update_expense` | Pendiente |
| `DELETE /api/v1/finances/expenses/{expense_id}` | Finanzas, CRM y Taller | Pendiente: verificar `delete_expense` | Pendiente |
| `GET /api/v1/finances/projects` | Finanzas, CRM y Taller | Pendiente: verificar `list_projects` | Pendiente |
| `POST /api/v1/finances/projects` | Finanzas, CRM y Taller | Pendiente: verificar `create_project` | Pendiente |
| `PUT /api/v1/finances/projects/{project_id}` | Finanzas, CRM y Taller | Pendiente: verificar `update_project` | Pendiente |
| `DELETE /api/v1/finances/projects/{project_id}` | Finanzas, CRM y Taller | Pendiente: verificar `delete_project` | Pendiente |
| `GET /api/v1/finances/resources` | Finanzas, CRM y Taller | Pendiente: verificar `list_resources` | Pendiente |
| `POST /api/v1/finances/resources` | Finanzas, CRM y Taller | Pendiente: verificar `create_resource` | Pendiente |
| `PUT /api/v1/finances/resources/{resource_id}` | Finanzas, CRM y Taller | Pendiente: verificar `update_resource` | Pendiente |
| `DELETE /api/v1/finances/resources/{resource_id}` | Finanzas, CRM y Taller | Pendiente: verificar `delete_resource` | Pendiente |
| `GET /api/v1/graph` | Sistema/Conexiones | Pendiente: verificar `get_graph` | Pendiente |
| `GET /health` | Sistema | Pendiente: verificar `health_check` | Pendiente |
| `POST /api/v1/importer/batch` | Bóveda | Pendiente: verificar `batch_import_vault` | Pendiente |
| `GET /api/v1/passwords/generate` | Bóveda | Pendiente: verificar `generate_password` | Pendiente |
| `GET /api/v1/passwords/vault` | Bóveda | Pendiente: verificar `get_all_vault_credentials` | Pendiente |
| `GET /api/v1/passwords/history/{target_id}` | Bóveda | Pendiente: verificar `get_password_history` | Pendiente |
| `GET /api/v1/payments` | Finanzas y Bóveda | Pendiente: verificar `list_payment_methods` | Pendiente |
| `POST /api/v1/payments` | Finanzas y Bóveda | Pendiente: verificar `create_payment_method` | Pendiente |
| `PUT /api/v1/payments/{payment_id}` | Finanzas y Bóveda | Pendiente: verificar `update_payment_method` | Pendiente |
| `DELETE /api/v1/payments/{payment_id}` | Finanzas y Bóveda | Pendiente: verificar `delete_payment_method` | Pendiente |
| `GET /api/v1/platforms/billing-history` | Bóveda y Finanzas | Pendiente: verificar `get_billing_history` | Pendiente |
| `POST /api/v1/platforms/process-subscriptions` | Bóveda y Finanzas | Pendiente: verificar `trigger_process_due_subscriptions` | Pendiente |
| `GET /api/v1/platforms` | Bóveda y Finanzas | Pendiente: verificar `list_platforms` | Pendiente |
| `GET /api/v1/platforms/{platform_id}` | Bóveda y Finanzas | Pendiente: verificar `get_platform_detail` | Pendiente |
| `POST /api/v1/platforms` | Bóveda y Finanzas | Pendiente: verificar `create_platform` | Pendiente |
| `PUT /api/v1/platforms/{platform_id}` | Bóveda y Finanzas | Pendiente: verificar `update_platform` | Pendiente |
| `DELETE /api/v1/platforms/{platform_id}` | Bóveda y Finanzas | Pendiente: verificar `delete_platform_soft` | Pendiente |
| `GET /api/v1/platforms/{platform_id}/secret` | Bóveda y Finanzas | Pendiente: verificar `get_single_secret` | Pendiente |
| `POST /api/v1/platforms/{platform_id}/totp` | Bóveda y Finanzas | Pendiente: verificar `setup_platform_totp` | Pendiente |
| `GET /api/v1/platforms/{platform_id}/totp` | Bóveda y Finanzas | Pendiente: verificar `get_platform_totp` | Pendiente |
| `DELETE /api/v1/platforms/{platform_id}/totp` | Bóveda y Finanzas | Pendiente: verificar `delete_platform_totp` | Pendiente |
| `GET /api/v1/prospects` | CRM | Pendiente: verificar `list_prospects` | Pendiente |
| `GET /api/v1/prospects/{prospect_id}` | CRM | Pendiente: verificar `get_prospect_detail` | Pendiente |
| `POST /api/v1/prospects` | CRM | Pendiente: verificar `create_prospect` | Pendiente |
| `PUT /api/v1/prospects/{prospect_id}` | CRM | Pendiente: verificar `update_prospect` | Pendiente |
| `POST /api/v1/prospects/{prospect_id}/contact-attempt` | CRM | Pendiente: verificar `record_prospect_contact_attempt` | Pendiente |
| `POST /api/v1/prospects/{prospect_id}/reactivate` | CRM | Pendiente: verificar `reactivate_cold_prospect` | Pendiente |
| `POST /api/v1/prospects/{prospect_id}/recycle-demo` | CRM | Pendiente: verificar `recycle_prospect_demo` | Pendiente |
| `POST /api/v1/prospects/{prospect_id}/respond` | CRM | Pendiente: verificar `mark_prospect_responded` | Pendiente |
| `POST /api/v1/prospects/{prospect_id}/reset-timer` | CRM | Pendiente: verificar `reset_prospect_timer` | Pendiente |
| `DELETE /api/v1/prospects/{prospect_id}` | CRM | Pendiente: verificar `delete_prospect_soft` | Pendiente |
| `GET /api/v1/security/health` | Bóveda/Seguridad | Pendiente: verificar `get_security_health_audit` | Pendiente |
| `GET /api/v1/security/emergency-kit` | Bóveda/Seguridad | Pendiente: verificar `generate_emergency_kit` | Pendiente |
| `POST /api/v1/security/check-pwned` | Bóveda/Seguridad | Pendiente: verificar `check_password_pwned` | Pendiente |
| `GET /api/v1/settings` | Sistema/Configuración | Pendiente: verificar `get_settings` | Pendiente |
| `PUT /api/v1/settings` | Sistema/Configuración | Pendiente: verificar `update_settings` | Pendiente |
| `GET /api/v1/settings/export` | Sistema/Configuración | Pendiente: verificar `export_vault` | Pendiente |
| `GET /api/v1/trash` | Sistema/Papelera | Pendiente: verificar `list_trash` | Pendiente |
| `POST /api/v1/trash/restore/{item_type}/{item_id}` | Sistema/Papelera | Pendiente: verificar `restore_item` | Pendiente |
| `DELETE /api/v1/trash/purge/{item_type}/{item_id}` | Sistema/Papelera | Pendiente: verificar `purge_item_permanent` | Pendiente |
| `GET /api/v1/trash/audit` | Sistema/Papelera | Pendiente: verificar `list_audit_logs` | Pendiente |
| `POST /api/v1/vault/export-encrypted` | Bóveda | Pendiente: verificar `export_encrypted_vault` | Pendiente |
| `POST /api/v1/vault/restore-encrypted` | Bóveda | Pendiente: verificar `restore_encrypted_vault` | Pendiente |
