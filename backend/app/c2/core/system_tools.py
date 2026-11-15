"""Rutas conocidas para herramientas del sistema ejecutadas por el C2."""
import os
import shutil

# No usar el PATH heredado en comandos privilegiados: puede omitir sbin o
# contener directorios controlados por otro usuario.
SYSTEM_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"


def tool_environment() -> dict[str, str]:
    return {**os.environ, "PATH": SYSTEM_PATH}


def find_tool(name: str) -> str | None:
    return shutil.which(name, path=SYSTEM_PATH)
