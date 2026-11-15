#!/usr/bin/env bash
# Servicio C2 opcional: instala su entorno y ejecútalo solo cuando se necesite.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$PROJECT_DIR/backend/.venv-c2"
RUNTIME="$PROJECT_DIR/c2-runtime"
MODE="${1:-menu}"

if (( EUID == 0 )) && [[ "$MODE" != _run_real ]]; then
  echo 'Ejecuta ./c2 con tu usuario habitual. El modo real solicita sudo desde la terminal.' >&2
  exit 1
fi

show_crm() {
  local port
  port="$(python3 - "$PROJECT_DIR" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
for name in ('.env.runtime', '.env'):
    path = root / name
    if path.exists():
        for line in path.read_text().splitlines():
            key, sep, value = line.partition('=')
            if sep and key.strip() == 'HTTPS_PORT':
                value = value.strip().strip("\"'")
                if value.isdigit() and 1 <= int(value) <= 65535:
                    print(value)
                    raise SystemExit
print('8443')
PY
)"
  printf '\nDirección del CRM (cuando esté encendido): https://localhost:%s\n' "$port"
}

if [[ "$MODE" == menu ]]; then
  show_crm
  if [[ ! -t 0 ]]; then
    echo 'Uso: ./c2 start | demo | setup'
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
    test -x "$VENV/bin/uvicorn" || { echo 'Ejecuta primero scripts/c2.sh setup.' >&2; exit 1; }
    show_crm
    printf 'Abre Red y Lab con tu cuenta de propietario y la bóveda desbloqueada.\n'
    printf 'Para cerrar C2 y realizar la limpieza, pulsa Ctrl+C en esta terminal.\n\n'
    if [[ "$MODE" == start ]]; then
      if [[ ! -t 0 ]]; then
        echo 'Activa C2 real desde una terminal interactiva.' >&2
        exit 1
      fi
      echo 'Confirma con la contraseña de tu usuario del sistema si sudo la solicita.'
      exec sudo -k -- "$0" _run_real
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
    test "${#C2_WORKER_SECRET}" -ge 32 || { echo 'Falta una clave C2 válida; ejecuta scripts/c2.sh setup.' >&2; exit 1; }
    mkdir -p "$RUNTIME"
    # Evita iniciar dos procesos sobre el mismo socket.
    touch "$RUNTIME/worker.lock"
    chmod 666 "$RUNTIME/worker.lock"
    exec 9>"$RUNTIME/worker.lock"
    flock -n 9 || { echo 'El servicio C2 ya está activo.' >&2; exit 1; }
    # No se cargan los secretos del CRM en el proceso con privilegios.
    export PYTHONPATH="$PROJECT_DIR/backend"
    export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    export LESSSO_DEMO=0
    [[ "$MODE" == _run_demo ]] && export LESSSO_DEMO=1
    cd /tmp
    exec "$VENV/bin/uvicorn" app.c2_worker:app --uds "$RUNTIME/worker.sock" --workers 1
    ;;
  *)
    echo 'Uso: scripts/c2.sh setup | start | demo'
    echo 'start requiere sudo y acceso a las interfaces del equipo; demo no necesita root.'
    ;;
esac
