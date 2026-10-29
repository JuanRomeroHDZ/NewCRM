"""Genera un inventario mecánico de las rutas HTTP sin acceder a datos."""

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
API = ROOT / "backend/app/api/v1"
GROUPS = {
    "auth": ("Sistema", "sesiones y configuración de acceso"),
    "audit": ("Sistema/Actividad", "eventos de auditoría"),
    "emails": ("Bóveda", "cuentas de correo y recuperación"),
    "platforms": ("Bóveda y Finanzas", "cuentas, credenciales y suscripciones"),
    "passwords": ("Bóveda", "contraseñas e historial"),
    "payments": ("Finanzas y Bóveda", "medios de pago"),
    "prospects": ("CRM", "prospectos y seguimiento"),
    "finances": ("Finanzas, CRM y Taller", "ingresos, gastos, renovaciones, proyectos y recursos"),
    "graph": ("Sistema/Conexiones", "relaciones entre registros"),
    "trash": ("Sistema/Papelera", "registros eliminados y actividad"),
    "exchange": ("Finanzas", "tipos de cambio"),
    "settings": ("Sistema/Configuración", "preferencias y configuración"),
    "security": ("Bóveda/Seguridad", "credenciales y evaluación de seguridad"),
    "importer": ("Bóveda", "importación de cuentas"),
    "vault_backup": ("Bóveda", "exportación y restauración existentes"),
    "health": ("Sistema", "estado de la base"),
}


def main() -> None:
    outputs = (ROOT / "INVENTARIO_RUTAS.md", ROOT / "MATRIZ_RUTAS.md")
    if any(path.exists() for path in outputs):
        raise SystemExit("Los informes ya existen; no se sobrescriben las anotaciones existentes.")
    entries = []
    for source in sorted(API.glob("*.py")):
        if source.stem not in GROUPS:
            continue
        tree = ast.parse(source.read_text(encoding="utf-8"))
        prefix = ""
        for node in tree.body:
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
                if isinstance(node.value.func, ast.Name) and node.value.func.id == "APIRouter":
                    for keyword in node.value.keywords:
                        if keyword.arg == "prefix" and isinstance(keyword.value, ast.Constant):
                            prefix = keyword.value.value
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
                    continue
                if not isinstance(decorator.func.value, ast.Name) or decorator.func.value.id != "router":
                    continue
                method = decorator.func.attr.upper()
                if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"} or not decorator.args:
                    continue
                path = decorator.args[0]
                if not isinstance(path, ast.Constant) or not isinstance(path.value, str):
                    continue
                base = "" if source.stem == "health" else "/api/v1"
                destination, data = GROUPS[source.stem]
                entries.append((method, base + prefix + path.value, node.name, source.relative_to(ROOT), node.lineno, destination, data))
    header = (
        "# Inventario de rutas HTTP\n\n"
        "Generado por inspección estática de los decoradores. El nombre de la función identifica "
        "el comportamiento a revisar; no demuestra que funcione ni que la paridad esté completa. "
        "Todas las rutas requieren verificación individual. La ruta raíz `GET /` de `backend/app/main.py` "
        "también debe conservarse.\n\n"
        "| Método | Ruta | Función y ubicación | Datos principales | Destino previsto | Estado |\n"
        "|---|---|---|---|---|---|\n"
    )
    lines = [f"| {method} | `{path}` | `{name}` en `{source}:{line}` | {data} | {dest}; conservar o mejorar | Sin prueba individual |"
             for method, path, name, source, line, dest, data in entries]
    (ROOT / "INVENTARIO_RUTAS.md").write_text(header + "\n".join(lines) + "\n", encoding="utf-8")
    matrix_header = (
        "# Matriz de paridad de rutas\n\n"
        "Inventario inicial generado de los decoradores. Ninguna entrada se declara migrada; "
        "la prueba de humo y la ubicación definitiva deben completarse antes de cerrar cada fase.\n\n"
        "| Ruta original | Destino propuesto | Prueba de humo | Estado |\n"
        "|---|---|---|---|\n"
    )
    matrix = [f"| `{method} {path}` | {dest} | Pendiente: verificar `{name}` | Pendiente |"
              for method, path, name, source, line, dest, data in entries]
    (ROOT / "MATRIZ_RUTAS.md").write_text(matrix_header + "\n".join(matrix) + "\n", encoding="utf-8")
    print(f"Rutas inventariadas: {len(entries)}")


if __name__ == "__main__":
    main()
