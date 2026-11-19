#!/usr/bin/env python3
"""Print a TSV inventory from the frontend lockfile and the running backend."""

import csv
import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
PYTHON_INVENTORY = """
import importlib.metadata
import json

packages = []
for dist in importlib.metadata.distributions():
    name = dist.metadata["Name"]
    if not name:
        continue
    classifiers = [value for value in dist.metadata.get_all("Classifier", [])
                   if value.startswith("License ::")]
    license_info = dist.metadata.get("License-Expression") or " | ".join(classifiers)
    if not license_info:
        declared = (dist.metadata.get("License") or "").strip()
        if len(declared) < 100 and "\\n" not in declared:
            license_info = declared
    packages.append((name, dist.version, license_info))
print(json.dumps(sorted(packages)))
"""


def backend(*arguments: str) -> str:
    return subprocess.check_output(
        ["docker", "compose", "exec", "-T", "backend", *arguments],
        cwd=ROOT,
        text=True,
    )


def main() -> None:
    lock = json.loads((ROOT / "frontend/package-lock.json").read_text(encoding="utf-8"))
    writer = csv.writer(sys.stdout, delimiter="\t", lineterminator="\n")
    writer.writerow(("origen", "componente", "versión", "licencia declarada o ubicación del aviso"))
    for path, info in sorted(lock["packages"].items()):
        if path and not info.get("dev"):
            name = path.rsplit("node_modules/", 1)[-1]
            writer.writerow(("npm", info.get("name", name), info["version"], info.get("license") or "Revisar paquete"))
    for name, version, licensing in json.loads(backend("python", "-c", PYTHON_INVENTORY)):
        writer.writerow(("Python", name, version, licensing or "Revisar archivos de la distribución"))
    for line in backend("dpkg-query", "-W", "-f=${Package}\\t${Version}\\n").splitlines():
        name, version = line.split("\t", 1)
        writer.writerow(("Debian backend", name, version, f"/usr/share/doc/{name}/copyright"))
    writer.writerow(("binario", "Typst", backend("typst", "--version").strip(), "Apache-2.0, revisar NOTICE de su versión"))
    for name, path in (
        ("Leaflet", "frontend/public/vendor/leaflet/LICENSE"),
        ("Lora", "frontend/public/fonts/Lora-OFL.txt"),
        ("Poppins", "frontend/public/fonts/Poppins-OFL.txt"),
    ):
        writer.writerow(("archivo incluido", name, "", path))


if __name__ == "__main__":
    main()
