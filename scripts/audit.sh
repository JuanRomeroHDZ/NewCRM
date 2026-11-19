#!/usr/bin/env bash
# Local audit entry points. See docs/auditoria-lessso.md for follow-up paths.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077
trivy='aquasec/trivy@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb'
trufflehog='trufflesecurity/trufflehog@sha256:2ec535840f860aa27f11fee20222fb790326ecd66325c96bd49d02ec6af46eca'
k6='grafana/k6@sha256:3d8e5c7f1d53ec59408c2ffbd9943602a0985ffcbd4a2430ec00f3ffca89796e'
cache="${XDG_CACHE_HOME:-$HOME/.cache}/lessso/trivy"

trivy_run() {
  mkdir -p "$cache"
  docker run --rm --volume "$cache:/cache" -e TRIVY_CACHE_DIR=/cache "$@"
}

case "${1:-guide}" in
  guide)
    cat <<'TXT'
Elige una entrada según el hallazgo. Guía: docs/auditoria-lessso.md
  source             Dependencias, secretos en fuentes y configuración Docker
  history            Historial local Git, con resultados sin valores secretos
  image IMAGEN       Paquetes de una imagen Docker local
  runtime URL [CA]   TLS, salud, autenticación de Reportes y caché
  load URL [CA]      k6 de disponibilidad, 5 usuarios virtuales
  database           Privilegios de la cuenta de PostgreSQL y tablas con RLS
  backups            Últimos respaldos cifrados sin abrir los archivos
TXT
    ;;
  source)
    bash -n lessso
    bash -n scripts/audit.sh
    stage="$(mktemp -d)"
    trap 'find "$stage" -depth -delete' EXIT
    git ls-files -co --exclude-standard -z -- .env.example lessso docker-compose.yml docker-compose.dev.yml \
      backend/app backend/migrations backend/requirements.txt backend/Dockerfile \
      frontend/src frontend/package.json frontend/package-lock.json frontend/Dockerfile \
      nginx/Dockerfile nginx/default.conf.template nginx/lessso-auth-proxy.conf nginx/lessso-security-headers.conf \
      scripts/full_backup .github/workflows |
      sort -zu | tar --null -T - -cf - | tar -xf - -C "$stage"
    trivy_run --volume "$stage:/src:ro" "$trivy" fs --scanners vuln,misconfig \
      --severity HIGH,CRITICAL --exit-code 1 /src || status=$?
    trivy_run --volume "$stage:/src:ro" "$trivy" fs --scanners secret \
      --format json --severity HIGH,CRITICAL --exit-code 1 /src |
      python3 -c 'import sys,json; d=json.load(sys.stdin); print("Secretos candidatos:",sum(len(r.get("Secrets", [])) for r in d.get("Results", [])))' || status=$?
    exit "${status:-0}"
    ;;
  history)
    gitdir="$(git rev-parse --absolute-git-dir)"
    docker run --rm --network none --volume "$gitdir:/scan/.git:ro" "$trufflehog" \
      git file:///scan --no-verification --no-update --json |
      python3 -c 'import json,sys
found=False
for line in sys.stdin:
    x=json.loads(line)
    g=x.get("SourceMetadata",{}).get("Data",{}).get("Git",{})
    print(x.get("DetectorName","unknown"),g.get("commit","")[:12],g.get("file",""),g.get("line",""))
    found=True
raise SystemExit(1 if found else 0)'
    ;;
  image)
    : "${2:?Indica la imagen Docker local que quieres auditar}"
    stage="$(mktemp -d)"
    trap 'find "$stage" -depth -delete' EXIT
    docker save --output "$stage/image.tar" "$2"
    trivy_run --volume "$stage:/input:ro" "$trivy" image --input /input/image.tar \
      --scanners vuln --severity HIGH,CRITICAL --exit-code 1
    ;;
  database)
    docker compose exec -T db sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off' <<'SQL'
SELECT rolsuper AS superusuario, rolbypassrls AS omite_rls FROM pg_roles WHERE rolname = 'lessso_runtime';
SELECT count(*) AS tablas_con_rls FROM pg_class WHERE relrowsecurity;
SQL
    ;;
  backups)
    docker compose exec -T full_backup sh -c 'find /var/backups/full -mindepth 1 -maxdepth 1 -type d -name "full-*" -printf "%f\n" | sort | tail -5'
    ;;
  runtime|load)
    : "${2:?Indica la URL HTTPS de la instalación}"
    [[ "$2" == https://* ]] || { echo 'Se requiere HTTPS.' >&2; exit 2; }
    base="${2%/}"
    ca="$(realpath "${3:-nginx/certs/local/ca.crt}")"
    if [[ "$1" == runtime ]]; then
      docker compose config --quiet
      curl --fail --silent --show-error --max-time 10 --cacert "$ca" "$base/health"
      printf '\n'
      response="$(curl --silent --show-error --max-time 10 --cacert "$ca" --dump-header - --output /dev/null "$base/api/v1/reports/documents")"
      printf '%s\n' "$response" | grep -Ei '^HTTP/|^cache-control:|^content-security-policy:'
      grep -Eq '^HTTP/[^ ]+ (401|403)' <<<"$response"
      grep -Eiq '^cache-control:.*no-store' <<<"$response"
      grep -Eiq '^content-security-policy:' <<<"$response"
    else
      docker run --rm -e "LESSSO_BASE_URL=$base" -e SSL_CERT_FILE=/review/ca.crt \
        --volume "$ca:/review/ca.crt:ro" --volume "$PWD/scripts/k6/crm-smoke.js:/review/smoke.js:ro" \
        "$k6" run /review/smoke.js
    fi
    ;;
  *)
    echo 'Subcomando desconocido. Usa scripts/audit.sh guide.' >&2
    exit 2
    ;;
esac
