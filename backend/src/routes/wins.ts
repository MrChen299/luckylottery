import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware, type AuthPayload } from '../middleware/auth';
import { getPrizeName, formatAmount } from '../utils/lottery';

const wins = new Hono<{ Bindings: Env; Variables: { user: AuthPayload } }>();

// 用户名脱敏：保留首字符，其余用 * 替代
function maskUsername(username: string): string {
  if (username.length <= 2) {
    return username[0] + '*';
  }
  const first = username[0];
  const last = username[username.length - 1];
  const middle = '*'.repeat(Math.min(username.length - 2, 4));
  return first + middle + last;
}

// GET /api/wins/public - 全站中奖记录（用户名脱敏）
wins.get('/public', async (c) => {
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20')));

  const results = await c.env.DB.prepare(`
    SELECT w.id, w.issue, w.reds, w.blue, w.win_reds, w.win_blue,
           w.red_match, w.blue_match, w.prize_level, w.prize_amount,
           w.created_at, u.username
    FROM wins w
    JOIN users u ON w.user_id = u.id
    WHERE w.prize_level > 0
    ORDER BY w.created_at DESC
    LIMIT ?
  `).bind(limit).all<{
    id: number;
    issue: string;
    reds: string;
    blue: number;
    win_reds: string;
    win_blue: number;
    red_match: number;
    blue_match: number;
    prize_level: number;
    prize_amount: number;
    created_at: string;
    username: string;
  }>();

  const data = (results.results || []).map(row => ({
    issue: row.issue,
    username: maskUsername(row.username),
    reds: JSON.parse(row.reds) as number[],
    blue: row.blue,
    winReds: JSON.parse(row.win_reds) as number[],
    winBlue: row.win_blue,
    redMatch: row.red_match,
    blueMatch: row.blue_match,
    prizeLevel: row.prize_level,
    prizeName: getPrizeName(row.prize_level),
    prizeAmount: row.prize_amount,
    prizeAmountText: formatAmount(row.prize_amount),
    createdAt: row.created_at,
  }));

  return c.json({ data });
});

// GET /api/wins/mine - 我的中奖记录（需登录）
wins.get('/mine', authMiddleware, async (c) => {
  const user = c.get('user');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20')));
  const offset = (page - 1) * limit;

  // 获取总数
  const countResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as total FROM wins WHERE user_id = ? AND prize_level > 0
  `).bind(user.userId).first<{ total: number }>();
  const total = countResult?.total || 0;

  // 获取记录
  const results = await c.env.DB.prepare(`
    SELECT id, issue, reds, blue, win_reds, win_blue,
           red_match, blue_match, prize_level, prize_amount, created_at
    FROM wins
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(user.userId, limit, offset).all<{
    id: number;
    issue: string;
    reds: string;
    blue: number;
    win_reds: string;
    win_blue: number;
    red_match: number;
    blue_match: number;
    prize_level: number;
    prize_amount: number;
    created_at: string;
  }>();

  const data = (results.results || []).map(row => ({
    issue: row.issue,
    reds: JSON.parse(row.reds) as number[],
    blue: row.blue,
    winReds: JSON.parse(row.win_reds) as number[],
    winBlue: row.win_blue,
    redMatch: row.red_match,
    blueMatch: row.blue_match,
    prizeLevel: row.prize_level,
    prizeName: getPrizeName(row.prize_level),
    prizeAmount: row.prize_amount,
    prizeAmountText: formatAmount(row.prize_amount),
    createdAt: row.created_at,
  }));

  return c.json({ data, total, page, limit });
});

export default wins;