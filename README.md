# EmailSaver — Gestor Relacional de Identidades, Contraseñas, APIs & Finanzas

Plataforma web autohospedada (**self-hosted**) que reemplaza las listas planas de los gestores tradicionales por un **modelo relacional jerárquico en grafo**, con una estética minimalista y fluida inspirada en **Notion** y **Obsidian** (Dark Mode grafito/carbón, lienzo de puntos *dot-grid*, inspector lateral deslizable de 3 columnas y atajos con paleta de comandos `Ctrl + K`).

---

## 🏛️ 1. Arquitectura de Infraestructura & Seguridad

El sistema opera bajo estrictos estándares de DevSecOps, aislamiento de redes y protección criptográfica:

```
                                  [ INTERNET / USUARIO ]
                                            │
                                            ▼
                        ┌───────────────────────────────────────┐
                        │   Proxy Inverso Nginx (Rate Limit)    │  (Puerto 8080 / 80)
                        │   CSP, HSTS, Limits, No Host Ports    │
                        └───────────────────┬───────────────────┘
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    │  Red Frontal Pública (frontend_net)            │
                    ▼                                               ▼
         ┌─────────────────────┐                         ┌─────────────────────┐
         │  Frontend (Vite /   │                         │  Backend (FastAPI)  │
         │  React 18 / TS)     │                         │  Async Python 3.12  │
         └─────────────────────┘                         └──────────┬──────────┘
                                                                    │
                    ┌───────────────────────────────────────────────┴─────────────────┐
                    │  Red Privada de Datos (backend_net - Sin acceso exterior)        │
                    ▼                                                                 ▼
         ┌─────────────────────────┐                                       ┌─────────────────────┐
         │ PostgreSQL 16 (ACID)    │                                       │ Redis 7 (Sesiones,  │
         │ (Volumen postgres_data) │                                       │ Ephemeral Cache)    │
         └─────────────────────────┘                                       └─────────────────────┘
```

### Principios Fundamentales
- **Segmentación Estricta de Redes**: PostgreSQL 16, Redis y el backend residen en redes internas aisladas. El backend no expone puertos directamente al host, canalizándose exclusivamente a través del proxy inverso Nginx.
- **Autorización por Defecto**: Todas las rutas de lectura y mutación (correos, plataformas, métodos de pago, finanzas, tipo de cambio, configuración, grafos y auditoría) requieren validación de token de sesión activo de Nivel 2.
- **Higiene Criptográfica y Derivación**:
  - Llave AES-256-GCM derivada mediante **Argon2id** a partir de la contraseña maestra del usuario y un salt criptográfico único por bóveda.
  - La clave de cifrado se mantiene **únicamente en memoria RAM volátil** durante la sesión activa y se destruye inmediatamente al bloquear la bóveda (`/auth/lock`) o al expirar el tiempo de sesión.
  - Cumplimiento PCI DSS: No se almacena CVV/CVC bajo ningún concepto y los números de tarjeta se enmascaran preservando solo los últimos 4 dígitos.
- **Revocación Real de Sesión**:
  - Tokens JWT con identificador único de sesión (`jti`).
  - El endpoint `/auth/lock` invalida el token en el gestor de sesiones en servidor, imposibilitando su reutilización.
- **Verificación Asíncrona de Filtraciones (HIBP)**:
  - Consulta k-anónima asíncrona (SHA-1 truncado a 5 caracteres) sin bloquear el event loop, con manejo explícito de estado fuera de línea y caché en memoria.

---

## 🔐 2. Arquitectura de Desbloqueo en Dos Niveles

EmailSaver opera bajo el esquema de **Seguridad Granular de Dos Niveles**:

1. **Nivel 1 — Estado Bloqueado**:
   - Solo permite consultar el estado del sistema (`/health`, `/auth/status`).
   - El acceso a datos sensibles, finanzas, inventarios y notas privadas está completamente protegido.
2. **Nivel 2 — Bóveda Desbloqueada (Modo Seguro)**:
   - Requiere la autenticación con la **Contraseña Maestra**.
   - Habilita la consulta y copiado seguro de credenciales, contraseñas, PINs de perfil, llaves API, variables de entorno, ingresos, vencimientos y reportes financieros.
   - **Temporizador de Auto-Bloqueo**: Configurable (1, 5, 10, 30 min) con cuenta regresiva en vivo en la barra lateral.
   - **Higiene de Portapapeles**: Vaciado automático del portapapeles tras $X$ segundos (configurable) al copiar cualquier secreto.

---

## 📂 3. Estructura del Proyecto

```
EmailSaver/
├── docker-compose.yml         # Orquestación declarativa multi-contenedor con healthchecks
├── .env.example               # Parámetros de entorno de infraestructura
├── .gitignore                 # Reglas estrictas de exclusión (sin bases de datos ni secretos)
├── .dockerignore              # Aislamiento de contextos de construcción Docker
├── nginx/
│   ├── Dockerfile
│   └── default.conf           # Rate-limiting, compresión gzip, CSP, cabeceras seguras
├── backend/
│   ├── Dockerfile             # Multi-stage non-root Python 3.12
│   ├── requirements.txt
│   ├── tests/                 # Suite de pruebas automatizadas (Auth, Cripto, PCI, Finanzas)
│   └── app/
│       ├── main.py            # Inicialización FastAPI & lifespan migrations
│       ├── config.py          # Settings validados con Pydantic v2
│       ├── database.py        # SQLAlchemy 2.0 Async
│       ├── seed_data.py       # Inicialización segura (sin contraseñas fijas)
│       ├── models/            # Modelos declarativos (Email, Platform, Payment, Incomes, etc.)
│       ├── schemas/           # Contratos Pydantic v2
│       ├── security/          # Argon2id, derivación AES-256-GCM, tokens jti y gestor de sesiones
│       ├── services/          # Divisas USD/MXN, favicons SVG y grafo relacional
│       └── api/v1/            # Routers protegidos (/auth, /emails, /platforms, /finances...)
└── frontend/
    ├── Dockerfile             # Multi-stage build Node 22 + Nginx Alpine
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js     # Tokens de diseño y color de acento dinámico
    └── src/
        ├── context/VaultContext.tsx   # Estado global de bóveda y temporizadores
        ├── components/
        │   ├── layout/        # Sidebar colapsable, Topbar e Inspector Contextual
        │   ├── common/        # Paleta de Comandos (Ctrl+K), Generador de Claves y Modales
        │   └── views/         # 11 Secciones principales (Dashboard, Emails, Finanzas...)
        └── lib/api.ts         # Cliente API tipado con auto-bloqueo ante 401/403
```

---

## 🚀 4. Despliegue con Docker Compose (Producción)

1. **Configurar variables de entorno**:
   ```bash
   cp .env.example .env
   # Configura SERVER_SECRET_KEY y credenciales en .env
   ```

2. **Levantar todos los servicios**:
   ```bash
   docker compose up --build -d
   ```

3. **Verificar estado de salud de los contenedores**:
   ```bash
   docker compose ps
   curl -s http://localhost:8080/health
   ```

Accede a la plataforma abriendo tu navegador en `http://localhost:8080`.

---

## 💻 5. Ejecución Local en Modo Desarrollo

### Requisitos
- **Python 3.12+**
- **Node.js 22+**

### Backend (FastAPI)
```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
pytest                          # Ejecuta la suite de pruebas
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (Vite + React)
```bash
cd frontend
npm install
npm run build                   # Verifica compilación y tipos TypeScript
npm run dev -- --port 3000
```
Abre `http://localhost:3000` en tu navegador.

---

## 🧪 6. Pruebas Automatizadas & Calidad

La suite de pruebas automatizadas cubre:
- **Criptografía y Derivación de Claves**: Derivación Argon2id, cifrado simétrico AES-256-GCM y notas privadas.
- **Gestión y Revocación de Sesiones**: Creación de tokens con `jti`, verificación y revocación inmediata al bloquear.
- **Matriz de Autorización**: Verificación de rechazo con código 401 en todas las rutas protegidas al llamar sin token.
- **Cumplimiento PCI DSS**: Verificación de rechazo/omisión de CVV y enmascaramiento de tarjetas.
- **Integridad Financiera**: Idempotencia de clonación mensual de ingresos recurrentes.
- **Respaldos Cifrados**: Exportación y restauración round-trip con validación de esquemas.

Para ejecutar los tests en cualquier momento:
```bash
pytest
```
