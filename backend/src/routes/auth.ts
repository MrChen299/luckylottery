import { Hono } from 'hono';
import type { Env } from '../index';
import { createToken, authMiddleware, type AuthPayload } from '../middleware/auth';

const auth = new Hono<{ Bindings: Env; Variables: { user: AuthPayload } }>();

// Password hashing using Web Crypto (PBKDF2)
async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, storedHash] = stored.split(':');
  if (!saltHex || !storedHash) return false;
  const salt = Uint8Array.from(saltHex.match(/.{1,2}/g)!, (b) => parseInt(b, 16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  const hashHex = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex === storedHash;
}

// POST /api/auth/register
auth.post('/register', async (c) => {
  try {
    const { username, password } = await c.req.json<{ username: string; password: string }>();

    // Validation
    if (!username || !password) {
      return c.json({ error: '用户名和密码不能为空' }, 400);
    }
    if (username.length < 2 || username.length > 20) {
      return c.json({ error: '用户名长度需在2-20个字符之间' }, 400);
    }
    if (password.length < 6 || password.length > 50) {
      return c.json({ error: '密码长度需在6-50个字符之间' }, 400);
    }
    // Username: allow Chinese, letters, digits, underscores
    if (!/^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(username)) {
      return c.json({ error: '用户名只能包含中英文、数字和下划线' }, 400);
    }

    // Check if username already exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).bind(username).first();

    if (existing) {
      return c.json({ error: '用户名已被注册' }, 409);
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const result = await c.env.DB.prepare(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)'
    ).bind(username, passwordHash).run();

    if (!result.success) {
      return c.json({ error: '注册失败，请稍后重试' }, 500);
    }

    return c.json({ message: '注册成功' }, 201);
  } catch (err) {
    return c.json({ error: '请求参数错误' }, 400);
  }
});

// POST /api/auth/login
auth.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json<{ username: string; password: string }>();

    if (!username || !password) {
      return c.json({ error: '用户名和密码不能为空' }, 400);
    }

    // Find user
    const user = await c.env.DB.prepare(
      'SELECT id, username, password_hash FROM users WHERE username = ?'
    ).bind(username).first<{ id: number; username: string; password_hash: string }>();

    if (!user) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    // Create token
    const token = await createToken(
      { userId: user.id, username: user.username },
      c.env.JWT_SECRET
    );

    return c.json({ token, username: user.username });
  } catch (err) {
    return c.json({ error: '请求参数错误' }, 400);
  }
});

// GET /api/auth/me — get current user info
auth.get('/me', authMiddleware, (c) => {
  const user = c.get('user');
  return c.json({ username: user.username });
});

export default auth;