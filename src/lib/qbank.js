/* ============================================================
 * qbank.js —— 真题库纯函数：批量解析 / 抽题 / 状态 / 统计
 * 无 React / DOM 依赖，可单测
 * ============================================================ */

/* 批量导入支持的题型（申论小题/大作文按主观题处理） */
export const QUESTION_TYPES = ['单选题', '多选题', '判断题', '主观题'];

/* 科目 → 打卡任务分类 */
export function subCat(sub) {
  if (sub === '申论小题' || sub === '申论大作文') return '申论';
  if (sub === '常识') return '常识';
  return '行测';
}

/* ------- 批量文本解析 -------
   格式（题与题之间用单独一行 --- 分隔；连续遇到【题干】也自动分题）：
   【科目】资料分析
   【题型】单选题
   【题干】2023年……增长率约为多少？
   【A】12.5%
   【B】13.2%
   【C】14.8%
   【D】15.6%
   【答案】B
   【解析】……
   【知识点】年均增长率
   【来源】2025江苏真题
*/
const FIELD_KEYS = {
  '科目': 'sub', '题型': 'type', '题干': 'stem', '答案': 'answer',
  '解析': 'analysis', '知识点': 'knowledge', '来源': 'source'
};
const OPT_RE = /^[A-Fa-f]$/;

export function parseQuestionsText(text) {
  const out = { questions: [], errors: [] };
  if (!text || !String(text).trim()) { out.errors.push('内容为空'); return out; }

  /* 1) 分块：--- 分隔线优先；否则遇到【题干】且当前块已有题干时开始新块 */
  const lines = String(text).replace(/\r/g, '').split('\n');
  const blocks = [];
  let cur = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^-{3,}$/.test(line) || /^===+$/.test(line)) {
      if (cur.some(x => x.trim())) blocks.push(cur);
      cur = [];
      continue;
    }
    if (/^【\s*题干\s*】/.test(line) && cur.some(x => /^【\s*题干\s*】/.test(x.trim()))) {
      blocks.push(cur);
      cur = [];
    }
    cur.push(raw);
  }
  if (cur.some(x => x.trim())) blocks.push(cur);

  /* 2) 逐块解析 */
  blocks.forEach((block, bi) => {
    const no = bi + 1;
    const fields = {};   // 标记字段
    const opts = [];     // 选项 {key, text}
    let lastKey = null;  // 续行归属（题干/解析等多行内容）

    for (const raw of block) {
      const line = raw.trim();
      if (!line) { lastKey = null; continue; }
      const m = line.match(/^【\s*([^】]+?)\s*】\s*[:：]?\s*(.*)$/);
      if (m) {
        const key = m[1].trim();
        const val = m[2].trim();
        if (OPT_RE.test(key)) {
          opts.push({ key: key.toUpperCase(), text: val });
          lastKey = null;
        } else if (FIELD_KEYS[key]) {
          fields[FIELD_KEYS[key]] = val;
          lastKey = FIELD_KEYS[key];
        } else {
          lastKey = null; // 未知标记忽略
        }
      } else if (lastKey) {
        fields[lastKey] = (fields[lastKey] ? fields[lastKey] + '\n' : '') + line;
      }
      // 无标记且无归属的行：忽略（容错）
    }

    /* 3) 校验与归一 */
    if (!fields.stem) { out.errors.push('第 ' + no + ' 题：缺【题干】'); return; }
    if (!fields.sub) { out.errors.push('第 ' + no + ' 题：缺【科目】（如：资料分析/判断推理/言语理解/数量-数推/数量-运算/常识/申论小题/申论大作文）'); return; }
    if (fields.answer == null || fields.answer === '') { out.errors.push('第 ' + no + ' 题：缺【答案】'); return; }

    const optsSorted = opts.slice().sort((a, b) => a.key < b.key ? -1 : 1);
    const options = optsSorted.map(o => o.text);
    const type = fields.type || (options.length ? '单选题' : '主观题');
    out.questions.push({
      sub: fields.sub,
      type,
      stem: fields.stem,
      options,
      answer: String(fields.answer).trim(),
      analysis: fields.analysis || '',
      knowledge: fields.knowledge || '',
      source: fields.source || ''
    });
  });

  return out;
}

/* ------- 做题状态（按最近一次 attempt） ------- */
export function questionStatus(q, attempts) {
  if (!Array.isArray(attempts)) return 'new';
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i];
    if (a && a.qid === q.id) return a.correct === true ? 'right' : a.correct === false ? 'wrong' : 'new';
  }
  return 'new';
}

export const STATUS_LABEL = { new: '未做', wrong: '做错', right: '做对' };
const STATUS_RANK = { new: 0, wrong: 1, right: 2 };

/* ------- 抽题：未做 > 做错 > 做对（同组内保持题库顺序） ------- */
export function pickQuestions(questions, attempts, opts) {
  const { sub, count } = opts || {};
  let pool = (Array.isArray(questions) ? questions : []).filter(q => q && !q.demo);
  if (sub) pool = pool.filter(q => q.sub === sub);
  return pool
    .map(q => ({ q, rank: STATUS_RANK[questionStatus(q, attempts)] }))
    .sort((a, b) => a.rank - b.rank)
    .map(x => x.q)
    .slice(0, Math.max(0, count == null ? pool.length : count));
}

/* ------- 统计 ------- */
export function bankStats(questions, attempts) {
  const qs = Array.isArray(questions) ? questions : [];
  const bySub = {};
  let done = 0, right = 0;
  qs.forEach(q => {
    if (!q || q.demo) return;
    bySub[q.sub] = (bySub[q.sub] || 0) + 1;
    const st = questionStatus(q, attempts);
    if (st !== 'new') done++;
    if (st === 'right') right++;
  });
  const total = Object.values(bySub).reduce((s, v) => s + v, 0);
  return { total, bySub, done, right, rightRate: done ? Math.round(right / done * 100) : null };
}

/* 各科目「待消化」题数（未做 + 做错），供每日刷题任务选科 */
export function bankPracticeStats(questions, attempts) {
  const qs = Array.isArray(questions) ? questions : [];
  const bySub = {};
  qs.forEach(q => {
    if (!q || q.demo) return;
    const st = questionStatus(q, attempts);
    if (st === 'right') return;
    if (!bySub[q.sub]) bySub[q.sub] = { sub: q.sub, need: 0, total: 0 };
    bySub[q.sub].need++;
  });
  qs.forEach(q => { if (q && !q.demo && bySub[q.sub]) bySub[q.sub].total++; });
  return Object.values(bySub).sort((a, b) => b.need - a.need);
}

/* ------- AI 变式题 JSON 容错解析 -------
   期望：[{stem, options:[..], answer, analysis, knowledge}] */
export function parseVariantJson(text) {
  if (!text) throw new Error('AI 返回为空，请重试');
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const l = s.indexOf('[');
  const r = s.lastIndexOf(']');
  if (l === -1 || r === -1 || r <= l) throw new Error('AI 未返回 JSON 数组，请重试');
  let arr;
  try { arr = JSON.parse(s.slice(l, r + 1)); }
  catch (e) { throw new Error('AI 返回的 JSON 解析失败，请重试'); }
  if (!Array.isArray(arr) || !arr.length) throw new Error('AI 返回的变式题为空，请重试');
  return arr.map((x, i) => {
    if (!x || typeof x.stem !== 'string' || !x.stem.trim()) throw new Error('第 ' + (i + 1) + ' 道变式题缺题干，请重试');
    const options = Array.isArray(x.options) ? x.options.map(String) : [];
    return {
      stem: x.stem.trim(),
      options,
      answer: String(x.answer == null ? '' : x.answer).trim(),
      analysis: String(x.analysis == null ? '' : x.analysis).trim(),
      knowledge: String(x.knowledge == null ? '' : x.knowledge).trim()
    };
  });
}
