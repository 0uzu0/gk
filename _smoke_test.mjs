/* React 渲染冒烟测试：用 jsdom 挂载 App，验证关键 UI 元素渲染 */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/* 用构建产物（单文件）在 jsdom 中执行 */
const html = readFileSync('dist/index.html', 'utf8');

const dom = new JSDOM(html, {
  url: 'file:///C:/Users/ZT/WorkBuddy/2026-08-31-16-13-53/output/江苏省考B类法学岗备考工作台.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  resources: 'usable'
});

/* 注入浏览器 API 缺失项 */
dom.window.indexedDB = undefined; // 触发 fallback 路径（localStorage）
dom.window.URL.createObjectURL = () => 'blob:fake';
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {}, fillStyle: '' });

/* 捕获页面内错误与 console */
const errs = [];
dom.window.addEventListener('error', e => errs.push('window.error: ' + (e.error ? e.error.stack || e.error.message : e.message)));
dom.window.console.error = (...a) => errs.push('console.error: ' + a.map(x => (x && x.stack) || String(x)).join(' '));

/* 等待 React 挂载完成 */
await new Promise(r => setTimeout(r, 1500));

if (errs.length) {
  console.log('--- 页面内错误 ---');
  errs.slice(0, 6).forEach(e => console.log(e.slice(0, 500)));
  console.log('--- 错误结束 ---');
}

const doc = dom.window.document;
let fail = 0;
function ok(name, cond) {
  if (!cond) fail++;
  console.log((cond ? '✅' : '❌') + ' ' + name);
}

ok('root 已渲染子节点', doc.getElementById('root') && doc.getElementById('root').children.length > 0);
ok('标题渲染', doc.body.textContent.includes('备考工作台'));
ok('倒计时渲染', doc.body.textContent.includes('距笔试'));
ok('Tab 导航渲染', doc.body.textContent.includes('今日打卡') && doc.body.textContent.includes('AI 助手'));
ok('今日任务自动生成（摸底周3条）', doc.body.textContent.includes('行测真题限时摸底'));
ok('AI 设置面板存在', doc.body.textContent.includes('API Key'));
ok('数据管理存在', doc.body.textContent.includes('导出备份'));

/* 点击切到错题本 */
const tabs = Array.from(doc.querySelectorAll('.tab'));
const mkTab = tabs.find(t => t.textContent.includes('错题本'));
if (mkTab) mkTab.click();
await new Promise(r => setTimeout(r, 300));
ok('错题本渲染示例错题', doc.body.textContent.includes('年均增长率'));

/* 点击切到 AI 助手 */
const aiTab = Array.from(doc.querySelectorAll('.tab')).find(t => t.textContent.includes('AI 助手'));
if (aiTab) aiTab.click();
await new Promise(r => setTimeout(r, 300));
ok('AI 面板含申论批改', doc.body.textContent.includes('申论批改'));
ok('AI 面板含错题解析', doc.body.textContent.includes('错题解析'));

console.log(fail === 0 ? '\n=== 渲染冒烟全部通过 ===' : '\n=== ' + fail + ' 项失败 ===');
process.exit(fail ? 1 : 0);
