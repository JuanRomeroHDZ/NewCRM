import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, projectRoot, 'VITE_');
  const apiProxyTarget = env.VITE_API_PROXY_TARGET;
  const devHost = env.VITE_DEV_HOST;
  const devPort = Number.parseInt(env.VITE_DEV_PORT, 10);
  const devHttps = command === 'serve' && env.VITE_DEV_HTTPS === 'true';
  const https = devHttps
    ? {
        key: readFileSync(join(projectRoot, 'nginx/certs/local/server.key')),
        cert: readFileSync(join(projectRoot, 'nginx/certs/local/server.crt')),
      }
    : undefined;
  const apiProxy = apiProxyTarget
    ? {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      }
    : undefined;

  if (command === 'serve') {
    const missing = [
      ['VITE_API_PROXY_TARGET', apiProxyTarget],
      ['VITE_DEV_HOST', devHost],
      ['VITE_DEV_PORT', env.VITE_DEV_PORT],
    ].filter(([, value]) => !value).map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`Define ${missing.join(', ')} in the project .env before starting the frontend dev server.`);
    }
    if (!Number.isInteger(devPort) || devPort < 1 || devPort > 65535) {
      throw new Error('VITE_DEV_PORT must be a valid TCP port between 1 and 65535.');
    }
  }

  return {
    envDir: projectRoot,
    plugins: [react()],
    server: {
      port: Number.isInteger(devPort) ? devPort : undefined,
      host: devHost || undefined,
      https,
      proxy: apiProxy,
    },
    preview: {
      port: Number.isInteger(devPort) ? devPort : undefined,
      host: devHost || undefined,
      https,
      proxy: apiProxy,
    },
  };
});
