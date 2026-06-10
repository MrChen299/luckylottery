# 双色球 · 智能机选（后端）

基于 Cloudflare Workers + D1 的 RESTful API 服务，提供用户认证和机选记录管理。

## 技术栈

| 组件 | 选型 |
|------|------|
| 运行时 | Cloudflare Workers |
| 框架 | Hono |
| 数据库 | Cloudflare D1 (SQLite) |
| 认证 | JWT (HS256)，Web Crypto API |
| 密钥管理 | Cloudflare Secrets |

## 项目结构

```
backend/
├── package.json
├── tsconfig.json
├── wrangler.toml      # Workers 配置（不含密钥）
├── .dev.vars           # 本地开发密钥（不提交 Git）
├── .gitignore
├── db/
│   └── schema.sql      # D1 建表语句
└── src/
    ├── index.ts                # 入口，Hono 路由挂载
    ├── middleware/
    │   └── auth.ts             # JWT 创建/验证中间件
    └── routes/
        ├── auth.ts             # 注册/登录/获取用户信息
        └── picks.ts            # 保存/查询机选记录
```

## API 接口

| 方法 | 路径 | 说明 | 需认证 |
|------|------|------|--------|
| `POST` | `/api/auth/register` | 用户注册 | 否 |
| `POST` | `/api/auth/login` | 用户登录，返回 JWT | 否 |
| `GET` | `/api/auth/me` | 获取当前用户信息 | 是 |
| `POST` | `/api/picks` | 保存机选结果（批次） | 是 |
| `GET` | `/api/picks` | 获取机选历史记录 | 是 |

### 注册

```
POST /api/auth/register
Content-Type: application/json

{ "username": "test", "password": "123456" }
```

### 登录

```
POST /api/auth/login
Content-Type: application/json

{ "username": "test", "password": "123456" }

→ { "token": "eyJ...", "username": "test" }
```

### 保存机选结果

```
POST /api/picks
Authorization: Bearer <token>
Content-Type: application/json

{
  "issue": "2026064",
  "tickets": [
    { "reds": [1, 5, 12, 18, 25, 33], "blue": 7 },
    { "reds": [3, 8, 15, 20, 27, 30], "blue": 12 }
  ],
  "luckySeed": "我的幸运日"
}
```

### 查询机选记录

```
GET /api/picks?page=1&limit=10
Authorization: Bearer <token>
```

## 数据表设计

### users

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| username | TEXT UNIQUE | 用户名 |
| password_hash | TEXT | PBKDF2 哈希 |
| created_at | TEXT | 注册时间 |

### picks

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键自增 |
| user_id | INTEGER | 外键，关联 users |
| issue | TEXT | 双色球期号（如 2026064） |
| reds | TEXT | 红球 JSON 数组 |
| blue | INTEGER | 蓝球号码 |
| batch_id | TEXT | 批次 ID（同次机选共享） |
| lucky_seed | TEXT | 幸运字符串（可选） |
| created_at | TEXT | 生成时间 |

## 本地开发

```bash
cd backend
npm install

# 创建本地 D1 数据库（仅首次）
npx wrangler d1 create lottery-db
# 将输出的 database_id 填入 wrangler.toml

# 编辑 .dev.vars，设置本地 JWT 密钥
# JWT_SECRET=your-local-dev-secret

# 初始化本地数据表
npx wrangler d1 execute lottery-db --file=./db/schema.sql --local

# 启动开发服务器
npx wrangler dev
```

默认监听 `http://localhost:8787`。

## 部署

### 1. 创建线上 D1 数据库

```bash
npx wrangler d1 create lottery-db
```

将输出的 `database_id` 填入 `wrangler.toml`。

### 2. 设置 JWT 密钥（Cloudflare Secret）

```bash
# 生成随机密钥
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 设置为 Cloudflare Secret（不会出现在代码或配置文件中）
npx wrangler secret put JWT_SECRET
```

### 3. 初始化线上数据库

```bash
npx wrangler d1 execute lottery-db --file=./db/schema.sql --remote
```

### 4. 部署

```bash
npx wrangler deploy
```

## 密钥安全说明

`JWT_SECRET` 通过 `wrangler secret put` 设置为 **Cloudflare Secret**，加密存储在 Cloudflare 服务端，不会出现在 `wrangler.toml` 或任何源码中。本地开发时使用 `.dev.vars` 文件（已加入 `.gitignore`），不会被提交到 Git。