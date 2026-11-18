#!/usr/bin/env python3
"""Create age-encrypted full backup snapshots without persisting plaintext files."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable


FORMAT = "lessso-full-backup"
VERSION = 2
RETENTION_DAYS = 14
SCHEDULE_HOUR_UTC = 2
MAX_MEDIA_CAPTURE_ATTEMPTS = 3
AGE_HEADER = b"age-encryption.org/v1\n"
SNAPSHOT_PATTERN = re.compile(r"^full-(\d{8}T\d{6}Z)$")
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
        "docker-compose.yml",
        "docker-compose.dev.yml",
        ".env.example",
        "README.md",
        "RUNBOOK.md",
        "PRODUCT.md",
        "SEGURIDAD.md",
        "Recomendations.md",
        "pytest.ini",
        "backend/Dockerfile",
        "backend/alembic.ini",
        "backend/pytest.ini",
        "backend/requirements.txt",
        "frontend/Dockerfile",
        "frontend/index.html",
        "frontend/package.json",
        "frontend/package-lock.json",
        "frontend/postcss.config.js",
        "frontend/tailwind.config.js",
        "frontend/tsconfig.json",
        "frontend/vite.config.ts",
    }
)
REQUIRED_DEPLOYMENT_PATHS = (
    "README.md",
    "RUNBOOK.md",
    "docker-compose.yml",
    "docker-compose.dev.yml",
    ".env.example",
    "backend/app/main.py",
    "backend/alembic.ini",
    "backend/migrations/env.py",
    "backend/requirements.txt",
    "backend/Dockerfile",
    "backend/pytest.ini",
    "backend/tests/conftest.py",
    "backend/tests/test_writeups.py",
    "frontend/tests/writeups.test.mjs",
    "frontend/src/main.tsx",
    "frontend/src/App.tsx",
    "frontend/public/robots.txt",
    "frontend/package.json",
    "frontend/package-lock.json",
    "frontend/index.html",
    "frontend/postcss.config.js",
    "frontend/tailwind.config.js",
    "frontend/tsconfig.json",
    "frontend/vite.config.ts",
    "frontend/Dockerfile",
    "pytest.ini",
    "PRODUCT.md",
    "SEGURIDAD.md",
    "Recomendations.md",
    "docs/auditoria-secretos.md",
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
SOURCE_TEXT_SUFFIXES = frozenset(
    {".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".html", ".css", ".svg", ".txt", ".yaml", ".yml", ".toml", ".ini", ".conf", ".template", ".sh", ".md", ".rst", ".example"}
)
SENSITIVE_SOURCE_PATTERNS = (
    ("private-key block", re.compile(b"-----BEGIN " + rb"(?:RSA |EC |OPENSSH )?" + b"PRIVATE KEY-----")),
    ("AWS access key", re.compile(rb"\bAKIA[0-9A-Z]{16}\b")),
    ("Google API key", re.compile(rb"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("GitHub token", re.compile(rb"\bgh[pousr]_[A-Za-z0-9_]{30,}\b")),
    ("Slack token", re.compile(rb"\bxox[baprs]-[A-Za-z0-9-]{20,}\b")),
    ("OpenAI API key", re.compile(rb"\bsk-[A-Za-z0-9_-]{24,}\b")),
    ("hard-coded credential", re.compile(rb"(?i)\b(?:api[_-]?key|client[_-]?secret|password|secret[_-]?key|access[_-]?token)\s*[:=]\s*[\"']([A-Za-z0-9_./+=-]{20,})[\"']")),
    ("database URL credential", re.compile(rb"(?i)postgres(?:ql)?(?:\+\w+)?://[^:\s\"']+:[^@\s\"']+@")),
    ("bearer token", re.compile(rb"(?i)\bbearer\s+[A-Za-z0-9._-]{24,}")),
    ("JWT token", re.compile(rb"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
)


class MediaChangedDuringCapture(RuntimeError):
    """The source files changed during the DB/media capture window."""


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def seconds_until_next_run(now: datetime, hour_utc: int = SCHEDULE_HOUR_UTC) -> float:
    next_run = now.astimezone(timezone.utc).replace(hour=hour_utc, minute=0, second=0, microsecond=0)
    if next_run <= now.astimezone(timezone.utc):
        next_run += timedelta(days=1)
    return max(1.0, (next_run - now.astimezone(timezone.utc)).total_seconds())


def require_age_recipient(recipient: str | None) -> str:
    if not recipient or not recipient.startswith("age1") or any(ch.isspace() for ch in recipient):
        raise RuntimeError(
            "BACKUP_AGE_RECIPIENT falta o no parece una clave pública age. "
            "En un equipo confiable fuera de este servidor, genera una identidad con "
            "`age-keygen -o lessso-backup-identity.txt`; guarda ese archivo privado fuera "
            "del servidor y agrega únicamente el valor age1... que sigue a `# public key:` "
            "como BACKUP_AGE_RECIPIENT en la configuración local. No copies la identidad privada aquí."
        )
    return recipient


def verify_recipient(recipient: str) -> None:
    probe = subprocess.run(
        ["age", "--encrypt", "--recipient", recipient],
        input=b"lessso-backup-recipient-check",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if probe.returncode != 0 or not probe.stdout.startswith(AGE_HEADER):
        raise RuntimeError(
            "BACKUP_AGE_RECIPIENT no es aceptada por age. Configura la clave pública age1... "
            "correspondiente a una identidad privada guardada fuera del servidor."
        )


def sha256_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    byte_count = 0
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
            byte_count += len(chunk)
    return digest.hexdigest(), byte_count


def _deployment_path_is_allowlisted(relative: Path, is_directory: bool) -> bool:
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
    if not is_directory and value == ".env.example":
        return False
    return any(part == ".env" or part == ".env.runtime" or part.startswith(".env.") for part in Path(value).parts)


def _check_source_for_embedded_secrets(path: Path, archive_path: str) -> None:
    if archive_path.startswith("deployment/nginx/certs/") or path.suffix.lower() not in SOURCE_TEXT_SUFFIXES:
        return
    raw = path.read_bytes()
    for label, pattern in SENSITIVE_SOURCE_PATTERNS:
        if pattern.search(raw):
            raise RuntimeError(
                f"No se incluye {archive_path}: el análisis local detectó un patrón de {label}. "
                "Mueve ese secreto fuera del código fuente y usa el gestor de configuración."
            )


def tree_inventory(sources: Iterable[tuple[str, Path]]) -> list[dict[str, object]]:
    """Hash every file and record metadata; reject links and non-regular entries."""
    inventory: list[dict[str, object]] = []
    for archive_root, root in sources:
        if not root.is_dir():
            raise RuntimeError(f"No existe el directorio requerido para el respaldo: {archive_root}")
        root_info = root.stat(follow_symlinks=False)
        inventory.append({
            "path": archive_root,
            "kind": "directory",
            "mtime_ns": root_info.st_mtime_ns,
            "ctime_ns": root_info.st_ctime_ns,
            "device": root_info.st_dev,
            "inode": root_info.st_ino,
            "mode": root_info.st_mode & 0o7777,
        })
        selected: list[Path] = []
        for current, directory_names, filenames in os.walk(root, topdown=True, followlinks=False):
            current_path = Path(current)
            kept_directories = []
            for directory_name in sorted(directory_names):
                path = current_path / directory_name
                relative_path = path.relative_to(root)
                relative_parts = relative_path.parts
                if _is_forbidden_env_path(Path(*relative_parts).as_posix(), path.is_dir()):
                    raise RuntimeError("El respaldo nunca puede incluir .env ni archivos .env.*.")
                if archive_root == "deployment" and not _deployment_path_is_allowlisted(relative_path, True):
                    continue
                if path.is_symlink():
                    raise RuntimeError(f"El respaldo completo no admite enlaces simbólicos: {archive_root}/{relative_path.as_posix()}")
                selected.append(path)
                kept_directories.append(directory_name)
            directory_names[:] = kept_directories

            for filename in sorted(filenames):
                path = current_path / filename
                relative_path = path.relative_to(root)
                relative_parts = relative_path.parts
                if _is_forbidden_env_path(Path(*relative_parts).as_posix(), path.is_dir()):
                    raise RuntimeError("El respaldo nunca puede incluir .env ni archivos .env.*.")
                if archive_root == "deployment" and not _deployment_path_is_allowlisted(relative_path, False):
                    continue
                selected.append(path)

        for path in sorted(selected, key=lambda item: item.as_posix()):
            relative = path.relative_to(root).as_posix()
            archive_path = f"{archive_root}/{relative}" if relative != "." else archive_root
            if path.is_symlink():
                raise RuntimeError(f"El respaldo completo no admite enlaces simbólicos: {archive_path}")
            info = path.stat(follow_symlinks=False)
            if path.is_dir():
                inventory.append({
                    "path": archive_path,
                    "kind": "directory",
                    "mtime_ns": info.st_mtime_ns,
                    "ctime_ns": info.st_ctime_ns,
                    "device": info.st_dev,
                    "inode": info.st_ino,
                    "mode": info.st_mode & 0o7777,
                })
                continue
            if not path.is_file():
                raise RuntimeError(f"Tipo de archivo no admitido en el respaldo: {archive_path}")
            if archive_root == "deployment":
                _check_source_for_embedded_secrets(path, archive_path)
            digest, size = sha256_file(path)
            inventory.append(
                {
                    "path": archive_path,
                    "kind": "file",
                    "size": size,
                    "sha256": digest,
                    "mtime_ns": info.st_mtime_ns,
                    "ctime_ns": info.st_ctime_ns,
                    "device": info.st_dev,
                    "inode": info.st_ino,
                    "mode": info.st_mode & 0o7777,
                }
            )
    return inventory


def require_deployment_certificates(sources: Iterable[tuple[str, Path]]) -> None:
    deployment = next((root for name, root in sources if name == "deployment"), None)
    if deployment is None:
        raise RuntimeError("Falta el árbol de configuración/certificados del despliegue.")
    missing_source = [name for name in REQUIRED_DEPLOYMENT_PATHS if not (deployment / name).is_file()]
    if missing_source:
        raise RuntimeError(
            "No se publicó el respaldo: faltan archivos fuente/de configuración requeridos: "
            + ", ".join(missing_source)
        )
    expected = (
        "nginx/certs/local/ca.crt",
        "nginx/certs/local/ca.key",
        "nginx/certs/local/server.crt",
        "nginx/certs/local/server.key",
    )
    missing = [name for name in expected if not (deployment / name).is_file()]
    if missing:
        raise RuntimeError(
            "No se publicó el respaldo: faltan certificados o claves TLS requeridos en nginx/certs/local. "
            "Recupéralos desde su custodia segura antes de activar el respaldo."
        )
    unreadable = [name for name in expected if not os.access(deployment / name, os.R_OK)]
    if unreadable:
        raise RuntimeError(
            "El contenedor de respaldo no puede leer los certificados requeridos. "
            "Conserva sus permisos actuales; revisa el acceso de solo lectura DAC_READ_SEARCH del perfil full-backup."
        )


def check_backup_volume(root: Path) -> None:
    """Fail early unless the dedicated encrypted-output volume is writable."""
    try:
        with tempfile.NamedTemporaryFile(prefix=".write-check-", dir=root) as handle:
            handle.write(b"ok")
            handle.flush()
    except OSError as exc:
        raise RuntimeError(
            "El volumen dedicado full_backup_data no es escribible por el servicio. "
            "Un volumen nuevo se inicializa con /var/backups/full como root:root, modo 0700."
        ) from exc


def _age_encrypt_stream(source_command: list[str], destination: Path, recipient: str, source_env: dict[str, str] | None = None) -> None:
    """Pipe a plaintext producer directly to age; do not stage plaintext on disk."""
    with destination.open("xb") as output:
        producer = subprocess.Popen(
            source_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=source_env,
        )
        assert producer.stdout is not None
        with producer.stdout:
            encryptor = subprocess.Popen(
                ["age", "--encrypt", "--recipient", recipient],
                stdin=producer.stdout,
                stdout=output,
                stderr=subprocess.PIPE,
            )
        age_stderr = encryptor.communicate()[1]
        producer_stderr = producer.communicate()[1]
        producer_status = producer.returncode
        age_status = encryptor.returncode

    if producer_status != 0:
        destination.unlink(missing_ok=True)
        message = producer_stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"Falló la captura del componente del respaldo (código {producer_status}). {message}")
    if age_status != 0:
        destination.unlink(missing_ok=True)
        message = age_stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"age no pudo cifrar un componente del respaldo. {message}")
    validate_age_artifact(destination)


def validate_age_artifact(path: Path) -> dict[str, object]:
    with path.open("rb") as handle:
        header = handle.readline(128)
    if not header.startswith(AGE_HEADER):
        raise RuntimeError(f"El artefacto cifrado no tiene cabecera age válida: {path.name}")
    digest, size = sha256_file(path)
    if size <= len(AGE_HEADER):
        raise RuntimeError(f"El artefacto cifrado está vacío o incompleto: {path.name}")
    return {"sha256": digest, "bytes": size}


def encrypt_bytes(raw: bytes, destination: Path, recipient: str) -> None:
    with destination.open("xb") as output:
        result = subprocess.run(
            ["age", "--encrypt", "--recipient", recipient],
            input=raw,
            stdout=output,
            stderr=subprocess.PIPE,
            check=False,
        )
    if result.returncode != 0:
        destination.unlink(missing_ok=True)
        raise RuntimeError("age no pudo cifrar el manifiesto del respaldo.")
    validate_age_artifact(destination)


def _source_roots() -> list[tuple[str, Path]]:
    return [
        ("vault_media", Path(os.environ.get("BACKUP_MEDIA_SOURCE", "/source/vault_media"))),
        ("deployment", Path(os.environ.get("BACKUP_DEPLOYMENT_SOURCE", "/source/deployment"))),
    ]


def _database_command() -> tuple[list[str], dict[str, str]]:
    env = os.environ.copy()
    for required in ("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"):
        if not env.get(required):
            raise RuntimeError(f"Falta la variable de conexión {required} en el servicio de respaldo.")
    env["PGPASSWORD"] = env["POSTGRES_PASSWORD"]
    command = [
        "pg_dump",
        "--no-password",
        "--format=custom",
        "--host", env.get("POSTGRES_HOST", "db"),
        "--port", env.get("POSTGRES_PORT", "5432"),
        "--username", env["POSTGRES_USER"],
        "--dbname", env["POSTGRES_DB"],
    ]
    return command, env


def _media_archive_command(file_list: Path, source_root: str | Path = "/source") -> list[str]:
    # These are explicit read-only mounts. The active .env and .env.runtime are
    # intentionally not mounted and cannot enter this archive. --no-recursion
    # makes the NUL-delimited inventory the exact archive allowlist.
    return [
        "tar", "--create", "--gzip", "--file=-", "--sort=name", "--numeric-owner",
        "--no-recursion", "--null", f"--directory={source_root}", f"--files-from={file_list}",
    ]


def _snapshot_name(now: datetime) -> str:
    return "full-" + now.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _cleanup_abandoned_partials(root: Path) -> None:
    cutoff = time.time() - 24 * 60 * 60
    for path in root.glob(".partial-*"):
        try:
            if path.is_dir() and not path.is_symlink() and path.stat().st_mtime < cutoff:
                shutil.rmtree(path)
        except OSError as exc:
            print(f"No se pudo retirar un respaldo parcial antiguo: {exc}", file=sys.stderr)


def prune_expired_snapshots(root: Path, now: datetime, retention_days: int = RETENTION_DAYS) -> list[str]:
    cutoff = now.astimezone(timezone.utc) - timedelta(days=retention_days)
    removed: list[str] = []
    for path in root.iterdir():
        match = SNAPSHOT_PATTERN.fullmatch(path.name)
        if not match or path.is_symlink() or not path.is_dir():
            continue
        snapshot_time = datetime.strptime(match.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        if snapshot_time < cutoff:
            shutil.rmtree(path)
            removed.append(path.name)
    return removed


def create_snapshot(recipient: str, now: datetime | None = None) -> Path:
    root = Path(os.environ.get("BACKUP_ROOT", "/var/backups/full"))
    root.mkdir(parents=True, exist_ok=True)
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError("La ubicación aislada del respaldo no es un directorio seguro.")
    os.umask(0o077)
    check_backup_volume(root)
    _cleanup_abandoned_partials(root)

    stamp = now or utc_now()
    final_path = root / _snapshot_name(stamp)
    if final_path.exists():
        raise RuntimeError(f"Ya existe un respaldo con este sello horario: {final_path.name}")

    sources = _source_roots()
    require_deployment_certificates(sources)
    database_command, database_env = _database_command()
    last_change_error: Exception | None = None

    for attempt in range(1, MAX_MEDIA_CAPTURE_ATTEMPTS + 1):
        with tempfile.TemporaryDirectory(prefix=".partial-", dir=root) as temporary:
            work = Path(temporary)
            media_path = work / "media-config.tar.gz.age"
            database_path = work / "database.dump.age"
            try:
                initial_inventory = tree_inventory(sources)
                _age_encrypt_stream(database_command, database_path, recipient, source_env=database_env)
                if tree_inventory(sources) != initial_inventory:
                    raise MediaChangedDuringCapture("vault_media o la configuración cambió mientras se capturaba PostgreSQL.")
                inventory_file = tempfile.NamedTemporaryFile(prefix="lessso-backup-files-", dir="/tmp", delete=False)
                inventory_path = Path(inventory_file.name)
                try:
                    inventory_file.write(
                        b"\0".join(os.fsencode(item["path"]) for item in initial_inventory) + b"\0"
                    )
                    inventory_file.close()
                    _age_encrypt_stream(_media_archive_command(inventory_path), media_path, recipient)
                finally:
                    inventory_file.close()
                    inventory_path.unlink(missing_ok=True)
                if tree_inventory(sources) != initial_inventory:
                    raise MediaChangedDuringCapture(
                        "vault_media o la configuración cambiaron durante la copia de archivos."
                    )

                components = {
                    media_path.name: validate_age_artifact(media_path),
                    database_path.name: validate_age_artifact(database_path),
                }
                manifest = {
                    "format": FORMAT,
                    "version": VERSION,
                    "created_at": stamp.astimezone(timezone.utc).isoformat(),
                    "schedule": "daily 02:00 UTC",
                    "retention_days": RETENTION_DAYS,
                    "encryption": "age",
                    "components": components,
                    "source_inventory": initial_inventory,
                    "consistency_check": "source tree hashes and metadata matched before and after database capture and after the media archive",
                    "included": [
                        "PostgreSQL custom-format dump",
                        "vault_media volume contents",
                        "backend/app, migrations and tests with requirements/alembic/pytest config",
                        "frontend/src, tests and public assets with package manifests/build config",
                        "root pytest config, product/security docs, docs tree and safe .env.example template",
                        "README/RUNBOOK, deployment scripts, Dockerfiles, nginx config and certificates",
                    ],
                    "excluded": [
                        ".env", ".env.runtime", "Redis runtime state", "C2 runtime socket state",
                        "all .env.* except the checked-in .env.example template", "node_modules", "dist", "build", ".venv", ".git", "Python/JS caches", "compiled files",
                    ],
                }
                manifest_path = work / "manifest.json.age"
                encrypt_bytes(
                    json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"),
                    manifest_path,
                    recipient,
                )
                validate_age_artifact(manifest_path)

                os.replace(work, final_path)
                removed = prune_expired_snapshots(root, stamp)
                if removed:
                    print(f"Retención aplicada: {len(removed)} respaldo(s) de más de {RETENTION_DAYS} días eliminado(s).")
                return final_path
            except MediaChangedDuringCapture as exc:
                last_change_error = exc
                print(f"Archivos cambiaron durante la captura; se descarta y reintenta ({attempt}/{MAX_MEDIA_CAPTURE_ATTEMPTS}).", file=sys.stderr)
                continue

    raise RuntimeError(
        f"No se publicó ningún respaldo: los archivos cambiaron durante {MAX_MEDIA_CAPTURE_ATTEMPTS} intentos. "
        f"Último detalle: {last_change_error}"
    )


def run_once() -> Path:
    recipient = require_age_recipient(os.environ.get("BACKUP_AGE_RECIPIENT"))
    verify_recipient(recipient)
    snapshot = create_snapshot(recipient)
    print(f"Respaldo cifrado completo creado: {snapshot.name}")
    return snapshot


def run_schedule() -> None:
    # Create an initial snapshot immediately, then run once daily at 02:00 UTC.
    while True:
        try:
            run_once()
        except Exception as exc:
            print(f"No se completó el respaldo; no se publicó un snapshot incompleto. {exc}", file=sys.stderr)
            print("Se reintentará en 5 minutos.", file=sys.stderr)
            time.sleep(5 * 60)
            continue
        delay = seconds_until_next_run(utc_now())
        print(f"Próxima captura diaria en {int(delay)} segundos (02:00 UTC).")
        time.sleep(delay)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Crear solo un snapshot y salir.")
    mode.add_argument("--schedule", action="store_true", help="Crear un snapshot inicial y ejecutar cada día.")
    args = parser.parse_args(argv)
    try:
        recipient = require_age_recipient(os.environ.get("BACKUP_AGE_RECIPIENT"))
        verify_recipient(recipient)
        if args.once:
            snapshot = create_snapshot(recipient)
            print(f"Respaldo cifrado completo creado: {snapshot.name}")
            return 0
        run_schedule()
    except KeyboardInterrupt:
        print("Programador de respaldos detenido.")
        return 130
    except Exception as exc:
        print(f"No se inició el respaldo completo: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
