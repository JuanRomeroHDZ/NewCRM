# Permisos de equipo

La API comprueba la sesión de la cuenta, su rol y el estado de la bóveda para los módulos operativos. Las cuentas con contraseña temporal deben cambiarla antes de acceder.

| Operación | Propietario | Administrador | Operador | Ventas | Consulta |
| --- | --- | --- | --- | --- | --- |
| Consultar prospectos | Sí | Sí | Sí | Sí | Sí |
| Editar prospectos, gestionar captación, propuestas y ventas | Sí | Sí | Sí | Sí | — |
| Gestionar el seguimiento comercial, comunicaciones y eventos de agenda sin datos financieros | Sí | Sí | Sí | Sí | — |
| Editar documentos y lienzos, gestionar cuentas y servicios, utilizar la bóveda de credenciales | Sí | Sí | Sí | — | — |
| Consultar conexiones entre cuentas, servicios y prospectos | Sí | Sí | Sí | — | — |
| Consultar tarjetas, historial de cargos y métricas financieras | Sí | Sí | — | — | — |
| Gestionar finanzas operativas, facturas externas, eventos financieros y tipo de cambio | Sí | Sí | — | — | — |
| Gestionar presupuestos y deudas personales | Sí | — | — | — | — |
| Consultar actividad general o gestionar configuración y respaldos | Sí | Sí | — | — | — |
| Consultar las preferencias compartidas para operar (monedas, mapa y formatos) | Sí | Sí | Sí | Sí | Sí |
| Consultar cuentas del equipo | Sí | Sí | — | — | — |
| Crear cuentas y modificar accesos del equipo | Sí | — | — | — | — |

El mapa de conexiones del operador excluye los nodos y enlaces de medios de pago. Los datos de facturación registrados directamente en un servicio siguen disponibles en su ficha para quien administra ese servicio. Ventas puede restaurar un prospecto eliminado si conoce su identificador. La vista general de la papelera y el borrado definitivo requieren un rol de administración.

Las comprobaciones automatizadas cubren las rutas operativas por rol y distinguen la expiración de la sesión de cuenta del bloqueo de la bóveda. Véanse `backend/tests/test_role_access_matrix.py` y `frontend/tests/sessionRace.test.mjs`.
