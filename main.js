// Kept so a host still configured for the original app (start command `node main.js`) boots the new
// server. The real entry point is server/index.ts; `npm start` runs it directly.
await import('./scripts/ensure-build.ts');
await import('./server/index.ts');
