# Multi-stage hardened Dockerfile for the LESSSO FastAPI backend
FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=100 --retries 5 --user -r requirements.txt

# Final Runtime Stage
FROM python:3.12-slim AS runner

WORKDIR /app

# Install runtime dependencies only
ARG TYPST_VERSION=0.15.1
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    ca-certificates \
    xz-utils \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libffi8 \
    shared-mime-info \
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

# Copy installed packages from builder
COPY --from=builder /root/.local /home/appuser/.local
ENV PATH=/home/appuser/.local/bin:$PATH

# Copy application code
COPY --chown=appuser:appgroup . /app

USER appuser

EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Las sesiones de bóveda viven en memoria del proceso; varios procesos las aislarían.
# Mantener un proceso hasta disponer de sesiones compartidas y revocables.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
