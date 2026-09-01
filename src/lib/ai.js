/* ============================================================
 * ai.js —— AI 助手：申论批改 / 错题解析 / 模考分析
 * OpenAI 兼容 Chat Completions 接口（DeepSeek / 通义 / 自定义端点）
 * ============================================================ */

export const AI_PROVIDERS = [
  { key: 'deepseek', label: 'DeepSeek（推荐，便宜）', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { key: 'qwen',     label: '通义千问',               baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { key: 'custom',   label: '自定义（OpenAI兼容）',    baseUrl: '', model: '' }
];

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

export function mistakeMessages(m) {
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
  return [
    { role: 'system', content: '你是资深公考培训讲师，讲解要精炼、直击要害，控制在 400 字以内。' },
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
