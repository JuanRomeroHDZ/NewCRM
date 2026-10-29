# Estructura Objetivo de la Arquitectura Modular | Contact LESSSO

Fecha de auditoría: 2026-10-28.
Estado: Definida y aprobada para implementación.

```
Contact-LESSSO/
├── docker-compose.yml              # Orquestación declarativa Docker Compose v2 (sin 'version:')
├── .env.example                    # Variables de entorno limpias sin secretos reales
├── .gitignore                      # Exclusiones estrictas (.db, backups, certs, .env)
├── nginx/
│   ├── Dockerfile
│   ├── default.conf                # Proxy inverso con TLS local, rate limit y cabeceras estrictas
│   └── certs/                      # Certificados generados por la CA privada local
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── migrations/                 # Migraciones versionadas y reversibles
│   ├── tests/                      # Suites de pruebas por módulo y pruebas de integración
│   │   ├── conftest.py
│   │   ├── test_auth_routes.py
│   │   ├── test_crypto.py
│   │   ├── test_pci_and_finances.py
│   │   ├── test_vault_rekey.py
│   │   ├── test_prospect_workflow.py
│   │   ├── test_agenda.py
│   │   ├── test_comms.py
│   │   ├── test_crm.py
│   │   └── test_workshop.py
│   └── app/
│       ├── main.py                 # FastAPI principal, middlewares y montaje de routers
│       ├── config.py               # Configuración modular validada con Pydantic v2
│       ├── database.py             # SQLAlchemy 2.0 Async, pool y sesiones
│       ├── models/                 # Modelos declarativos agrupados por dominio
│       │   ├── core.py             # Usuarios, roles, sesiones, auditoría, configuración, cola
│       │   ├── vault.py            # Cuentas, credenciales, historial, TOTP, recursos seguros
│       │   ├── finances.py         # Gastos, categorías, presupuestos, tarjetas (Opción B), deudas
│       │   ├── crm.py              # Prospectos, propuestas, ventas, cobros, facturas, clientes
│       │   ├── agenda.py           # Calendario unificado, eventos, tareas, visitas, pentesting
│       │   ├── comms.py            # Hilos, plantillas, WhatsApp, Telegram, cola de salida
│       │   └── workshop.py         # Herramientas del taller, proyectos y utilidades
│       ├── schemas/                # Contratos y validaciones Pydantic por módulo
│       ├── security/               # Argon2id, cifrado AES-256-GCM, tokens jti, sesiones en DB
│       ├── services/               # Lógica de negocio y adaptadores desacoplados
│       └── api/v1/                 # Endpoints REST protegidos por roles y permisos
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js          # Tokens canónicos (#080A0A, #081416, #0C1024, #A98242)
    └── src/
        ├── App.tsx
        ├── index.css
        ├── context/VaultContext.tsx# Estado global de sesión, bóveda y navegación
        ├── components/
        │   ├── layout/             # Sidebar, Topbar, Inspector lateral, Barra de estado
        │   ├── views/              # Vistas principales de los 7 módulos funcionales
        │   │   ├── DashboardView.tsx
        │   │   ├── VaultView.tsx
        │   │   ├── FinancesView.tsx
        │   │   ├── CRMView.tsx
        │   │   ├── AgendaView.tsx
        │   │   ├── CommunicationsView.tsx
        │   │   ├── WorkshopView.tsx
        │   │   └── SystemView.tsx
        │   ├── modals/             # Diálogos y formularios accesibles
        │   └── common/             # Componentes base (botones, campos secretos, badges)
        └── lib/                    # Utilidades de cliente y llamadas de API
```
