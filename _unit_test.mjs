/* 纯函数单测：阶段/日期/模板/迁移 */
import {
  START_DATE, DEFAULT_EXAM_DATE, DAYS_TOTAL, STAGES,
  diffDays, addDays, getStage, stageProgress, totalProgress, weekLabel, stagePctInside
} from './src/lib/dates.js';
import { templateForDate, mergeDailyTasks, dueMistakes, REVIEW_INTERVALS } from './src/lib/templates.js';
import {
  mistakeMessages, mistakeProfileMessages, variantMessages, bankVariantMessages, providerSupportsVision, AI_PROVIDERS
} from './src/lib/ai.js';
import {
  parseQuestionsText, parseVariantJson, questionStatus, pickQuestions, bankStats, bankPracticeStats, subCat
} from './src/lib/qbank.js';
import {
  monthRate, examTrend, lastModuleAvg, goalGap, mistakeBySub, mistakeByErr,
  GOAL, MODULES, SHENLUN_PARTS, ERR_OPTIONS
} from './src/lib/stats.js';
import { migrateV1, SCHEMA_VERSION, LS_KEY_V1, parseImport } from './src/lib/storage.js';

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

/* ---- 进度联动：薄弱模块动态化（接模考数据） ---- */
const examsDemo = [{ id: 'e1', date: '2026-10-20', m: { ziliao: 78, panduan: 72, yanyu: 80, shuliang: 55, changshi: 65 } }];
const sprTue = templateForDate('2026-10-27', { exams: examsDemo }); // 冲刺期周二
eq('冲刺期带模考数据仍 3 条', sprTue.length, 3);
eq('薄弱模块定向到数量关系(55%)', sprTue[0].title.includes('数量关系') && sprTue[0].title.includes('55%'), true);
eq('薄弱任务带稳定 key', sprTue[0].key, 'weak_module');
eq('无模考数据回退通用标题', templateForDate('2026-10-27')[0].title.includes('薄弱模块'), true);

/* ---- 进度联动：摸底阶段追赶（窗口错过自动补发） ---- */
const cat1 = mergeDailyTasks([], '2026-09-10', { exams: [] }); // 攻坚期周二，无任何历史记录
eq('攻坚期追赶补发摸底 2 条', cat1.filter(t => t.catchup).length, 2);
eq('追赶任务落在查看日', cat1.filter(t => t.catchup).every(t => t.date === '2026-09-10'), true);
const cat2 = mergeDailyTasks(
  [
    { id: 'x1', date: '2026-09-01', title: '行测真题限时摸底（120分钟 / 135题）', done: false },
    { id: 'x2', date: '2026-09-01', title: '申论真题摸底（150分钟，含大作文）', done: false }
  ],
  '2026-09-10', { exams: [] }
);
eq('两条基线都有记录则不再追赶', cat2.filter(t => t.catchup).length, 0);
eq('单条基线缺失时只补缺的那条', mergeDailyTasks(
  [{ id: 'x1', date: '2026-09-01', title: '行测真题限时摸底（120分钟 / 135题）', done: false }],
  '2026-09-10', { exams: [] }
).filter(t => t.catchup && t.title.includes('申论')).length, 1);
eq('摸底周内不触发追赶', mergeDailyTasks([], '2026-09-02', { exams: [] }).filter(t => t.catchup).length, 0);

/* ---- key 稳定去重：薄弱模块标题随模考变化，当天不重复生成 ---- */
const day1 = mergeDailyTasks([], '2026-10-26', { exams: examsDemo }); // 周一
const newExams = [{ id: 'e2', date: '2026-10-27', m: { ziliao: 60, panduan: 72, yanyu: 80, shuliang: 75, changshi: 65 } }];
const again = mergeDailyTasks(day1, '2026-10-26', { exams: newExams });
eq('标题变化但 key 相同不重复生成', again.filter(t => t.key === 'weak_module').length, 0);
eq('基线已存在也不重复追赶', again.filter(t => t.catchup).length, 0);

/* ---- 间隔复习：dueMistakes（错题登记后 1/3/7/15 天到期） ---- */
eq('复习间隔定义 [1,3,7,15]', REVIEW_INTERVALS, [1, 3, 7, 15]);
const mkDemo = (date, state) => ({ id: 'm_' + date + '_' + state, date, sub: '资料分析', err: '知识不会', knowledge: '增长率', state, imgs: [] });
eq('第 1 天到期', dueMistakes([mkDemo('2026-09-01', 'pending')], '2026-09-02').length, 1);
eq('第 3 天到期', dueMistakes([mkDemo('2026-09-01', 'pending')], '2026-09-04').length, 1);
eq('第 7 天到期', dueMistakes([mkDemo('2026-09-01', 'redo')], '2026-09-08').length, 1);
eq('第 15 天到期', dueMistakes([mkDemo('2026-09-01', 'redo')], '2026-09-16').length, 1);
eq('第 2 天不到期', dueMistakes([mkDemo('2026-09-01', 'pending')], '2026-09-03').length, 0);
eq('已掌握不再复习', dueMistakes([mkDemo('2026-09-01', 'done')], '2026-09-02').length, 0);
eq('demo 标记排除', dueMistakes([{ ...mkDemo('2026-09-01', 'pending'), demo: true }], '2026-09-02').length, 0);
eq('pending 超 15 天兜底到期', dueMistakes([mkDemo('2026-09-01', 'pending')], '2026-09-20').length, 1);
eq('redo 超 15 天不再拉回', dueMistakes([mkDemo('2026-09-01', 'redo')], '2026-09-20').length, 0);
eq('未来错题不到期', dueMistakes([mkDemo('2026-09-10', 'pending')], '2026-09-02').length, 0);
eq('空输入返回空数组', dueMistakes(null, '2026-09-02'), []);

/* ---- 间隔复习：今日打卡注入 mistake_review 任务 ---- */
const mkForInject = [
  mkDemo('2026-09-01', 'pending'),   // 9/2 到期（d=1）
  { ...mkDemo('2026-09-01', 'pending'), sub: '判断推理' }
];
const injected = mergeDailyTasks([], '2026-09-02', { exams: [], mistakes: mkForInject });
const reviewTask = injected.find(t => t.key === 'mistake_review');
eq('到期错题生成复习任务', !!reviewTask, true);
eq('复习任务标题含数量与分布', reviewTask && reviewTask.title.includes('2 条') && reviewTask.title.includes('资料分析×1') && reviewTask.title.includes('判断推理×1'), true);
eq('复习任务落在查看日', reviewTask && reviewTask.date === '2026-09-02', true);
eq('无到期错题不生成', mergeDailyTasks([], '2026-09-03', { exams: [], mistakes: mkForInject }).some(t => t.key === 'mistake_review'), false);
const withExisting = [{ id: 'r1', date: '2026-09-02', title: '🔁 重做到期错题 2 条（资料分析×1、判断推理×1）', key: 'mistake_review', done: false }];
eq('当天已有复习任务不重复生成', mergeDailyTasks(withExisting, '2026-09-02', { exams: [], mistakes: mkForInject }).filter(t => t.key === 'mistake_review').length, 0);
eq('不传 mistakes 上下文不生成', mergeDailyTasks([], '2026-09-02', { exams: [] }).some(t => t.key === 'mistake_review'), false);

/* ---- AI 消息构造器 ---- */
const mkWithImgs = { ...mkDemo('2026-09-01', 'pending'), source: '2026真题', note: '公式记错', imgs: ['img_a', 'img_b', 'img_c'] };
const noImgMsg = mistakeMessages(mkWithImgs, null);
eq('无图解析 content 为字符串', typeof noImgMsg[1].content === 'string', true);
const imgMsg = mistakeMessages(mkWithImgs, ['data:1', 'data:2', 'data:3']);
eq('带图解析 content 为数组', Array.isArray(imgMsg[1].content), true);
eq('图片最多带 2 张', imgMsg[1].content.filter(p => p.type === 'image_url').length, 2);
eq('带图解析含文字说明', imgMsg[1].content[0].type === 'text', true);
const emptyProfile = mistakeProfileMessages([]);
eq('空错题画像含录入提示', emptyProfile[1].content.includes('暂无错题记录'), true);
const fullProfile = mistakeProfileMessages([mkDemo('2026-09-01', 'pending'), mkWithImgs]);
eq('错题画像含分布统计', fullProfile[1].content.includes('按科目') && fullProfile[1].content.includes('按错因'), true);
const vr = variantMessages(mkWithImgs);
eq('变式题要求 2 道', vr[1].content.includes('2 道变式题'), true);

/* ---- 视觉能力判断 ---- */
eq('qwen-vl 支持看图', providerSupportsVision({ provider: 'qwen-vl' }), true);
eq('deepseek 不支持看图', providerSupportsVision({ provider: 'deepseek' }), false);
eq('custom 勾选 vision 支持', providerSupportsVision({ provider: 'custom', vision: true }), true);
eq('custom 未勾选不支持', providerSupportsVision({ provider: 'custom' }), false);
eq('qwen-vl 已在服务商列表', AI_PROVIDERS.some(p => p.key === 'qwen-vl' && p.vision), true);

/* ---- qbank：批量文本解析 ---- */
const parseOk = parseQuestionsText([
  '【科目】资料分析',
  '【题型】单选题',
  '【题干】2023年……增长率约为多少？',
  '【A】12.5%',
  '【B】13.2%',
  '【C】14.8%',
  '【D】15.6%',
  '【答案】B',
  '【解析】基期量计算',
  '【知识点】年均增长率',
  '【来源】2025江苏真题',
  '---',
  '【科目】申论小题',
  '【题型】主观题',
  '【题干】概括主要做法',
  '【答案】参考要点',
  '【解析】分条作答'
].join('\n'));
eq('解析出 2 题', parseOk.questions.length, 2);
eq('无解析错误', parseOk.errors.length, 0);
eq('选择题选项 4 个', parseOk.questions[0].options.length, 4);
eq('答案归一到 B', parseOk.questions[0].answer, 'B');
eq('选择题自动识别为单选', parseOk.questions[0].type, '单选题');
eq('主观题无选项', parseOk.questions[1].options.length, 0);
eq('主观题 type 判定', parseOk.questions[1].type, '主观题');
eq('空文本报错', parseQuestionsText('').errors.length > 0, true);
const parseErr = parseQuestionsText('【题干】没答案\n【科目】资料分析');
eq('缺答案报错', parseErr.errors.length > 0, true);
eq('缺答案不入库', parseErr.questions.length, 0);

/* ---- qbank：作答状态 / 抽题 ---- */
const qDemo = (id, sub) => ({ id, sub, demo: false });
const qs3 = [qDemo('q1', '资料分析'), qDemo('q2', '判断推理'), qDemo('q3', '资料分析')];
const atsRight = [{ qid: 'q1', correct: true }, { qid: 'q2', correct: false }];
eq('未做题状态 new', questionStatus(qs3[2], atsRight), 'new');
eq('做对状态 right', questionStatus(qs3[0], atsRight), 'right');
eq('做错状态 wrong', questionStatus(qs3[1], atsRight), 'wrong');
eq('抽题优先未做', pickQuestions(qs3, atsRight, {}).map(q => q.id)[0], 'q3');
const picked = pickQuestions(qs3, atsRight, { sub: '资料分析', count: 10 });
eq('按科目筛选抽题', picked.length, 2);
eq('demo 题不参与抽题', pickQuestions([{ id: 'd1', sub: '常识', demo: true }], [], {}).length, 0);

/* ---- qbank：统计 ---- */
const st = bankStats([qDemo('q1', '资料分析'), qDemo('q2', '判断推理'), { id: 'd1', sub: '常识', demo: true }], [{ qid: 'q1', correct: true }]);
eq('统计排除 demo', st.total, 2);
eq('已做 1 题', st.done, 1);
eq('正确率 100%', st.rightRate, 100);
const ps = bankPracticeStats([qDemo('q1', '资料分析'), qDemo('q2', '资料分析'), qDemo('q3', '判断推理')], [{ qid: 'q1', correct: true }]);
eq('待消化按需排序', ps[0].sub, '资料分析');
eq('待消化数正确', ps[0].need, 1);
eq('subCat 申论归类', subCat('申论小题'), '申论');
eq('subCat 常识归类', subCat('常识'), '常识');
eq('subCat 行测归类', subCat('资料分析'), '行测');

/* ---- qbank：变式题 JSON 解析 ---- */
const vj = parseVariantJson('[{"stem":"题1","options":["A","B"],"answer":"A","analysis":"解析","knowledge":"考点"}]');
eq('变式 JSON 解析 1 题', vj.length, 1);
eq('变式答案保留', vj[0].answer, 'A');
eq('变式含围栏容错', parseVariantJson('```json\n[{"stem":"x","options":[],"answer":"a"}]\n```').length, 1);
eq('变式空报错', (() => { try { parseVariantJson(''); return false; } catch (e) { return true; } })(), true);

/* ---- 真题变式题消息构造器 ---- */
const bv = bankVariantMessages({ sub: '资料分析', type: '单选题', stem: '原题', options: ['a', 'b', 'c', 'd'], answer: 'B', knowledge: '基期' });
eq('真题变式要求 JSON', bv[1].content.includes('JSON'), true);
eq('真题变式含原题考点', bv[1].content.includes('基期'), true);

/* ---- 今日打卡刷题任务注入 ---- */
const bankCtx = {
  exams: [],
  mistakes: [],
  questions: [qDemo('q1', '资料分析'), qDemo('q2', '判断推理')],
  attempts: [{ qid: 'q1', correct: false }]
};
const bankAdded = mergeDailyTasks([], '2026-09-08', bankCtx);
const practiceTask = bankAdded.find(t => t.key === 'bank_practice');
eq('生成真题刷题任务', !!practiceTask, true);
eq('刷题任务指向待消化最多的科目', practiceTask && practiceTask.title.includes('资料分析'), true);
eq('刷题任务归类行测', practiceTask && practiceTask.cat, '行测');
eq('题库为空不生成刷题任务', mergeDailyTasks([], '2026-09-08', { exams: [], mistakes: [], questions: [], attempts: [] }).some(t => t.key === 'bank_practice'), false);
eq('已有刷题任务不重复生成', mergeDailyTasks([practiceTask], '2026-09-08', bankCtx).filter(t => t.key === 'bank_practice').length, 0);

/* ---- stats.js：统计纯函数 ---- */
eq('GOAL 总分 145', GOAL.total, 145);
eq('MODULES 五模块', MODULES.length, 5);
eq('SHENLUN_PARTS 四题型', SHENLUN_PARTS.length, 4);
eq('ERR_OPTIONS 四错因', ERR_OPTIONS.length, 4);
const mt1 = monthRate([
  { date: '2026-09-01', done: true },
  { date: '2026-09-02', done: false },
  { date: '2026-09-03', done: true },
  { date: '2026-10-01', done: false }
], '2026-09');
eq('monthRate 当月 3 条', mt1.total, 3);
eq('monthRate 完成 2 条', mt1.done, 2);
eq('monthRate 67%', mt1.rate, 67);
eq('monthRate 空月 rate=0', monthRate([], '2026-09').rate, 0);
const et = examTrend([{ date: '2026-09-15' }, { date: '2026-09-01' }, { date: '2026-09-10' }]);
eq('examTrend 升序', et.map(e => e.date), ['2026-09-01', '2026-09-10', '2026-09-15']);
eq('lastModuleAvg 均值', lastModuleAvg({ m: { ziliao: 80, panduan: 70, yanyu: 90 } }), 80);
eq('lastModuleAvg null', lastModuleAvg(null), null);
eq('lastModuleAvg 无 m 返回 null', lastModuleAvg({}), null);
const gg = goalGap({ total: 130, xingce: 62, shenlun: 68 });
eq('goalGap 总分差 15', gg.totalGap, 15);
eq('goalGap 行测差 8', gg.xingceGap, 8);
eq('goalGap 申论差 7', gg.shenlunGap, 7);
eq('goalGap 无模考 null', goalGap(null), null);
eq('mistakeBySub 排序', mistakeBySub([{ sub: '资料分析' }, { sub: '判断推理' }, { sub: '资料分析' }]), [['资料分析', 2], ['判断推理', 1]]);
eq('mistakeByErr 排序', mistakeByErr([{ err: '知识不会' }, { err: '技巧不熟' }, { err: '知识不会' }, { err: '时间不够' }]), [['知识不会', 2], ['技巧不熟', 1], ['时间不够', 1]]);

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

/* ---- storage.parseImport（备份导入，异步） ---- */
const mkFile = (obj) => ({ text: async () => JSON.stringify(obj) });
const v2Empty = { schema_version: 2, tasks: [], exams: [], mistakes: [], reviews: [] };

async function runParseImportTests() {
  const r1 = await parseImport(mkFile({ app: 'wb_gk_2027', state: v2Empty, images: {} }), null);
  eq('parseImport v2 无图 schema=2', r1.state.schema_version, 2);
  eq('parseImport imageCount=0', r1.imageCount, 0);
  eq('parseImport 归一化补 questions', r1.state.questions, []);
  eq('parseImport 归一化补 attempts', r1.state.attempts, []);

  const r2 = await parseImport(mkFile({ app: 'wb_gk_2027', state: { tasks: [{ id: 't1', date: '2026-09-01', title: 'x', done: false }], exams: [], mistakes: [], reviews: [] } }), null);
  eq('parseImport v1 自动迁移到 v2', r2.state.schema_version, 2);

  const puts = [];
  const store = { put: async (k, v) => { puts.push([k, v]); } };
  const r3 = await parseImport(mkFile({ app: 'wb_gk_2027', state: v2Empty, images: { img_a: 'data:1', img_b: 'data:2' } }), store);
  eq('parseImport 带图 imageCount=2', r3.imageCount, 2);
  eq('parseImport 逐张写入 imgStore', puts.length, 2);
  eq('parseImport 写入 key 正确', puts.map(p => p[0]), ['img_a', 'img_b']);

  const r4 = await parseImport(mkFile({ app: 'wb_gk_2027', state: v2Empty, images: { a: 'data:x' } }), null);
  eq('parseImport 无 imgStore 带图不崩', r4.imageCount, 1);

  let threw = false;
  try { await parseImport(mkFile({ app: 'other', state: v2Empty }), null); } catch (e) { threw = true; }
  eq('parseImport 非本工作台抛错', threw, true);

  let threw2 = false;
  try { await parseImport(mkFile({ app: 'wb_gk_2027' }), null); } catch (e) { threw2 = true; }
  eq('parseImport 缺 state 抛错', threw2, true);

  let threw3 = false;
  try { await parseImport({ text: async () => 'not-json' }, null); } catch (e) { threw3 = true; }
  eq('parseImport 非法 JSON 抛错', threw3, true);
}

await runParseImportTests();

console.log(fail === 0 ? '\n=== 全部通过 ===' : '\n=== ' + fail + ' 项失败 ===');
process.exit(fail ? 1 : 0);
