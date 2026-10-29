# Política Integral de Seguridad y Privacidad de Datos | Contact LESSSO

## 1. Clasificación de Datos

Toda entidad e información manipulada por el sistema se clasifica estrictamente en cuatro niveles:

| Nivel de Clasificación | Definición y Ejemplos | Reglas de Almacenamiento, Consulta y Visualización |
|---|---|---|
| **Clase A: Secretos Críticos** | Contraseñas, claves de API, secretos TOTP, tokens OAuth, datos de medios de pago autorizados (Opción B) | Cifrado simétrico AES-256-GCM por registro. Quedan excluidos de búsquedas globales, registros de log, exportaciones abiertas y mapa de conexiones. En interfaces se muestran enmascarados; su revelación exige reautenticación y queda registrada en auditoría. |
| **Clase B: Financieros y Personales** | Ingresos, presupuestos, gastos, deudas, RFC, comprobantes fiscales, contratos y documentos de clientes | Cifrado a nivel de campo para campos sensibles. Indexación y búsqueda permitida solo por campos no sensibles (alias, fechas, conceptos generales). Las bitácoras registran mutaciones redactadas ("se modificó presupuesto") sin valores brutos. |
| **Clase C: Negocio y Contacto** | Nombre de prospectos, clientes, teléfonos, correos comerciales, notas de seguimiento | Protegidos por permisos de rol. Teléfonos y correos enmascarados para roles sin autorización de contacto. Indexables en el motor de búsqueda global. Contenido de mensajes solo indexable si el usuario lo activa explícitamente. |
| **Clase D: No Sensibles** | Catálogos de configuración, etapas de pipeline, plantillas estándar, etiquetas y tipos de servicios | Sin restricciones criptográficas especiales; accesibles para lectura por los roles autorizados. |

---

## 2. Arquitectura Criptográfica y Gestión de Claves

1. **Derivación de Clave Maestra**: Se utiliza **Argon2id** (iteraciones y memoria según recomendaciones OWASP) con sal criptográfica única almacenada en `user_settings`.
2. **Cifrado en Reposo**:
   - Algoritmo: **AES-256-GCM** autenticado.
   - Vector de Inicialización (IV): 12 bytes aleatorios generados de forma independiente por cada operación de cifrado y prefijados al texto cifrado (`enc:v1:...`).
   - Autenticación: Tag de integridad de 16 bytes que previene modificaciones maliciosas o silenciosas en la base de datos.
3. **Recifrado Atómico (`rekey.py`)**:
   - Al cambiar la contraseña maestra, una transacción única descifra todos los registros con la clave previa y los recifra con la nueva clave derivada.
   - Si un solo registro genera error de integridad, la operación se revierte por completo (`ROLLBACK`) manteniendo la contraseña anterior sin corrupción.
4. **Higiene de Memoria y Portapapeles**:
   - La clave derivada reside únicamente en memoria durante el tiempo de sesión activa.
   - Al bloquear la bóveda o expirar el temporizador, la clave se sobrescribe y purga.
   - El portapapeles se limpia automáticamente tras $N$ segundos configurables (por defecto 30 segundos).

---

## 3. Autenticación, Sesiones y Roles

- **Control de Intentos Fallidos**: Se impone bloqueo progresivo temporal tras 5 intentos fallidos consecutivos por origen IP y cuenta.
- **Mensajes Genéricos**: El sistema responde siempre "Credenciales incorrectas o cuenta bloqueada" para impedir la enumeración de usuarios.
- **Sesiones en Base de Datos**: Cada sesión genera un token aleatorio con `jti`. Se valida contra la tabla de sesiones en PostgreSQL. La invocación de cierre (`/auth/lock`) invalida de forma inmediata la sesión en base de datos.
- **Verificación en Dos Pasos (2FA/TOTP)**: Algoritmo RFC 6238 con códigos de respaldo de un solo uso para administradores.
- **Matriz de Permisos por Rol**:
  - `Propietario`: Acceso completo a Núcleo, Bóveda, Finanzas, CRM, Agenda, Comunicaciones y Taller.
  - `Administrador de Negocio`: CRM, Comunicaciones, Agenda y Taller; sin acceso a Bóveda ni Finanzas personales.
  - `Vendedor`: Acceso delimitado a sus prospectos asignados en CRM y Agenda.
  - `Solo Lectura`: Consulta de catálogos y reportes no sensibles sin capacidad de mutación.

---

## 4. Seguridad de Red y Prevención de SSRF

- **Red Local Única**: El sistema no expone puertos públicos a internet. La comunicación con clientes ocurre exclusivamente dentro de la red local (LAN) bajo TLS 1.3 con certificados emitidos por la CA privada local.
- **Prevención de SSRF (Llamadas Salientes)**:
  - Todo validador de URL externa (auditoría de sitios de clientes, favicons) resuelve la dirección IP antes de conectar.
  - Se rechazan terminantemente conexiones dirigidas a:
    - Loopback: `127.0.0.0/8`, `::1`
    - Redes privadas (RFC 1918): `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
    - Direcciones de enlace local y API de metadatos de nube: `169.254.0.0/16`, `fe80::/10`
  - Se establecen límites estrictos: tiempo máximo de respuesta (5s), tamaño máximo de carga (2MB) y máximo de 2 redirecciones validadas.

---

## 5. Privacidad y Derechos ARCO

- El sistema cuenta con formulario y bitácora interna para atender solicitudes de Acceso, Rectificación, Cancelación y Oposición (ARCO).
- La eliminación definitiva de prospectos y contactos desvincula y anonimiza las referencias cruzadas respetando los periodos legales de conservación fiscal para facturas del SAT (RESICO: 5 años).
