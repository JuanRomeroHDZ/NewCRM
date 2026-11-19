# syntax=docker/dockerfile:1.14
# Multi-stage hardened Dockerfile for the LESSSO FastAPI backend
FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN PIP_DISABLE_PIP_VERSION_CHECK=1 pip install --no-cache-dir --default-timeout=100 --retries 5 \
    --user --no-warn-script-location --root-user-action=ignore -r requirements.txt

FROM builder AS test-dependencies
COPY requirements-test.txt .
RUN PIP_DISABLE_PIP_VERSION_CHECK=1 pip install --no-cache-dir --default-timeout=100 --retries 5 \
    --user --no-warn-script-location --root-user-action=ignore -r requirements-test.txt

# Shared runtime base for production and the isolated test image.
FROM python:3.12-slim AS runtime-base

WORKDIR /app

# Install runtime dependencies only
ARG TYPST_VERSION=0.15.1
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    ca-certificates \
    xz-utils \
    zlib1g \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libffi8 \
    shared-mime-info \
    libharfbuzz-subset0 \
    fonts-dejavu-core \
    ffmpeg \
    librsvg2-bin \
    && arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
         amd64) typst_target="x86_64-unknown-linux-musl"; typst_sha256="a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c" ;; \
         arm64) typst_target="aarch64-unknown-linux-musl"; typst_sha256="5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee" ;; \
         *) echo "Unsupported architecture for Typst: $arch" >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${typst_target}.tar.xz" -o /tmp/typst.tar.xz \
    && echo "${typst_sha256}  /tmp/typst.tar.xz" | sha256sum -c - \
    && tar -xJf /tmp/typst.tar.xz --strip-components=1 -C /usr/local/bin "typst-${typst_target}/typst" \
    && chmod 0755 /usr/local/bin/typst \
    && rm -f /tmp/typst.tar.xz \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged non-root user
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -s /bin/bash -m appuser && \
    chmod 755 /home/appuser

# Copy runtime packages from builder before either final image copies source.
COPY --from=builder /root/.local /home/appuser/.local
ENV PATH=/home/appuser/.local/bin:$PATH

# Test-only image. Poppler is used by PDF assertions; production stays smaller.
FROM runtime-base AS test
USER root
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*
COPY --from=test-dependencies --chown=appuser:appgroup /root/.local /home/appuser/.local
COPY --chown=appuser:appgroup --chmod=u=rwX,go=rX . /app
USER appuser
HEALTHCHECK NONE
CMD ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider"]

# Production is the final/default target. Test dependencies stay isolated.
FROM runtime-base AS runner
COPY --chown=appuser:appgroup --chmod=u=rwX,go=rX . /app

USER appuser
# Catch missing or unreadable revisions during build, before replacing the API.
RUN python -m alembic heads

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Una API worker por contenedor mantiene acotado el pool local de PostgreSQL.
# Escala horizontalmente con réplicas del servicio backend en Compose.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--ws-max-size", "52428800"]
