# EmailSaver — Gestor Relacional de Identidades, Contraseñas, APIs & Suscripciones

Plataforma web autohospedada (**self-hosted**) que reemplaza las listas planas de los gestores tradicionales por un **modelo relacional jerárquico en grafo**, con una estética minimalista y fluida inspirada en **Notion** y **Obsidian** (Dark Mode grafito/carbón, lienzo de puntos *dot-grid*, inspector lateral deslizable de 3 columnas y atajos con paleta de comandos `Ctrl + K`).

---

## 🏛️ 1. Arquitectura de Infraestructura & Seguridad

El sistema opera bajo los más altos estándares empresariales de DevSecOps, alta disponibilidad (HA) y atomicidad transaccional (ACID):

```
                                  [ INTERNET / USUARIO ]
                                            │
                                            ▼
                        ┌───────────────────────────────────────┐
                        │   Proxy Inverso Nginx (Rate Limit)    │  (Puerto 80 / 443)
                        └───────────────────┬───────────────────┘
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    │  Red Frontal Pública (frontend_net)            │
                    ▼                                               ▼
         ┌─────────────────────┐                         ┌─────────────────────┐
         │  Frontend (Vite /   │                         │  Backend (FastAPI)  │
         │  React 19 / TS)     │                         │  Async Python 3.12  │
         └─────────────────────┘                         └──────────┬──────────┘
                                                                    │
                    ┌───────────────────────────────────────────────┴─────────────────┐
                    │  Red Privada de Datos (backend_net - Sin acceso exterior)        │
                    ▼                                                                 ▼
         ┌─────────────────────────┐                                       ┌─────────────────────┐
         │ PostgreSQL 16 (ACID)    │                                       │ Redis 7 (Sesiones,  │
         │ (Volumen postgres_data) │                                       │ Temporizadores)     │
         └─────────────────────────┘                                       └─────────────────────┘
```

### Principios Fundamentales
- **Segmentación de Redes Internas**: La base de datos PostgreSQL 16 y el servidor Redis residen en una red virtual privada interna (`internal: true`) sin exposición de puertos hacia el exterior. Solo el backend tiene doble interfaz de red.
- **Atomicidad Transaccional (Unit of Work)**: Toda rotación de contraseña verifica la anterior, la archiva en la tabla inmutable `password_history`, cifra la nueva con AES-256-GCM y registra el evento en `audit_logs` dentro de una **única transacción atómica**. Si cualquier fase falla, se produce un *rollback* completo automático.
- **Backend 100% Stateless**: No guarda sesiones en memoria RAM local; escala horizontalmente detrás del balanceador Nginx.
- **Resiliencia & Operación Offline**:
  - Conversión USD a MXN con caché persistente y soporte para valor manual fijado por el usuario.
  - Extracción asíncrona de favicons con fallback inmediato a insignias tipográficas vectoriales SVG.

---

## 🔐 2. Arquitectura Criptográfica y Desbloqueo en Dos Niveles

EmailSaver opera bajo el esquema de **Seguridad Granular de Dos Niveles**:

1. **Nivel 1 — Sesión Operativa (Abierto tras Login)**:
   - Dashboard ejecutivo con KPIs y métricas de gasto mensual/anual.
   - Grafo interactivo Obsidian para visualización de topología y dependencias.
   - Directorio de plataformas y metadatos generales (sin exponer contraseñas ni llaves).
2. **Nivel 2 — Bóveda Cifrada (Modo Privilegiado)**:
   - Requiere la **Contraseña Maestra / PIN**.
   - Habilita la consulta y copiado de contraseñas, PINs de perfil, llaves API, variables de entorno, números completos de tarjeta y papelera de reciclaje.
   - **Temporizador de Auto-Bloqueo**: Configurable (1, 5, 10, 30 min) con cuenta regresiva en vivo en la barra lateral.
   - **Higiene de Portapapeles**: Vaciado automático del portapapeles tras $X$ segundos (configurable) al copiar cualquier secreto.
   - **Criptografía**: Derivación y hashing con **Argon2id** (prohibido bcrypt) + cifrado autenticado **AES-256-GCM** (con vector de inicialización de 96 bits y etiqueta de autenticación de 128 bits).

---

## 📂 3. Estructura del Proyecto

```
EmailSaver/
├── docker-compose.yml         # Orquestación declarativa multi-contenedor
├── .env.example               # Parámetros de entorno de infraestructura
├── nginx/
│   ├── Dockerfile
│   └── default.conf           # Rate-limiting, compresión gzip y proxy reverso
├── backend/
│   ├── Dockerfile             # Multi-stage non-root Python 3.12
│   ├── requirements.txt
│   └── app/
│       ├── main.py            # Inicialización FastAPI & lifespan migrations
│       ├── config.py          # Settings validados con Pydantic
│       ├── database.py        # SQLAlchemy 2.0 Async
│       ├── seed_data.py       # Cuentas iniciales, grafos y pruebas gratuitas
│       ├── models/            # Modelos declarativos (Email, Platform, Payment, History, Audit)
│       ├── security/          # Argon2id, AES-256-GCM y tokens de bóveda
│       ├── services/          # Divisas USD/MXN, favicons SVG y grafo relacional
│       └── api/v1/            # Routers modulares (/auth, /emails, /platforms, /graph...)
└── frontend/
    ├── Dockerfile             # Multi-stage build Node 22 + Nginx Alpine
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── context/VaultContext.tsx   # Estado global de bóveda y temporizadores
        ├── components/
        │   ├── layout/        # Sidebar colapsable, Topbar e Inspector Contextual deslizante
        │   ├── common/        # Paleta de Comandos (Ctrl+K), Generador de Claves y Modales
        │   └── views/         # 8 Secciones principales (Dashboard, Emails, Grafo...)
        └── lib/api.ts         # Cliente API tipado con header X-Vault-Token
```

---

## 🚀 4. Despliegue con Docker Compose (Producción)

1. **Clonar y configurar variables**:
   ```bash
   cp .env.example .env
   # Edita .env con tus credenciales seguras
   ```

2. **Levantar todos los servicios**:
   ```bash
   docker compose up --build -d
   ```

3. **Verificar estado de salud de los contenedores**:
   ```bash
   docker compose ps
   curl -s http://localhost/health
   ```

Accede a la plataforma abriendo tu navegador en `http://localhost`.

---

## 💻 5. Ejecución Local en Modo Desarrollo

### Requisitos
- **Python 3.12+**
- **Node.js 20+**

### Backend (FastAPI)
```bash
cd backend
source .venv/bin/activate   # O usa uv / virtualenv
pip install -r requirements.txt
export PYTHONPATH=$PWD
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (Vite + React)
```bash
cd frontend
npm install
npm run dev -- --port 3000
```
Abre `http://localhost:3000` en tu navegador.

---

## 🔑 6. Credenciales de Demostración Inicial

El sistema incluye datos precargados con topología completa (cuentas Google, Proton, Outlook, TechCorp, suscripciones en Netflix, AWS, GitHub, Midjourney con prueba por vencer, etc.):

- **Contraseña Maestra Predeterminada de la Bóveda**:
  ```
  MasterPassword123!
  ```
- **Atajo del Buscador Universal**:
  ```
  Ctrl + K  (o Cmd + K)
  ```
