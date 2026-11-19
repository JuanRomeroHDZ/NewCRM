#!/usr/bin/env bash
set -euo pipefail

# Generador de Autoridad Certificadora Privada y Certificados TLS Locales
# para LESSSO (servidor activo: lessso-srv)

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERTS_DIR="$PROJECT_ROOT/nginx/certs/local"
mkdir -p "$CERTS_DIR"

if [ -z "${SERVER_NAME:-}" ] && [ -f "$PROJECT_ROOT/.env" ]; then
    SERVER_NAME="$(awk -F= '$1 == "SERVER_NAME" { print $2; exit }' "$PROJECT_ROOT/.env" | tr -d '\r')"
fi
SERVER_NAME="${SERVER_NAME:-lessso-srv}"
if [[ ! "$SERVER_NAME" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "SERVER_NAME debe contener solo letras, números, puntos y guiones." >&2
    exit 1
fi
HOST_BIND_IP="${HOST_BIND_IP:-127.0.0.1}"
python3 - "$HOST_BIND_IP" <<'PY'
import ipaddress, sys
try:
    address = ipaddress.IPv4Address(sys.argv[1])
    private_networks = [ipaddress.IPv4Network(net) for net in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')]
    if address != ipaddress.IPv4Address('127.0.0.1') and not any(address in network for network in private_networks):
        raise ValueError('se requiere 127.0.0.1 o una dirección IPv4 privada')
except ValueError as exc:
    raise SystemExit(f'Dirección de certificado no válida: {exc}')
PY

echo "Generando Autoridad Certificadora Privada en: $CERTS_DIR"

# Nunca sustituir una CA incompleta: los clientes pueden confiar en ella.
if [[ -f "$CERTS_DIR/ca.key" && ! -f "$CERTS_DIR/ca.crt" ]] || [[ ! -f "$CERTS_DIR/ca.key" && -f "$CERTS_DIR/ca.crt" ]]; then
    echo 'Falta la clave o el certificado de la CA existente. Recupera el archivo faltante antes de continuar.' >&2
    exit 1
fi

# 1. Generar clave privada de la CA
if [ ! -f "$CERTS_DIR/ca.key" ]; then
    openssl genrsa -out "$CERTS_DIR/ca.key" 4096
fi

# 2. Generar certificado raíz de la CA (válido por 10 años)
if [ ! -f "$CERTS_DIR/ca.crt" ]; then
    openssl req -x509 -new -nodes -key "$CERTS_DIR/ca.key" -sha256 -days 3650 \
        -out "$CERTS_DIR/ca.crt" \
        -addext 'basicConstraints=critical,CA:TRUE' \
        -addext 'keyUsage=critical,keyCertSign,cRLSign' \
        -subj "/C=MX/ST=Baja California/L=Tijuana/O=LESSSO Security/OU=Certificados Locales/CN=Contact LESSSO Root CA"
fi

if ! openssl x509 -in "$CERTS_DIR/ca.crt" -checkend 0 -noout >/dev/null; then
    echo 'La CA local no está vigente. Recupera o sustituye la CA antes de renovar.' >&2
    exit 1
fi

# 3. Generar clave privada del servidor
if [ ! -f "$CERTS_DIR/server.key" ]; then
    openssl genrsa -out "$CERTS_DIR/server.key" 2048
fi

# Generar los archivos temporales junto al certificado para no dejarlo incompleto
# si falla la firma. La clave y la CA existentes se conservan.
TEMP_DIR="$(mktemp -d "$CERTS_DIR/.server.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

# 4. Crear archivo de configuración SAN (Subject Alternative Names)
cat > "$TEMP_DIR/server.ext" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${SERVER_NAME}
DNS.2 = ${SERVER_NAME}.local
DNS.3 = localhost
IP.1 = 127.0.0.1
IP.2 = ${HOST_BIND_IP}
EOF

# 5. Generar CSR del servidor
openssl req -new -key "$CERTS_DIR/server.key" -out "$TEMP_DIR/server.csr" \
    -subj "/C=MX/ST=Baja California/L=Tijuana/O=LESSSO/OU=Produccion Local/CN=${SERVER_NAME}"

# 6. Firmar el certificado del servidor con la CA privada (válido por 2 años)
openssl x509 -req -in "$TEMP_DIR/server.csr" -CA "$CERTS_DIR/ca.crt" -CAkey "$CERTS_DIR/ca.key" \
    -CAcreateserial -out "$TEMP_DIR/server.crt" -days 730 -sha256 \
    -extfile "$TEMP_DIR/server.ext"
openssl verify -verify_ip "$HOST_BIND_IP" -CAfile "$CERTS_DIR/ca.crt" "$TEMP_DIR/server.crt"
mv "$TEMP_DIR/server.crt" "$CERTS_DIR/server.crt"

chmod 600 "$CERTS_DIR"/*.key
chmod 644 "$CERTS_DIR"/*.crt

echo "Certificado local generado para $SERVER_NAME, localhost y $HOST_BIND_IP."
