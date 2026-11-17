#!/usr/bin/env bash
# Servicio C2 opcional: instala su entorno y ejecútalo solo cuando se necesite.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$PROJECT_DIR/backend/.venv-c2"
RUNTIME="$PROJECT_DIR/c2-runtime"
MODE="${1:-menu}"

if (( EUID == 0 )) && [[ "$MODE" != _run_real ]]; then
  echo 'Ejecuta ./lessso con tu usuario habitual. El modo real solicita sudo desde la terminal.' >&2
  exit 1
fi

show_crm() {
  local address
  address="$(python3 - "$PROJECT_DIR" <<'PY'
from pathlib import Path
import ipaddress
import sys
root = Path(sys.argv[1])
values = {}
for name in ('.env.runtime', '.env'):
    path = root / name
    if path.exists():
        for line in path.read_text().splitlines():
            key, sep, value = line.partition('=')
            if sep and key.strip() in ('HTTPS_PORT', 'HOST_BIND_IP') and key.strip() not in values:
                value = value.strip().strip("\"'")
                values[key.strip()] = value
port = values.get('HTTPS_PORT', '8443')
if not port.isdigit() or not 1 <= int(port) <= 65535:
    port = '8443'
try:
    host = str(ipaddress.IPv4Address(values.get('HOST_BIND_IP', '127.0.0.1')))
except ValueError:
    host = '127.0.0.1'
print(f'{host}:{port}')
PY
)"
  printf '\nDirección del CRM (cuando esté encendido): https://%s\n' "$address"
}

# Comprueba el entrypoint real con una clave ficticia. Importar el módulo no
# arranca el servidor ni ejecuta operaciones de red; sí detecta dependencias
# ausentes que una comprobación parcial de uvicorn/scapy dejaría pasar.
c2_worker_imports() {
  PYTHONPATH="$PROJECT_DIR/backend" \
    "$VENV/bin/python" -c 'import os, secrets; os.environ["C2_WORKER_SECRET"] = secrets.token_hex(32); from app.c2_worker import app; assert app' >/dev/null 2>&1
}

# If the lock is already held, verify the worker and its mode before reporting
# success. This avoids the confusing "already active" followed by "failed"
# output when ./lessso is run a second time.
c2_active_mode() {
  python3 - "$RUNTIME/worker.sock" <<'PY'
import json
import os
import socket
import sys

sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.settimeout(2)
try:
    sock.connect(sys.argv[1])
    request = (
        b"GET /c2/meta HTTP/1.1\r\n"
        b"Host: localhost\r\n"
        b"Connection: close\r\n"
        b"X-C2-Internal-Secret: " + os.environ.get("C2_WORKER_SECRET", "").encode() + b"\r\n\r\n"
    )
    sock.sendall(request)
    response = bytearray()
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            break
        response.extend(chunk)
    head, separator, body = response.partition(b"\r\n\r\n")
    if not separator or not head.startswith(b"HTTP/1.1 200"):
        raise SystemExit(1)
    if b"transfer-encoding: chunked" in head.lower():
        decoded = bytearray()
        while body:
            size_line, marker, remainder = body.partition(b"\r\n")
            if not marker:
                raise SystemExit(1)
            size = int(size_line.split(b";", 1)[0], 16)
            if size == 0:
                break
            decoded.extend(remainder[:size])
            body = remainder[size + 2:]
        body = bytes(decoded)
    payload = json.loads(body)
    print("demo" if payload.get("demo_mode") else "real")
except (OSError, ValueError, json.JSONDecodeError):
    raise SystemExit(1)
finally:
    sock.close()
PY
}

if [[ "$MODE" == menu ]]; then
  show_crm
  if [[ ! -t 0 ]]; then
    echo 'Abre ./lessso para utilizar C2.'
    exit 0
  fi
  printf '\n1) Activar C2 real (sudo)\n2) Iniciar demostración\n3) Preparar C2\n4) Salir\n'
  read -r -p 'Elige una opción: ' choice
  case "$choice" in
    1) MODE=start ;;
    2) MODE=demo ;;
    3) MODE=setup ;;
    4) exit 0 ;;
    *) echo 'Opción no válida.' >&2; exit 1 ;;
  esac
fi

case "$MODE" in
  setup)
    test -f "$PROJECT_DIR/.env" || { echo 'Primero configura .env para LESSSO.' >&2; exit 1; }
    mkdir -p "$RUNTIME"
    chmod 750 "$RUNTIME"
    python3 - "$PROJECT_DIR/.env" <<'PY'
from pathlib import Path
import os, secrets, sys
path = Path(sys.argv[1])
lines = path.read_text().splitlines()
if not any(line.startswith('C2_WORKER_SECRET=') and line.split('=', 1)[1].strip() for line in lines):
    lines = [line for line in lines if not line.startswith('C2_WORKER_SECRET=')]
    lines.append('C2_WORKER_SECRET=' + secrets.token_hex(32))
if not any(line.startswith('C2_SOCKET_GID=') for line in lines):
    lines.append('C2_SOCKET_GID=' + str(os.getgid()))
path.write_text('\n'.join(lines) + '\n')
PY
    chmod 600 "$PROJECT_DIR/.env"
    python3 -m venv "$VENV"
    "$VENV/bin/python" -m pip install -r "$PROJECT_DIR/backend/requirements.txt"
    echo 'Preparación terminada. Reinicia el backend del CRM para cargar la clave nueva.'
    ;;
  start|demo)
    test -x "$VENV/bin/python" || { echo 'Abre ./lessso para preparar C2.' >&2; exit 1; }
    if ! c2_worker_imports; then
      echo 'El entorno de C2 no puede cargar app.c2_worker. Abre ./lessso y elige la opción 3 para instalar o reparar sus dependencias.' >&2
      exit 1
    fi
    show_crm
    printf 'Abre Red y Lab con tu cuenta de propietario y la bóveda desbloqueada.\n'
    printf 'Para cerrar C2 y realizar la limpieza, pulsa Ctrl+C en esta terminal.\n\n'
    if [[ "$MODE" == start ]]; then
      if [[ ! -t 0 ]]; then
        echo 'Activa C2 real desde una terminal interactiva.' >&2
        exit 1
      fi
      if ! command -v sudo >/dev/null 2>&1; then
        echo 'Falta sudo; no se puede iniciar C2 real con permisos de administrador.' >&2
        exit 1
      fi
      echo 'Confirma con la contraseña de tu usuario del sistema si sudo la solicita.'
      # Ejecutar sudo una sola vez evita pedir la contraseña durante la
      # validación y volver a pedirla al iniciar el worker.
      exec sudo -- "$0" _run_real
    fi
    exec "$0" "_run_$MODE"
    ;;
  _run_real|_run_demo)
    if [[ "$MODE" == _run_real && "$(id -u)" != 0 ]]; then
      echo 'El modo real requiere permisos de administrador en Linux.' >&2; exit 1
    fi
    test "$(uname -s)" = Linux || { echo 'El servicio C2 requiere Linux.' >&2; exit 1; }
    export C2_WORKER_SECRET
    C2_WORKER_SECRET="$(python3 - "$PROJECT_DIR/.env" <<'PY'
from pathlib import Path
import sys
for line in Path(sys.argv[1]).read_text().splitlines():
    if line.startswith('C2_WORKER_SECRET='):
        print(line.split('=', 1)[1].strip().strip('\"\''))
        break
PY
)"
    test "${#C2_WORKER_SECRET}" -ge 32 || { echo 'Falta la clave de C2. Abre ./lessso para prepararlo.' >&2; exit 1; }
    mkdir -p "$RUNTIME"
    # Evita iniciar dos procesos sobre el mismo socket.
    touch "$RUNTIME/worker.lock"
    chmod 666 "$RUNTIME/worker.lock"
    exec 9>"$RUNTIME/worker.lock"
    if ! flock -n 9; then
      active_mode="$(c2_active_mode 2>/dev/null || true)"
      requested_mode=real
      [[ "$MODE" == _run_demo ]] && requested_mode=demo
      if [[ "$active_mode" == "$requested_mode" ]]; then
        echo "C2 ya está activo y responde en modo ${requested_mode}."
        exit 0
      fi
      if [[ -n "$active_mode" ]]; then
        echo "C2 ya está activo en modo ${active_mode}; detén ese servicio antes de cambiar a modo ${requested_mode}." >&2
      else
        echo 'Otro proceso conserva el bloqueo de C2, pero el worker no responde. Detén la sesión anterior antes de reintentarlo.' >&2
      fi
      exit 1
    fi
    # No se cargan los secretos del CRM en el proceso con privilegios.
    export PYTHONPATH="$PROJECT_DIR/backend"
    export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    export LESSSO_DEMO=0
    [[ "$MODE" == _run_demo ]] && export LESSSO_DEMO=1
    cd /tmp
    exec "$VENV/bin/python" -m uvicorn app.c2_worker:app --uds "$RUNTIME/worker.sock" --workers 1
    ;;
  *)
    echo 'Uso: scripts/c2.sh setup | start | demo'
    echo 'start requiere sudo y acceso a las interfaces del equipo; demo no necesita root.'
    ;;
esac
