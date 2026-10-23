import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startGameServer } from './app';

const here = dirname(fileURLToPath(import.meta.url));
// Works both from source (server/) and from the bundle (dist/server/).
const projectRoot = [resolve(here, '..'), resolve(here, '..', '..')].find((p) => existsSync(join(p, 'package.json'))) ?? process.cwd();

const env = process.env;
const persistenceOn = (env.PERSISTENCE ?? 'on').toLowerCase() !== 'off';
const dataDir = persistenceOn ? resolve(env.DATA_DIR || join(projectRoot, 'data')) : null;
const staticDir = join(projectRoot, 'dist', 'client');

// In development (`npm run dev`) PORT may belong to the Vite dev server, so the game
// server uses SERVER_PORT there; in production it honours PORT like most hosts expect.
const isDev = process.argv.includes('--dev');
const port = Number((isDev ? env.SERVER_PORT : env.PORT ?? env.SERVER_PORT) ?? 3001);

const server = await startGameServer({
  port,
  host: env.HOST || undefined,
  dataDir,
  staticDir,
  allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
});

console.log(`[server] listening on http://localhost:${server.port}`);
console.log(`[server] persistence: ${dataDir ? dataDir : 'off (memory only)'}`);
if (!existsSync(join(staticDir, 'index.html'))) {
  console.log('[server] no client build found; in development open the Vite URL (http://localhost:5173)');
}

let closing = false;
const shutdown = async (signal: string) => {
  if (closing) return;
  closing = true;
  console.log(`[server] ${signal} received, saving rooms and shutting down`);
  await server.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
