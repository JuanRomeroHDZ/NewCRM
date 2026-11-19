# Revisión de secretos del repositorio

Se revisaron las reglas de exclusión de Git y de contexto Docker. Los archivos `.env` locales, bases de datos y claves privadas están excluidos; `.env.example` es la plantilla rastreada. Los valores por defecto públicos, las rutas internas y los parámetros de aplicación no son necesariamente credenciales y deben evaluarse según su función.

Se analizó el historial Git con TruffleHog en modo sin verificación de red. El detector señaló dos candidatos de credencial GitHub en el commit `58c970aa7a`, archivo histórico `backend/app/seed_data.py`, líneas 210 y 217, y sus duplicados en un archivo de bytecode histórico. También señaló coincidencias de GitHub OAuth en un README histórico de la dependencia JSON5, que requieren revisión contextual. Los resultados son **candidatos no verificados**; no confirman que una credencial haya sido real o siga activa. No se muestran los valores en este documento.

Si la revisión privada determina que alguna credencial fue real, se debe revocar o rotar en el proveedor, verificar su alcance y revisar su uso. Borrar el archivo actual no elimina el valor del historial; la reescritura de historial es una operación separada que requiere coordinar clones, copias y repositorios remotos. El análisis no demuestra la ausencia de otros secretos.

El módulo de auditoría de cámaras mantiene los hallazgos estructurados para el flujo autorizado, pero ya no imprime las credenciales detectadas en la salida de consola. Esos hallazgos pueden contener credenciales y deben tratarse como datos sensibles, sujetos a los controles y la retención de la instalación.

## Seguimiento

Se habilitaron GitHub Secret Scanning y Push Protection en `JuanRomeroHDZ/NewCRM`. La consulta de alertas a GitHub tras activarlos no devolvió alertas. El escaneo local sin verificación de red volvió a señalar dos candidatos de credencial en el archivo de semillas histórico y dos coincidencias de documentación de una dependencia. No se presentaron secretos de severidad alta o crítica en las fuentes actuales seleccionadas. El historial de certificados eliminados contiene certificados públicos y un número de serie, sin extensiones de clave privada en esas rutas.

La revisión del repositorio no determina qué credenciales siguen válidas. Confirma o rota las dos candidatas en el proveedor antes de coordinar el historial público. La rama principal conserva las referencias históricas hasta que se acuerde la intervención. GitHub describe el alcance de la limpieza y el manejo de referencias, clones y bifurcaciones en su [procedimiento oficial](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
