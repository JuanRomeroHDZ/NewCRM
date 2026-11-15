"""El CRM no debe cargar el motor de red del proceso C2 al arrancar."""
import os
import subprocess
import sys


def test_main_app_does_not_import_c2_engine():
    result = subprocess.run(
        [sys.executable, "-c", (
            "import app.main, sys; "
            "assert 'app.api.v1.c2' not in sys.modules; "
            "assert 'scapy' not in sys.modules"
        )],
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
