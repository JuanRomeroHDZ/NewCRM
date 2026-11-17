#!/usr/bin/env bash
# Levanta el CRM de LESSSO y elige puertos HTTP/HTTPS libres en el host.
# Los puertos quedan guardados en .env.runtime y se reutilizan al reiniciar.
set -euo pipefail

if (( EUID == 0 )); then
  echo 'Inicia el CRM con tu usuario habitual, sin sudo.' >&2
  exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."
for dependency in python3 openssl docker; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "Falta $dependency. Instálalo antes de iniciar LESSSO." >&2
    exit 1
  fi
done
if ! docker compose version >/dev/null 2>&1; then
  echo 'Falta Docker Compose v2 o posterior. Instala el complemento Docker Compose.' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Docker no está disponible para este usuario. Inicia Docker y comprueba sus permisos con docker info.' >&2
  exit 1
fi
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

# Puertos bloqueados para HTTP(S) por Fetch; también se comprueban al
# recuperar valores guardados o generados automáticamente.
browser_safe_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] || return 1
  local port=$((10#$1))
  (( port >= 1 && port <= 65535 )) || return 1
  case "$port" in
    1|7|9|11|13|15|17|19|20|21|22|23|25|37|42|43|53|69|77|79|87|95|101|102|103|104|109|110|111|113|115|117|119|123|135|137|139|143|161|179|389|427|465|512|513|514|515|526|530|531|532|540|548|554|556|563|587|601|636|989|990|993|995|1719|1720|1723|2049|3659|4045|4190|5060|5061|6000|6566|6665|6666|6667|6668|6669|6679|6697|10080) return 1 ;;
  esac
}

pick_port() {
  local current="${1:-}" avoid="${2:-}"
  if [ -n "$current" ] && browser_safe_port "$current" && [ "$current" != "$avoid" ] && { is_free "$current" || is_ours "$current"; }; then
    printf '%s' "$current"
  else
    local candidate
    for _ in {1..10}; do
      candidate="$(free_port)" || return 1
      if [[ "$candidate" != "$avoid" ]] && browser_safe_port "$candidate"; then
        printf '%s' "$candidate"
        return 0
      fi
    done
    echo 'No se encontró un segundo puerto libre. Intenta seleccionar los puertos manualmente.' >&2
    return 1
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
    if ! browser_safe_port "$port"; then
      echo "El puerto $port está bloqueado por los navegadores. Elige otro, por ejemplo 8080 o 8443." >&2
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
