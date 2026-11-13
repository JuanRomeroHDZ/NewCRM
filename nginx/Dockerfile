FROM nginx:alpine-slim

COPY default.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/health || exit 1

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
