/* ============================================================
 * templates.js —— 按「阶段 + 星期」生成每日任务模板（纯函数）
 * 对齐 95 天备考计划：预热/摸底/攻坚/提速/冲刺/临考 六种节奏
 * ============================================================ */
import { getStage, diffDays } from './dates.js';
import { MODULES } from './stats.js';
import { uid } from './id.js';
import { bankPracticeStats, subCat } from './qbank.js';

const T = (title, time, cat, once, key) => ({
  title, time, cat,
  ...(once ? { once: true } : {}),
  ...(key ? { key } : {})
});

/* 摸底基线（一次性）任务：摸底周窗口错过或未做时，用于阶段追赶补发 */
const TASK_XC_BASE = T('行测真题限时摸底（120分钟 / 135题）', '120min', '行测', true, 'baseline_xc');
const TASK_SL_BASE = T('申论真题摸底（150分钟，含大作文）', '150min', '申论', true, 'baseline_sl');
const BASELINE_TASKS = [TASK_XC_BASE, TASK_SL_BASE];

/* 用户主动删除过的基线任务 key：不再自动补发（避免删了又冒出来） */
const DISMISS_KEY = 'wb_gk_2027_dismissed_keys';
function dismissedKeys() {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); } catch (e) { return []; }
}
export function dismissBaseline(key) {
  try {
    const list = dismissedKeys();
    if (key && !list.includes(key)) localStorage.setItem(DISMISS_KEY, JSON.stringify(list.concat(key)));
  } catch (e) { /* noop */ }
}

/* 最近一次模考中正确率最低的行测模块（接模考数据；无数据返回 null） */
function weakestModule(exams) {
  if (!Array.isArray(exams) || !exams.length) return null;
  const sorted = exams.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = sorted[sorted.length - 1];
  if (!last || !last.m) return null;
  const entries = MODULES
    .map(mo => ({ label: mo.label, target: mo.target, value: last.m[mo.key] }))
    .filter(x => typeof x.value === 'number');
  if (!entries.length) return null;
  return entries.sort((a, b) => a.value - b.value)[0];
}

/* 工作日行测专项按星期轮换 */
const WEEKDAY_XC = {
  1: '判断推理专项（图形/定义/类比）',
  2: '资料分析专项 2 组限时',
  3: '言语理解专项（选词+片段）',
  4: '判断推理专项（逻辑/翻译）',
  5: '资料分析专项 2 组限时'
};

/* ------- 间隔复习（错题本 × 今日打卡联动） -------
   错题登记后第 1 / 3 / 7 / 15 天到期重做；
   已掌握（done）不再复习；一直没重做（pending）超过 15 天的兜底拉回 */
export const REVIEW_INTERVALS = [1, 3, 7, 15];

export function dueMistakes(mistakes, dateStr) {
  if (!Array.isArray(mistakes) || !dateStr) return [];
  return mistakes.filter(m => {
    if (!m || m.demo || m.state === 'done' || !m.date) return false;
    const d = diffDays(m.date, dateStr);
    if (d < 0) return false;
    return REVIEW_INTERVALS.includes(d) || (m.state === 'pending' && d > 15);
  });
}

/* 当天「重做到期错题」任务：到期数 > 0 且当天未生成过（按 key 去重） */
function mistakeReviewTask(existingTasks, dateStr, ctx) {
  const due = dueMistakes(ctx && ctx.mistakes, dateStr);
  if (!due.length) return [];
  const hit = existingTasks.some(x => x.date === dateStr && x.key === 'mistake_review');
  if (hit) return [];
  const bySub = {};
  due.forEach(m => { bySub[m.sub] = (bySub[m.sub] || 0) + 1; });
  const dist = Object.entries(bySub).map(([k, v]) => k + '×' + v).join('、');
  return [{
    id: uid(), date: dateStr,
    title: `🔁 重做到期错题 ${due.length} 条（${dist}）`,
    time: '30min', cat: '错题', done: false, auto: true, key: 'mistake_review'
  }];
}

/* 每日真题刷题任务：按题库「待消化题数」（未做+做错）最多的科目生成，
   每天最多 1 条（按 key 去重），刷完可到「真题库」在线完成 */
function dailyPracticeTask(existingTasks, dateStr, ctx) {
  const qs = ctx && ctx.questions;
  const ats = ctx && ctx.attempts;
  if (!Array.isArray(qs) || !qs.some(q => q && !q.demo)) return [];
  const hit = existingTasks.some(x => x.date === dateStr && x.key === 'bank_practice');
  if (hit) return [];
  const stats = bankPracticeStats(qs, ats);
  const top = stats[0];
  if (!top) return [];
  const cat = subCat(top.sub);
  /* 携带预设，供今日打卡「去刷题」直接开练（单次上限 20 题，避免一次刷到吐） */
  const count = Math.max(1, Math.min(top.need, 20));
  return [{
    id: uid(), date: dateStr,
    title: `📚 真题刷题：${top.sub}（待消化 ${top.need} 题）`,
    time: '45min', cat, done: false, auto: true, key: 'bank_practice',
    bankSub: top.sub, bankCount: count
  }];
}

export function templateForDate(dateStr, ctx) {
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

  /* 摸底周（9/1-9/6）：前 3 天做整套摸底，后 3 天按模块补测，避免每天任务雷同 */
  if (stage.name === '摸底周') {
    if (dow >= 1 && dow <= 3) {
      // 周一~周三：整套摸底（一次性任务，做完即不再重复生成）
      out.push(TASK_XC_BASE);
      out.push(TASK_SL_BASE);
      out.push(T('登记各模块正确率，写摸底复盘', '30min', '复盘'));
    } else if (dow === 4) {
      out.push(T('资料分析 + 判断推理 模块补测（各限时30分钟）', '60min', '行测'));
      out.push(T('申论小题 2 道（归纳概括 + 提出对策）', '50min', '申论'));
      out.push(T('登记模块正确率，定位薄弱点', '20min', '复盘'));
    } else if (dow === 5) {
      out.push(T('言语理解 + 数量关系 模块补测（各限时30分钟）', '60min', '行测'));
      out.push(T('申论小题 1 道（应用文/公文）', '40min', '申论'));
      out.push(T('常识时政速测 + 记录错题', '25min', '常识'));
    } else {
      // 周日（dow===0）或周六：汇总摸底结论
      out.push(T('汇总摸底成绩，算出各模块正确率基线', '40min', '复盘'));
      out.push(T('制定攻坚期专项计划（按薄弱模块排序）', '30min', '准备'));
      out.push(T('本周错题全部登记入错题本', '30min', '错题'));
    }
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
      /* 薄弱模块动态化：按最近一次模考正确率最低的模块定向生成；无模考数据则提示先录入 */
      const weak = weakestModule(ctx && ctx.exams);
      out.push(T(
        weak
          ? `${weak.label}专项（最近正确率 ${weak.value}%，目标 ${weak.target}%）`
          : '薄弱模块专项（先在「模考复盘」录入成绩后自动定向）',
        '60min', '行测', false, 'weak_module'
      ));
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

/* 判断一条模板任务是否应被跳过：
   - once 任务：全局（任意日期）已有同 key/同名记录 → 跳过；用户已 dismiss → 跳过
   - 带 key 任务：当天已有同 key 或同名 → 跳过（标题随模考数据变化时仍能稳定去重）
   - 普通任务：当天同名 → 跳过 */
function shouldSkip(t, existingTasks, dateStr) {
  if (t.once) {
    if (t.key && dismissedKeys().includes(t.key)) return true;
    return existingTasks.some(x => x.title === t.title || (t.key && x.key === t.key));
  }
  if (t.key) {
    return existingTasks.some(x => x.date === dateStr && (x.title === t.title || (x.key && x.key === t.key)));
  }
  return existingTasks.some(x => x.date === dateStr && x.title === t.title);
}

/* 阶段追赶：日历已过摸底周，但基线任务从未生成/从未做过 → 补发到查看日（带 catchup 标记），
   保证摸底基线不因错过时间窗口而永久缺失 */
function catchupBaseline(existingTasks, dateStr) {
  const stage = getStage(dateStr);
  if (stage.name === '备战预热' || stage.name === '摸底周') return [];
  const dis = dismissedKeys();
  const added = [];
  for (const t of BASELINE_TASKS) {
    if (t.key && dis.includes(t.key)) continue;
    const hit = existingTasks.some(x => x.title === t.title || (t.key && x.key === t.key));
    if (!hit) added.push({ id: uid(), date: dateStr, ...t, done: false, auto: true, catchup: true });
  }
  return added;
}

/* 生成某天 0 点时应有的「自动任务」：已存在同名任务则跳过，含阶段追赶 + 到期错题复习 */
export function ensureDailyTasks(existingTasks, dateStr, ctx) {
  const tmpl = templateForDate(dateStr, ctx);
  const added = [];
  for (const t of tmpl) {
    if (shouldSkip(t, existingTasks, dateStr)) continue;
    added.push({ id: uid(), date: dateStr, ...t, done: false, auto: true });
  }
  return added
    .concat(catchupBaseline(existingTasks, dateStr))
    .concat(mistakeReviewTask(existingTasks, dateStr, ctx))
    .concat(dailyPracticeTask(existingTasks, dateStr, ctx));
}

/* 补齐某天任务（不区分 auto/手动）：返回「需新增」的任务数组，同名已存在则跳过，含阶段追赶 + 到期错题复习 */
export function mergeDailyTasks(existingTasks, dateStr, ctx) {
  const tmpl = templateForDate(dateStr, ctx);
  const added = [];
  for (const t of tmpl) {
    if (shouldSkip(t, existingTasks, dateStr)) continue;
    added.push({ id: uid(), date: dateStr, ...t, done: false, auto: true });
  }
  return added
    .concat(catchupBaseline(existingTasks, dateStr))
    .concat(mistakeReviewTask(existingTasks, dateStr, ctx))
    .concat(dailyPracticeTask(existingTasks, dateStr, ctx));
}

/* ID 生成已统一到 lib/id.js（各实体带类型前缀，含递增序列防碰撞）。
   注意：必须先 import 再 export —— `export { uid } from` 只是转发绑定，
   不会在本模块作用域创建 uid，模块内部调用会 ReferenceError。
   此处 re-export 仅为兼容既有 import，新代码请直接 import { uid } from './id.js'。 */
export { uid };
