import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap


def test_c2_worker_import_does_not_require_dns_or_load_email_routes():
    backend_dir = Path(__file__).resolve().parents[1]
    script = textwrap.dedent(
        """
        import importlib.abc
        import os
        import secrets
        import sys

        class BlockDnsImports(importlib.abc.MetaPathFinder):
            def find_spec(self, fullname, path=None, target=None):
                if fullname == "dns" or fullname.startswith("dns."):
                    raise ModuleNotFoundError("dns intentionally unavailable", name=fullname)
                return None

        sys.meta_path.insert(0, BlockDnsImports())
        os.environ["C2_WORKER_SECRET"] = secrets.token_hex(32)
        from app.c2_worker import app

        assert app is not None
        assert "app.api.v1.emails" not in sys.modules
        assert "app.services.email_domain_posture" not in sys.modules
        """
    )
    env = {
        "PATH": os.environ.get("PATH", ""),
        "PYTHONPATH": str(backend_dir),
        "PYTHONDONTWRITEBYTECODE": "1",
    }

    with tempfile.TemporaryDirectory(prefix="lessso-c2-import-") as workdir:
        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=workdir,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )

    assert result.returncode == 0, result.stderr or result.stdout
