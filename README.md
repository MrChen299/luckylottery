# 双色球 · 智能机选

基于历史开奖数据的双色球智能选号工具，支持一键机选和历史开奖结果查询。

## 功能

- **智能机选**：基于最近 50 期真实开奖数据，采用热度+冷号加权随机策略生成号码，支持 1~20 注自由选择
- **历史查询**：展示近 50 期双色球开奖结果（期号、日期、红球、蓝球）
- **响应式设计**：适配桌面端与移动端

## 技术栈

纯静态页面，HTML + CSS + JavaScript，无框架依赖。

## 数据来源

通过 [api.huiniao.top](https://api.huiniao.top) 聚合接口获取开奖数据，数据源自中国福利彩票官网。

## 本地运行

```bash
# 任意静态文件服务器即可，例如：
python -m http.server 3000
# 或
npx serve .
```

浏览器打开 `http://localhost:3000`。

## 部署

### Cloudflare Pages（推荐）

```bash
npx wrangler pages deploy . --project-name luckylottery
```

或通过 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → 直接上传 `index.html`。

## 免责声明

仅供娱乐参考，不构成任何投注建议。