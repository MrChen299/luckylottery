import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { calculatePrize, getPrizeName, formatAmount } from '../utils/lottery';
import { generatePicks, type DrawData } from '../utils/pickGenerator';

const backtest = new Hono<{ Bindings: Env }>();

const LOTTERY_API = 'https://api.huiniao.top/interface/home/lotteryHistory';

interface LotteryResult {
  code: string;
  day: string;
  one: string;
  two: string;
  three: string;
  four: string;
  five: string;
  six: string;
  seven: string;
}

// 从API获取开奖数据
async function fetchDraws(code?: string, limit?: number): Promise<LotteryResult[]> {
  const params = new URLSearchParams({ type: 'ssq' });
  if (code) params.set('code', code);
  if (limit) params.set('limit', String(limit));

  const res = await fetch(`${LOTTERY_API}?${params}`);
  if (!res.ok) throw new Error('获取开奖数据失败');
  const json = await res.json() as { code: number; data?: { data?: { list: LotteryResult[] } } };
  if (json.code !== 1 || !json.data?.data?.list) return [];
  return json.data.data.list;
}

// 解析开奖数据
function parseDraws(raw: LotteryResult[]): DrawData[] {
  return raw.map(item => {
    const reds = ['one', 'two', 'three', 'four', 'five', 'six']
      .map(f => parseInt(item[f], 10))
      .filter(n => !isNaN(n));
    const blue = parseInt(item.seven, 10) || 0;
    return { issue: item.code || '', date: item.day || '', reds, blue };
  }).filter(d => d.reds.length === 6 && d.blue > 0);
}

// POST /api/backtest - 执行回测
backtest.post('/', authMiddleware, async (c) => {
  const user = c.get('user');

  let body: { startIssue?: string; endIssue?: string; luckySeed?: string; pickCount?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求参数错误' }, 400);
  }

  const { startIssue, endIssue, luckySeed, pickCount: rawPickCount } = body;
  if (!startIssue || !endIssue) {
    return c.json({ error: '请选择起止期号' }, 400);
  }

  const pickCount = Math.min(20, Math.max(1, rawPickCount || 5));

  // 1. 获取足够多的开奖数据（从endIssue往前取足够多期，包含startIssue之前的50期用于分析）
  const allDraws = await fetchDraws(endIssue, 200);
  if (allDraws.length === 0) {
    return c.json({ error: '获取开奖数据失败' }, 502);
  }

  const parsedDraws = parseDraws(allDraws);

  // 2. 找到范围内的期号
  const startIdx = parsedDraws.findIndex(d => d.issue === startIssue);
  const endIdx = parsedDraws.findIndex(d => d.issue === endIssue);
  if (startIdx === -1 || endIdx === -1) {
    return c.json({ error: '期号范围无效，请检查期号是否正确' }, 400);
  }

  // parsedDraws 按时间降序排列（最新在前）
  // 范围内的期号（从旧到新）
  const rangeDraws = parsedDraws.slice(endIdx, startIdx + 1).reverse();

  // 3. 创建回测记录
  const btResult = await c.env.DB.prepare(`
    INSERT INTO backtests (user_id, start_issue, end_issue, lucky_seed, pick_count, status)
    VALUES (?, ?, ?, ?, ?, 'running')
  `).bind(user.userId, startIssue, endIssue, luckySeed || null, pickCount).run();

  const backtestId = btResult.meta.last_row_id;

  try {
    let totalPicks = 0;
    let totalWins = 0;
    let totalPrizeAmount = 0;

    // 4. 对每一期进行回测
    for (let i = 0; i < rangeDraws.length; i++) {
      const draw = rangeDraws[i];

      // 获取该期之前的50期数据用于分析
      const drawIdx = parsedDraws.findIndex(d => d.issue === draw.issue);
      const historyDraws = parsedDraws.slice(drawIdx + 1, drawIdx + 51);

      if (historyDraws.length < 10) continue; // 历史数据不足，跳过

      // 生成机选号码
      const tickets = generatePicks(historyDraws, pickCount, luckySeed);

      // 计算中奖
      for (const ticket of tickets) {
        const prize = calculatePrize(ticket.reds, ticket.blue, draw.reds, draw.blue);
        totalPicks++;

        // 写入明细（所有记录都保存，包括未中奖）
        await c.env.DB.prepare(`
          INSERT INTO backtest_details (backtest_id, issue, reds, blue, win_reds, win_blue, red_match, blue_match, prize_level, prize_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          backtestId,
          draw.issue,
          JSON.stringify(ticket.reds),
          ticket.blue,
          JSON.stringify(draw.reds),
          draw.blue,
          prize.redMatch,
          prize.blueMatch,
          prize.level,
          prize.amount
        ).run();

        if (prize.level > 0) {
          totalWins++;
          totalPrizeAmount += prize.amount;
        }
      }
    }

    // 5. 更新回测记录
    const totalBetAmount = totalPicks * 200; // 每注2元=200分
    const winRate = totalPicks > 0 ? totalWins / totalPicks : 0;

    await c.env.DB.prepare(`
      UPDATE backtests SET total_picks = ?, total_wins = ?, total_prize_amount = ?, total_bet_amount = ?, win_rate = ?, status = 'completed'
      WHERE id = ?
    `).bind(totalPicks, totalWins, totalPrizeAmount, totalBetAmount, winRate, backtestId).run();

    return c.json({
      id: backtestId,
      startIssue,
      endIssue,
      luckySeed: luckySeed || null,
      pickCount,
      totalPicks,
      totalWins,
      totalPrizeAmount,
      totalPrizeAmountText: formatAmount(totalPrizeAmount),
      totalBetAmount,
      totalBetAmountText: formatAmount(totalBetAmount),
      winRate: (winRate * 100).toFixed(2) + '%',
      issueCount: rangeDraws.length,
    });
  } catch (err) {
    // 回测失败，更新状态
    await c.env.DB.prepare(`UPDATE backtests SET status = 'failed' WHERE id = ?`).bind(backtestId).run();
    throw err;
  }
});

// GET /api/backtest - 获取用户的回测列表
backtest.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20')));
  const offset = (page - 1) * limit;

  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM backtests WHERE user_id = ?'
  ).bind(user.userId).first<{ total: number }>();
  const total = countResult?.total || 0;

  const result = await c.env.DB.prepare(`
    SELECT * FROM backtests WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).bind(user.userId, limit, offset).all();

  const data = (result.results || []).map((r: any) => ({
    id: r.id,
    startIssue: r.start_issue,
    endIssue: r.end_issue,
    luckySeed: r.lucky_seed,
    pickCount: r.pick_count,
    totalPicks: r.total_picks,
    totalWins: r.total_wins,
    totalPrizeAmount: r.total_prize_amount,
    totalPrizeAmountText: formatAmount(r.total_prize_amount),
    totalBetAmount: r.total_bet_amount,
    totalBetAmountText: formatAmount(r.total_bet_amount),
    winRate: (r.win_rate * 100).toFixed(2) + '%',
    status: r.status,
    createdAt: r.created_at,
  }));

  return c.json({ data, total, page, limit });
});

// GET /api/backtest/:id - 获取回测详情
backtest.get('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: '无效的ID' }, 400);

  const bt = await c.env.DB.prepare(
    'SELECT * FROM backtests WHERE id = ? AND user_id = ?'
  ).bind(id, user.userId).first<any>();

  if (!bt) return c.json({ error: '回测记录不存在' }, 404);

  const details = await c.env.DB.prepare(
    'SELECT * FROM backtest_details WHERE backtest_id = ? ORDER BY issue ASC, id ASC'
  ).bind(id).all();

  const detailData = (details.results || []).map((d: any) => ({
    id: d.id,
    issue: d.issue,
    reds: JSON.parse(d.reds),
    blue: d.blue,
    winReds: JSON.parse(d.win_reds),
    winBlue: d.win_blue,
    redMatch: d.red_match,
    blueMatch: d.blue_match,
    prizeLevel: d.prize_level,
    prizeName: getPrizeName(d.prize_level),
    prizeAmount: d.prize_amount,
    prizeAmountText: formatAmount(d.prize_amount),
  }));

  return c.json({
    id: bt.id,
    startIssue: bt.start_issue,
    endIssue: bt.end_issue,
    luckySeed: bt.lucky_seed,
    pickCount: bt.pick_count,
    totalPicks: bt.total_picks,
    totalWins: bt.total_wins,
    totalPrizeAmount: bt.total_prize_amount,
    totalPrizeAmountText: formatAmount(bt.total_prize_amount),
    totalBetAmount: bt.total_bet_amount,
    totalBetAmountText: formatAmount(bt.total_bet_amount),
    winRate: (bt.win_rate * 100).toFixed(2) + '%',
    status: bt.status,
    createdAt: bt.created_at,
    details: detailData,
  });
});

export default backtest;
