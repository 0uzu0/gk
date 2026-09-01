/* ============================================================
 * storage.js —— Schema 版本管理 + 迁移 + 持久化
 * v1 → v2：加 schema_version；旧错题图片 base64 迁 IndexedDB
 *          （迁移时生成 img id 引用，base64 转存 imgstore，由 App 异步执行）
 * ============================================================ */
import { uid } from './templates.js';
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

export function emptyState() {
  return {
    schema_version: SCHEMA_VERSION,
    tasks: [],
    exams: [],
    mistakes: [],
    reviews: []
  };
}

export function demoState() {
  return {
    schema_version: SCHEMA_VERSION,
    tasks: demoTasks(),
    exams: demoExams(),
    mistakes: demoMistakes(),
    reviews: demoReviews()
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
      const imgId = 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) + '_' + i;
      ids.push(imgId);
      pendingImgs.push({ imgId, dataUrl: b64 });
    });
    return { ...m, imgs: ids };
  });
  return {
    state: {
      schema_version: SCHEMA_VERSION,
      tasks: tasks.map(t => ({ id: t.id, date: t.date, title: t.title, time: t.time || '', cat: t.cat || '其他', done: !!t.done, demo: !!t.demo, auto: !!t.auto })),
      exams: Array.isArray(raw.exams) ? raw.exams : [],
      mistakes: m2,
      reviews: Array.isArray(raw.reviews) ? raw.reviews : []
    },
    pendingImgs
  };
}

/* 读取初始化状态（同步部分）：v2 → v1 → 示例数据 */
export function initState() {
  try {
    const v2 = localStorage.getItem(LS_KEY);
    if (v2) {
      const parsed = JSON.parse(v2);
      if (parsed && parsed.schema_version === SCHEMA_VERSION) return { state: parsed, pendingImgs: [] };
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

/* 解析导入文件：返回 {state, images} 或抛错 */
export async function parseImport(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || data.app !== 'wb_gk_2027' || !data.state) throw new Error('不是本工作台的备份文件');
  let state = data.state;
  if (state.schema_version !== SCHEMA_VERSION) {
    const mig = migrateV1(state);
    if (mig) state = mig.state;
    else throw new Error('备份文件版本不兼容');
  }
  // 图片写入 imgstore
  const images = data.images || {};
  await Promise.all(Object.keys(images).map(k => imgStore.put(k, images[k])));
  return { state, imageCount: Object.keys(images).length };
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
