import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware, type AuthPayload } from '../middleware/auth';
import { calculatePrize, getPrizeName, formatAmount } from '../utils/lottery';

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

// POST /api/wins/calculate - 按期号计算中奖（需登录）
wins.post('/calculate', authMiddleware, async (c) => {
  const user = c.get('user');

  let body: { issue?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求参数错误' }, 400);
  }

  const { issue } = body;
  if (!issue) {
    return c.json({ error: '缺少期号参数' }, 400);
  }

  // 1. 获取该用户该期的所有机选记录
  const picksResult = await c.env.DB.prepare(`
    SELECT id, user_id, issue, reds, blue
    FROM picks
    WHERE user_id = ? AND issue = ?
  `).bind(user.userId, issue).all<{
    id: number;
    user_id: number;
    issue: string;
    reds: string;
    blue: number;
  }>();

  if (!picksResult.results || picksResult.results.length === 0) {
    return c.json({ error: '该期无机选记录' }, 404);
  }

  // 2. 获取该期开奖数据
  const LOTTERY_API = 'https://api.huiniao.top/interface/home/lotteryHistory';
  let winReds: number[] = [];
  let winBlue = 0;

  try {
    const res = await fetch(`${LOTTERY_API}?type=ssq&code=${issue}`);
    if (!res.ok) {
      return c.json({ error: '获取开奖数据失败' }, 502);
    }
    const json = await res.json() as { code: number; data?: { data?: { list: Array<{ code: string; one: string; two: string; three: string; four: string; five: string; six: string; seven: string }> } } };
    if (json.code !== 1 || !json.data?.data?.list?.length) {
      return c.json({ error: '该期暂未开奖或开奖数据不可用' }, 404);
    }
    const result = json.data.data.list[0];
    winReds = [
      parseInt(result.one, 10),
      parseInt(result.two, 10),
      parseInt(result.three, 10),
      parseInt(result.four, 10),
      parseInt(result.five, 10),
      parseInt(result.six, 10),
    ];
    winBlue = parseInt(result.seven, 10);
  } catch {
    return c.json({ error: '获取开奖数据失败' }, 502);
  }

  // 3. 计算中奖并写入 wins 表（仅记录中奖的，INSERT OR IGNORE 防重复）
  let winsCount = 0;
  let noWinCount = 0;
  let skipCount = 0;
  const results: Array<{
    pickId: number;
    reds: number[];
    blue: number;
    redMatch: number;
    blueMatch: number;
    prizeLevel: number;
    prizeName: string;
    prizeAmount: number;
    prizeAmountText: string;
  }> = [];

  for (const pick of picksResult.results) {
    const userReds = JSON.parse(pick.reds) as number[];
    const prize = calculatePrize(userReds, pick.blue, winReds, winBlue);

    if (prize.level === 0) {
      noWinCount++;
      continue;
    }

    try {
      await c.env.DB.prepare(`
        INSERT OR IGNORE INTO wins (user_id, pick_id, issue, reds, blue, win_reds, win_blue, red_match, blue_match, prize_level, prize_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        pick.user_id,
        pick.id,
        pick.issue,
        pick.reds,
        pick.blue,
        JSON.stringify(winReds),
        winBlue,
        prize.redMatch,
        prize.blueMatch,
        prize.level,
        prize.amount
      ).run();

      // 检查是否实际插入（通过查询确认）
      const existing = await c.env.DB.prepare(`
        SELECT id FROM wins WHERE user_id = ? AND issue = ? AND pick_id = ?
      `).bind(pick.user_id, pick.issue, pick.id).first<{ id: number }>();

      if (existing) {
        winsCount++;
        results.push({
          pickId: pick.id,
          reds: userReds,
          blue: pick.blue,
          redMatch: prize.redMatch,
          blueMatch: prize.blueMatch,
          prizeLevel: prize.level,
          prizeName: getPrizeName(prize.level),
          prizeAmount: prize.amount,
          prizeAmountText: formatAmount(prize.amount),
        });
      } else {
        skipCount++;
      }
    } catch {
      skipCount++;
    }
  }

  return c.json({
    message: `计算完成：共${picksResult.results.length}注，中奖${winsCount}注，未中奖${noWinCount}注，跳过${skipCount}注`,
    issue,
    winReds,
    winBlue,
    results,
    total: picksResult.results.length,
    wins: winsCount,
    noWin: noWinCount,
    skipped: skipCount,
  });
});

export default wins;