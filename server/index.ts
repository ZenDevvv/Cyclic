import { loadConfig } from './config.ts';
import { createServer } from './app.ts';

const config = loadConfig();
const server = await createServer({
  port: config.port,
  dbPath: config.dbPath,
  corsOrigins: config.corsOrigins,
  clientDist: config.clientDist,
  production: config.production,
  trustProxy: config.trustProxy,
});

console.log(`Scidama listening on ${server.url}${config.production ? '' : ' (dev: open the Vite URL)'}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
