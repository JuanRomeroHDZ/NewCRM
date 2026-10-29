# Inventario técnico inicial

Fecha de revisión: 2026-10-28. Estado: parcial; no es una aprobación de migración.

- La aplicación existente consta de backend FastAPI, frontend React/TypeScript, Nginx, PostgreSQL y Redis. El backend contiene 78 rutas declaradas y el frontend 11 vistas principales.
- El PostgreSQL activo contiene 14 tablas. En el momento de la consulta solo había dos registros de tipo de cambio; las demás tablas estaban vacías. Esta observación no determina el contenido de otras computadoras o respaldos.
- Hay dos bases SQLite en el commit `58c970a`; fueron eliminadas de la versión actual, pero permanecen en el historial. En una hay dos direcciones de correo que no coinciden con los datos de demostración. Los alias de las tres tarjetas y los cinco prospectos coinciden con los ejemplos antiguos; ambas bases contienen campos históricos de código de seguridad. No se han descifrado ni restaurado datos.
- Redis figura en Compose, pero no se encontraron referencias de uso en el código del backend ni del frontend. Las sesiones de bóveda se mantienen en memoria por proceso. Su retirada no se ha autorizado ni realizado.
- Las migraciones actuales se ejecutan al iniciar y omiten excepciones; no hay migraciones Alembic identificadas.
- Se detectaron cambios locales preexistentes, incluidos archivos nuevos en `frontend/src/lib/`. Se deben conservar.
- La suite actual ejecutó 17 pruebas con SQLite en memoria; la verificación de tipos del frontend pasó. Estas pruebas no prueban la migración ni el respaldo completo.

El historial accesible contiene dos commits. Un escaneo sin red de ambos, con Gitleaks 8.18.4 previamente validado con un token ficticio, encontró tres coincidencias en el código de ejemplos antiguo. Las bases SQLite binarias requieren revisión separada y no están cubiertas por el escaneo textual.

Pendiente: revisión adicional de binarios y datos anteriores, comparación de todas las funciones y pruebas de recuperación en un entorno aislado.
