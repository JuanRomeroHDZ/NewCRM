"""Standard-library tests for the opt-in full backup and isolated restore helpers."""

from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "full_backup"))
sys.path.insert(0, str(REPO_ROOT / "scripts"))
import backup
import restore_full_backup_test as restore_test


class FullBackupUnitTests(unittest.TestCase):
    @staticmethod
    def _populate_required_sources(deployment: Path) -> None:
        required = [*backup.REQUIRED_DEPLOYMENT_PATHS,
                    "nginx/certs/local/ca.crt", "nginx/certs/local/ca.key",
                    "nginx/certs/local/server.crt", "nginx/certs/local/server.key"]
        for name in required:
            path = deployment / name
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                path.write_text("test source", encoding="utf-8")

    def test_missing_recipient_fails_with_offline_key_instructions(self):
        with self.assertRaisesRegex(RuntimeError, "age-keygen.*fuera del servidor"):
            backup.require_age_recipient("")

    def test_schedule_runs_at_next_0200_utc(self):
        before = datetime(2026, 11, 15, 1, 30, tzinfo=timezone.utc)
        after = datetime(2026, 11, 15, 2, 1, tzinfo=timezone.utc)
        self.assertEqual(backup.seconds_until_next_run(before), 30 * 60)
        self.assertEqual(backup.seconds_until_next_run(after), 23 * 60 * 60 + 59 * 60)

    def test_retention_removes_only_expired_complete_snapshots(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            expired = root / "full-20261031T020000Z"
            retained = root / "full-20261114T020000Z"
            partial = root / ".partial-old"
            unrelated = root / "notes"
            for path in (expired, retained, partial, unrelated):
                path.mkdir()
            now = datetime(2026, 11, 15, 2, tzinfo=timezone.utc)

            removed = backup.prune_expired_snapshots(root, now)

            self.assertEqual(removed, [expired.name])
            self.assertFalse(expired.exists())
            self.assertTrue(retained.exists())
            self.assertTrue(partial.exists())
            self.assertTrue(unrelated.exists())

    def test_inventory_refuses_environment_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            media = root / "media"
            deployment = root / "deployment"
            media.mkdir()
            deployment.mkdir()
            (deployment / ".env").write_text("SHOULD_NOT_BE_INCLUDED", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "nunca puede incluir .env"):
                backup.tree_inventory([("vault_media", media), ("deployment", deployment)])

    def test_inventory_omits_dependency_build_and_cache_trees(self):
        with tempfile.TemporaryDirectory() as temp:
            deployment = Path(temp) / "deployment"
            (deployment / "backend" / "app" / "__pycache__").mkdir(parents=True)
            (deployment / "frontend" / "src").mkdir(parents=True)
            (deployment / "frontend" / "node_modules" / "dep").mkdir(parents=True)
            (deployment / "frontend" / "dist").mkdir(parents=True)
            (deployment / "backend" / "app" / "main.py").write_text("app", encoding="utf-8")
            (deployment / "backend" / "app" / "__pycache__" / "main.pyc").write_bytes(b"cache")
            (deployment / "frontend" / "src" / "App.tsx").write_text("ui", encoding="utf-8")
            (deployment / "frontend" / "node_modules" / "dep" / "index.js").write_text("dependency", encoding="utf-8")
            (deployment / "frontend" / "dist" / "bundle.js").write_text("build", encoding="utf-8")

            paths = {item["path"] for item in backup.tree_inventory([("deployment", deployment)])}

            self.assertIn("deployment/backend/app/main.py", paths)
            self.assertIn("deployment/frontend/src/App.tsx", paths)
            self.assertFalse(any("__pycache__" in name or "node_modules" in name or "/dist/" in name for name in paths))

    def test_source_allowlist_includes_recovery_tests_docs_and_only_root_env_template(self):
        with tempfile.TemporaryDirectory() as temp:
            deployment = Path(temp) / "deployment"
            self._populate_required_sources(deployment)
            (deployment / ".env.example").write_text("SERVER_SECRET_KEY=\n", encoding="utf-8")
            (deployment / "docs" / "recovery-guide.md").write_text("Restore notes\n", encoding="utf-8")
            (deployment / "backend" / "tests" / "extra_test.py").write_text("def test_recovery(): pass\n", encoding="utf-8")
            (deployment / "frontend" / "tests" / "extra.test.mjs").write_text("// recovery test\n", encoding="utf-8")
            (deployment / "docs" / ".private.md").write_text("hidden\n", encoding="utf-8")
            (deployment / ".github").mkdir()
            (deployment / ".github" / "workflow.yml").write_text("hidden\n", encoding="utf-8")

            paths = {item["path"] for item in backup.tree_inventory([("deployment", deployment)])}

            for name in backup.REQUIRED_DEPLOYMENT_PATHS:
                self.assertIn("deployment/" + name, paths, name)
            self.assertIn("deployment/docs/recovery-guide.md", paths)
            self.assertIn("deployment/backend/tests/extra_test.py", paths)
            self.assertIn("deployment/frontend/tests/extra.test.mjs", paths)
            self.assertNotIn("deployment/docs/.private.md", paths)
            self.assertFalse(any(".github" in path for path in paths))

    def test_only_exact_root_env_example_is_permitted(self):
        for name in (".env", ".env.runtime", ".env.production", "docs/.env.example", "backend/tests/.env.test"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                deployment = Path(temp) / "deployment"
                path = deployment / name
                path.parent.mkdir(parents=True)
                path.write_text("SHOULD_NOT_BE_INCLUDED", encoding="utf-8")
                with self.assertRaisesRegex(RuntimeError, "nunca puede incluir"):
                    backup.tree_inventory([("deployment", deployment)])

    def test_secret_scan_covers_markdown_and_env_example_text(self):
        for name in ("docs/guide.md", ".env.example"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                deployment = Path(temp) / "deployment"
                path = deployment / name
                path.parent.mkdir(parents=True)
                credential_field = "PASS" + "WORD"
                sample_value = "long-test-secret-placeholder-12345"
                path.write_text(f'{credential_field} = "{sample_value}"\n', encoding="utf-8")
                with self.assertRaisesRegex(RuntimeError, "hard-coded credential"):
                    backup.tree_inventory([("deployment", deployment)])

    def test_tar_stream_uses_only_the_allowlisted_inventory(self):
        if shutil.which("tar") is None:
            self.skipTest("tar no está instalado")
        version = subprocess.run(["tar", "--version"], capture_output=True, text=True, check=False)
        if version.returncode != 0 or "GNU tar" not in version.stdout:
            self.skipTest("La implementación del sistema no es GNU tar")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source"
            deployment = source / "deployment"
            (deployment / "backend" / "app" / "__pycache__").mkdir(parents=True)
            (deployment / "frontend" / "src").mkdir(parents=True)
            (deployment / "frontend" / "node_modules" / "dep").mkdir(parents=True)
            (deployment / "backend" / "app" / "main.py").write_text("app", encoding="utf-8")
            (deployment / "backend" / "app" / "__pycache__" / "main.pyc").write_bytes(b"cache")
            (deployment / "frontend" / "src" / "App.tsx").write_text("ui", encoding="utf-8")
            (deployment / "frontend" / "node_modules" / "dep" / "index.js").write_text("dependency", encoding="utf-8")
            inventory = backup.tree_inventory([("deployment", deployment)])
            file_list = root / "allowlist.bin"
            file_list.write_bytes(b"\0".join(os.fsencode(item["path"]) for item in inventory) + b"\0")

            archive = subprocess.run(
                backup._media_archive_command(file_list, source_root=source),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(archive.returncode, 0, archive.stderr.decode("utf-8", errors="replace"))
            with tarfile.open(fileobj=io.BytesIO(archive.stdout), mode="r:gz") as tar:
                names = {member.name.rstrip("/") for member in tar.getmembers()}
            self.assertIn("deployment/backend/app/main.py", names)
            self.assertIn("deployment/frontend/src/App.tsx", names)
            self.assertFalse(any("__pycache__" in name or "node_modules" in name for name in names))

    def test_inventory_fails_closed_on_likely_embedded_credentials_without_echoing_them(self):
        with tempfile.TemporaryDirectory() as temp:
            deployment = Path(temp) / "deployment"
            app_dir = deployment / "backend" / "app"
            app_dir.mkdir(parents=True)
            secret_value = "very-long-placeholder-secret-value-123456"
            (app_dir / "main.py").write_text(f'API_KEY = "{secret_value}"\n', encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "hard-coded credential") as caught:
                backup.tree_inventory([("deployment", deployment)])
            self.assertNotIn(secret_value, str(caught.exception))

    def test_backup_volume_permission_check_leaves_no_marker(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            backup.check_backup_volume(root)
            self.assertEqual(list(root.iterdir()), [])

    def test_compose_grants_only_read_search_and_initializes_backup_volume_root(self):
        compose = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        backup_service = compose.split("  full_backup:", 1)[1].split("\nvolumes:", 1)[0]
        dockerfile = (REPO_ROOT / "scripts" / "full_backup" / "Dockerfile").read_text(encoding="utf-8")
        self.assertIn('user: "0:0"', backup_service)
        self.assertIn("cap_drop: [ALL]", backup_service)
        self.assertIn("cap_add: [DAC_READ_SEARCH]", backup_service)
        self.assertIn("chown root:root /var/backups/full", dockerfile)
        self.assertIn("chmod 0700 /var/backups/full", dockerfile)
        bind_mounts = [
            line.strip().removeprefix("- ")
            for line in backup_service.splitlines()
            if line.strip().startswith("- ./")
        ]
        self.assertTrue(bind_mounts)
        self.assertTrue(all(line.endswith(":ro") for line in bind_mounts))
        env_mounts = [line for line in bind_mounts if ".env" in line]
        self.assertEqual(env_mounts, ["./.env.example:/source/deployment/.env.example:ro"])
        self.assertFalse(any("./:/" in line or "docker.sock" in line for line in bind_mounts))
        self.assertIn("./backend/app:/source/deployment/backend/app:ro", bind_mounts)
        self.assertIn("./frontend/src:/source/deployment/frontend/src:ro", bind_mounts)
        self.assertIn("./frontend/public:/source/deployment/frontend/public:ro", bind_mounts)
        self.assertIn("./backend/tests:/source/deployment/backend/tests:ro", bind_mounts)
        self.assertIn("./frontend/tests:/source/deployment/frontend/tests:ro", bind_mounts)
        self.assertIn("./.env.example:/source/deployment/.env.example:ro", bind_mounts)
        self.assertIn("./docs:/source/deployment/docs:ro", bind_mounts)

    def test_capture_retries_and_discards_snapshot_when_source_changes_during_db_dump(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            media = root / "media"
            deployment = root / "deployment"
            backup_root = root / "backups"
            (media / "nested").mkdir(parents=True)
            (deployment / "nginx" / "certs" / "local").mkdir(parents=True)
            (deployment / "docker-compose.yml").write_text("services: {}\n", encoding="utf-8")
            for name in ("ca.crt", "ca.key", "server.crt", "server.key"):
                (deployment / "nginx" / "certs" / "local" / name).write_text("test cert/key", encoding="utf-8")
            self._populate_required_sources(deployment)
            media_file = media / "nested" / "asset.bin"
            media_file.write_bytes(b"version one")
            calls = []

            def fake_encrypt_stream(command, destination, recipient, source_env=None):
                calls.append(command[0])
                destination.write_bytes(backup.AGE_HEADER + b"test encrypted bytes")
                if command[0] == "pg_dump" and calls.count("pg_dump") == 1:
                    media_file.write_bytes(b"version two")

            def fake_encrypt_bytes(raw, destination, recipient):
                destination.write_bytes(backup.AGE_HEADER + b"test encrypted manifest")

            with patch.dict(os.environ, {
                "BACKUP_ROOT": str(backup_root),
                "BACKUP_MEDIA_SOURCE": str(media),
                "BACKUP_DEPLOYMENT_SOURCE": str(deployment),
                "POSTGRES_USER": "test_user",
                "POSTGRES_PASSWORD": "test_password_only",
                "POSTGRES_DB": "test_db",
            }), patch.object(backup, "_database_command", return_value=(["pg_dump"], {})), patch.object(
                backup, "_age_encrypt_stream", side_effect=fake_encrypt_stream
            ), patch.object(backup, "encrypt_bytes", side_effect=fake_encrypt_bytes):
                snapshot = backup.create_snapshot("age1testrecipient", datetime(2026, 11, 15, 2, tzinfo=timezone.utc))

            self.assertEqual(calls.count("pg_dump"), 2)
            self.assertEqual(calls.count("tar"), 1)
            self.assertTrue((snapshot / "database.dump.age").is_file())
            self.assertTrue((snapshot / "media-config.tar.gz.age").is_file())
            self.assertTrue((snapshot / "manifest.json.age").is_file())
            self.assertEqual([path.name for path in backup_root.iterdir()], [snapshot.name])


class RestoreVerificationUnitTests(unittest.TestCase):
    def test_isolated_restore_uses_disposable_storage_and_streams_dump_to_stdin(self):
        table_names = "\n".join(entry.split()[-1] for entry in restore_test.EXPECTED_DB_ENTRIES)
        responses = [
            subprocess.CompletedProcess([], 0, stdout=""),
            subprocess.CompletedProcess([], 0, stdout=""),
            subprocess.CompletedProcess([], 0, stdout=table_names),
            subprocess.CompletedProcess([], 0, stdout="writeups=3\nwriteup_assets=1"),
        ]

        with tempfile.TemporaryDirectory() as temp:
            database_dump = Path(temp) / "database.dump"
            database_dump.write_bytes(b"test dump")
            with patch.object(restore_test, "_run_checked", side_effect=responses) as run_checked, patch.object(
                restore_test, "_wait_for_postgres"
            ), patch.object(restore_test.subprocess, "run") as remove_container:
                counts = restore_test._restore_isolated_database(database_dump)

        create_command = run_checked.call_args_list[0].args[0]
        restore_command = run_checked.call_args_list[1].args[0]
        self.assertIn("--network", create_command)
        self.assertIn("none", create_command)
        self.assertIn("--rm", create_command)
        self.assertNotIn("--mount", create_command)
        self.assertEqual(restore_command[-1], "restore_test")
        self.assertEqual(run_checked.call_args_list[1].kwargs["input_file"], database_dump)
        self.assertEqual(counts, {"writeups": 3, "writeup_assets": 1})
        self.assertEqual(remove_container.call_args.args[0][:3], ["docker", "rm", "--force"])

    def _make_archive(self, path: Path, members: list[tuple[str, bytes | None, bool]]) -> None:
        with tarfile.open(path, "w:gz") as archive:
            for name, content, is_dir in members:
                info = tarfile.TarInfo(name)
                if is_dir:
                    info.type = tarfile.DIRTYPE
                    info.mode = 0o755
                    archive.addfile(info)
                else:
                    value = content or b"test"
                    info.size = len(value)
                    archive.addfile(info, io.BytesIO(value))

    def test_manifest_requires_encrypted_database_and_media_components(self):
        source_files = [
            *backup.REQUIRED_DEPLOYMENT_PATHS,
            "nginx/certs/local/ca.crt",
            "nginx/certs/local/ca.key",
            "nginx/certs/local/server.crt",
            "nginx/certs/local/server.key",
        ]
        directories = {"vault_media", "deployment"}
        for filename in source_files:
            parts = filename.split("/")
            for depth in range(1, len(parts)):
                directories.add("deployment/" + "/".join(parts[:depth]))

        def inventory_item(name, kind, index):
            entry = {"path": name, "kind": kind, "mtime_ns": 1, "ctime_ns": 1, "device": 1, "inode": index + 1, "mode": 0o700}
            if kind == "file":
                entry.update({"size": 1, "sha256": f"{index + 1:064x}", "mode": 0o600})
            return entry

        source_inventory = [inventory_item(name, "directory", index) for index, name in enumerate(sorted(directories))]
        source_inventory.extend(
            inventory_item("deployment/" + name, "file", index + len(source_inventory))
            for index, name in enumerate(source_files)
        )
        manifest = {
            "format": restore_test.FORMAT,
            "version": restore_test.VERSION,
            "created_at": "2026-11-15T02:00:00+00:00",
            "encryption": "age",
            "retention_days": 14,
            "schedule": "daily 02:00 UTC",
            "consistency_check": "source tree hashes and metadata matched before and after database capture and after the media archive",
            "excluded": [
                ".env", ".env.runtime", "node_modules", "dist", "build", ".venv", ".git",
                "Python/JS caches", "compiled files", "all .env.* except the checked-in .env.example template",
            ],
            "components": {
                "database.dump.age": {"sha256": "a" * 64, "bytes": 100},
                "media-config.tar.gz.age": {"sha256": "b" * 64, "bytes": 100},
            },
            "source_inventory": source_inventory,
        }
        self.assertEqual(restore_test.validate_manifest(manifest)["version"], 2)
        del manifest["components"]["database.dump.age"]
        with self.assertRaisesRegex(ValueError, "database.dump.age"):
            restore_test.validate_manifest(manifest)

    def test_archive_structure_extracts_only_expected_regular_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive_path = root / "media.tar.gz"
            extracted = root / "extracted"
            required_files = [
                *backup.REQUIRED_DEPLOYMENT_PATHS,
                "nginx/certs/local/ca.crt",
                "nginx/certs/local/ca.key",
                "nginx/certs/local/server.crt",
                "nginx/certs/local/server.key",
            ]
            directories = {"deployment"}
            for filename in required_files:
                parts = filename.split("/")
                for depth in range(1, len(parts)):
                    directories.add("deployment/" + "/".join(parts[:depth]))
            archive_members = [("vault_media", None, True)]
            archive_members.extend((name, None, True) for name in sorted(directories))
            archive_members.extend(
                (
                    "deployment/" + name,
                    b"services: {}" if name == "docker-compose.yml" else b"source",
                    False,
                )
                for name in required_files
            )
            self._make_archive(archive_path, archive_members)
            names = restore_test.validate_and_extract_media_config(archive_path, extracted)
            self.assertIn("deployment/docker-compose.yml", names)
            self.assertIn("deployment/.env.example", names)
            self.assertIn("deployment/docs/auditoria-secretos.md", names)
            self.assertIn("deployment/backend/tests/test_writeups.py", names)
            self.assertIn("deployment/frontend/tests/writeups.test.mjs", names)
            self.assertEqual((extracted / "deployment/docker-compose.yml").read_text(), "services: {}")
            inventory = backup.tree_inventory([
                ("vault_media", extracted / "vault_media"),
                ("deployment", extracted / "deployment"),
            ])
            restore_test.verify_extracted_inventory(extracted, inventory)
            (extracted / "deployment/docker-compose.yml").write_text("changed", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "huella"):
                restore_test.verify_extracted_inventory(extracted, inventory)

    def test_archive_rejects_parent_path_and_links(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ("../escape", "deployment/.env", "vault_media/link"):
                archive_path = root / ("bad-" + str(len(name)) + ".tar.gz")
                if name == "../escape":
                    self._make_archive(archive_path, [
                        ("vault_media", None, True),
                        ("deployment/docker-compose.yml", b"x", False),
                        ("deployment/nginx/certs", None, True),
                        (name, b"bad", False),
                    ])
                elif name == "deployment/.env":
                    self._make_archive(archive_path, [
                        ("vault_media", None, True),
                        ("deployment/docker-compose.yml", b"x", False),
                        ("deployment/nginx/certs/local", None, True),
                        ("deployment/nginx/certs/local/ca.crt", b"x", False),
                        ("deployment/nginx/certs/local/ca.key", b"x", False),
                        ("deployment/nginx/certs/local/server.crt", b"x", False),
                        ("deployment/nginx/certs/local/server.key", b"x", False),
                        (name, b"secret", False),
                    ])
                else:
                    with tarfile.open(archive_path, "w:gz") as archive:
                        for member_name in (
                            "vault_media", "deployment", "deployment/docker-compose.yml", "deployment/nginx",
                            "deployment/nginx/certs", "deployment/nginx/certs/local",
                            "deployment/nginx/certs/local/ca.crt", "deployment/nginx/certs/local/ca.key",
                            "deployment/nginx/certs/local/server.crt", "deployment/nginx/certs/local/server.key",
                        ):
                            info = tarfile.TarInfo(member_name)
                            info.type = tarfile.DIRTYPE if member_name in (
                                "vault_media", "deployment", "deployment/nginx", "deployment/nginx/certs",
                                "deployment/nginx/certs/local",
                            ) else tarfile.REGTYPE
                            info.size = 0
                            archive.addfile(info)
                        link = tarfile.TarInfo(name)
                        link.type = tarfile.SYMTYPE
                        link.linkname = "../../outside"
                        archive.addfile(link)
                with self.subTest(name=name), tarfile.open(archive_path, "r:gz") as archive:
                    with self.assertRaises(ValueError):
                        restore_test._validated_members(archive)

    def test_restore_archive_rejects_other_env_and_hidden_paths(self):
        for name in ("deployment/.env", "deployment/.env.production", "deployment/docs/.env.example", "deployment/.github/workflow.yml"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                archive_path = Path(temp) / "bad.tar.gz"
                self._make_archive(archive_path, [("vault_media", None, True), (name, b"secret", False)])
                with tarfile.open(archive_path, "r:gz") as archive:
                    with self.assertRaises(ValueError):
                        restore_test._validated_members(archive)


if __name__ == "__main__":
    unittest.main()
