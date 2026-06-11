import type { Env } from '../index';
import { calculatePrize } from '../utils/lottery';

// 开奖数据 API
const LOTTERY_API = 'https://api.huiniao.top/interface/home/lotteryHistory';

type LotteryResult = {
  code: string;
  day: string;
  one: string;
  two: string;
  three: string;
  four: string;
  five: string;
  six: string;
  seven: string;
};

// 获取开奖数据
async function fetchLotteryResults(issue: string): Promise<LotteryResult | null> {
  try {
    const res = await fetch(`${LOTTERY_API}?type=ssq&code=${issue}`);
    if (!res.ok) return null;
    const json = await res.json() as { code: number; data?: { data?: { list: LotteryResult[] } } };
    if (json.code !== 1 || !json.data?.data?.list?.length) return null;
    return json.data.data.list[0];
  } catch {
    return null;
  }
}

// 批量获取开奖数据
async function fetchLotteryResultsByRange(startIssue: string, endIssue: string): Promise<LotteryResult[]> {
  try {
    // 计算期数范围
    const startNum = parseInt(startIssue, 10);
    const endNum = parseInt(endIssue, 10);
    if (isNaN(startNum) || isNaN(endNum) || startNum > endNum) return [];

    // 获取足够多的数据
    const limit = Math.min(100, endNum - startNum + 10);
    const res = await fetch(`${LOTTERY_API}?type=ssq&page=1&limit=${limit}`);
    if (!res.ok) return [];
    const json = await res.json() as { code: number; data?: { data?: { list: LotteryResult[] } } };
    if (json.code !== 1 || !json.data?.data?.list) return [];

    // 过滤出范围内的期号
    return json.data.data.list.filter(item => {
      const num = parseInt(item.code, 10);
      return num >= startNum && num <= endNum;
    });
  } catch {
    return [];
  }
}

// 检查并记录中奖
export async function checkWins(env: Env): Promise<{ processed: number; wins: number }> {
  const db = env.DB;

  // 1. 获取 picks 表中的期号范围
  const issueRange = await db.prepare(`
    SELECT MIN(issue) as min_issue, MAX(issue) as max_issue
    FROM picks
    WHERE issue NOT IN (SELECT issue FROM processed_issues)
  `).first<{ min_issue: string; max_issue: string }>();

  if (!issueRange?.min_issue || !issueRange?.max_issue) {
    return { processed: 0, wins: 0 };
  }

  // 2. 获取开奖数据
  const results = await fetchLotteryResultsByRange(issueRange.min_issue, issueRange.max_issue);
  if (results.length === 0) {
    return { processed: 0, wins: 0 };
  }

  const resultsMap = new Map<string, LotteryResult>();
  results.forEach(r => resultsMap.set(r.code, r));

  // 3. 获取未处理的 picks
  const unprocessedPicks = await db.prepare(`
    SELECT p.id, p.user_id, p.issue, p.reds, p.blue, u.username
    FROM picks p
    JOIN users u ON p.user_id = u.id
    WHERE p.issue IN (${results.map(() => '?').join(',')})
    AND p.issue NOT IN (SELECT issue FROM processed_issues)
  `).bind(...results.map(r => r.code)).all<{
    id: number;
    user_id: number;
    issue: string;
    reds: string;
    blue: number;
    username: string;
  }>();

  if (!unprocessedPicks.results?.length) {
    return { processed: 0, wins: 0 };
  }

  // 4. 计算中奖并写入 wins 表
  let winsCount = 0;
  const processedIssues = new Set<string>();

  for (const pick of unprocessedPicks.results) {
    const result = resultsMap.get(pick.issue);
    if (!result) continue;

    const winReds = [
      parseInt(result.one, 10),
      parseInt(result.two, 10),
      parseInt(result.three, 10),
      parseInt(result.four, 10),
      parseInt(result.five, 10),
      parseInt(result.six, 10),
    ];
    const winBlue = parseInt(result.seven, 10);
    const userReds = JSON.parse(pick.reds) as number[];

    const prize = calculatePrize(userReds, pick.blue, winReds, winBlue);

    // 只记录中奖的
    if (prize.level > 0) {
      await db.prepare(`
        INSERT INTO wins (user_id, pick_id, issue, reds, blue, win_reds, win_blue, red_match, blue_match, prize_level, prize_amount)
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
      winsCount++;
    }

    processedIssues.add(pick.issue);
  }

  // 5. 标记期号已处理
  for (const issue of processedIssues) {
    await db.prepare(`
      INSERT OR IGNORE INTO processed_issues (issue) VALUES (?)
    `).bind(issue).run();
  }

  return { processed: processedIssues.size, wins: winsCount };
}

// Scheduled handler
export async function scheduledHandler(env: Env): Promise<void> {
  console.log('Starting win check job...');
  const result = await checkWins(env);
  console.log(`Win check completed: processed ${result.processed} issues, found ${result.wins} wins`);
}