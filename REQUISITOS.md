# Matriz de Requisitos, Integraciones y Alternativas Manuales | Contact LESSSO

Fecha: 2026-10-28.
Principio: **La aplicación funciona completa y al 100 % sin ninguna integración externa activa.** Toda funcionalidad dependiente de terceros cuenta con alternativa manual local inmediata y sin coste.

---

## 1. Catálogo de Integraciones

| Integración | Módulo | Estado Inicial | Requisitos para Activación | Coste Estimado | Alternativa Manual Funcional |
|---|---|---|---|---|---|
| **OpenStreetMap (Nominatim)** | CRM (Captación) | Activa (local con límites y atribución) | Conectividad saliente en modo no local. Respeta 1 req/seg y cabecera User-Agent | Gratuita (ODbL) | Captura manual de fichas de prospectos y colonias |
| **Google Places API** | CRM (Captación) | Inactiva / Apagada por defecto | Clave de API de Google Cloud con facturación activa y topes en cero | Variable por consulta (con créditos gratuitos iniciales) | Búsqueda por OpenStreetMap e importación de CSV |
| **WhatsApp Business Cloud API** | Comunicaciones | Inactiva por defecto | Cuenta Meta Developers, Business Manager verificado, número de teléfono, Token Permanente | Tarifa por conversación Meta (según categoría) | Botón "Abrir en WhatsApp" (click-to-chat), copiar mensaje y registro de contacto con un clic |
| **Zoho Mail (Web Direct)** | Comunicaciones | Disponible | Navegador web en el mismo equipo | Incluido en el servicio de correo del usuario | Enlace `mailto:` estándar y copiado de plantilla con variables |
| **Correo Automatizado (SMTP/IMAP/OAuth)** | Comunicaciones | Inactivo por defecto | Credenciales de servidor SMTP/IMAP o aplicación OAuth configurada | Gratuito con el proveedor de correo | Redacción asistida, importación de archivos `.eml` y registro manual |
| **Telegram Bot API** | Comunicaciones / Sistema | Inactivo por defecto | Bot creado en @BotFather, Bot Token e ID de chat personal autorizado | Gratuito | Notificaciones en interfaz web y panel de actividad |
| **Google Calendar API** | Agenda | Inactiva por defecto | Proyecto en Google Cloud, credenciales OAuth 2.0 Web y autorización local | Gratuito | Exportación e importación manual de archivos de calendario estándar `.ics` |
| **Teselas de Mapa Locales** | CRM (Mapas) | Inactivas por defecto | Servidor local de teselas o paquete de archivos MBTiles de Baja California | Almacenamiento local (~500MB) | Vista de lista tabular filtrada por zona y colonia |
| **Respaldo en la Nube (Google Drive)** | Sistema | Inactivo por defecto | Cuenta de Google dedicada, credenciales de aplicación y carpeta privada | Gratuito (15 GB incluidos) | Respaldo local cifrado en disco duro secundario |
| **Certificados HTTPS Locales** | Sistema / Red | Autoridad privada activa | Generación de certificados con la CA raíz del sistema e instalación en dispositivos | Gratuito | Protocolo HTTP para entornos de prueba cerrados |

---

## 2. Requisitos de Infraestructura del Servidor
- **Sistema Operativo**: Ubuntu 26.04 LTS (o cualquier distribución Linux moderna compatible con Docker).
- **Procesador y Memoria**: 2 núcleos de CPU, 4 GB de memoria RAM (mínimo recomendado para contenedores PostgreSQL, Nginx, Backend y Frontend).
- **Almacenamiento**: Al menos 20 GB de espacio disponible en disco para base de datos y volumen de medios.
- **Red**: Interfaz de red local conectada a router con asignación estática o reserva DHCP para `lessso-srv`.
