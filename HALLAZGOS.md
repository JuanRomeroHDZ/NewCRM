# Informe Consolidado de Hallazgos de Seguridad, Arquitectura y UI/UX | Contact LESSSO

Fecha de auditoría: 2026-10-28.
Estado: Auditado y documentado con plan de remediación integral.

---

## 1. Seguridad de Credenciales y Repositorio Git

### Análisis con Gitleaks y Revisión Manual de Commits
- **Escáner utilizado**: Gitleaks 8.18.4 (contenedor verificado previamente con muestra canaria ficticia).
- **Alcance**: 2 commits del historial local (`58c970a` y `3828915`).
- **Hallazgos detectados**:
  1. Commit `58c970a`, archivo `backend/app/seed_data.py`:
     - Clave de API de AWS simulada en datos de ejemplo (terminación: `...4567`).
     - Token personal de GitHub simulado (terminación: `...demo`).
     - Token de despliegue simulado (terminación: `...test`).
  2. Archivos binarios SQLite históricos:
     - En el commit `58c970a` se encontraban versionados `data.db` y `emailsaver.db`. Fueron retirados del árbol de trabajo en `3828915`, pero subsisten en los blobs del historial.
     - Contenían estructuras con campos `card_cvv` y direcciones de correo.
- **Acción recomendada**:
  - Asumir cualquier clave real análoga a los ejemplos como comprometida y rotarla en el proveedor respectivo.
  - Asegurar que `.gitignore` excluya de forma permanente `*.db`, `*.sqlite`, `*.sqlite3`, `backups/`, `.env` y certificados TLS.
  - Prohibir en el código la persistencia o recepción de códigos de seguridad CVV/CVC.

### Revisión de `.env.example`
- Se constató que `.env.example` utilizaba valores como `emailsaver_secret_pass` y semillas predecibles.
- **Remediación**: Sustituir todas las variables por marcadores vacíos o instrucciones descriptivas sin valores utilizables en producción.

---

## 2. Sesiones, Bóveda y Criptografía

- **Almacenamiento de sesiones en memoria volátil**: Las sesiones de desbloqueo residían en diccionarios de memoria por proceso Python. Un reinicio o concurrencia con múltiples procesos invalidaba el estado.
  - *Remediación*: Implementar almacenamiento de sesiones en PostgreSQL con revocación remota y tokens criptográficos `jti`.
- **Cifrado de datos y recifrado transaccional**: Anteriormente, el cambio de contraseña maestra no recifraba los registros históricos de notas y credenciales.
  - *Estado*: Se implementó recifrado atómico en `backend/app/security/rekey.py` con reversión ante fallos.
- **Enmascaramiento de secretos en API**: En la implementación previa, las respuestas JSON entregaban contraseñas completas en texto claro una vez desbloqueada la bóveda, confiando en el frontend para enmascararlas visualmente.
  - *Remediación*: Las respuestas de listado devolverán únicamente campos enmascarados; la revelación de un secreto específico exigirá una petición individual con reautenticación y quedará registrada en auditoría.

---

## 3. Red, Infraestructura y Exposición

- **Acceso por HTTP plano**: El proxy Nginx escuchaba originalmente en el puerto 80 sin cifrado TLS en tránsito en la red local.
  - *Remediación*: Configuración de autoridad certificadora privada local y emisión de certificados TLS para `lessso-srv` y dominios locales autorizados, forzando redirección HTTPS (puerto 443).
- **Protección contra SSRF en llamadas salientes**: Las funciones de obtención de favicons y futuras auditorías de sitios web de clientes carecían de filtrado de direcciones IP privadas.
  - *Remediación*: Validador estricto que rechaza direcciones loopback (`127.0.0.0/8`), redes privadas RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), enlace local (`169.254.0.0/16`) y metadatos de nube.

---

## 4. Datos Financieros y Política de Tarjetas

- **Política de Tarjetas (Decisión Opción B)**:
  - En cumplimiento de la decisión aprobada, el sistema no almacena ni migra números de tarjeta completos ni códigos de seguridad (CVV).
  - Se almacena exclusivamente: alias identificador, entidad emisora/banco, últimos 4 dígitos y fecha de vencimiento cifrada para alimentar recordatorios de la agenda.

---

## 5. Deficiencias de Interfaz (UI/UX) y Accesibilidad

- **Contraste y tokens de diseño dispersos**: Se utilizaban clases directas con opacidades que en pantallas de bajo brillo no cumplían el estándar WCAG AA (mínimo 4.5:1).
  - *Remediación*: Paleta canónica fija (fondo `#080A0A`, tarjetas `#081416`, barra navegación `#0C1024`, alerta peligro `#240B0B`, foco y acción `#A98242`, texto `#FFFFFF`).
- **Navegación por teclado incompleta**: Varios componentes dependían del cursor del ratón (como el lienzo de conexiones y ciertos botones de acción rápida).
  - *Remediación*: Soporte integral de foco visible dorado `#A98242`, atajos accesibles y navegación por teclado en listas alternativas.
- **Tipografías dependientes de CDN**: Se detectó carga de Google Fonts desde `fonts.googleapis.com` en `index.html`.
  - *Remediación*: Integrar tipografías Lora y Poppins servidas localmente desde el paquete estático sin peticiones a terceros.
