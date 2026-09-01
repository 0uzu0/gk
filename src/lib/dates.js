/* ============================================================
 * dates.js —— 日期/阶段/进度 纯函数（无 React 依赖，可单测）
 * 阶段配置单一来源：STAGES 常量，getStage/stageProgress 都从它推导
 * ============================================================ */

export const START_DATE = '2026-09-01';   // 备考起点（9/1 正式开跑）
export const DEFAULT_EXAM_DATE = '2026-12-05'; // 预计笔试日（2027 年度江苏省考）
export const DAYS_TOTAL = 96;             // 9/1 → 12/5 含考试日共 96 天

/* 阶段定义（唯一事实来源） */
export const STAGES = [
  { name: '摸底周',   from: '2026-09-01', to: '2026-09-06', color: '#7c3aed', desc: '真题摸底，建立基线' },
  { name: '模块攻坚', from: '2026-09-07', to: '2026-09-27', color: '#2563eb', desc: '逐模块专项突破' },
  { name: '套题提速', from: '2026-09-28', to: '2026-10-25', color: '#d97706', desc: '限时套题+固定做题顺序' },
  { name: '冲刺巩固', from: '2026-10-26', to: '2026-11-29', color: '#dc2626', desc: '错题重做+查漏补缺' },
  { name: '临考调整', from: '2026-11-30', to: '2026-12-04', color: '#059669', desc: '回归基础，稳定心态' }
];

const PRE_HEAT = { name: '备战预热', color: '#64748b', desc: '距开跑 N 天，备齐资料' };

/* ------- 日期工具 ------- */

export function pad(n) { return n < 10 ? '0' + n : '' + n; }

export function toStr(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function todayStr() { return toStr(new Date()); }

export function parseStr(s) {
  const p = String(s).split('-').map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
}

/* 两个 YYYY-MM-DD 相差天数：b - a */
export function diffDays(a, b) {
  const t1 = parseStr(a).getTime();
  const t2 = parseStr(b).getTime();
  return Math.round((t2 - t1) / 86400000);
}

/* 日期加 n 天，返回 YYYY-MM-DD */
export function addDays(dateStr, n) {
  const d = parseStr(dateStr);
  d.setDate(d.getDate() + n);
  return toStr(d);
}

export function fmtMD(dateStr) {
  const p = String(dateStr).split('-');
  return (p[1] | 0) + '/' + (p[2] | 0);
}

export function weekOf(dateStr) {
  const d = parseStr(dateStr);
  const wd = d.getDay() === 0 ? 7 : d.getDay(); // 1=周一 .. 7=周日
  const mon = addDays(dateStr, 1 - wd);
  /* 9/1（周二）所在周的周一 = 2026-08-31，作为第 1 周锚点 */
  const anchor = addDays(STAGES[0].from, 1 - (parseStr(STAGES[0].from).getDay() === 0 ? 7 : parseStr(STAGES[0].from).getDay()));
  const diff = diffDays(anchor, mon);
  return Math.floor(diff / 7) + 1;
}

export function weekLabel(dateStr) {
  const stage = getStage(dateStr);
  if (stage.name === '备战预热') return '预热期';
  if (stage.name === '摸底周') return '摸底周';
  const w = weekOf(dateStr);
  const short = stage.name.replace('模块攻坚', '攻坚').replace('套题提速', '提速').replace('冲刺巩固', '冲刺').replace('临考调整', '临考');
  return 'W' + w + ' ' + short;
}

/* ------- 阶段 ------- */

export function getStage(dateStr) {
  if (dateStr < STAGES[0].from) return PRE_HEAT;
  for (const s of STAGES) {
    if (dateStr >= s.from && dateStr <= s.to) return s;
  }
  return STAGES[STAGES.length - 1]; // 超过考试日兜底
}

export function stageProgress() {
  return STAGES.map(s => ({ name: s.name, from: s.from, to: s.to, color: s.color }));
}

/* 阶段内进度百分比（供进度条） */
export function stagePctInside(dateStr) {
  const st = getStage(dateStr);
  if (st.name === '备战预热') return 0;
  const total = diffDays(st.from, st.to) + 1;
  const used = diffDays(st.from, dateStr) + 1;
  return Math.max(0, Math.min(100, Math.round(used / total * 100)));
}

/* 总进度：备考第 N 天 / 总天数（按 examDate 动态计算） */
export function totalProgress(dateStr, examDate) {
  const days = Math.max(0, diffDays(dateStr, examDate));
  const used = Math.max(0, DAYS_TOTAL - days);
  return { used, left: days, pct: Math.min(100, Math.round(used / DAYS_TOTAL * 100)) };
}

/* 周复盘编号 */
export function reviewWeekLabel(dateStr) {
  const st = getStage(dateStr);
  if (st.name === '备战预热') return '预热周';
  if (st.name === '摸底周') return '摸底周';
  return weekLabel(dateStr);
}
