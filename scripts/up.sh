#!/usr/bin/env bash
# Levanta el CRM de LESSSO y elige puertos HTTP/HTTPS libres en el host.
# Los puertos quedan guardados en .env.runtime y se reutilizan al reiniciar.
set -euo pipefail

if (( EUID == 0 )); then
  echo 'Inicia el CRM con tu usuario habitual, sin sudo.' >&2
  exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."
RUNTIME_FILE=".env.runtime"
CHOOSE_PORTS=false
CHOOSE_ADDRESS=false
while [[ "${1:-}" == --choose-* ]]; do
  case "$1" in
    --choose-ports) CHOOSE_PORTS=true ;;
    --choose-address) CHOOSE_ADDRESS=true ;;
    *) echo "Opción desconocida: $1" >&2; exit 1 ;;
  esac
  shift
done

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
  python3 - "$HOST_BIND_IP" <<'PY'
import socket
import sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind((sys.argv[1], 0))
print(s.getsockname()[1])
s.close()
PY
}

is_free() {
  python3 - "$HOST_BIND_IP" "$1" <<'PY'
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.bind((sys.argv[1], int(sys.argv[2])))
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
      HOST_BIND_IP) [ -n "${HOST_BIND_IP:-}" ] || HOST_BIND_IP="$value" ;;
    esac
  done < "$RUNTIME_FILE"
fi

PORT="${PORT:-$(dotenv_value PORT)}"
HTTPS_PORT="${HTTPS_PORT:-$(dotenv_value HTTPS_PORT)}"
PORT="${PORT:-8080}"
HTTPS_PORT="${HTTPS_PORT:-8443}"
HOST_BIND_IP="${HOST_BIND_IP:-$(dotenv_value HOST_BIND_IP)}"
HOST_BIND_IP="${HOST_BIND_IP:-127.0.0.1}"

if $CHOOSE_ADDRESS; then
  [[ -t 0 ]] || { echo 'Elige la dirección desde una terminal.' >&2; exit 1; }
  suggested_address="$(python3 scripts/lan_address.py --suggest 2>/dev/null || true)"
  if ! python3 scripts/lan_address.py --validate "$HOST_BIND_IP" >/dev/null 2>&1; then
    if [[ -n "$suggested_address" ]]; then
      echo "La dirección guardada (${HOST_BIND_IP}) ya no está en este equipo."
      HOST_BIND_IP="$suggested_address"
    else
      echo "La dirección guardada (${HOST_BIND_IP}) ya no está en este equipo."
      HOST_BIND_IP="127.0.0.1"
    fi
  fi
  echo 'Direcciones privadas detectadas en este equipo:'
  python3 scripts/lan_address.py --list || true
  echo 'Usa 127.0.0.1 para acceso solo en este equipo, o una IPv4 privada de este equipo para acceso desde la red local.'
  read -r -p "Dirección IPv4 [$HOST_BIND_IP]: " selected_address
  HOST_BIND_IP="${selected_address:-$HOST_BIND_IP}"
fi

if ! python3 scripts/lan_address.py --validate "$HOST_BIND_IP"; then
  if ! $CHOOSE_ADDRESS; then
    suggested_address="$(python3 scripts/lan_address.py --suggest 2>/dev/null || true)"
    if [[ -n "$suggested_address" ]]; then
      if python3 scripts/lan_address.py --validate "$suggested_address" >/dev/null 2>&1; then
        echo "La dirección guardada (${HOST_BIND_IP}) ya no está asignada; usaré la dirección privada activa ${suggested_address}."
        HOST_BIND_IP="$suggested_address"
      else
        echo "La dirección guardada (${HOST_BIND_IP}) ya no está asignada. Abre ./lessso y elige la opción 6 para seleccionar la dirección privada actual." >&2
        exit 1
      fi
    else
      echo 'Abre ./lessso y elige la opción 6 para seleccionar una dirección local válida.' >&2
      exit 1
    fi
  else
    echo 'La dirección indicada no está asignada a este equipo. Elige una dirección privada de la lista mostrada.' >&2
    exit 1
  fi
fi

# Reutiliza la CA instalada en los clientes y renueva solo el certificado del servidor
# si la dirección seleccionada aún no figura entre sus nombres alternativos.
CERT_RENEWED=false
if ! openssl x509 -in nginx/certs/local/server.crt -noout -checkip "$HOST_BIND_IP" 2>/dev/null | grep -q 'does match certificate'; then
  HOST_BIND_IP="$HOST_BIND_IP" ./scripts/generate_certs.sh
  CERT_RENEWED=true
fi

if $CHOOSE_PORTS; then
  [[ -t 0 ]] || { echo 'Elige los puertos desde una terminal.' >&2; exit 1; }
  read -r -p "Puerto HTTP [$PORT]: " selected_http
  read -r -p "Puerto HTTPS [$HTTPS_PORT]: " selected_https
  PORT="${selected_http:-$PORT}"
  HTTPS_PORT="${selected_https:-$HTTPS_PORT}"
  for port in "$PORT" "$HTTPS_PORT"; do
    if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
      echo 'Escribe puertos numéricos entre 1 y 65535.' >&2
      exit 1
    fi
    if ! is_free "$port" && ! is_ours "$port"; then
      echo "El puerto $port ya está ocupado. Elige otro." >&2
      exit 1
    fi
  done
  if (( 10#$PORT == 10#$HTTPS_PORT )); then
    echo 'HTTP y HTTPS necesitan puertos diferentes.' >&2
    exit 1
  fi
else
  PORT="$(pick_port "$PORT")"
  HTTPS_PORT="$(pick_port "$HTTPS_PORT" "$PORT")"
fi
export PORT HTTPS_PORT HOST_BIND_IP

docker compose up -d --build --wait "$@"
if $CERT_RENEWED; then
  # Un proxy que ya estaba ejecutándose necesita recargar el certificado nuevo.
  docker compose restart proxy
fi

cat > "$RUNTIME_FILE" <<EOF
# Generado por scripts/up.sh
PORT=${PORT}
HTTPS_PORT=${HTTPS_PORT}
HOST_BIND_IP=${HOST_BIND_IP}
EOF

echo
echo "LESSSO CRM listo:"
echo "  HTTP:  http://${HOST_BIND_IP}:${PORT}"
echo "  HTTPS: https://${HOST_BIND_IP}:${HTTPS_PORT}"
if [[ "$HOST_BIND_IP" != 127.0.0.1 ]]; then
  echo 'Para acceder desde otro equipo, instala allí nginx/certs/local/ca.crt como autoridad de confianza.'
fi
echo
echo "Dirección y puertos guardados en ${RUNTIME_FILE}; los puertos se reutilizan si siguen libres."
echo "Estado: docker compose ps"
