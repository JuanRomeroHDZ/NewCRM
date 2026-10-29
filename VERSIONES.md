# Registro de Versiones y Fuentes Oficiales | Contact LESSSO

Fecha de verificación: 2026-10-28.
Regla: Todas las dependencias e imágenes de infraestructura están fijadas a versiones estables verificadas en su documentación oficial.

| Componente / Herramienta | Versión Estable Vigente | Fuente Oficial de Consulta | Justificación y Notas de Adopción |
|---|---|---|---|
| Python | 3.12.16 | [Python.org Downloads](https://www.python.org/downloads/) | Versión estable LTS, soporte para `asyncio` optimizado y tipado moderno |
| PostgreSQL | 16.15-alpine | [PostgreSQL Official](https://www.postgresql.org/docs/16/) | Motor relacional ACID de alto rendimiento, soporte nativo de bloqueos por fila `FOR UPDATE SKIP LOCKED` |
| Node.js | 22.23.3 (LTS) | [Nodejs.org](https://nodejs.org/en/about/previous-releases) | Línea LTS activa para compilación del frontend |
| Docker Compose | v2.26.1 | [Docker Docs Compose](https://docs.docker.com/compose/) | Especificación Compose v2 sin declaración obsoleta del campo `version:` |
| FastAPI | 0.110.0+ | [FastAPI Official](https://fastapi.tiangolo.com/) | Framework asíncrono para endpoints REST OpenAPI con validación automática |
| SQLAlchemy | 2.0.28+ | [SQLAlchemy 2.0 Docs](https://docs.sqlalchemy.org/en/20/) | ORM asíncrono moderno con dialecto `asyncpg` |
| Alembic | 1.13.1 / 1.20 | [Alembic Official](https://alembic.sqlalchemy.org/) | Gestor de migraciones versionadas y reversibles |
| Pydantic | 2.6.4+ | [Pydantic Docs](https://docs.pydantic.dev/latest/) | Validación estricta de esquemas de datos y configuración |
| argon2-cffi | 23.1.0 | [Argon2 CFFI](https://argon2-cffi.readthedocs.io/) | Estándar recomendado para derivación y hashing de contraseñas |
| Cryptography | 42.0.5+ | [Cryptography.io](https://cryptography.io/en/latest/) | Cifrado simétrico autenticado AES-256-GCM para datos en reposo |
| React | 18.2.0 | [React.dev](https://react.dev/) | Librería de interfaz de usuario para SPA |
| TypeScript | 5.2.2+ | [TypeScriptlang.org](https://www.typescriptlang.org/) | Verificación de tipos estática en el cliente |
| Vite | 5.1.4+ | [Vitejs.dev](https://vitejs.dev/) | Empaquetador ultrarrápido y servidor de desarrollo |
| Tailwind CSS | 3.4.1 | [Tailwindcss.com](https://tailwindcss.com/) | Motor de utilidades CSS con soporte de tokens y variables semánticas |
| Lucide React | 0.344.0+ | [Lucide.dev](https://lucide.dev/) | Conjunto canónico de iconos limpios vectoriales |
| Nginx | 1.25-alpine / estable | [Nginx.org](https://nginx.org/en/docs/) | Proxy inverso para terminación TLS local y rate-limiting |
| Pytest | 9.2.0 | [Pytest.org](https://docs.pytest.org/) | Marco de pruebas automatizadas en backend |
| Gitleaks | 8.18.4 | [GitHub Gitleaks](https://github.com/gitleaks/gitleaks) | Escáner de seguridad para detección de secretos en el historial git |
