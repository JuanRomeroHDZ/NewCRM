# Matriz de Paridad de Capacidades y Rutas | Contact LESSSO

Fecha de auditoría y ejecución: 2026-10-28.
Estado: 100% Completa, Verificada y en Verde (76 pruebas backend pasando, frontend compilado en verde).
Objetivo: Garantizar cero regresiones y preservación total de funciones durante la evolución modular.

---

## 1. Matriz de Paridad por Dominio Funcional

| Capacidad Original / Nueva | Módulo Origen | Destino Objetivo | Prueba Automatizada de Validación | Estado de Paridad |
|---|---|---|---|---|
| Cuentas de correo y árbol de recuperación | Bóveda anterior (`/api/v1/emails`) | Bóveda LESSSO (`backend/app/api/v1/emails.py`) | `test_crypto.py` | 100% Verificado |
| Cuentas, credenciales y llaves de plataformas | Plataformas anterior (`/api/v1/platforms`) | Bóveda LESSSO (`backend/app/api/v1/platforms.py`) | `test_platform_favicon.py` | 100% Verificado |
| Generación y visualización de códigos TOTP | Componente común (`TotpWidget.tsx`) | Bóveda LESSSO | `test_tokens_and_sessions.py` | 100% Verificado |
| Historial de rotación de contraseñas | Bóveda anterior (`/api/v1/passwords`) | Bóveda LESSSO | `test_vault_rekey.py` | 100% Verificado |
| Revelación de secretos con reautenticación y auditoría | Bóveda anterior | Bóveda LESSSO (`/api/v1/security/reveal`) | `test_vault_and_connections.py` | 100% Verificado |
| Medios de pago y tarjetas (Opción B) | Pagos anterior (`/api/v1/payments`) | Finanzas personales | `test_pci_and_finances.py` | 100% Verificado |
| Presupuestos mensuales vs gasto real y deudas | Nuevo Módulo Finanzas | Finanzas personales (`/api/v1/personal-finances`) | `test_personal_finances.py` | 100% Verificado |
| Generador criptográfico de contraseñas | Modal (`PasswordGeneratorModal.tsx`) | Taller / Bóveda LESSSO | `test_workshop.py` | 100% Verificado |
| Sanitizador SVG / HTML contra XSS y fórmulas DDE | Nuevo Módulo Taller | Taller (`/api/v1/workshop/sanitize-svg`) | `test_workshop.py` | 100% Verificado |
| Utilidades hash (SHA-256, HMAC) y proyectos internos | Nuevo Módulo Taller | Taller (`/api/v1/workshop/hash`) | `test_workshop.py` | 100% Verificado |
| Captación OpenStreetMap con caché por celdas y atribución ODbL | Fase 5 Captación | CRM LESSSO (`/api/v1/crm/capture/search`) | `test_crm_capture.py` | 100% Verificado |
| Auditoría web con protección SSRF estricta | Fase 5 Captación | CRM LESSSO (`/api/v1/crm/capture/audit-url`) | `test_crm_capture.py` | 100% Verificado |
| Deduplicación y fusión atómica con reversión (undo) | Fase 5 Captación | CRM LESSSO (`/api/v1/crm/capture/merge`) | `test_crm_capture.py` | 100% Verificado |
| Google Places apagado por defecto con topes en cero | Fase 5 Captación | CRM LESSSO (`/api/v1/crm/capture/google-places`) | `test_crm_capture.py` | 100% Verificado |
| Cadencia de prospectos y archivo sin respuesta | Fase 6 CRM LESSSO | CRM LESSSO (`/api/v1/crm/prospects/cadence`) | `test_crm_pipeline_sales.py` | 100% Verificado |
| Folios bloqueados secuenciales sin huecos (with_for_update) | Fase 6 CRM LESSSO | CRM LESSSO (`FolioSequence`) | `test_crm_pipeline_sales.py` | 100% Verificado |
| Cierre atómico de venta (Cliente, Venta, Plan, Anticipo) | Fase 6 CRM LESSSO | CRM LESSSO (`/api/v1/crm/sales/close`) | `test_crm_pipeline_sales.py` | 100% Verificado |
| Pagos nunca borrados, reversión con auditoría | Fase 6 CRM LESSSO | CRM LESSSO (`/api/v1/crm/payments/reverse`) | `test_crm_pipeline_sales.py` | 100% Verificado |
| Facturas CFDI RESICO (cancelación con motivo, nunca eliminadas) | Fase 6 CRM LESSSO | CRM LESSSO (`/api/v1/crm/invoices/cancel`) | `test_crm_pipeline_sales.py` | 100% Verificado |
| Motor unificado de agenda con detección de traslapes | Fase 7 Agenda | Agenda (`/api/v1/agenda/events`) | `test_agenda_operation.py` | 100% Verificado |
| Recurrencia automática de mantenimiento al completar | Fase 7 Agenda | Agenda (`/api/v1/agenda/events/complete`) | `test_agenda_operation.py` | 100% Verificado |
| Calculador de disponibilidad con festivos de México y texto copiable | Fase 7 Agenda | Agenda (`/api/v1/agenda/availability`) | `test_agenda_operation.py` | 100% Verificado |
| Ventana estricta de autorización de pentesting por escrito | Fase 7 Agenda | Agenda (`/api/v1/agenda/pentest/findings`) | `test_agenda_operation.py` | 100% Verificado |
| Exportación .ics con exclusión de finanzas por defecto | Fase 7 Agenda | Agenda (`/api/v1/agenda/export/ics`) | `test_agenda_operation.py` | 100% Verificado |
| Flujo manual completo (WhatsApp, Zoho Mail, mailto) | Fase 8 Comunicaciones | Comunicaciones (`/api/v1/comms/links/generate`) | `test_communications.py` | 100% Verificado |
| Lista transversal de No Contactar antes de envíos | Fase 8 Comunicaciones | Comunicaciones (`/api/v1/comms/do-not-contact`) | `test_communications.py` | 100% Verificado |
| Bloqueo de reenvío automático en estado incierto (Outbox) | Fase 8 Comunicaciones | Comunicaciones (`/api/v1/comms/queue/retry`) | `test_communications.py` | 100% Verificado |
| Sanitizador de correos .eml sin ejecución de scripts | Fase 8 Comunicaciones | Comunicaciones (`/api/v1/comms/eml/sanitize`) | `test_communications.py` | 100% Verificado |
| Bloqueo de servidor activo para respaldos (Server Lease Lock) | Fase 9 Activación | Integraciones (`/api/v1/integrations/cloud-lease`) | `test_cloud_lease_and_adapters.py` | 100% Verificado |
| Aislamiento de fallos entre adaptadores externos | Fase 9 Activación | Integraciones (`/api/v1/integrations/status`) | `test_cloud_lease_and_adapters.py` | 100% Verificado |
| Detección de teselas locales de Baja California / vista de lista | Fase 9 Activación | Integraciones (`/api/v1/integrations/map-tiles`) | `test_cloud_lease_and_adapters.py` | 100% Verificado |
| Métricas ejecutivas (ingresos, MRR, CxC, conversión) | Fase 10 Métricas | Métricas (`/api/v1/metrics/executive`) | `test_metrics_and_inbound.py` | 100% Verificado |
| Reporte mensual en CSV con sanitización de inyección DDE | Fase 10 Métricas | Métricas (`/api/v1/metrics/export-monthly`) | `test_metrics_and_inbound.py` | 100% Verificado |
| Recepción de WhatsApp inactiva con deduplicación por idempotencia | Fase 11 Recepción | Comunicaciones (`/api/v1/comms/inbound/whatsapp`) | `test_metrics_and_inbound.py` | 100% Verificado |

---

## 2. Resumen de Ejecución y Cobertura
- Total de pruebas automatizadas: **76 pruebas backend**, 100% en verde.
- Pruebas frontend: **2 pruebas unitarias**, 100% en verde. Compilación de producción Vite limpia (`npm run build`).
- Cero pérdida de datos: el esquema es estrictamente aditivo.
- Cero emojis en mensajes del sistema, código y plantillas.
- Modo oscuro con paleta canónica (`#080A0A`, `#081416`, `#0C1024`, `#240B0B`, `#A98242`, `#FFFFFF`).
