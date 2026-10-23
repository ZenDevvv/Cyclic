// Session tokens (stored hashed) and passwords (scrypt).
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Repo, User } from './db.ts';

export const newToken = (): string => randomBytes(32).toString('base64url');

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const key = scryptSync(password, Buffer.from(saltB64, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const NAME_RULE = 'Names are 3–20 characters: letters, digits, spaces, _ and -.';

/** Trim and collapse spaces; null when the name breaks the rule. */
export function normaliseName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  return /^[A-Za-z0-9 _-]{3,20}$/.test(name) ? name : null;
}

export function userForToken(repo: Repo, token: string | undefined | null): User | null {
  if (!token || token.length > 200) return null;
  return repo.userForSession(hashToken(token));
}

export function startSession(repo: Repo, userId: string): string {
  const token = newToken();
  repo.createSession(userId, hashToken(token));
  return token;
}
