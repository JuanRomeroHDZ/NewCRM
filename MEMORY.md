# Mapa Integral de Archivos y Componentes | Contact LESSSO

Fecha de actualización: 2026-10-28.
Estado: 100% de fases completadas (Fases 0 a 11) con 76 pruebas backend pasando y frontend compilando limpiamente.

---

## 1. Documentación de Gobierno y Especificación
- `README.md`: Resumen ejecutivo del sistema, arquitectura DevSecOps y estado de fases.
- `MEMORY.md`: Este mapa integral de archivos con la función de cada elemento en una línea.
- `DECISIONS.md`: Registro histórico de decisiones arquitectónicas y de negocio aprobadas.
- `VERSIONES.md`: Registro de versiones estables de software, fuentes oficiales y fechas de consulta.
- `REQUISITOS.md`: Matriz de integraciones, costos, alternativas manuales y estado inicial.
- `CHANGELOG.md`: Bitácora cronológica de cambios técnicos y verificaciones realizadas.
- `RUNBOOK.md`: Manual operativo para contingencias, apagones, traspaso de servidores y certificados.
- `SEGURIDAD.md`: Clasificación formal de datos (A, B, C, D), criptografía y derechos de privacidad.
- `GLOSARIO.md`: Definiciones claras de términos comerciales, técnicos y del régimen fiscal RESICO.
- `INVENTARIO.md`: Diagnóstico del entorno técnico, dependencias y bases binarias analizadas.
- `INVENTARIO_FUNCIONES.md`: Catálogo completo de pantallas, rutas, widgets, acciones y disposiciones.
- `MATRIZ_PARIDAD.md`: Mapeo de preservación funcional, pruebas de humo y estado de paridad.
- `HALLAZGOS.md`: Informe consolidado de riesgos de seguridad, arquitectura y accesibilidad.
- `PLAN_MIGRACION.md`: Estrategia de evolución modular no destructiva y planes de reversión.
- `ESTRUCTURA_OBJETIVO.md`: Árbol de carpetas objetivo para backend, frontend y servicios de soporte.
- `MAPA_NAVEGACION.md`: Jerarquía de pantallas, menús y atajos de accesibilidad.
- `.env.example`: Plantilla de variables de infraestructura limpias sin secretos reales.

## 2. Infraestructura y Despliegue
- `docker-compose.yml`: Orquestación multi-contenedor con redes segmentadas y verificaciones de salud.
- `nginx/Dockerfile`: Contenedor Nginx Alpine para terminación TLS local y proxy inverso.
- `nginx/default.conf`: Configuración de rate-limiting, cabeceras seguras CSP, HTTPS 443 y balanceo.
- `nginx/certs/`: Autoridad Certificadora (CA) privada y certificados locales para `lessso-srv` y `localhost`.
- `scripts/generate_certs.sh`: Script automatizado para emitir certificados locales X.509.

## 3. Backend (FastAPI, SQLAlchemy, Criptografía)
- `backend/app/main.py`: Punto de entrada de FastAPI, inclusión de routers modulares y ciclo de vida.
- `backend/app/config.py`: Parámetros validados con Pydantic v2 (`SERVER_NAME=lessso-srv`, `ALLOWED_LOCAL_CIDR`).
- `backend/app/database.py`: Motor asíncrono SQLAlchemy y generador de sesiones `AsyncSession`.
- `backend/app/models/core.py`: Modelos de usuarios, sesiones, parámetros, cola de trabajos y actividad.
- `backend/app/models/finances.py`: Modelos de presupuestos mensuales, deudas y amortizaciones.
- `backend/app/models/crm_capture.py`: Celdas de caché OSM, auditorías web, candidatos duplicados y descartes.
- `backend/app/models/crm_sales.py`: Folios bloqueados, clientes, propuestas, ventas, pagos y facturas CFDI RESICO.
- `backend/app/models/agenda.py`: Eventos unificados, tareas operativas, activos de clientes y pentesting.
- `backend/app/models/communications.py`: Hilos unificados, mensajes, lista de no contactar y configuraciones.
- `backend/app/models/cloud_lease.py`: Arrendamiento exclusivo de servidor activo para respaldos en la nube.
- `backend/app/models/inbound_whatsapp.py`: Deduplicación e idempotencia para mensajes entrantes de WhatsApp.
- `backend/app/services/core_auth.py`: Autenticación Argon2id, bloqueo temporal y sesiones en base de datos.
- `backend/app/services/config_service.py`: Catálogos modulares y exportación/importación sanitizada.
- `backend/app/services/workshop_sanitizer.py`: Sanitización SVG/HTML contra XSS y neutralización de inyección DDE.
- `backend/app/services/crm_capture.py`: Cliente OSM, auditor con protección SSRF estricta y deduplicación.
- `backend/app/services/crm_sales.py`: Cadencia de prospectos, folios sin huecos, cierre atómico y reversión de pagos.
- `backend/app/services/agenda_service.py`: Detección de traslapes, disponibilidad, festivos México, pentesting e ICS.
- `backend/app/services/communications_service.py`: Enlaces manuales, lista No Contactar, sanitizador EML y cola outbox.
- `backend/app/services/cloud_lease.py`: Bloqueo de servidor activo, teselas locales de Baja California y aislamiento.
- `backend/app/services/metrics_service.py`: Métricas ejecutivas (ingresos, MRR, CxC) y exportación de reporte CSV sanitizado.
- `backend/app/services/inbound_whatsapp.py`: Adaptador pull intermedio con deduplicación por hash SHA-256.

## 4. Controladores API REST (`backend/app/api/v1/`)
- `auth.py`, `users.py`, `system_config.py`, `jobs.py`, `activity.py`: Módulo Núcleo y Sistema.
- `emails.py`, `platforms.py`, `passwords.py`, `security.py`, `vault_backup.py`: Módulo Bóveda.
- `finances.py`, `personal_finances.py`, `exchange.py`: Módulo Finanzas Personales y Comerciales.
- `workshop.py`: Módulo Taller (utilidades criptográficas, sanitizador, proyectos).
- `crm_capture.py`: Módulo Captación LESSSO (OSM, auditor web, zonas de Tijuana, deduplicación).
- `crm_sales.py`: Módulo CRM LESSSO (propuestas, ventas, planes de pago, facturas CFDI).
- `agenda.py`: Módulo Agenda y Operación (eventos, disponibilidad, pentesting, exportación ICS).
- `communications.py`: Módulo Comunicaciones (hilos, mensajes manuales, plantillas, No Contactar).
- `integrations.py`: Módulo Integraciones (bloqueo de servidor, teselas locales, pruebas aisladas).
- `metrics_and_inbound.py`: Módulo Métricas Ejecutivas y Recepción WhatsApp inactiva.

## 5. Pruebas Automatizadas Backend (76 pruebas en verde)
- `tests/test_core_infrastructure.py`: Autenticación, bloqueo temporal, sesiones y eventos.
- `tests/test_vault_and_connections.py`: Revelación de secretos con reautenticación y grafo.
- `tests/test_personal_finances.py`: Presupuestos mensuales, amortización de deudas y control de acceso.
- `tests/test_workshop.py`: Hash, generador de contraseñas, sanitizador SVG y proyectos.
- `tests/test_crm_capture.py`: Caché OSM, protección SSRF, fusión y reversión de duplicados, Google Places.
- `tests/test_crm_pipeline_sales.py`: Cadencia a sin respuesta, folios sin huecos, venta atómica, reversión de pagos y cancelación de facturas.
- `tests/test_agenda_operation.py`: Recurrencia automática de mantenimiento, traslapes, disponibilidad, pentesting e ICS.
- `tests/test_communications.py`: Flujo manual, bloqueo No Contactar, mensaje incierto no reenvía, plantillas y EML.
- `tests/test_cloud_lease_and_adapters.py`: Bloqueo por servidor activo (lease lock), teselas locales y aislamiento.
- `tests/test_metrics_and_inbound.py`: Métricas ejecutivas, CSV sanitizado contra DDE y deduplicación de WhatsApp.

## 6. Frontend (React 18, TypeScript, Tailwind CSS)
- Tokens de diseño semánticos aplicados con paleta canónica `#080A0A`, `#081416`, `#0C1024`, `#240B0B`, `#A98242`, `#FFFFFF`.
- Tipografía local configurada (Lora Bold, Poppins).
- Cero emojis en textos del sistema.
- Compilación de producción Vite limpia (`npm run build`).
