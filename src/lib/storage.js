/* ============================================================
 * storage.js —— Schema 版本管理 + 迁移 + 持久化
 * v1 → v2：加 schema_version；旧错题图片 base64 迁 IndexedDB
 *          （迁移时生成 img id 引用，base64 转存 imgstore，由 App 异步执行）
 * ============================================================ */
import { uid, imgId as newImgId } from './id.js';
import { DEFAULT_EXAM_DATE } from './dates.js';

export const SCHEMA_VERSION = 2;
export const LS_KEY = 'wb_gk_2027_state_v2';
export const LS_KEY_V1 = 'wb_gk_2027_state_v1';
export const EXAM_DATE_KEY = 'wb_gk_2027_examdate';
export const AI_KEY = 'wb_gk_2027_ai_config';

/* ------- 默认/示例数据 ------- */

export function demoTasks() {
  return [
    { id: uid(), date: '2026-09-01', title: '行测真题限时摸底（120分钟 / 135题）', time: '120min', cat: '行测', done: false, demo: true },
    { id: uid(), date: '2026-09-01', title: '申论真题摸底（150分钟，含大作文）', time: '150min', cat: '申论', done: false, demo: true },
    { id: uid(), date: '2026-09-01', title: '登记各模块正确率，写摸底复盘', time: '30min', cat: '复盘', done: false, demo: true }
  ];
}

export function demoExams() {
  return [{
    id: uid(), date: '2026-09-01', name: '摸底模考（2025江苏B类）',
    xingce: 65, shenlun: 68, total: 133,
    m: { ziliao: 78, panduan: 72, yanyu: 80, shuliang: 55, changshi: 65 },
    s: { gaikuo: 15, duice: 17, yingyong: 17, dazuo: 19 },
    demo: true
  }];
}

export function demoMistakes() {
  return [
    { id: uid(), date: '2026-09-01', sub: '资料分析', err: '知识不会', source: '摸底卷-资料第3题', knowledge: '年均增长率 vs 增长率', note: '题目问"年均"却用了普通增长率公式，审题先圈关键词。', state: 'redo', demo: true },
    { id: uid(), date: '2026-09-01', sub: '判断推理', err: '技巧不熟', source: '摸底卷-判断第28题', knowledge: '翻译推理：-A→B 与 A→-B 混淆', note: '肯前必肯后、否后必否前，画出箭头链再推。', state: 'pending', demo: true },
    { id: uid(), date: '2026-08-30', sub: '申论小题', err: '审题失误', source: '摸底卷-归纳概括', knowledge: '作答对象=成效+问题，漏答"问题"', note: '先拆作答要素再回材料定位，要点全、语言简。', state: 'done', demo: true }
  ];
}

export function demoReviews() {
  return [{
    id: uid(), week: '摸底周', done: '完成摸底套题，行测65 / 申论68',
    rate: 62, focus: '资料分析找数慢，判断推理翻译规则不熟', demo: true
  }];
}

/* 真题库示例（无数据时展示，可一键清除） */
export function demoQuestions() {
  return [
    {
      id: uid(), date: '2026-09-01', sub: '资料分析', type: '单选题',
      stem: '2021年全国规模以上工业企业实现利润总额 87092 亿元，比上年增长 34.3%，比 2019 年增长 39.7%，两年平均增长 18.2%。问：2020 年全国规模以上工业企业实现利润总额约为多少亿元？',
      options: ['约 58000', '约 64700', '约 72500', '约 76000'],
      answer: 'B', analysis: '基期 = 87092 / (1+34.3%) ≈ 64840，选 B。基期量 = 现期 / (1+增长率)。',
      knowledge: '基期量计算', source: '示例题·资料分析', imgs: [], demo: true
    },
    {
      id: uid(), date: '2026-09-01', sub: '判断推理', type: '单选题',
      stem: '所有的镇干部都要下村走访，老张是镇干部。由此可以推出：',
      options: ['老张要下村走访', '老张不用下村走访', '下村走访的都是镇干部', '无法推出任何结论'],
      answer: 'A', analysis: '三段论：所有 A 是 B，某个 x 是 A → x 是 B。肯前必肯后。',
      knowledge: '翻译推理·三段论', source: '示例题·判断推理', imgs: [], demo: true
    },
    {
      id: uid(), date: '2026-09-01', sub: '数量-数推', type: '单选题',
      stem: '3，5，9，17，33，（ ）',
      options: ['57', '63', '65', '69'],
      answer: 'C', analysis: '相邻两项差为 2,4,8,16,32（等比），33+32=65。做差观察。',
      knowledge: '多级等差数列', source: '示例题·数字推理', imgs: [], demo: true
    },
    {
      id: uid(), date: '2026-09-01', sub: '常识', type: '单选题',
      stem: '根据《行政处罚法》，下列属于行政处罚种类的是：',
      options: ['罚金', '警告', '拘留', '责令赔偿损失'],
      answer: 'B', analysis: '罚金是刑罚，拘留分刑事/行政（行政拘留是处罚但选项不明确），警告是行政处罚法定种类。',
      knowledge: '行政处罚种类', source: '示例题·常识法律', imgs: [], demo: true
    },
    {
      id: uid(), date: '2026-09-01', sub: '申论小题', type: '主观题',
      stem: '根据给定资料，概括 S 市推进基层网格化治理的主要做法。（15分，200字以内）',
      options: [],
      answer: '参考要点：1. 划分网格，明确责任到人；2. 建立信息平台，闭环处置；3. 整合多方力量进网格；4. 健全考核激励机制。',
      analysis: '归纳概括：动宾结构提炼，分条作答，每条以做法为核心。',
      knowledge: '归纳概括', source: '示例题·申论', imgs: [], demo: true
    }
  ];
}

export function emptyState() {
  return {
    schema_version: SCHEMA_VERSION,
    tasks: [],
    exams: [],
    mistakes: [],
    reviews: [],
    questions: [],
    attempts: []
  };
}

export function demoState() {
  return {
    schema_version: SCHEMA_VERSION,
    tasks: demoTasks(),
    exams: demoExams(),
    mistakes: demoMistakes(),
    reviews: demoReviews(),
    questions: demoQuestions(),
    attempts: []
  };
}

/* 旧 v2 数据缺 questions/attempts 字段时补默认（向后兼容，不 bump 版本） */
function normalizeState(s) {
  return {
    ...s,
    questions: Array.isArray(s.questions) ? s.questions : [],
    attempts: Array.isArray(s.attempts) ? s.attempts : []
  };
}

/* ------- 迁移 ------- */

/*
 * v1 数据（LS_KEY_V1）：
 * { tasks:[{id,date,title,time,cat,done,demo}], exams:[...], mistakes:[{...,imgs:[base64,...]}], reviews:[...] }
 * 迁移产出 v2 + pendingImgs（mistakeId -> [{imgId, dataUrl}]），由调用方写入 imgstore 后清理 imgsData。
 */
export function migrateV1(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const mistakes = Array.isArray(raw.mistakes) ? raw.mistakes : [];
  const pendingImgs = [];
  const m2 = mistakes.map(m => {
    const imgs = Array.isArray(m.imgs) ? m.imgs.filter(x => typeof x === 'string') : [];
    if (!imgs.length) return { ...m, imgs: [] };
    const ids = [];
    imgs.forEach((b64, i) => {
      const iid = newImgId(i);
      ids.push(iid);
      pendingImgs.push({ imgId: iid, dataUrl: b64 });
    });
    return { ...m, imgs: ids };
  });
  return {
    state: normalizeState({
      schema_version: SCHEMA_VERSION,
      tasks: tasks.map(t => ({ id: t.id, date: t.date, title: t.title, time: t.time || '', cat: t.cat || '其他', done: !!t.done, demo: !!t.demo, auto: !!t.auto })),
      exams: Array.isArray(raw.exams) ? raw.exams : [],
      mistakes: m2,
      reviews: Array.isArray(raw.reviews) ? raw.reviews : []
    }),
    pendingImgs
  };
}

/* 读取初始化状态（同步部分）：v2 → v1 → 示例数据 */
export function initState() {
  try {
    const v2 = localStorage.getItem(LS_KEY);
    if (v2) {
      const parsed = JSON.parse(v2);
      if (parsed && parsed.schema_version === SCHEMA_VERSION) return { state: normalizeState(parsed), pendingImgs: [] };
      // 低版本 v2（无版本字段）→ 按 v1 兜底
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tasks)) {
        const mig = migrateV1(parsed);
        if (mig) return mig;
      }
    }
    const v1 = localStorage.getItem(LS_KEY_V1);
    if (v1) {
      try {
        const parsed = JSON.parse(v1);
        const mig = migrateV1(parsed);
        if (mig) return mig;
      } catch (e) { /* 损坏则忽略 */ }
    }
  } catch (e) { /* 损坏则忽略 */ }
  return { state: demoState(), pendingImgs: [] };
}

export function saveState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

/* 异步完成图片迁移（v1 base64 → imgstore），返回迁移后的 state（imgs 已是 id 数组） */
export async function finalizeImgMigration(state, pendingImgs, imgStore) {
  if (!pendingImgs || !pendingImgs.length) return { state, migrated: 0 };
  let migrated = 0;
  for (const p of pendingImgs) {
    const ok = await imgStore.put(p.imgId, p.dataUrl);
    if (ok) migrated++;
  }
  return { state, migrated };
}

/* ------- 导出 / 导入（含图片） ------- */

export async function exportData(state, imgStore) {
  const images = {};
  const ids = [];
  for (const m of state.mistakes || []) {
    for (const id of (m.imgs || [])) if (!images[id]) ids.push(id);
  }
  const got = await imgStore.getMany(ids);
  Object.assign(images, got);
  return {
    app: 'wb_gk_2027',
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    state,
    images
  };
}

export function buildExportBlob(data) {
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export function downloadJSON(data, filename) {
  const blob = buildExportBlob(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
}

/*
 * 解析导入文件：返回 {state, imageCount} 或抛错。
 * imgStore 由调用方注入（保持 storage 不反向依赖 imgstore，避免循环依赖）；
 * 未注入时跳过图片写入，但仍返回 imageCount —— 保证纯数据备份照样能恢复。
 */
export async function parseImport(file, imgStore) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || data.app !== 'wb_gk_2027' || !data.state) throw new Error('不是本工作台的备份文件');
  let state = data.state;
  if (state.schema_version !== SCHEMA_VERSION) {
    const mig = migrateV1(state);
    if (mig) state = mig.state;
    else throw new Error('备份文件版本不兼容');
  }
  const images = (data.images && typeof data.images === 'object') ? data.images : {};
  const keys = Object.keys(images);
  if (imgStore && typeof imgStore.put === 'function' && keys.length) {
    await Promise.all(keys.map(k => imgStore.put(k, images[k])));
  }
  return { state: normalizeState(state), imageCount: keys.length };
}

export function getExamDate() {
  try {
    const v = localStorage.getItem(EXAM_DATE_KEY);
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  } catch (e) { /* noop */ }
  return DEFAULT_EXAM_DATE;
}

export function setExamDate(dateStr) {
  try { localStorage.setItem(EXAM_DATE_KEY, dateStr); } catch (e) { /* noop */ }
}

/* ------- AI 配置 ------- */

export function getAiConfig() {
  try {
    const raw = localStorage.getItem(AI_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* noop */ }
  return { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: '' };
}

export function saveAiConfig(cfg) {
  try { localStorage.setItem(AI_KEY, JSON.stringify(cfg)); return true; }
  catch (e) { return false; }
}
