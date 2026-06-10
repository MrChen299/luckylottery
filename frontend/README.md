# 双色球 · 智能机选（前端）

基于历史开奖数据的双色球智能选号工具前端页面，提供智能机选、用户登录、历史开奖查询和机选记录管理。

## 功能

- **用户系统**：注册 / 登录，JWT 鉴权，登录后才可使用机选
- **智能机选**：基于最近 50 期真实开奖数据，热度+冷号加权随机策略，支持 1~20 注
- **幸运种子**：可输入自定义字符串作为随机种子，相同输入可复现相同结果
- **机选记录**：每次机选自动保存到后端，按批次分组展示
- **历史查询**：展示近 50 期双色球开奖结果（期号、日期、红球、蓝球）
- **响应式设计**：适配桌面端与移动端

## 技术栈

纯静态页面，HTML + CSS + JavaScript，无框架依赖。

## 项目结构

```
frontend/
├── index.html     # 源文件（BACKEND_URL 为占位符）
├── build.js       # 构建脚本（注入环境变量）
├── package.json
├── .gitignore
└── README.md
```

## 本地开发

```bash
cd frontend

# 方式一：直接启动静态服务器（需要先手动修改 index.html 中的 BACKEND_URL）
python -m http.server 3000

# 方式二：构建后启动（推荐）
BACKEND_URL=http://localhost:8787 node build.js
cd dist && python -m http.server 3000
```

浏览器打开 `http://localhost:3000`。

## 构建

`BACKEND_URL` 通过环境变量注入，不硬编码在源码中：

```bash
# 本地开发
BACKEND_URL=http://localhost:8787 node build.js

# 生产部署
BACKEND_URL=https://luckylottery-backend.xxx.workers.dev node build.js
```

构建产物输出到 `dist/index.html`。

## 部署

### Cloudflare Pages

```bash
cd frontend

# 设置环境变量并构建
BACKEND_URL=https://luckylottery-backend.xxx.workers.dev node build.js

# 部署 dist 目录
npx wrangler pages deploy dist --project-name luckylottery
```

或通过 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → Pages → 直接上传 `dist/index.html`。

## 安全说明

| 配置项 | 存储方式 | 说明 |
|--------|----------|------|
| `BACKEND_URL` | 环境变量 | 构建时注入，不硬编码在源码中 |
| `dist/` | 构建产物 | 不提交 Git |

## 数据来源

通过 [api.huiniao.top](https://api.huiniao.top) 聚合接口获取开奖数据，数据源自中国福利彩票官网。

## 免责声明

仅供娱乐参考，不构成任何投注建议。