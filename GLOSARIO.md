# Glosario de Términos del Sistema y del Negocio | Contact LESSSO

## 1. Términos del Negocio y Operación
- **LESSSO**: Nombre comercial de la marca de servicios tecnológicos, diseño web, desarrollo de software y ciberseguridad operada por el titular.
- **RESICO (Régimen Simplificado de Confianza)**: Régimen fiscal mexicano para personas físicas con actividades empresariales que ofrece tasas reducidas de ISR. La facturación se emite y timbra a través del portal del SAT o PAC externo; el sistema solo registra y almacena los metadatos y comprobantes (XML y PDF).
- **CFDI (Comprobante Fiscal Digital por Internet)**: Factura electrónica válida en México. Sus componentes clave son el folio fiscal (UUID), fecha, RFC emisor/receptor, conceptos e importes.
- **Prospecto**: Entidad comercial o persona física susceptible de adquirir servicios. Pasa por etapas de pipeline desde captación hasta cierre.
- **Cadencia de Seguimiento**: Frecuencia programada de contactos comerciales con intervalos crecientes y límite máximo de intentos antes de archivar por falta de respuesta.
- **SLA (Service Level Agreement)**: Plazo máximo comprometido para dar respuesta o seguimiento a un prospecto (por defecto 48 horas).
- **Pentesting (Pruebas de Penetración)**: Evaluación ofensiva de seguridad sobre activos digitales autorizados expresamente por escrito por el cliente, delimitada a una ventana de tiempo estricta.

## 2. Términos Técnicos y de Arquitectura
- **Bóveda (Vault)**: Módulo criptográfico aislado para el resguardo de credenciales maestras, correos, llaves de API y notas confidenciales.
- **Argon2id**: Función de derivación de claves robusta contra ataques de canal lateral y GPU, empleada para la contraseña maestra.
- **AES-256-GCM**: Algoritmo de cifrado simétrico autenticado con vector de inicialización único por registro para garantizar confidencialidad e integridad.
- **Session Token (`jti`)**: Identificador único aleatorio de sesión criptográfica registrado en la base de datos para posibilitar revocación instantánea.
- **SSRF (Server-Side Request Forgery)**: Vulnerabilidad en la que el servidor realiza peticiones no autorizadas hacia recursos internos. El sistema previene SSRF bloqueando todas las redes privadas y de metadatos.
- **Idempotencia**: Propiedad por la cual una operación ejecutada múltiples veces produce el mismo resultado sin efectos secundarios duplicados.
- **Cola de Salida con Estado Incierto**: Cola transaccional para mensajes hacia servicios externos donde, en caso de timeout ambiguo, el mensaje no se reintenta automáticamente para evitar duplicaciones.
- **Tokens Semánticos**: Variables de diseño (colores, espaciado, bordes) que desvinculan la interfaz de valores directos para asegurar consistencia estética y accesibilidad.
