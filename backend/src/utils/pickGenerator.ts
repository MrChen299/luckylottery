// 机选算法 - 从前端移植

export interface DrawData {
  issue: string;
  date: string;
  reds: number[];
  blue: number;
}

export interface AnalysisResult {
  redFreq: Record<number, number>;
  redLastSeen: Record<number, number>;
  blueFreq: Record<number, number>;
  blueLastSeen: Record<number, number>;
  totalDraws: number;
}

export interface Ticket {
  reds: number[];
  blue: number;
}

// DJB2 hash
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// mulberry32 PRNG
export function createRNG(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 分析历史开奖数据
export function analyzeHistory(draws: DrawData[]): AnalysisResult | null {
  if (draws.length === 0) return null;

  const totalDraws = draws.length;

  const redFreq: Record<number, number> = {};
  const redLastSeen: Record<number, number> = {};
  for (let i = 1; i <= 33; i++) {
    redFreq[i] = 0;
    redLastSeen[i] = totalDraws;
  }

  const blueFreq: Record<number, number> = {};
  const blueLastSeen: Record<number, number> = {};
  for (let i = 1; i <= 16; i++) {
    blueFreq[i] = 0;
    blueLastSeen[i] = totalDraws;
  }

  draws.forEach((draw, idx) => {
    draw.reds.forEach(r => {
      redFreq[r] = (redFreq[r] || 0) + 1;
      if (redLastSeen[r] === totalDraws) redLastSeen[r] = idx;
    });
    const b = draw.blue;
    blueFreq[b] = (blueFreq[b] || 0) + 1;
    if (blueLastSeen[b] === totalDraws) blueLastSeen[b] = idx;
  });

  return { redFreq, redLastSeen, blueFreq, blueLastSeen, totalDraws };
}

function calculateScore(freq: number, lastSeen: number, totalDraws: number, rng: () => number): number {
  const freqScore = freq / totalDraws;
  const recencyScore = lastSeen === totalDraws ? 1.0 : (lastSeen / totalDraws) * 0.8 + 0.2;
  return freqScore * 0.5 + recencyScore * 0.3 + rng() * 0.2;
}

function smartPickReds(analysis: AnalysisResult, count: number, rng: () => number): number[] {
  const { redFreq, redLastSeen, totalDraws } = analysis;
  const candidates: Array<{ num: number; score: number }> = [];

  for (let i = 1; i <= 33; i++) {
    const score = calculateScore(redFreq[i], redLastSeen[i], totalDraws, rng);
    candidates.push({ num: i, score });
  }

  candidates.sort((a, b) => b.score - a.score);

  const pool = candidates.slice(0, 25);
  const selected = new Set<number>();

  while (selected.size < count) {
    const prevSize = selected.size;
    const totalWeight = pool.reduce((sum, c) => sum + c.score, 0);
    let rand = rng() * totalWeight;
    for (const c of pool) {
      rand -= c.score;
      if (rand <= 0 && !selected.has(c.num)) {
        selected.add(c.num);
        break;
      }
    }
    if (selected.size === prevSize) {
      for (const c of pool) {
        if (!selected.has(c.num)) {
          selected.add(c.num);
          break;
        }
      }
    }
  }

  return [...selected].sort((a, b) => a - b);
}

function smartPickBlue(analysis: AnalysisResult, rng: () => number): number {
  const { blueFreq, blueLastSeen, totalDraws } = analysis;
  const candidates: Array<{ num: number; score: number }> = [];

  for (let i = 1; i <= 16; i++) {
    const score = calculateScore(blueFreq[i], blueLastSeen[i], totalDraws, rng);
    candidates.push({ num: i, score });
  }

  candidates.sort((a, b) => b.score - a.score);

  const pool = candidates.slice(0, 12);
  const totalWeight = pool.reduce((sum, c) => sum + c.score, 0);
  let rand = rng() * totalWeight;
  for (const c of pool) {
    rand -= c.score;
    if (rand <= 0) return c.num;
  }
  return pool[0].num;
}

// 生成机选号码
export function generatePicks(
  historyDraws: DrawData[],
  pickCount: number,
  luckySeed?: string
): Ticket[] {
  const analysis = analyzeHistory(historyDraws);
  if (!analysis) return [];

  let baseSeed = Date.now();
  if (luckySeed && luckySeed.length > 0) {
    baseSeed = hashString(luckySeed);
  }

  const tickets: Ticket[] = [];
  for (let i = 0; i < pickCount; i++) {
    const stepSeed = baseSeed + i * 911382629;
    const rng = luckySeed && luckySeed.length > 0 ? createRNG(stepSeed) : createRNG(stepSeed);
    const reds = smartPickReds(analysis, 6, rng);
    const blue = smartPickBlue(analysis, rng);
    tickets.push({ reds, blue });
  }

  return tickets;
}
