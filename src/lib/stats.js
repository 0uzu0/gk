/* ============================================================
 * stats.js —— 统计/目标拆解 纯函数
 * ============================================================ */

/* 目标拆解：145 = 行测70 + 申论75 */
export const GOAL = { total: 145, xingce: 70, shenlun: 75, line: 105 };

/* 行测五模块（含基准权重） */
export const MODULES = [
  { key: 'ziliao',  label: '资料分析', target: 90 },
  { key: 'panduan', label: '判断推理', target: 85 },
  { key: 'yanyu',   label: '言语理解', target: 85 },
  { key: 'shuliang',label: '数量关系', target: 60 },
  { key: 'changshi',label: '常识',     target: 65 }
];

/* 申论四题型 */
export const SHENLUN_PARTS = [
  { key: 'gaikuo',  label: '归纳概括', max: 20 },
  { key: 'duice',   label: '提出对策', max: 25 },
  { key: 'yingyong',label: '应用文',   max: 20 },
  { key: 'dazuo',   label: '大作文',   max: 40 }
];

/* 本月打卡率：tasks 中 date 落在当月且是 auto/用户任务 */
export function monthRate(tasks, monthStr) {
  const inMonth = tasks.filter(t => String(t.date).startsWith(monthStr));
  if (!inMonth.length) return { done: 0, total: 0, rate: 0 };
  const done = inMonth.filter(t => t.done).length;
  return { done, total: inMonth.length, rate: Math.round(done / inMonth.length * 100) };
}

/* 模考总分趋势（按日期升序） */
export function examTrend(exams) {
  return exams.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* 最近一次模考的五模块正确率均值（行测） */
export function lastModuleAvg(exam) {
  if (!exam || !exam.m) return null;
  const vals = Object.keys(exam.m).filter(k => exam.m[k] != null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, k) => s + exam.m[k], 0) / vals.length);
}

/* 目标差距（最近一次模考 vs 目标） */
export function goalGap(exam) {
  if (!exam) return null;
  return {
    totalGap: GOAL.total - exam.total,
    xingceGap: GOAL.xingce - exam.xingce,
    shenlunGap: GOAL.shenlun - exam.shenlun
  };
}

/* 错题按科目统计 */
export function mistakeBySub(mistakes) {
  const map = {};
  for (const m of mistakes) map[m.sub] = (map[m.sub] || 0) + 1;
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/* 错题按错因统计 */
export function mistakeByErr(mistakes) {
  const map = {};
  for (const m of mistakes) map[m.err] = (map[m.err] || 0) + 1;
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

export const SUB_OPTIONS = ['资料分析', '判断推理', '言语理解', '数量-数推', '数量-运算', '常识', '申论小题', '申论大作文'];
export const ERR_OPTIONS = ['知识不会', '技巧不熟', '时间不够', '审题失误'];
export const MISTAKE_STATES = [
  { key: 'pending', label: '待重做', cls: 's-pending' },
  { key: 'redo',    label: '已重做', cls: 's-redo' },
  { key: 'done',    label: '已掌握', cls: 's-done' }
];
