"""Regression tests for LAN certificates; all keys are generated in a temporary directory."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class LanCertificatesTest(unittest.TestCase):
    def test_regeneration_preserves_ca_and_adds_the_selected_ip(self):
        script = Path(__file__).resolve().parents[1] / "generate_certs.sh"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            shutil.copy(script, root / "scripts" / script.name)
            env = {**os.environ, "HOST_BIND_IP": "127.0.0.1", "SERVER_NAME": "test-server"}
            command = ["bash", str(root / "scripts" / script.name)]
            subprocess.run(command, env=env, check=True, capture_output=True)
            ca = (root / "nginx/certs/local/ca.crt").read_bytes()
            ca_key = (root / "nginx/certs/local/ca.key").read_bytes()
            env["HOST_BIND_IP"] = "192.168.1.20"
            subprocess.run(command, env=env, check=True, capture_output=True)
            cert = root / "nginx/certs/local/server.crt"
            self.assertEqual(ca, (root / "nginx/certs/local/ca.crt").read_bytes())
            self.assertEqual(ca_key, (root / "nginx/certs/local/ca.key").read_bytes())
            for ip in ("192.168.1.20", "127.0.0.1"):
                result = subprocess.run(["openssl", "x509", "-in", str(cert), "-noout", "-checkip", ip], check=True, capture_output=True, text=True)
                self.assertIn("does match certificate", result.stdout)
            subprocess.run(["openssl", "verify", "-CAfile", str(root / "nginx/certs/local/ca.crt"), str(cert)], check=True, capture_output=True)
            before = cert.read_bytes()
            env["HOST_BIND_IP"] = "0.0.0.0"
            result = subprocess.run(command, env=env, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(before, cert.read_bytes())


if __name__ == "__main__":
    unittest.main()
