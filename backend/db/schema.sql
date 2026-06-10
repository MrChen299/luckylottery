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