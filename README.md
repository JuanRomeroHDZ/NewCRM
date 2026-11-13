# Contact | LESSSO

Sistema personal integral con Bóveda de credenciales, Finanzas personales y comerciales, CRM de captación y ventas, Comunicaciones unificadas, Agenda operativa y Taller de herramientas.

Plataforma web autohospedada (self-hosted) diseñada para operar exclusivamente en red local bajo estrictos estándares de aislamiento DevSecOps, protección criptográfica en reposo (AES-256-GCM y Argon2id), diseño en Modo Oscuro con paleta canónica y arquitectura modular con cero datos de red escritos en el código fuente.

---

## 1. Arquitectura del Sistema y Seguridad

El sistema opera mediante contenedores aislados y redes internas segmentadas:

```
                                  [ DISPOSITIVO / NAVEGADOR LOCAL ]
                                                  │
                                                  ▼
                              ┌───────────────────────────────────────┐
                              │    Proxy Nginx TLS (Local Private CA) │  Puertos:
                              │    Cabeceras CSP, HSTS, Rate Limit    │  HTTP: 8080 -> 80
                              └───────────────────┬───────────────────┘  HTTPS: 8443 -> 443
                                                  │
                          ┌───────────────────────┴───────────────────────┐
                          │   Red Frontal Pública (frontend_net)          │
                          ▼                                               ▼
               ┌─────────────────────┐                         ┌─────────────────────┐
               │  Frontend (Vite /   │                         │  Backend (FastAPI / │
               │  React 18 / TS)     │                         │  Async Python 3.12) │
               └─────────────────────┘                         └──────────┬──────────┘
                                                                          │
                          ┌───────────────────────────────────────────────┴─────────────────┐
                          │   Red Privada de Datos (backend_net - Sin acceso a host)        │
                          ▼                                                                 ▼
               ┌─────────────────────────┐                                       ┌─────────────────────┐
               │ PostgreSQL 16 (ACID)    │                                       │ Redis 7             │
               │ (Volumen postgres_data) │                                       │ (Caché y Colas)     │
               └─────────────────────────┘                                       └─────────────────────┘
```

### Principios de Seguridad
- **Cero datos de red o credenciales en código**: Direcciones IP, nombres de servidor, puertos y rutas de disco se definen exclusivamente por variables de entorno de cada equipo.
- **Red local y autoridad certificadora privada**: No depende de Let's Encrypt ni expone puertos hacia internet público. El tráfico viaja cifrado en HTTPS local mediante certificados emitidos por una CA privada propia.
- **Bóveda con doble factor y reautenticación**: Claves maestras derivadas con Argon2id, cifrado simétrico AES-256-GCM con vector de inicialización único por registro, y revelación de contraseñas protegida por reautenticación obligatoria con registro de auditoría.
- **Tarjetas y finanzas (Opción B)**: Solo se conservan alias, emisor, últimos 4 dígitos y fecha de expiración cifrada. El código de seguridad CVV/CVC jamás se almacena.
- **Protección estricta contra SSRF**: El auditor web rechaza peticiones a redes privadas (RFC 1918), bucles locales (127.0.0.1) y metadatos de computación en la nube (169.254.169.254).

---

## 2. Requisitos Previos

Antes de desplegar el sistema, asegúrate de contar con:
1. **Sistema Operativo**: Linux (Ubuntu 22.04 LTS, 24.04 LTS o 26.04 LTS recomendado), macOS o Windows con WSL2.
2. **Docker Engine**: Versión 24.0 o superior.
3. **Docker Compose**: Plugin de Compose v2 (`docker compose version`).
4. **OpenSSL**: Para la generación inicial de certificados locales X.509.
5. **Puertos locales disponibles**:
   - Puerto `8080` (HTTP, redirige automáticamente a HTTPS).
   - Puerto `8443` (HTTPS seguro local).

---

## 3. Guía de Despliegue por Primera Vez

Sigue estos pasos en orden para poner en marcha el sistema en tu equipo servidor (por ejemplo, `lessso-srv` o tu equipo de trabajo):

### Paso 1: Clonar o situarse en el directorio del proyecto
```bash
cd /ruta/hacia/Email-CRM
```

### Paso 2: Crear el archivo de configuración local (.env)
Copia la plantilla de variables de entorno y ajusta los valores necesarios:
```bash
cp .env.example .env
```

Parámetros clave a revisar en `.env`:
- `SERVER_NAME`: Nombre del servidor en tu red local (por defecto `lessso-srv`).
- `PORT`: Puerto HTTP público del proxy (por defecto `8080`).
- `HTTPS_PORT`: Puerto HTTPS seguro del proxy (por defecto `8443`).
- `SERVER_SECRET_KEY`: Cadena aleatoria larga para firmas criptográficas de sesión.
- `LOCAL_MODE`: Mantener en `true` para asegurar operación estrictamente local sin salidas no autorizadas a internet.
- `POSTGRES_USER` y `POSTGRES_PASSWORD`: Credenciales para la base de datos interna.

### Paso 3: Generar los certificados TLS de la Autoridad Certificadora local
El sistema incluye un script automatizado para crear la Autoridad Certificadora (CA) privada y emitir los certificados para `lessso-srv` y `localhost`:
```bash
chmod +x scripts/generate_certs.sh
./scripts/generate_certs.sh
```
Este comando generará dentro de `nginx/certs/`:
- `ca.crt` y `ca.key`: Tu Autoridad Certificadora local.
- `server.crt` y `server.key`: Certificados TLS firmados con SAN para `lessso-srv`, `localhost` y `127.0.0.1`.

> **Nota para los dispositivos cliente**: Para que tu navegador no muestre advertencia de certificado no confiable, instala una sola vez el archivo `nginx/certs/ca.crt` en el almacén de certificados de tu sistema o navegador. Consulta las instrucciones paso a paso en [RUNBOOK.md](RUNBOOK.md).

### Paso 4: Construir y levantar los contenedores
Inicia los servicios en segundo plano con Docker Compose:
```bash
docker compose up -d --build
```

### Paso 5: Verificar el estado de los servicios
Comprueba que los cinco contenedores se encuentren en estado saludable (`healthy`):
```bash
docker compose ps
```

Deberás observar los siguientes servicios en ejecución:
- `emailsaver_proxy`: Proxy inverso Nginx en puertos `8080` y `8443`.
- `emailsaver_backend`: API FastAPI en Python 3.12.
- `emailsaver_frontend`: Interfaz de usuario en React / Vite.
- `emailsaver_db`: Base de datos PostgreSQL 16.
- `emailsaver_redis`: Servidor de caché y colas Redis 7.

Verifica la respuesta de salud del sistema mediante HTTP o HTTPS:
```bash
curl -k https://localhost:8443/health
```
Respuesta esperada: `{"status":"healthy","database":"connected","version":"1.0.0"}`.

### Paso 6: Primer ingreso a la aplicación
1. Abre tu navegador web e ingresa a:
   ```
   https://localhost:8443
   ```
   (O accede mediante `https://lessso-srv:8443` si configuraste el nombre en tu archivo `/etc/hosts` o DNS local).
2. **Credenciales iniciales de administrador**:
   - Usuario: `propietario` (o correo `admin@lessso.local`).
   - Contraseña inicial: `AdminLESSSO2026!`
3. **Configuración inicial recomendada**:
   - Cambia la contraseña temporal inmediatamente desde la sección Sistema / Usuarios.
   - Establece la contraseña maestra de la Bóveda en el diálogo de bienvenida o configuración.
   - Guarda tu clave maestra en un lugar seguro fuera del equipo.

---

## 4. Estructura de Módulos del Sistema

La navegación del sistema está organizada en ocho módulos funcionales:

1. **Inicio (Dashboard)**:
   - Resumen ejecutivo de cuentas por cobrar, ingresos del mes, alertas de seguridad y métricas clave.
   - Atajo global para búsqueda rápida (`Ctrl + K`).

2. **CRM LESSSO**:
   - **Captación**: Búsqueda por zonas y colonias de Tijuana con OpenStreetMap, caché por celdas con atribución legal obligatoria y auditoría web segura (protegida contra SSRF).
   - **Deduplicación**: Detección inteligente por teléfono, dominio y razón social, con opción de fusión atómica y reversión completa (`undo`).
   - **Seguimiento y Cadencia**: Registro de contactos con salida automática a `sin_respuesta` al agotar intentos, preservando el historial.
   - **Propuestas**: Numeración correlativa con folios bloqueados sin huecos numéricos (`PROP-0001`).
   - **Ventas y Cobros**: Cierre de venta en transacción atómica (creación simultánea de cliente, venta, plan de pagos y tareas). Los pagos nunca se eliminan físicamente; se revierten con motivo y rastro de auditoría.
   - **Facturación CFDI**: Registro de metadatos fiscales para personas físicas en RESICO. Cancelación justificada sin eliminación de registros.

3. **Agenda y Operación**:
   - Motor unificado de eventos con 12 tipos configurables (visitas, reuniones, seguimientos, cobros, mantenimientos, etc.).
   - Detección visual de traslapes de horario con advertencia.
   - Recurrencia automática: al completar un evento de mantenimiento, se programa automáticamente su siguiente cita.
   - Calculador de disponibilidad con días festivos oficiales de México y generación de propuesta en texto copiable.
   - Módulo de pruebas de penetración (pentesting): exige alcance por escrito y bloquea cualquier registro fuera de la ventana de tiempo autorizada.
   - Exportación de calendario en formato estándar RFC 5545 (`.ics`), excluyendo por defecto los eventos de finanzas privadas.

4. **Comunicaciones**:
   - Bandeja unificada por prospecto o cliente.
   - Modo manual disponible sin requerir APIs externas: generación directa de enlaces a WhatsApp (`wa.me`), redacción en Zoho Mail y enlaces de correo estándar (`mailto`).
   - Lista transversal de No Contactar: bloquea cualquier acción de contacto en todos los canales.
   - Cola de salida segura: un mensaje en estado incierto jamás se reenvía automáticamente.
   - Sanitizador de correos `.eml` importados sin ejecución de código malicioso.

5. **Bóveda**:
   - Almacenamiento cifrado de correos electrónicos, cuentas de plataformas, secretos y llaves de API.
   - Derivación de claves con Argon2id y cifrado AES-256-GCM.
   - Revelación de secretos enmascarados condicionada a reautenticación obligatoria con registro de auditoría.
   - Bloqueo automático por inactividad y limpieza de portapapeles.

6. **Finanzas Personales**:
   - Control de presupuestos mensuales por categoría frente a gastos reales.
   - Registro y amortización de deudas con cálculo de saldos.
   - Tarjetas registradas bajo política Opción B (alias, emisor, últimos cuatro dígitos y fecha de vencimiento cifrada; sin CVV).
   - Acceso restringido exclusivamente al rol de propietario (`owner`).

7. **Taller**:
   - Calculadora criptográfica de hashes (SHA-256, HMAC-SHA256).
   - Generador de contraseñas de alta entropía.
   - Sanitizador de diagramas SVG y código HTML para neutralizar vectores XSS.
   - Neutralizador de inyección de fórmulas CSV (DDE).
   - Gestión de proyectos internos de software y código.

8. **Sistema**:
   - Gestión de usuarios y roles (`owner`, `worker`, `viewer`).
   - Catálogos configurables del sistema (tipos de servicio, festivos, monedas).
   - Cola interna de trabajos en segundo plano con estados transparentes.
   - Registro dual de actividad: historial amigable y rastro completo de auditoría.
   - Control de integraciones con prueba de conexión aislada y bloqueo por arrendamiento de servidor (`ServerLeaseLock`) para respaldos.

---

## 5. Ejecución de Pruebas Automatizadas

El sistema cuenta con una cobertura integral de pruebas que valida cada módulo y regla de negocio.

### Pruebas del Backend (76 pruebas en verde)
Ejecuta la suite completa dentro del contenedor de backend:
```bash
docker compose exec -T backend python -m pytest tests/
```

Para ejecutar un módulo de pruebas específico:
```bash
# Pruebas de Núcleo e Infraestructura
docker compose exec -T backend python -m pytest tests/test_core_infrastructure.py

# Pruebas de Bóveda y Criptografía
docker compose exec -T backend python -m pytest tests/test_vault_and_connections.py tests/test_crypto.py

# Pruebas de Finanzas Personales
docker compose exec -T backend python -m pytest tests/test_personal_finances.py

# Pruebas de Taller y Sanitización
docker compose exec -T backend python -m pytest tests/test_workshop.py

# Pruebas de Captación y Auditoría Web SSRF
docker compose exec -T backend python -m pytest tests/test_crm_capture.py

# Pruebas de CRM, Ventas Atómicas y Facturación
docker compose exec -T backend python -m pytest tests/test_crm_pipeline_sales.py

# Pruebas de Agenda, Mantenimientos y Pentesting
docker compose exec -T backend python -m pytest tests/test_agenda_operation.py

# Pruebas de Comunicaciones y No Contactar
docker compose exec -T backend python -m pytest tests/test_communications.py

# Pruebas de Arrendamiento de Servidor (Lease Lock) e Integraciones
docker compose exec -T backend python -m pytest tests/test_cloud_lease_and_adapters.py

# Pruebas de Métricas y Deduplicación WhatsApp
docker compose exec -T backend python -m pytest tests/test_metrics_and_inbound.py
```

### Pruebas del Frontend
Ejecuta las pruebas unitarias y la verificación de compilación en el directorio `frontend/`:
```bash
cd frontend
npm test
npm run build
```

---

## 6. Procedimientos de Apagado, Reinicio y Contingencias

- **Detener los servicios sin perder datos**:
  ```bash
  docker compose down
  ```
  Los datos de la base de datos se conservan íntegros en el volumen persistente `postgres_data`.

- **Reiniciar los servicios**:
  ```bash
  docker compose restart
  ```

- **Ver registros en tiempo real**:
  ```bash
  docker compose logs -f backend
  docker compose logs -f proxy
  ```

- **Manejo ante apagones imprevistos o cortes de energía**:
  El sistema utiliza transacciones ACID en PostgreSQL y sesiones en base de datos. Al restablecerse el suministro eléctrico, ejecuta `docker compose up -d` y el sistema reanudará operaciones desde el último estado confirmado.

Para procedimientos avanzados de rotación de claves maestras, migración de servidor o recuperación ante desastres, consulta el manual operativo completo en [RUNBOOK.md](RUNBOOK.md).
