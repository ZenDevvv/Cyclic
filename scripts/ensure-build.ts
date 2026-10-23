// Runs before `npm start`: builds the client if a host's build step did not (for example a Render
// service still set up for the original app, whose build command is only `npm install`).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

if (!fs.existsSync(path.join(root, 'client/dist/index.html'))) {
  console.log('[scidama] client/dist is missing: building the client before starting.');
  let vite: typeof import('vite');
  try {
    vite = await import('vite');
  } catch {
    console.error('[scidama] Cannot build the client: dev dependencies are not installed.');
    console.error('[scidama] Use the build command "npm install --include=dev && npm run build".');
    process.exit(1);
  }
  process.chdir(root);
  await vite.build({ configFile: path.join(root, 'vite.config.ts'), logLevel: 'warn' });
  console.log('[scidama] client built.');
}
