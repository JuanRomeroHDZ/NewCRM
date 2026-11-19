# Multi-stage hardened Dockerfile for EmailSaver Frontend
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm test && npm run build

# Local development target with Vite HMR. Production continues to use runner.
FROM node:22-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

# Runtime Stage: Lightweight Nginx Alpine
FROM nginx:alpine-slim AS runner

# Remove default nginx website
RUN rm -rf /usr/share/nginx/html/* \
    && sed -i '/^user /d; s|/run/nginx.pid|/tmp/nginx.pid|' /etc/nginx/nginx.conf \
    && chown -R nginx:nginx /var/cache/nginx

# Copy built static assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx configuration for SPA routing
RUN cat <<'EOF' > /etc/nginx/conf.d/default.conf
server {
    listen 8080;
    listen [::]:8080;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    }

    location ~* \.mjs$ {
        types { application/javascript mjs; }
        try_files $uri =404;
        expires 1y;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|webp|avif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

USER nginx
EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
