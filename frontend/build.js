// 构建脚本：将环境变量注入 index.html
// 用法：node build.js
// 环境变量：BACKEND_URL

const fs = require('fs');
const path = require('path');

const backendUrl = process.env.BACKEND_URL;

if (!backendUrl) {
  console.error('错误：请设置环境变量 BACKEND_URL');
  console.error('示例：BACKEND_URL=https://your-worker.workers.dev node build.js');
  process.exit(1);
}

const srcPath = path.join(__dirname, 'index.html');
const distPath = path.join(__dirname, 'dist', 'index.html');

// 确保 dist 目录存在
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });

// 读取源文件
let html = fs.readFileSync(srcPath, 'utf-8');

// 替换占位符
html = html.replace(/__BACKEND_URL__/g, backendUrl);

// 写入 dist
fs.writeFileSync(distPath, html);

console.log(`构建完成：BACKEND_URL=${backendUrl}`);
console.log(`输出文件：${distPath}`);
