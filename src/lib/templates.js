/* ============================================================
 * templates.js —— 按「阶段 + 星期」生成每日任务模板（纯函数）
 * 对齐 95 天备考计划：预热/摸底/攻坚/提速/冲刺/临考 六种节奏
 * ============================================================ */
import { getStage } from './dates.js';

const T = (title, time, cat) => ({ title, time, cat });

/* 工作日行测专项按星期轮换 */
const WEEKDAY_XC = {
  1: '判断推理专项（图形/定义/类比）',
  2: '资料分析专项 2 组限时',
  3: '言语理解专项（选词+片段）',
  4: '判断推理专项（逻辑/翻译）',
  5: '资料分析专项 2 组限时'
};

export function templateForDate(dateStr) {
  const stage = getStage(dateStr);
  const d = new Date(String(dateStr) + 'T00:00:00');
  const dow = d.getDay(); // 0=周日 1-6=周一..周六
  const weekend = dow === 0 || dow === 6;
  const out = [];

  /* 备战预热（9/1 之前） */
  if (stage.name === '备战预热') {
    out.push(T('准备资料：江苏真题+模块题库+错题本', '30min', '准备'));
    out.push(T('列 9 月目标：资料90% / 数推全对 / 申论踩点85%', '15min', '准备'));
    return out;
  }

  /* 摸底周 */
  if (stage.name === '摸底周') {
    out.push(T('行测真题限时摸底（120分钟 / 135题）', '120min', '行测'));
    out.push(T('申论真题摸底（150分钟，含大作文）', '150min', '申论'));
    out.push(T('登记各模块正确率，写摸底复盘', '30min', '复盘'));
    return out;
  }

  /* 模块攻坚（9/7-9/27） */
  if (stage.name === '模块攻坚') {
    if (dow === 6) {
      out.push(T('行测套题限时（120分钟）', '120min', '行测'));
      out.push(T('申论小题 2 道（概括/对策轮换）', '45min', '申论'));
      out.push(T('错题重做 + 周复盘', '40min', '复盘'));
    } else if (dow === 0) {
      out.push(T('大作文限时写作（60分钟）', '60min', '申论'));
      out.push(T('素材本整理（力度/温度/制度三主题）', '30min', '素材'));
      out.push(T('本周错题全部重做', '40min', '复盘'));
    } else {
      out.push(T(WEEKDAY_XC[dow], '60min', '行测'));
      out.push(T('申论小题 1 道（精做+对照答案踩点）', '40min', '申论'));
      out.push(T('常识/时政碎片积累', '15min', '常识'));
      out.push(T('错题本记录当日错题', '15min', '错题'));
      out.push(T('数字推理 10 题限时', '20min', '行测'));
    }
    return out;
  }

  /* 套题提速（9/28-10/25） */
  if (stage.name === '套题提速') {
    if (dow === 6) {
      out.push(T('行测全真套题（120分钟，固定做题顺序）', '120min', '行测'));
      out.push(T('申论小题组合 2 道', '50min', '申论'));
      out.push(T('套题错题按模块拆解重做', '40min', '复盘'));
    } else if (dow === 0) {
      out.push(T('大作文限时（60分钟）+ 精改 1 篇', '90min', '申论'));
      out.push(T('素材三主题默写一遍', '20min', '素材'));
      out.push(T('周复盘 + 下周计划', '30min', '复盘'));
    } else {
      out.push(T(dow === 2 || dow === 4 ? '行测限时套题（周二/周四）' : '行测模块限时训练', '120min', '行测'));
      out.push(T('申论小题 / 应用文 1 道', '40min', '申论'));
      out.push(T('错题重做 + 记录', '30min', '复盘'));
    }
    return out;
  }

  /* 冲刺巩固（10/26-11/29） */
  if (stage.name === '冲刺巩固') {
    if (dow === 6) {
      out.push(T('行测全真套题（120分钟）', '120min', '行测'));
      out.push(T('申论套题小题（含应用文）', '60min', '申论'));
      out.push(T('错题本总复习', '40min', '复盘'));
    } else if (dow === 0) {
      out.push(T('大作文限时 + 精改 1 篇', '90min', '申论'));
      out.push(T('素材本背诵默写', '30min', '素材'));
      out.push(T('周复盘', '20min', '复盘'));
    } else {
      out.push(T('薄弱模块专项（按正确率最低的来）', '60min', '行测'));
      out.push(T('申论小题 1 道', '40min', '申论'));
      out.push(T('错题重做', '30min', '复盘'));
    }
    return out;
  }

  /* 临考调整（11/30-12/4） */
  if (weekend) {
    out.push(T('近 3 年真题回顾 + 错题本通读', '120min', '复盘'));
    out.push(T('大作文框架默写（力度-温度-制度）', '30min', '申论'));
  } else {
    out.push(T('行测限时套题或轻量训练', '90min', '行测'));
    out.push(T('申论小题手感 1 道', '40min', '申论'));
    out.push(T('调整作息，保证睡眠', '—', '其他'));
  }
  return out;
}

/* 生成某天 0 点时应有的「自动任务」：已存在同名任务则跳过 */
export function ensureDailyTasks(existingTasks, dateStr) {
  const tmpl = templateForDate(dateStr);
  const added = [];
  for (const t of tmpl) {
    const hit = existingTasks.some(x => x.date === dateStr && x.title === t.title);
    if (!hit) {
      const task = { id: uid(), date: dateStr, ...t, done: false, auto: true };
      added.push(task);
    }
  }
  return added;
}

let _uid = 0;
export function uid() {
  _uid++;
  return 'id' + Date.now().toString(36) + '_' + (_uid % 9999).toString(36) + Math.random().toString(36).slice(2, 6);
}
