-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 机选记录表
CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  issue TEXT NOT NULL,
  reds TEXT NOT NULL,      -- JSON数组字符串，如 "[01,05,12,18,25,33]"
  blue INTEGER NOT NULL,
  batch_id TEXT NOT NULL,  -- 同一批机选的批次ID，用于分组
  lucky_seed TEXT,         -- 用户输入的幸运字符串（可为空）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_picks_user_id ON picks(user_id);
CREATE INDEX IF NOT EXISTS idx_picks_issue ON picks(issue);
CREATE INDEX IF NOT EXISTS idx_picks_batch_id ON picks(batch_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 中奖记录表
CREATE TABLE IF NOT EXISTS wins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  pick_id INTEGER NOT NULL,        -- 关联的机选记录ID
  issue TEXT NOT NULL,             -- 期号
  reds TEXT NOT NULL,              -- 用户选的红球
  blue INTEGER NOT NULL,           -- 用户选的蓝球
  win_reds TEXT NOT NULL,          -- 开奖红球
  win_blue INTEGER NOT NULL,       -- 开奖蓝球
  red_match INTEGER NOT NULL,      -- 红球命中数
  blue_match INTEGER NOT NULL,     -- 蓝球命中数（0或1）
  prize_level INTEGER NOT NULL,    -- 中奖等级（1-6，0为未中奖）
  prize_amount INTEGER NOT NULL,   -- 中奖金额（单位：分）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (pick_id) REFERENCES picks(id)
);

-- 中奖表索引
CREATE INDEX IF NOT EXISTS idx_wins_user_id ON wins(user_id);
CREATE INDEX IF NOT EXISTS idx_wins_issue ON wins(issue);
CREATE INDEX IF NOT EXISTS idx_wins_prize_level ON wins(prize_level);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wins_user_issue_pick ON wins(user_id, issue, pick_id);

-- 已处理的期号记录表（用于定时任务去重）
CREATE TABLE IF NOT EXISTS processed_issues (
  issue TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 回测记录表
CREATE TABLE IF NOT EXISTS backtests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  start_issue TEXT NOT NULL,
  end_issue TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  lucky_seed TEXT,
  pick_count INTEGER NOT NULL DEFAULT 5,
  total_picks INTEGER NOT NULL DEFAULT 0,
  total_wins INTEGER NOT NULL DEFAULT 0,
  total_prize_amount INTEGER NOT NULL DEFAULT 0,
  total_bet_amount INTEGER NOT NULL DEFAULT 0,
  max_prize_amount INTEGER NOT NULL DEFAULT 0,
  win_rate REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 回测明细表
CREATE TABLE IF NOT EXISTS backtest_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_id INTEGER NOT NULL,
  issue TEXT NOT NULL,
  reds TEXT NOT NULL,
  blue INTEGER NOT NULL,
  win_reds TEXT,
  win_blue INTEGER,
  red_match INTEGER NOT NULL DEFAULT 0,
  blue_match INTEGER NOT NULL DEFAULT 0,
  prize_level INTEGER NOT NULL DEFAULT 0,
  prize_amount INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (backtest_id) REFERENCES backtests(id)
);

-- 回测表索引
CREATE INDEX IF NOT EXISTS idx_backtests_user_id ON backtests(user_id);
CREATE INDEX IF NOT EXISTS idx_backtest_details_backtest_id ON backtest_details(backtest_id);