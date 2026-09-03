/* ============================================================
 * ai.js —— AI 助手：申论批改 / 错题解析 / 模考分析
 * OpenAI 兼容 Chat Completions 接口（DeepSeek / 通义 / 自定义端点）
 * ============================================================ */

export const AI_PROVIDERS = [
  { key: 'deepseek', label: 'DeepSeek（推荐，便宜）', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { key: 'qwen',     label: '通义千问（纯文字）',      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { key: 'qwen-vl',  label: '通义千问 VL（能看图）',   baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-max', vision: true },
  { key: 'custom',   label: '自定义（OpenAI兼容）',    baseUrl: '', model: '' }
];

/* 当前配置是否支持图片输入（决定错题解析是否带图） */
export function providerSupportsVision(cfg) {
  if (!cfg) return false;
  if (cfg.provider === 'custom') return !!cfg.vision;
  const p = AI_PROVIDERS.find(x => x.key === cfg.provider);
  return !!(p && p.vision);
}

export function resolveBaseUrl(cfg) {
  const p = AI_PROVIDERS.find(x => x.key === cfg.provider);
  if (cfg.provider === 'custom') return (cfg.baseUrl || '').trim().replace(/\/+$/, '');
  return p ? p.baseUrl : (cfg.baseUrl || '').trim().replace(/\/+$/, '');
}

export function resolveModel(cfg) {
  const p = AI_PROVIDERS.find(x => x.key === cfg.provider);
  if (cfg.provider === 'custom') return cfg.model || 'gpt-4o-mini';
  return cfg.model || (p ? p.model : 'deepseek-chat');
}

/* 核心调用：返回 markdown 文本 */
export async function aiChat(messages, cfg) {
  const baseUrl = resolveBaseUrl(cfg);
  const model = resolveModel(cfg);
  if (!cfg.apiKey) throw new Error('请先在 AI 助手设置里填写 API Key');
  if (!baseUrl) throw new Error('请填写 API 端点地址');
  const url = baseUrl + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.apiKey
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 3000
    })
  });
  if (!resp.ok) {
    let msg = 'HTTP ' + resp.status;
    try {
      const j = await resp.json();
      if (j && j.error && j.error.message) msg = j.error.message;
    } catch (e) { /* noop */ }
    throw new Error('AI 接口错误：' + msg);
  }
  const j = await resp.json();
  const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!text) throw new Error('AI 返回为空，请重试');
  return text;
}

/* ------- 场景 prompt ------- */

const SHENLUN_SYSTEM =
  '你是江苏省考申论阅卷专家，深谙 B 类（行政执法）申论评分标准。' +
  '批改要求：一针见血指出问题，给可操作的修改建议，语言专业但不空泛。' +
  '输出格式为 Markdown，必须包含以下小节标题：' +
  '## 总分评定、## 分项点评、## 主要问题、## 修改建议、## 示范改写。';

export function shenlunMessages(type, score, req, answer) {
  const user = [
    '【题型】' + type + '（满分 ' + (score || 40) + ' 分）',
    '【题目要求】',
    req || '（未提供，按该题型通用评分标准）',
    '',
    '【考生作答】',
    answer || '（未提供）',
    '',
    '请给出批改报告：先评总分与分档，再逐项点评，指出主要问题，给出可执行的修改建议，' +
    '并针对开头或分论点给一段示范改写（结合行政执法语境）。'
  ].join('\n');
  return [
    { role: 'system', content: SHENLUN_SYSTEM },
    { role: 'user', content: user }
  ];
}

/* 错题解析：有图片时用图文混合消息（OpenAI 兼容多模态格式，最多带 2 张） */
export function mistakeMessages(m, imgs) {
  const user = [
    '请作为公考培训讲师解析下面这道错题，输出 Markdown，包含：## 考点定位、## 正确思路、## 我的错因、## 避坑提醒。',
    '',
    '科目：' + m.sub,
    '知识点：' + m.knowledge,
    '我的错因类型：' + m.err,
    m.source ? '题目来源：' + m.source : '',
    m.note ? '我自己的记录：' + m.note : '',
    ''
  ].join('\n');
  if (imgs && imgs.length) {
    const content = [{ type: 'text', text: user }];
    imgs.slice(0, 2).forEach(u => content.push({ type: 'image_url', image_url: { url: u } }));
    return [
      { role: 'system', content: '你是资深公考培训讲师，讲解要精炼、直击要害，控制在 400 字以内。图片是题目原题，请结合原题解析。' },
      { role: 'user', content }
    ];
  }
  return [
    { role: 'system', content: '你是资深公考培训讲师，讲解要精炼、直击要害，控制在 400 字以内。' },
    { role: 'user', content: user }
  ];
}

/* 错题模式画像：全部错题打包 → 共性错误聚类 + 薄弱定位 + 训练清单 */
export function mistakeProfileMessages(mistakes) {
  const lines = ['请基于以下错题记录做错误模式分析，输出 Markdown，必须包含：## 错误模式聚类、## 薄弱环节定位、## 下周针对性训练清单。'];
  lines.push('');
  if (!mistakes || !mistakes.length) {
    lines.push('（暂无错题记录，请提示先在错题本录入错题）');
  } else {
    const bySub = {}, byErr = {};
    mistakes.forEach(m => {
      if (m.sub) bySub[m.sub] = (bySub[m.sub] || 0) + 1;
      if (m.err) byErr[m.err] = (byErr[m.err] || 0) + 1;
    });
    lines.push('【错题分布】');
    lines.push('- 按科目：' + Object.entries(bySub).map(([k, v]) => k + ' ' + v + '条').join('、'));
    lines.push('- 按错因：' + Object.entries(byErr).map(([k, v]) => k + ' ' + v + '条').join('、'));
    lines.push('');
    lines.push('【错题明细】（最近 60 条）');
    mistakes.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60).forEach((m, i) => {
      const st = m.state === 'done' ? '已掌握' : m.state === 'redo' ? '已重做' : '待重做';
      lines.push((i + 1) + '. [' + m.sub + '｜' + m.err + '｜' + st + '] ' + m.knowledge + (m.note ? '——' + String(m.note).slice(0, 50) : ''));
    });
  }
  lines.push('');
  lines.push('要求：聚类要指出共性根因（如公式混淆、规则记反、审题偏差、时间不够），训练清单具体到每天做什么，不超过 5 条。');
  return [
    { role: 'system', content: '你是公考教研专家，擅长从错题数据里找错误规律，分析要狠、准、可执行，600 字以内。' },
    { role: 'user', content: lines.join('\n') }
  ];
}

/* 变式题举一反三：基于错题考点原创 2 道变式题（含参考答案） */
export function variantMessages(m) {
  const user = [
    '基于下面这道错题的考点，原创 2 道变式题（不要照抄原题），每道题包含：题目、参考答案、一句话考点提示。',
    '输出 Markdown，格式：',
    '## 变式题 1（题目 / 参考答案 / 考点提示）',
    '## 变式题 2（题目 / 参考答案 / 考点提示）',
    '',
    '科目：' + m.sub,
    '知识点：' + m.knowledge,
    '我的错因类型：' + m.err,
    m.source ? '题目来源：' + m.source : '',
    m.note ? '我自己的记录：' + m.note : ''
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: '你是公考命题人，出的变式题要贴合江苏省考 B 类难度，答案准确、表述清晰。' },
    { role: 'user', content: user }
  ];
}

/* 真题变式题（结构化入库）：基于一道真题，产出可解析 JSON 的变式题，
   存入真题库并继续「未做→做错→做对」循环追踪 */
export function bankVariantMessages(q) {
  const isSubjective = q.type === '主观题';
  const user = [
    '基于下面这道真题的考点，原创 2 道变式题（不要照抄原题），只输出一个 JSON 数组，不要任何多余文字或 Markdown 代码块。',
    '每道题结构：' + (isSubjective
      ? '{"stem":"题干","options":[],"answer":"参考答案要点","analysis":"解析","knowledge":"考点"}'
      : '{"stem":"题干","options":["选项A","选项B","选项C","选项D"],"answer":"正确选项字母如B","analysis":"解析","knowledge":"考点"}'),
    '',
    '科目：' + q.sub,
    '题型：' + q.type,
    '知识点：' + (q.knowledge || ''),
    '原题：' + q.stem,
    q.options && q.options.length ? '原题选项：' + q.options.join(' / ') + '；答案：' + q.answer : '',
    '',
    '要求：难度贴近江苏 B 类；答案必须准确；直接输出 JSON 数组，形如 [{...},{...}]。'
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: '你是公考命题人，只输出合法 JSON 数组，不要 Markdown 围栏、不要解释。' },
    { role: 'user', content: user }
  ];
}

export function examAnalysisMessages(exams, mistakes) {
  const lines = ['请基于以下备考数据给出提分分析，输出 Markdown，包含：## 强弱项诊断、## 与目标差距、## 未来两周训练重点、## 选岗参考。'];
  lines.push('');
  lines.push('目标：总分 145（行测 70 / 申论 75），B 类合格线总分 105、行测 50。');
  if (exams && exams.length) {
    lines.push('【模考记录】');
    exams.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach(e => {
      lines.push('- ' + e.date + ' ' + (e.name || '模考') + '：总分 ' + e.total + '（行测 ' + e.xingce + ' / 申论 ' + e.shenlun + '）');
      if (e.m) {
        const parts = Object.entries(e.m).filter(([, v]) => v != null).map(([k, v]) => {
          const map = { ziliao: '资料', panduan: '判断', yanyu: '言语', shuliang: '数量', changshi: '常识' };
          return (map[k] || k) + v + '%';
        });
        lines.push('  - 行测模块：' + parts.join('、'));
      }
      if (e.s) {
        const parts = Object.entries(e.s).filter(([, v]) => v != null).map(([k, v]) => {
          const map = { gaikuo: '概括', duice: '对策', yingyong: '应用文', dazuo: '大作文' };
          return (map[k] || k) + v + '分';
        });
        lines.push('  - 申论各题：' + parts.join('、'));
      }
    });
  } else {
    lines.push('【模考记录】暂无，建议尽快做一次真题摸底。');
  }
  if (mistakes && mistakes.length) {
    const bySub = {};
    mistakes.forEach(m => { bySub[m.sub] = (bySub[m.sub] || 0) + 1; });
    lines.push('【错题分布】' + Object.entries(bySub).map(([k, v]) => k + ' ' + v + ' 条').join('、'));
  }
  return [
    { role: 'system', content: '你是江苏省考备考规划师，分析要基于数据、给出可执行结论，600 字以内。' },
    { role: 'user', content: lines.join('\n') }
  ];
}

/* ------- 轻量 Markdown 渲染（安全转义 + 标题/列表/加粗） ------- */

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mdToHtml(md) {
  if (!md) return '';
  const lines = String(md).split('\n');
  const out = [];
  let listType = null; // 'ul' | 'ol' | null
  function closeList() {
    if (listType) { out.push('</' + listType + '>'); listType = null; }
  }
  for (let raw of lines) {
    const line = raw.trimEnd();
    const inline = esc(line)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
    if (/^###\s+/.test(line)) { closeList(); out.push('<h4>' + inline.replace(/^###\s+/, '') + '</h4>'); }
    else if (/^##\s+/.test(line)) { closeList(); out.push('<h3>' + inline.replace(/^##\s+/, '') + '</h3>'); }
    else if (/^#\s+/.test(line)) { closeList(); out.push('<h2>' + inline.replace(/^#\s+/, '') + '</h2>'); }
    else if (/^\s*[-*]\s+/.test(line)) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push('<li>' + inline.replace(/^\s*[-*]\s+/, '') + '</li>');
    }
    else if (/^\s*\d+[.、)]\s+/.test(line)) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push('<li>' + inline.replace(/^\s*\d+[.、)]\s+/, '') + '</li>');
    }
    else if (line.trim() === '') { closeList(); out.push('<div class="md-gap"></div>'); }
    else { closeList(); out.push('<p>' + inline + '</p>'); }
  }
  closeList();
  return out.join('\n');
}

/* ============================================================
 * AI 解析写回错题笔记（幂等）
 * 背景：此前每次点「存入错题笔记」都在原 note 后追加一段，
 *       重复点击会堆出多份雷同解析。现按标记定位，已存在则整段替换。
 * ============================================================ */
export const AI_NOTE_TAG = '【AI 解析】';

export function withAiNote(oldNote, aiText) {
  const body = AI_NOTE_TAG + String(aiText || '').trim();
  const src = String(oldNote || '');
  const at = src.indexOf(AI_NOTE_TAG);
  if (at === -1) return (src.replace(/\s+$/, '') ? src.replace(/\s+$/, '') + '\n\n' : '') + body;
  return src.slice(0, at).replace(/\s+$/, '') + '\n\n' + body;
}

/* 笔记中是否已有 AI 解析（用于按钮文案与重复提示） */
export function hasAiNote(note) {
  return String(note || '').indexOf(AI_NOTE_TAG) !== -1;
}
