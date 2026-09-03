/*
 * 冒烟测试：真实渲染整个 App（esbuild 打包 + jsdom + React 19 act），逐页点击验证。
 *
 * 为什么不加载 dist/index.html 来验证？—— 构建产物主脚本是 <script type="module">，
 * 而 jsdom 不执行 ES module，页面恒为空白，测出来的「失败」是假信号：
 * 既不能证明产物坏了，也不能证明产物好。此前的截图验证死循环正源于此。
 *
 * 这里直接渲染源码组件树，因此能真正抓住组件层的运行时崩溃
 * （例如 QuizRunner 曾因 preset={} 空对象 truthy 导致 questions 为 null 时取下标报错）。
 *
 * 运行：node _smoke_test.mjs
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENTRY = path.join(ROOT, '_smoke_entry.jsx');
const LS_KEY = 'wb_gk_2027_state_v2';

/* 预置数据：非 demo 题目（demo 题不参与练习，注入真实题才能走到作答界面） */
const SEED = {
  schema_version: 2,
  tasks: [],
  exams: [],
  mistakes: [],
  reviews: [],
  attempts: [],
  questions: [
    {
      id: 'q_seed_1', date: '2026-09-01', sub: '资料分析', type: '单选题',
      stem: '某市 2025 年 GDP 为 1200 亿元，同比增长 20%，则 2024 年 GDP 约为多少亿元？',
      options: ['960', '1000', '1100', '1440'], answer: 'B',
      analysis: '基期 = 1200 / 1.2 = 1000。', knowledge: '基期量', source: '冒烟用例', imgs: []
    },
    {
      id: 'q_seed_2', date: '2026-09-01', sub: '判断推理', type: '单选题',
      stem: '所有 A 都是 B，有些 B 是 C。由此可以推出：',
      options: ['有些 A 是 C', '有些 C 是 B', '所有 C 都是 A', '无法推出任何结论'],
      answer: 'B', analysis: '有些 B 是 C 等价于有些 C 是 B。', knowledge: '换位推理', source: '冒烟用例', imgs: []
    },
    {
      id: 'q_seed_3', date: '2026-09-01', sub: '申论小题', type: '主观题',
      stem: '概括给定资料中 S 市网格化治理的主要做法。（15 分）',
      options: [], answer: '参考要点：划分网格；搭建平台；整合力量；强化考核。',
      analysis: '归纳概括，分条作答。', knowledge: '归纳概括', source: '冒烟用例', imgs: []
    }
  ]
};

const results = [];
let fatal = null;

function check(name, fn) {
  try {
    const r = fn();
    results.push(r === false
      ? { name, ok: false, msg: '断言不成立' }
      : { name, ok: true, msg: typeof r === 'string' ? r : 'ok' });
  } catch (e) {
    results.push({ name, ok: false, msg: e && e.message ? e.message : String(e) });
  }
}

async function main() {
  /* 1) 打包入口（放在项目根，确保能解析 node_modules 与相对路径） */
  fs.writeFileSync(ENTRY, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './src/App.jsx';
globalThis.__WB__ = { React, createRoot, App };
`, 'utf8');

  let code;
  try {
    const res = await build({
      entryPoints: [ENTRY],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      loader: { '.jsx': 'jsx', '.js': 'jsx', '.css': 'empty' },
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"development"' },
      absWorkingDir: ROOT,
      logLevel: 'silent'
    });
    code = res.outputFiles[0].text;
  } finally {
    fs.rmSync(ENTRY, { force: true });
  }

  /* 2) jsdom 环境 */
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.IS_REACT_ACT_ENVIRONMENT = true;
  /* jsdom 未实现 MessageChannel，React scheduler 会用到，用 Node 的实现补齐 */
  if (typeof MessageChannel === 'function' && !window.MessageChannel) {
    window.MessageChannel = MessageChannel;
  }
  window.localStorage.setItem(LS_KEY, JSON.stringify(SEED));

  const consoleErrors = [];
  window.console.error = (...args) => { consoleErrors.push(args.map(String).join(' ')); };
  window.console.warn = () => {};

  window.eval(code);
  const { React, createRoot, App } = window.__WB__;
  const act = React.act;
  const doc = window.document;
  const container = doc.getElementById('root');

  const text = () => (container.textContent || '') + ' ' + (doc.body.textContent || '');
  const qa = (sel) => Array.from(doc.querySelectorAll(sel));
  const byText = (sel, txt) => qa(sel).find(el => (el.textContent || '').includes(txt)) || null;

  const click = async (el, label) => {
    if (!el) throw new Error('找不到可点击元素：' + label);
    await act(async () => {
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  };
  const nav = async (label) => click(byText('.nav-item', label), '导航-' + label);

  /* 3) 挂载 */
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(React.createElement(App));
  });

  check('应用挂载成功', () => text().includes('备考工作台') || '未渲染出侧边栏标题');
  check('今日打卡默认页渲染', () => text().includes('今日打卡') || '默认页不是今日打卡');

  /* 4) 逐页切换 */
  for (const [label, marker] of [
    ['备考进度', '备考进度'],
    ['模考复盘', '模考复盘'],
    ['错题本', '错题本'],
    ['真题库', '真题库'],
    ['AI 助手', 'AI 助手'],
    ['数据管理', '数据管理']
  ]) {
    await nav(label);
    check(`切换「${label}」不崩溃`, () => text().includes(marker) || `页面未渲染出「${marker}」`);
  }

  /* 5) 真题库 → 在线练习（回归点：此处曾 100% 崩溃） */
  await nav('真题库');
  await click(byText('button', '在线练习'), '在线练习按钮');
  check('弹出练习配置窗', () => text().includes('配置在线练习') || '未出现配置弹窗');

  await click(byText('button', '开始练习'), '开始练习按钮');
  check('进入作答界面', () => text().includes('在线练习 ·') || '未进入作答界面');

  /* 6) 客观题：选选项 → 提交 → 看判分 */
  await click(qa('.quiz-opts .opt')[0], '选项 A');
  await click(byText('button', '提交本题'), '提交本题');
  check('客观题提交后显示判分', () => /回答正确|回答错误/.test(text()) || '未出现判分结果');

  /* 7) 走到主观题，验证自评（回归点：主观题曾恒判为正确，正确率虚高） */
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value').set;

  let guard = 0;
  while (guard++ < 8 && !text().includes('对照参考答案，本题自评')) {
    const opt = qa('.quiz-opts .opt')[0];
    if (opt) {
      await click(opt, '选项');
    } else {
      // 主观题：填写作答内容（React 受控组件需用原生 setter + input 事件）
      const ta = doc.querySelector('.quiz-q textarea');
      if (ta) {
        await act(async () => {
          valueSetter.call(ta, '划分网格责任到人；搭建信息平台闭环处置；整合力量进网格。');
          ta.dispatchEvent(new window.Event('input', { bubbles: true }));
        });
      }
    }
    const sub = byText('button', '提交本题');
    if (sub && !sub.disabled) await click(sub, '提交本题');
    const nb = byText('button', '下一题');
    if (!nb) break;
    await click(nb, '下一题');
  }

  if (text().includes('对照参考答案，本题自评')) {
    await click(byText('.sg-btn', '没答好'), '自评-没答好');
    check('主观题可自评（不再恒判为对）', () => text().includes('没答好'));
    const fin = byText('button', '查看结果');
    if (fin) {
      await click(fin, '查看结果');
      check('自评「没答好」计入错题并可归档', () =>
        /归档到错题本/.test(text()) || '结果页未出现错题归档入口');
    }
  } else {
    check('主观题自评流程', () => '未走到主观题');
  }

  /* 8) 回到今日打卡，确认仍正常 */
  await nav('今日打卡');
  check('返回今日打卡正常', () => text().includes('今日打卡'));

  /* 9) 打卡页「真题刷题」任务一键直达作答（回归点：此前按钮缺失，点了没反应） */
  const goBank = byText('button', '去刷题');
  if (goBank) {
    check('打卡页生成刷题任务', () => text().includes('真题刷题'));
    await click(goBank, '去刷题');
    check('打卡刷题直达作答（不再弹配置窗）', () =>
      (text().includes('在线练习 ·') && !text().includes('配置在线练习')) || '未直接进入作答界面');
  } else {
    check('打卡页生成刷题任务并提供入口', () => '未找到「去刷题」按钮');
  }

  /* React 的 act/key 警告不算失败，其余控制台报错要暴露 */
  const realErrors = consoleErrors.filter(e =>
    !/not wrapped in act|Warning: |ReactDOM\.render|useLayoutEffect/.test(e));
  results.push(realErrors.length
    ? { name: '控制台无未预期报错', ok: false, msg: realErrors[0].slice(0, 160) }
    : { name: '控制台无未预期报错', ok: true, msg: 'ok' });

  dom.window.close();
}

try {
  await main();
} catch (e) {
  if (e && Array.isArray(e.errors) && e.errors.length) {
    fatal = e.errors.map(x => (x && (x.stack || x.message)) || String(x)).join('\n---\n');
  } else {
    fatal = e && e.stack ? e.stack : String(e);
  }
}

const pass = results.filter(r => r.ok).length;
const fail = results.length - pass;
console.log('\n──────── 冒烟测试（真实 React 渲染） ────────');
results.forEach(r => console.log(
  `${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? (r.msg !== 'ok' ? ' — ' + r.msg : '') : ' — ' + r.msg}`));
console.log('─────────────────────────────────────────────');
console.log(`通过 ${pass} / ${results.length}`);
if (fatal) console.log('\n致命异常：\n' + fatal);
process.exit(fail || fatal ? 1 : 0);
