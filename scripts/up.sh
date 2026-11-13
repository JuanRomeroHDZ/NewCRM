#!/usr/bin/env bash
# Levanta Email-CRM y elige puertos HTTP/HTTPS libres en el host.
# Los puertos quedan guardados en .env.runtime y se reutilizan al reiniciar.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
RUNTIME_FILE=".env.runtime"

# Lee solo una variable simple de .env; no ejecuta ni muestra sus secretos.
dotenv_value() {
  python3 - "$1" .env <<'PY'
import pathlib, sys
key, filename = sys.argv[1:]
path = pathlib.Path(filename)
if path.exists():
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        name, value = line.split('=', 1)
        if name.strip() == key:
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            print(value)
            break
PY
}

free_port() {
  python3 - <<'PY'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(("0.0.0.0", 0))
print(s.getsockname()[1])
s.close()
PY
}

is_free() {
  python3 - "$1" <<'PY'
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.bind(("0.0.0.0", int(sys.argv[1])))
except OSError:
    sys.exit(1)
finally:
    s.close()
PY
}

is_ours() {
  docker ps \
    --filter "label=com.docker.compose.project.working_dir=$(pwd)" \
    --format '{{.Ports}}' | grep -Eq "[^0-9]${1}->"
}

pick_port() {
  local current="${1:-}" avoid="${2:-}"
  if [ -n "$current" ] && [ "$current" != "$avoid" ] && { is_free "$current" || is_ours "$current"; }; then
    printf '%s' "$current"
  else
    free_port
  fi
}

# Prioriza variables del shell, después .env.runtime y por último .env.
if [ -f "$RUNTIME_FILE" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      PORT) [ -n "${PORT:-}" ] || PORT="$value" ;;
      HTTPS_PORT) [ -n "${HTTPS_PORT:-}" ] || HTTPS_PORT="$value" ;;
    esac
  done < "$RUNTIME_FILE"
fi

PORT="${PORT:-$(dotenv_value PORT)}"
HTTPS_PORT="${HTTPS_PORT:-$(dotenv_value HTTPS_PORT)}"
PORT="${PORT:-8080}"
HTTPS_PORT="${HTTPS_PORT:-8443}"

PORT="$(pick_port "$PORT")"
HTTPS_PORT="$(pick_port "$HTTPS_PORT" "$PORT")"
export PORT HTTPS_PORT

cat > "$RUNTIME_FILE" <<EOF
# Generado por scripts/up.sh
PORT=${PORT}
HTTPS_PORT=${HTTPS_PORT}
EOF

docker compose up -d --build "$@"

echo
echo "Email-CRM levantado:"
echo "  HTTP:  http://localhost:${PORT}"
echo "  HTTPS: https://localhost:${HTTPS_PORT}"
echo
echo "Puertos guardados en ${RUNTIME_FILE}; se reutilizan si siguen libres."
echo "Estado: docker compose ps"
