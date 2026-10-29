#!/usr/bin/env bash
set -euo pipefail

# Generador de Autoridad Certificadora Privada y Certificados TLS Locales
# para Contact | LESSSO (servidor activo: lessso-srv)

CERTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../nginx/certs" && pwd)"
mkdir -p "$CERTS_DIR"

SERVER_NAME="${SERVER_NAME:-lessso-srv}"

echo "Generando Autoridad Certificadora Privada en: $CERTS_DIR"

# 1. Generar clave privada de la CA
if [ ! -f "$CERTS_DIR/ca.key" ]; then
    openssl genrsa -out "$CERTS_DIR/ca.key" 4096
fi

# 2. Generar certificado raíz de la CA (válido por 10 años)
if [ ! -f "$CERTS_DIR/ca.crt" ]; then
    openssl req -x509 -new -nodes -key "$CERTS_DIR/ca.key" -sha256 -days 3650 \
        -out "$CERTS_DIR/ca.crt" \
        -subj "/C=MX/ST=Baja California/L=Tijuana/O=LESSSO Security/OU=Certificados Locales/CN=Contact LESSSO Root CA"
fi

# 3. Generar clave privada del servidor
if [ ! -f "$CERTS_DIR/server.key" ]; then
    openssl genrsa -out "$CERTS_DIR/server.key" 2048
fi

# 4. Crear archivo de configuración SAN (Subject Alternative Names)
cat > "$CERTS_DIR/server.ext" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${SERVER_NAME}
DNS.2 = ${SERVER_NAME}.local
DNS.3 = localhost
IP.1 = 127.0.0.1
EOF

# 5. Generar CSR del servidor
openssl req -new -key "$CERTS_DIR/server.key" -out "$CERTS_DIR/server.csr" \
    -subj "/C=MX/ST=Baja California/L=Tijuana/O=LESSSO/OU=Produccion Local/CN=${SERVER_NAME}"

# 6. Firmar el certificado del servidor con la CA privada (válido por 2 años)
openssl x509 -req -in "$CERTS_DIR/server.csr" -CA "$CERTS_DIR/ca.crt" -CAkey "$CERTS_DIR/ca.key" \
    -CAcreateserial -out "$CERTS_DIR/server.crt" -days 730 -sha256 \
    -extfile "$CERTS_DIR/server.ext"

rm -f "$CERTS_DIR/server.csr" "$CERTS_DIR/server.ext"

chmod 600 "$CERTS_DIR"/*.key
chmod 644 "$CERTS_DIR"/*.crt

echo "Certificados locales generados exitosamente para $SERVER_NAME y localhost."
