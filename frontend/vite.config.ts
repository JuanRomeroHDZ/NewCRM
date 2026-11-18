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
  const proxiedHmr = command === 'serve' && env.VITE_DEV_HMR === 'true';
  const hmrHost = env.VITE_DEV_HMR_HOST;
  const hmrClientPort = Number.parseInt(env.VITE_DEV_HMR_CLIENT_PORT, 10);
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
          ws: true,
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
    if (proxiedHmr && (!hmrHost || !Number.isInteger(hmrClientPort) || hmrClientPort < 1 || hmrClientPort > 65535)) {
      throw new Error('Define VITE_DEV_HMR_HOST and a valid VITE_DEV_HMR_CLIENT_PORT when VITE_DEV_HMR is enabled.');
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
      hmr: proxiedHmr
        ? { protocol: 'wss', host: hmrHost, clientPort: hmrClientPort }
        : undefined,
    },
    preview: {
      port: Number.isInteger(devPort) ? devPort : undefined,
      host: devHost || undefined,
      https,
      proxy: apiProxy,
    },
  };
});
