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
fronted/
├── index.html    # 单页面应用（前端全部代码）
└── README.md
```

## 本地运行

```bash
cd fronted
python -m http.server 3000
```

浏览器打开 `http://localhost:3000`。

## 后端地址配置

修改 `index.html` 第 873 行的 `BACKEND_URL`：

```js
// 本地开发（后端 wrangler dev 默认端口）
const BACKEND_URL = 'http://localhost:8787';

// 部署后改为 Workers 域名
const BACKEND_URL = 'https://luckylottery-backend.xxx.workers.dev';
```

## 部署

### Cloudflare Pages（推荐）

```bash
cd fronted
npx wrangler pages deploy . --project-name luckylottery
```

或通过 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → Pages → 直接上传 `index.html`。

## 数据来源

通过 [api.huiniao.top](https://api.huiniao.top) 聚合接口获取开奖数据，数据源自中国福利彩票官网。

## 免责声明

仅供娱乐参考，不构成任何投注建议。