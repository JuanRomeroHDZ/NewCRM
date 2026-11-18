#!/usr/bin/env python3
"""Decrypt and restore a full backup only into a temporary isolated PostgreSQL container."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any


FORMAT = "lessso-full-backup"
VERSION = 2
AGE_HEADER = b"age-encryption.org/v1\n"
EXPECTED_DB_ENTRIES = (
    "TABLE public prospects",
    "TABLE public writeups",
    "TABLE public writeup_assets",
    "TABLE public writeup_revisions",
    "TABLE public writeup_boards",
    "TABLE public writeup_citations",
    "TABLE public writeup_export_logs",
)
REQUIRED_ARCHIVE_PATHS = (
    "vault_media",
    "deployment/docker-compose.yml",
    "deployment/docker-compose.dev.yml",
    "deployment/.env.example",
    "deployment/README.md",
    "deployment/RUNBOOK.md",
    "deployment/PRODUCT.md",
    "deployment/SEGURIDAD.md",
    "deployment/pytest.ini",
    "deployment/backend/app/main.py",
    "deployment/backend/alembic.ini",
    "deployment/backend/migrations/env.py",
    "deployment/backend/requirements.txt",
    "deployment/backend/Dockerfile",
    "deployment/backend/pytest.ini",
    "deployment/backend/tests/conftest.py",
    "deployment/backend/tests/test_writeups.py",
    "deployment/frontend/tests/writeups.test.mjs",
    "deployment/frontend/src/main.tsx",
    "deployment/frontend/src/App.tsx",
    "deployment/frontend/public/robots.txt",
    "deployment/frontend/package.json",
    "deployment/frontend/package-lock.json",
    "deployment/frontend/index.html",
    "deployment/frontend/postcss.config.js",
    "deployment/frontend/tailwind.config.js",
    "deployment/frontend/tsconfig.json",
    "deployment/frontend/vite.config.ts",
    "deployment/frontend/Dockerfile",
    "deployment/docs/auditoria-secretos.md",
    "deployment/nginx/certs/local/ca.crt",
    "deployment/nginx/certs/local/ca.key",
    "deployment/nginx/certs/local/server.crt",
    "deployment/nginx/certs/local/server.key",
)
ALLOWED_DEPLOYMENT_DIRECTORIES = (
    "nginx",
    "scripts",
    "backend/app",
    "backend/migrations",
    "backend/tests",
    "frontend/src",
    "frontend/public",
    "frontend/tests",
    "docs",
)
ALLOWED_DEPLOYMENT_FILES = frozenset(
    {
        "docker-compose.yml", "docker-compose.dev.yml", ".env.example", "README.md", "RUNBOOK.md",
        "PRODUCT.md", "SEGURIDAD.md", "Recomendations.md", "pytest.ini",
        "backend/Dockerfile", "backend/alembic.ini", "backend/requirements.txt",
        "backend/pytest.ini",
        "frontend/Dockerfile", "frontend/index.html", "frontend/package.json",
        "frontend/package-lock.json", "frontend/postcss.config.js", "frontend/tailwind.config.js",
        "frontend/tsconfig.json", "frontend/vite.config.ts",
    }
)
EXCLUDED_DIRECTORY_NAMES = frozenset(
    {
        ".git", ".venv", "venv", "env", "ENV", "node_modules", "dist", "build",
        "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".next",
        ".turbo", ".cache", ".vite", "coverage", "htmlcov", "site-packages",
    }
)
EXCLUDED_SOURCE_SUFFIXES = frozenset(
    {
        ".pyc", ".pyo", ".pyd", ".so", ".dylib", ".log", ".sqlite", ".sqlite3",
        ".db", ".dump", ".age", ".emailsaver", ".p12", ".pfx", ".secret",
    }
)


def sha256_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    byte_count = 0
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
            byte_count += len(chunk)
    return digest.hexdigest(), byte_count


def _deployment_path_is_allowlisted(relative: PurePosixPath, is_directory: bool) -> bool:
    value = relative.as_posix()
    parts = relative.parts
    if any(part in EXCLUDED_DIRECTORY_NAMES for part in parts):
        return False
    if _is_forbidden_env_path(value, is_directory):
        return False
    if not is_directory and value == ".env.example":
        return True
    if any(part.startswith(".") for part in parts):
        return False
    if is_directory and value == ".":
        return True
    if not is_directory:
        if relative.suffix.lower() in EXCLUDED_SOURCE_SUFFIXES:
            return False
        in_certificate_tree = value.startswith("nginx/certs/")
        if relative.suffix.lower() in (".pem", ".key") and not in_certificate_tree:
            return False
        if relative.name.lower().startswith(("id_rsa", "id_ed25519", "credentials.", "secrets.")) and not in_certificate_tree:
            return False
        if value in ALLOWED_DEPLOYMENT_FILES:
            return True
        return any(value.startswith(directory + "/") for directory in ALLOWED_DEPLOYMENT_DIRECTORIES)
    return any(
        value == directory
        or value.startswith(directory + "/")
        or directory.startswith(value + "/")
        for directory in ALLOWED_DEPLOYMENT_DIRECTORIES
    )


def _is_forbidden_env_path(value: str, is_directory: bool = False) -> bool:
    """Permit only the checked-in root template; every other .env* is excluded."""
    if not is_directory and value in (".env.example", "deployment/.env.example"):
        return False
    return any(part == ".env" or part == ".env.runtime" or part.startswith(".env.") for part in PurePosixPath(value).parts)


def validate_manifest(manifest: Any) -> dict[str, Any]:
    if (not isinstance(manifest, dict) or manifest.get("format") != FORMAT
            or type(manifest.get("version")) is not int or manifest.get("version") != VERSION):
        raise ValueError("El manifiesto del respaldo no tiene un formato compatible.")
    created_at = manifest.get("created_at")
    if not isinstance(created_at, str):
        raise ValueError("El manifiesto no contiene una fecha de captura válida.")
    try:
        parsed_created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        if parsed_created_at.tzinfo is None:
            raise ValueError("La fecha no incluye zona horaria.")
    except ValueError as exc:
        raise ValueError("La fecha de captura del manifiesto no es válida.") from exc
    if manifest.get("encryption") != "age" or manifest.get("retention_days") != 14:
        raise ValueError("El manifiesto no coincide con la política de cifrado o retención esperada.")
    if manifest.get("schedule") != "daily 02:00 UTC":
        raise ValueError("El manifiesto no coincide con la programación diaria esperada.")
    if manifest.get("consistency_check") != (
        "source tree hashes and metadata matched before and after database capture and after the media archive"
    ):
        raise ValueError("El manifiesto no acredita la comprobación de consistencia de archivos.")
    excluded = manifest.get("excluded")
    expected_exclusions = {
        ".env", ".env.runtime", "node_modules", "dist", "build", ".venv", ".git",
        "Python/JS caches", "compiled files", "all .env.* except the checked-in .env.example template",
    }
    if not isinstance(excluded, list) or not expected_exclusions.issubset(set(excluded)):
        raise ValueError("El manifiesto no confirma la exclusión de los archivos de entorno.")
    components = manifest.get("components")
    if not isinstance(components, dict):
        raise ValueError("El manifiesto no enumera los componentes cifrados.")
    for filename in ("database.dump.age", "media-config.tar.gz.age"):
        entry = components.get(filename)
        if not isinstance(entry, dict):
            raise ValueError(f"Falta el componente cifrado {filename}.")
        if not isinstance(entry.get("sha256"), str) or len(entry["sha256"]) != 64:
            raise ValueError(f"El checksum de {filename} no es válido.")
        try:
            int(entry["sha256"], 16)
        except ValueError as exc:
            raise ValueError(f"El checksum de {filename} no es válido.") from exc
        if type(entry.get("bytes")) is not int or entry["bytes"] <= len(AGE_HEADER):
            raise ValueError(f"El tamaño de {filename} no es válido.")
    inventory = manifest.get("source_inventory")
    if not isinstance(inventory, list) or any(not isinstance(item, dict) for item in inventory):
        raise ValueError("El inventario de archivos del manifiesto no es válido.")
    inventory_paths: set[str] = set()
    for item in inventory:
        name = item.get("path")
        kind = item.get("kind")
        if not isinstance(name, str) or kind not in ("file", "directory"):
            raise ValueError("El inventario contiene una ruta o tipo inválido.")
        normalized = PurePosixPath(name)
        if (normalized.is_absolute() or ".." in normalized.parts or not normalized.parts
                or "\\" in name or "\x00" in name):
            raise ValueError("El inventario contiene una ruta insegura.")
        if normalized.parts[0] not in ("vault_media", "deployment"):
            raise ValueError("El inventario enumera contenido fuera de los componentes permitidos.")
        if _is_forbidden_env_path(normalized.as_posix(), kind == "directory"):
            raise ValueError("El manifiesto no puede incluir variables de entorno activas.")
        if name in inventory_paths:
            raise ValueError("El inventario contiene rutas duplicadas.")
        inventory_paths.add(name)
        if normalized.parts[0] == "deployment":
            deployment_relative = PurePosixPath(*normalized.parts[1:])
            if not _deployment_path_is_allowlisted(deployment_relative, kind == "directory"):
                raise ValueError(f"El manifiesto incluye contenido fuera de la lista permitida: {name}")
        if kind == "file":
            if type(item.get("size")) is not int or item["size"] < 0:
                raise ValueError("El inventario contiene un tamaño de archivo inválido.")
            digest = item.get("sha256")
            if not isinstance(digest, str) or len(digest) != 64:
                raise ValueError("El inventario contiene un checksum inválido.")
            try:
                int(digest, 16)
            except ValueError as exc:
                raise ValueError("El inventario contiene un checksum inválido.") from exc
        for attribute in ("mtime_ns", "ctime_ns", "device", "inode", "mode"):
            if type(item.get(attribute)) is not int or item[attribute] < 0:
                raise ValueError(f"El inventario contiene metadatos inválidos ({attribute}).")
    required_inventory = {
        "vault_media",
        "deployment/docker-compose.yml",
        "deployment/.env.example",
        "deployment/README.md",
        "deployment/RUNBOOK.md",
        "deployment/PRODUCT.md",
        "deployment/SEGURIDAD.md",
        "deployment/pytest.ini",
        "deployment/backend/app/main.py",
        "deployment/backend/alembic.ini",
        "deployment/backend/migrations/env.py",
        "deployment/backend/requirements.txt",
        "deployment/backend/Dockerfile",
        "deployment/backend/pytest.ini",
        "deployment/backend/tests/conftest.py",
        "deployment/backend/tests/test_writeups.py",
        "deployment/frontend/tests/writeups.test.mjs",
        "deployment/frontend/src/main.tsx",
        "deployment/frontend/src/App.tsx",
        "deployment/frontend/public/robots.txt",
        "deployment/frontend/package.json",
        "deployment/frontend/package-lock.json",
        "deployment/frontend/index.html",
        "deployment/frontend/postcss.config.js",
        "deployment/frontend/tailwind.config.js",
        "deployment/frontend/tsconfig.json",
        "deployment/frontend/vite.config.ts",
        "deployment/frontend/Dockerfile",
        "deployment/docs/auditoria-secretos.md",
        "deployment/nginx/certs/local/ca.crt",
        "deployment/nginx/certs/local/ca.key",
        "deployment/nginx/certs/local/server.crt",
        "deployment/nginx/certs/local/server.key",
    }
    if not required_inventory.issubset(inventory_paths):
        raise ValueError("El manifiesto no incluye PostgreSQL, vault_media y la configuración/certificados requeridos.")
    return manifest


def validate_encrypted_artifact(path: Path, declared: dict[str, Any] | None = None) -> None:
    with path.open("rb") as handle:
        header = handle.readline(128)
    if not header.startswith(AGE_HEADER):
        raise ValueError(f"{path.name} no tiene una cabecera age válida.")
    if declared is not None:
        digest, size = sha256_file(path)
        if digest != declared["sha256"] or size != declared["bytes"]:
            raise ValueError(f"El checksum o tamaño de {path.name} no coincide con el manifiesto.")


def decrypt_artifact(source: Path, destination: Path, identity: Path) -> None:
    result = subprocess.run(
        ["age", "--decrypt", "--identity", str(identity), "--output", str(destination), str(source)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"No se pudo descifrar {source.name}; revisa que la identidad age corresponda al destinatario.")


def _validated_members(archive: tarfile.TarFile) -> list[tarfile.TarInfo]:
    members = archive.getmembers()
    seen: set[str] = set()
    by_name: dict[str, tarfile.TarInfo] = {}
    for member in members:
        normalized = PurePosixPath(member.name)
        if (normalized.is_absolute() or ".." in normalized.parts or not normalized.parts
                or "\\" in member.name or "\x00" in member.name):
            raise ValueError("El archivo contiene una ruta que saldría del área temporal de restauración.")
        clean_name = normalized.as_posix().rstrip("/")
        if clean_name in seen:
            raise ValueError("El archivo contiene rutas duplicadas.")
        seen.add(clean_name)
        by_name[clean_name] = member
        if normalized.parts[0] not in ("vault_media", "deployment"):
            raise ValueError("El archivo contiene una sección fuera de los componentes permitidos.")
        if _is_forbidden_env_path(normalized.as_posix(), member.isdir()):
            raise ValueError("El archivo contiene una variable de entorno excluida.")
        if normalized.parts[0] == "deployment":
            deployment_relative = PurePosixPath(*normalized.parts[1:])
            if not _deployment_path_is_allowlisted(deployment_relative, member.isdir()):
                raise ValueError(f"El archivo incluye contenido fuera de la lista permitida: {member.name}")
        if not (member.isdir() or member.isfile()):
            raise ValueError("El archivo contiene enlaces o tipos especiales que no se restauran en la prueba.")
        if member.size < 0:
            raise ValueError("El archivo contiene un tamaño inválido.")

    for required in REQUIRED_ARCHIVE_PATHS:
        entry = by_name.get(required)
        is_directory = required == "vault_media"
        if entry is None or (is_directory and not entry.isdir()) or (not is_directory and not entry.isfile()):
            raise ValueError(f"Falta la ruta requerida {required} en el archivo.")
    return members


def validate_and_extract_media_config(archive_path: Path, destination: Path) -> list[str]:
    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    with tarfile.open(archive_path, mode="r:gz") as archive:
        members = _validated_members(archive)
        root = destination.resolve()
        for member in members:
            relative = PurePosixPath(member.name)
            target = root.joinpath(*relative.parts)
            resolved_parent = target.parent.resolve()
            if root != resolved_parent and root not in resolved_parent.parents:
                raise ValueError("El archivo contiene una ruta insegura.")
            if member.isdir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
                continue
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            extracted = archive.extractfile(member)
            if extracted is None:
                raise ValueError(f"No se pudo leer {member.name} del archivo.")
            with extracted, target.open("xb") as output:
                shutil.copyfileobj(extracted, output)
            target.chmod(stat.S_IRUSR | stat.S_IWUSR)
    return [member.name for member in members]


def verify_extracted_inventory(destination: Path, inventory: list[dict[str, Any]]) -> None:
    expected = {item["path"]: item for item in inventory}
    actual: set[str] = set()
    for root_name in ("vault_media", "deployment"):
        root = destination / root_name
        if not root.is_dir() or root.is_symlink():
            raise ValueError(f"No se restauró el directorio requerido {root_name}.")
        actual.add(root_name)
        for path in root.rglob("*"):
            relative = path.relative_to(destination).as_posix()
            if path.is_symlink():
                raise ValueError("El contenido extraído incluye un enlace simbólico no permitido.")
            if path.is_dir():
                actual.add(relative)
                continue
            if not path.is_file():
                raise ValueError("El contenido extraído incluye un tipo de archivo no permitido.")
            actual.add(relative)
    if actual != set(expected):
        raise ValueError("El inventario restaurado no coincide con las rutas incluidas en el manifiesto.")

    for name, item in expected.items():
        path = destination / PurePosixPath(name)
        if item["kind"] == "directory":
            if not path.is_dir():
                raise ValueError(f"El manifiesto esperaba un directorio: {name}")
            continue
        if not path.is_file():
            raise ValueError(f"El manifiesto esperaba un archivo: {name}")
        digest, size = sha256_file(path)
        if digest != item["sha256"] or size != item["size"]:
            raise ValueError(f"La huella de {name} no coincide con el manifiesto.")


def _run_checked(command: list[str], *, input_file: Path | None = None) -> subprocess.CompletedProcess[str]:
    source = input_file.open("rb") if input_file else None
    try:
        result = subprocess.run(
            command,
            stdin=source,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=source is None,
            check=False,
        )
    finally:
        if source:
            source.close()
    if result.returncode != 0:
        error = result.stderr if isinstance(result.stderr, str) else result.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"Falló la validación/restauración aislada ({command[0]}): {error.strip()}")
    return result


def _wait_for_postgres(container: str, timeout_seconds: int = 90) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        check = subprocess.run(
            ["docker", "exec", container, "pg_isready", "-U", "postgres", "-d", "restore_test"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if check.returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError("El PostgreSQL aislado no inició dentro del tiempo esperado.")


def require_local_docker_context() -> None:
    override = os.environ.get("DOCKER_HOST", "")
    if override and not override.startswith("unix://"):
        raise RuntimeError("La prueba solo permite un daemon Docker local unix; no se usarán hosts remotos.")
    context_name = subprocess.run(
        ["docker", "context", "show"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False
    )
    if context_name.returncode != 0:
        raise RuntimeError("No se pudo identificar el contexto Docker local.")
    inspected = subprocess.run(
        ["docker", "context", "inspect", context_name.stdout.strip()],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if inspected.returncode != 0:
        raise RuntimeError("No se pudo inspeccionar el contexto Docker actual.")
    try:
        context_data = json.loads(inspected.stdout)[0]
        host = context_data["Endpoints"]["docker"]["Host"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("El contexto Docker actual no es verificable.") from exc
    if not host.startswith("unix://"):
        raise RuntimeError("La prueba solo permite un daemon Docker local unix; no se usarán hosts remotos.")


def _restore_isolated_database(database_dump: Path) -> dict[str, int]:
    container = "lessso-restore-test-" + uuid.uuid4().hex[:12]
    started = False
    try:
        _run_checked(
            [
                "docker", "run", "--detach", "--rm", "--name", container,
                "--network", "none",
                "--env", "POSTGRES_PASSWORD=" + secrets.token_urlsafe(24),
                "--env", "POSTGRES_USER=postgres",
                "--env", "POSTGRES_DB=restore_test",
                # The Postgres image's anonymous data volume is unique to this
                # container and Docker removes it with --rm, avoiding host
                # ownership residue after the postgres user initializes PGDATA.
                "postgres:16-alpine",
            ]
        )
        started = True
        _wait_for_postgres(container)
        _run_checked(
            [
                "docker", "exec", "--interactive", container, "pg_restore",
                "--exit-on-error", "--no-owner", "--no-privileges",
                "--username", "postgres", "--dbname", "restore_test",
            ],
            input_file=database_dump,
        )
        table_list = _run_checked(
            [
                "docker", "exec", container, "psql", "-U", "postgres", "-d", "restore_test",
                "-At", "-c",
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
            ]
        ).stdout.splitlines()
        tables = set(table_list)
        missing = [name.split()[-1] for name in EXPECTED_DB_ENTRIES if name.split()[-1] not in tables]
        if missing:
            raise RuntimeError("La base restaurada no contiene las tablas requeridas: " + ", ".join(missing))

        rows = _run_checked(
            [
                "docker", "exec", container, "psql", "-U", "postgres", "-d", "restore_test",
                "-At", "-c",
                "SELECT 'writeups=' || count(*) FROM writeups UNION ALL "
                "SELECT 'writeup_assets=' || count(*) FROM writeup_assets",
            ]
        ).stdout.splitlines()
        counts: dict[str, int] = {}
        for row in rows:
            key, value = row.split("=", 1)
            counts[key] = int(value)
        return counts
    finally:
        if started:
            subprocess.run(["docker", "rm", "--force", container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def run_restore_test(backup_dir: Path, identity: Path) -> dict[str, Any]:
    if not backup_dir.is_dir():
        raise RuntimeError("No existe el directorio de snapshot indicado.")
    if not identity.is_file():
        raise RuntimeError("No existe el archivo de identidad privada age indicado.")
    if os.name == "posix" and stat.S_IMODE(identity.stat().st_mode) & 0o077:
        raise RuntimeError("Protege la identidad privada age con permisos 600 antes de usarla.")

    with tempfile.TemporaryDirectory(prefix="lessso-full-restore-test-") as temporary:
        work_dir = Path(temporary)
        manifest_enc = backup_dir / "manifest.json.age"
        validate_encrypted_artifact(manifest_enc)
        manifest_path = work_dir / "manifest.json"
        decrypt_artifact(manifest_enc, manifest_path, identity)
        manifest = validate_manifest(json.loads(manifest_path.read_text(encoding="utf-8")))

        encrypted_components = {}
        for filename in ("database.dump.age", "media-config.tar.gz.age"):
            path = backup_dir / filename
            declared = manifest["components"][filename]
            validate_encrypted_artifact(path, declared)
            encrypted_components[filename] = path

        database_dump = work_dir / "database.dump"
        media_archive = work_dir / "media-config.tar.gz"
        decrypt_artifact(encrypted_components["database.dump.age"], database_dump, identity)
        decrypt_artifact(encrypted_components["media-config.tar.gz.age"], media_archive, identity)
        archive_listing = _run_checked(["pg_restore", "--list", str(database_dump)]).stdout
        missing_dump_entries = [entry for entry in EXPECTED_DB_ENTRIES if entry not in archive_listing]
        if missing_dump_entries:
            raise RuntimeError("El dump no incluye estas tablas de aplicación: " + ", ".join(missing_dump_entries))

        extracted = work_dir / "extracted"
        members = validate_and_extract_media_config(media_archive, extracted)
        verify_extracted_inventory(extracted, manifest["source_inventory"])
        database_counts = _restore_isolated_database(database_dump)
        return {
            "created_at": manifest["created_at"],
            "archive_entries": len(members),
            "database_tables_checked": len(EXPECTED_DB_ENTRIES),
            "database_counts": database_counts,
            "extracted_config_root": str(extracted),
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup-dir", required=True, type=Path, help="Directorio full-... del volumen de respaldos copiado a este equipo.")
    parser.add_argument("--identity-file", required=True, type=Path, help="Identidad privada age guardada fuera del servidor.")
    parser.add_argument(
        "--confirm-isolated-docker",
        action="store_true",
        help="Confirma que se creará un PostgreSQL temporal, sin red y sin volúmenes del CRM.",
    )
    args = parser.parse_args(argv)
    if not args.confirm_isolated_docker:
        parser.error("Añade --confirm-isolated-docker para autorizar el contenedor efímero de prueba.")
    for executable in ("age", "pg_restore", "docker"):
        if shutil.which(executable) is None:
            print(f"Falta la herramienta requerida: {executable}.", file=sys.stderr)
            return 2
    try:
        require_local_docker_context()
        result = run_restore_test(args.backup_dir, args.identity_file)
    except Exception as exc:
        print(f"La prueba de restauración aislada falló: {exc}", file=sys.stderr)
        return 1
    print("Restauración de prueba completada en un PostgreSQL temporal aislado.")
    print(f"Fecha del snapshot: {result['created_at']}")
    print(f"Elementos extraídos en el espacio temporal: {result['archive_entries']}")
    print(f"Tablas críticas verificadas: {result['database_tables_checked']}")
    print(f"Conteos no sensibles: {result['database_counts']}")
    print("No se abrió Compose ni se montaron volúmenes del CRM; no se modificó el despliegue activo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
