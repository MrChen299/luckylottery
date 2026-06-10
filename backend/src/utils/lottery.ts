// 双色球中奖规则
// 一等奖：6红+1蓝
// 二等奖：6红
// 三等奖：5红+1蓝
// 四等奖：5红 或 4红+1蓝
// 五等奖：4红 或 3红+1蓝
// 六等奖：2红+1蓝 或 1红+1蓝 或 0红+1蓝
// 福运奖：3红+0蓝（奖池≥15亿时启动，固定5元）

export type PrizeResult = {
  level: number;      // 1-6，0表示未中奖，7表示福运奖
  amount: number;     // 奖金（单位：分）
  redMatch: number;
  blueMatch: number;
};

// 双色球奖金对照表（单位：分，实际奖金以官方为准，这里使用典型值）
const PRIZE_TABLE: Record<number, number> = {
  1: 5_0000_0000,   // 一等奖：500万（浮动，取典型值）
  2: 1_0000_0000,   // 二等奖：100万（浮动，取典型值）
  3: 300000,        // 三等奖：3000元
  4: 20000,         // 四等奖：200元
  5: 1000,          // 五等奖：10元
  6: 500,           // 六等奖：5元
  7: 500,           // 福运奖：5元（3红+0蓝）
  0: 0,             // 未中奖
};

export function calculatePrize(
  userReds: number[],
  userBlue: number,
  winReds: number[],
  winBlue: number,
  luckyPoolEnabled: boolean = true  // 福运奖是否启用（奖池≥15亿时启用）
): PrizeResult {
  // 计算红球命中数
  const redMatch = userReds.filter(r => winReds.includes(r)).length;
  // 蓝球命中
  const blueMatch = userBlue === winBlue ? 1 : 0;

  let level = 0;

  if (redMatch === 6 && blueMatch === 1) {
    level = 1; // 一等奖
  } else if (redMatch === 6 && blueMatch === 0) {
    level = 2; // 二等奖
  } else if (redMatch === 5 && blueMatch === 1) {
    level = 3; // 三等奖
  } else if ((redMatch === 5 && blueMatch === 0) || (redMatch === 4 && blueMatch === 1)) {
    level = 4; // 四等奖
  } else if ((redMatch === 4 && blueMatch === 0) || (redMatch === 3 && blueMatch === 1)) {
    level = 5; // 五等奖
  } else if (blueMatch === 1 && (redMatch === 2 || redMatch === 1 || redMatch === 0)) {
    level = 6; // 六等奖
  } else if (luckyPoolEnabled && redMatch === 3 && blueMatch === 0) {
    level = 7; // 福运奖：3红+0蓝
  }

  return {
    level,
    amount: PRIZE_TABLE[level] || 0,
    redMatch,
    blueMatch,
  };
}

// 格式化金额（分 -> 元）
export function formatAmount(fen: number): string {
  if (fen >= 1_0000_0000) {
    return `${(fen / 1_0000_0000).toFixed(0)}万`;
  } else if (fen >= 1_0000) {
    return `${(fen / 1_0000).toFixed(0)}万`;
  } else {
    return `${(fen / 100).toFixed(0)}元`;
  }
}

// 中奖等级名称
export function getPrizeName(level: number): string {
  const names: Record<number, string> = {
    1: '一等奖',
    2: '二等奖',
    3: '三等奖',
    4: '四等奖',
    5: '五等奖',
    6: '六等奖',
    7: '福运奖',
    0: '未中奖',
  };
  return names[level] || '未知';
}