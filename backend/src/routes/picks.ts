import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware, type AuthPayload } from '../middleware/auth';

const picks = new Hono<{ Bindings: Env; Variables: { user: AuthPayload } }>();

// All picks routes require auth
picks.use('*', authMiddleware);

// GET /api/picks — get user's pick history (latest first, grouped by batch)
picks.get('/', async (c) => {
  const user = c.get('user');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20')));
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(DISTINCT batch_id) as total FROM picks WHERE user_id = ?'
  ).bind(user.userId).first<{ total: number }>();
  const total = countResult?.total || 0;

  // Get batch groups
  const batches = await c.env.DB.prepare(`
    SELECT batch_id, issue, lucky_seed, MIN(created_at) as created_at
    FROM picks
    WHERE user_id = ?
    GROUP BY batch_id
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(user.userId, limit, offset).all<{
    batch_id: string;
    issue: string;
    lucky_seed: string | null;
    created_at: string;
  }>();

  if (!batches.results || batches.results.length === 0) {
    return c.json({ data: [], total: 0, page, limit });
  }

  // Get picks for each batch
  const batchIds = batches.results.map((b) => b.batch_id);
  const allPicks = await c.env.DB.prepare(`
    SELECT id, batch_id, reds, blue, created_at
    FROM picks
    WHERE batch_id IN (${batchIds.map(() => '?').join(',')})
    ORDER BY id ASC
  `).bind(...batchIds).all<{
    id: number;
    batch_id: string;
    reds: string;
    blue: number;
    created_at: string;
  }>();

  // Group picks by batch_id
  const picksByBatch = new Map<string, typeof allPicks.results>();
  for (const pick of allPicks.results) {
    if (!picksByBatch.has(pick.batch_id)) {
      picksByBatch.set(pick.batch_id, []);
    }
    picksByBatch.get(pick.batch_id)!.push(pick);
  }

  // Build response
  const data = batches.results.map((batch) => ({
    batchId: batch.batch_id,
    issue: batch.issue,
    luckySeed: batch.lucky_seed,
    createdAt: batch.created_at,
    tickets: (picksByBatch.get(batch.batch_id) || []).map((p) => ({
      reds: JSON.parse(p.reds) as number[],
      blue: p.blue,
    })),
  }));

  return c.json({ data, total, page, limit });
});

// POST /api/picks — save a batch of picks
picks.post('/', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json<{
      issue: string;
      tickets: { reds: number[]; blue: number }[];
      luckySeed?: string;
    }>();

    const { issue, tickets, luckySeed } = body;

    if (!issue || !tickets || !Array.isArray(tickets) || tickets.length === 0) {
      return c.json({ error: '参数不完整' }, 400);
    }

    // Validate tickets
    for (const t of tickets) {
      if (!Array.isArray(t.reds) || t.reds.length !== 6 || typeof t.blue !== 'number') {
        return c.json({ error: '号码格式错误' }, 400);
      }
      if (t.reds.some((r) => r < 1 || r > 33) || t.blue < 1 || t.blue > 16) {
        return c.json({ error: '号码范围错误' }, 400);
      }
    }

    // Generate batch ID
    const batchId = crypto.randomUUID();

    // Insert all picks in a batch
    const stmt = c.env.DB.prepare(
      'INSERT INTO picks (user_id, issue, reds, blue, batch_id, lucky_seed) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const results = await c.env.DB.batch(
      tickets.map((t) =>
        stmt.bind(
          user.userId,
          issue,
          JSON.stringify(t.reds.map((r) => r)),
          t.blue,
          batchId,
          luckySeed || null
        )
      )
    );

    const allSuccess = results.every((r) => r.success);
    if (!allSuccess) {
      return c.json({ error: '保存失败，请稍后重试' }, 500);
    }

    return c.json({ message: '保存成功', batchId }, 201);
  } catch (err) {
    return c.json({ error: '请求参数错误' }, 400);
  }
});

export default picks;