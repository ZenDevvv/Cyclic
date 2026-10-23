import path from 'node:path';

export interface Config {
  port: number;
  dbPath: string;
  corsOrigins: string[];
  production: boolean;
  /** Built client to serve; null to serve nothing (tests, dev with Vite). */
  clientDist: string | null;
  /** Express "trust proxy": hops of reverse proxy in front (rate limits read X-Forwarded-For). */
  trustProxy: number | boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Render sets RENDER=true on every service; treat it as production even if NODE_ENV was never set.
  const production = env.NODE_ENV === 'production' || env.RENDER === 'true';
  return {
    port: Number(env.PORT) || 5500,
    dbPath: env.DATABASE_PATH || path.resolve(import.meta.dirname, '../data/scidama.db'),
    corsOrigins: (env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    production,
    clientDist: path.resolve(import.meta.dirname, '../client/dist'),
    // Behind a host's proxy (Render, Fly, Railway) one hop is right; without one, trusting the header
    // would let clients spoof their IP and dodge rate limits.
    trustProxy: parseTrustProxy(env.TRUST_PROXY, production),
  };
}

/** "2" → 2 hops, "true"/"false" as written, unset or empty → 1 in production, off otherwise. */
export function parseTrustProxy(raw: string | undefined, production: boolean): number | boolean {
  const v = raw?.trim().toLowerCase();
  if (!v) return production ? 1 : false;
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : false;
}
