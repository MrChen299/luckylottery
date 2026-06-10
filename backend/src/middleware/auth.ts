import { createMiddleware } from 'hono/factory';
import type { Env } from '../index';

// JWT payload stored in context
export type AuthPayload = {
  userId: number;
  username: string;
};

let cachedJwtSecret: CryptoKey | null = null;

async function importKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Create JWT token
export async function createToken(
  payload: AuthPayload,
  secret: string
): Promise<string> {
  const key = await importKey(secret);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(
    JSON.stringify({ ...payload, iat: now, exp: now + 86400 * 7 }) // 7 days
  );
  const data = new TextEncoder().encode(`${header}.${body}`);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  const signature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(sig))
  );
  return `${header}.${body}.${signature}`;
}

// Parse and verify JWT token
export async function parseToken(
  token: string,
  secret: string
): Promise<AuthPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const key = await importKey(secret);
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sigBytes = Uint8Array.from(
      base64UrlDecode(parts[2]),
      (c) => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // expired
    }
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}

// Auth middleware — attaches user info to context
export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: { user: AuthPayload };
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '未登录，请先登录' }, 401);
  }
  const token = authHeader.slice(7);
  const user = await parseToken(token, c.env.JWT_SECRET);
  if (!user) {
    return c.json({ error: '登录已过期，请重新登录' }, 401);
  }
  c.set('user', user);
  await next();
});