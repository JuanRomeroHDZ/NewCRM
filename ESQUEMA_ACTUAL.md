# Esquema observado

Consulta de solo lectura del PostgreSQL activo el 28 de octubre de 2026. Los conteos son una instantánea y pueden cambiar; no se han incluido datos personales. El detalle de columnas y tipos se encuentra en `backend/app/models/__init__.py`, y su correspondencia con la base fue contrastada mediante `information_schema`.

| Tabla | Uso observado | Filas |
|---|---|---:|
| `audit_logs` | Actividad y auditoría | 0 |
| `billing_records` | Historial de cargos de servicios | 0 |
| `client_incomes` | Ingresos de clientes | 0 |
| `domain_renewals` | Renovaciones de dominios y servicios | 0 |
| `email_accounts` | Correos, recuperación y credenciales cifradas | 0 |
| `exchange_rates` | Tipos de cambio | 2 |
| `internal_projects` | Proyectos internos | 0 |
| `one_time_expenses` | Gastos | 0 |
| `password_history` | Historial de contraseñas cifradas | 0 |
| `payment_methods` | Medios de pago, número cifrado y vencimiento | 0 |
| `platform_accounts` | Cuentas, claves, TOTP y suscripciones | 0 |
| `prospects` | Prospectos, seguimiento y datos de contacto | 0 |
| `secure_resources` | Contenido sensible y relaciones | 0 |
| `user_settings` | Preferencias, hash y sal de la bóveda | 0 |

Los montos observados se modelan con `double precision`; conviene migrarlos a un tipo decimal exacto con comparación de valores. Las fechas de algunos conceptos se guardan como texto. Las relaciones actuales usan claves foráneas entre entidades; una separación por módulos debe preservar y validar cada vínculo antes de sustituirlas. No se ha efectuado ninguna migración.

La base activa vacía no demuestra que los datos de otras instalaciones o de las bases históricas sean prescindibles. Las dos bases SQLite en el historial se documentan en `INVENTARIO.md`.
