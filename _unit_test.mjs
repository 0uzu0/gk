/* 纯函数单测：阶段/日期/模板/迁移 */
import {
  START_DATE, DEFAULT_EXAM_DATE, DAYS_TOTAL, STAGES,
  diffDays, addDays, getStage, stageProgress, totalProgress, weekLabel, stagePctInside
} from './src/lib/dates.js';
import { templateForDate } from './src/lib/templates.js';
import { migrateV1, SCHEMA_VERSION, LS_KEY_V1 } from './src/lib/storage.js';

let fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + ' => ' + JSON.stringify(got) + (ok ? '' : ' （期望 ' + JSON.stringify(want) + '）'));
}

/* ---- 日期基准 ---- */
eq('START_DATE=2026-09-01', START_DATE, '2026-09-01');
eq('EXAM_DATE=2026-12-05', DEFAULT_EXAM_DATE, '2026-12-05');
eq('周期 9/1→12/5 = 95 天', diffDays(START_DATE, DEFAULT_EXAM_DATE), 95);
eq('DAYS_TOTAL=96（含考试日）', DAYS_TOTAL, 96);
eq('9/1 是备考第1天', DAYS_TOTAL - diffDays('2026-09-01', DEFAULT_EXAM_DATE), 1);

/* ---- 阶段判断 ---- */
eq('8/31 = 备战预热', getStage('2026-08-31').name, '备战预热');
eq('9/1 = 摸底周', getStage('2026-09-01').name, '摸底周');
eq('9/6 = 摸底周', getStage('2026-09-06').name, '摸底周');
eq('9/7 = 模块攻坚', getStage('2026-09-07').name, '模块攻坚');
eq('9/27 = 模块攻坚', getStage('2026-09-27').name, '模块攻坚');
eq('9/28 = 套题提速', getStage('2026-09-28').name, '套题提速');
eq('10/25 = 套题提速', getStage('2026-10-25').name, '套题提速');
eq('10/26 = 冲刺巩固', getStage('2026-10-26').name, '冲刺巩固');
eq('11/30 = 临考调整', getStage('2026-11-30').name, '临考调整');
eq('12/4 = 临考调整', getStage('2026-12-04').name, '临考调整');

/* ---- STAGES 单一来源一致性：progress 与 getStage 边界不冲突 ---- */
const sp = stageProgress();
const okStages = sp.every((s, i) => s.from === STAGES[i].from && s.to === STAGES[i].to && s.name === STAGES[i].name);
eq('stageProgress 与 STAGES 一致', okStages, true);

/* ---- 日期边界 ---- */
eq('跨月 9/30+1', addDays('2026-09-30', 1), '2026-10-01');
eq('跨年 12/31+1', addDays('2026-12-31', 1), '2027-01-01');
eq('跨月 8/31+1', addDays('2026-08-31', 1), '2026-09-01');

/* ---- 总进度 ---- */
const p1 = totalProgress('2026-09-01', DEFAULT_EXAM_DATE);
eq('9/1 距笔试 95 天', p1.left, 95);
eq('9/1 已备考 1 天', p1.used, 1);

/* ---- 周标签 ---- */
eq('9/1 = 摸底周', weekLabel('2026-09-01'), '摸底周');
eq('9/7 是 W2 攻坚', weekLabel('2026-09-07'), 'W2 攻坚');
eq('9/28 是 W5 提速', weekLabel('2026-09-28'), 'W5 提速');

/* ---- 任务模板 ---- */
eq('预热期 2 条', templateForDate('2026-08-31').length, 2);
eq('摸底周 3 条', templateForDate('2026-09-01').length, 3);
eq('攻坚期周二 5 条', templateForDate('2026-09-08').length, 5);
eq('攻坚期周二含数推', templateForDate('2026-09-08').some(t => t.title.includes('数字推理')), true);
eq('攻坚期周六 3 条', templateForDate('2026-09-12').length, 3);
eq('提速期周六 3 条', templateForDate('2026-10-03').length, 3);
eq('提速期周二含套题', templateForDate('2026-09-29').some(t => t.title.includes('套题')), true);
eq('冲刺期周日 3 条', templateForDate('2026-11-01').length, 3);
eq('临考调整周一 3 条', templateForDate('2026-12-01').length, 3);

/* ---- v1 → v2 迁移 ---- */
const v1 = {
  tasks: [{ id: 't1', date: '2026-09-01', title: '摸底', time: '120min', cat: '行测', done: false, demo: true }],
  exams: [{ id: 'e1', date: '2026-09-01', name: '摸底', xingce: 65, shenlun: 68, total: 133 }],
  mistakes: [
    { id: 'm1', date: '2026-09-01', sub: '资料分析', err: '知识不会', source: 'x', knowledge: '年均增长率', note: 'n', state: 'redo', imgs: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'] },
    { id: 'm2', date: '2026-09-01', sub: '判断推理', err: '技巧不熟', source: '', knowledge: '翻译推理', note: '', state: 'pending' }
  ],
  reviews: [{ id: 'r1', week: '摸底周', done: 'x', rate: 60, focus: 'y' }]
};
const mig = migrateV1(v1);
eq('迁移后 schema_version=2', mig.state.schema_version, SCHEMA_VERSION);
eq('迁移后任务保留', mig.state.tasks.length, 1);
eq('迁移后示例错题 2 条', mig.state.mistakes.length, 2);
eq('带图错题 imgs 转 id 引用', mig.state.mistakes[0].imgs.length, 2);
eq('id 引用非 base64', mig.state.mistakes[0].imgs.every(x => !x.startsWith('data:')), true);
eq('无图错题 imgs=[]', Array.isArray(mig.state.mistakes[1].imgs) && mig.state.mistakes[1].imgs.length === 0, true);
eq('pendingImgs 2 张待迁', mig.pendingImgs.length, 2);
eq('pendingImgs 内容完整', mig.pendingImgs[1].dataUrl === 'data:image/jpeg;base64,BBB' && !!mig.pendingImgs[0].imgId, true);

/* ---- 迁移容错 ---- */
eq('migrateV1(null) 返回 null', migrateV1(null), null);
eq('migrateV1(空对象) 返回结构', migrateV1({}).state.tasks.length, 0);
eq('migrateV1(带 tasks) 保留字段', migrateV1({ tasks: [{ id: 'a', date: '2026-09-01', title: 't', done: true }] }).state.tasks[0].done, true);

console.log(fail === 0 ? '\n=== 全部通过 ===' : '\n=== ' + fail + ' 项失败 ===');
process.exit(fail ? 1 : 0);
