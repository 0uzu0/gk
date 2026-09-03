import { useEffect, useRef, useState } from 'react';
import { getAiConfig, saveAiConfig } from '../lib/storage.js';
import {
  aiChat, shenlunMessages, mistakeMessages, mistakeProfileMessages, variantMessages,
  examAnalysisMessages, mdToHtml, AI_PROVIDERS, providerSupportsVision,
  withAiNote, hasAiNote
} from '../lib/ai.js';
import { imgStore } from '../lib/imgstore.js';
import { todayStr } from '../lib/dates.js';
import { ERR_OPTIONS } from '../lib/stats.js';
import { uid } from '../lib/id.js';
import { actions } from '../store/useAppState.js';
import { useToast } from './Toast.jsx';

/* AI 返回的 HTML 还原成纯文本（存回错题笔记用） */
function htmlToText(h) {
  return String(h || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .trim();
}

function AiResult({ html, loading, error, onRetry }) {
  if (loading) return <div className="loading"><span className="spin" />AI 正在思考，通常需要 10-30 秒…</div>;
  if (error) return (
    <div className="ai-result" style={{ borderColor: '#f3b3b3', background: '#fffafa' }}>
      <p style={{ color: 'var(--red)' }}>⚠️ {error}</p>
      {onRetry && <div className="btn-row"><button className="btn ghost sm" onClick={onRetry}>重试</button></div>}
    </div>
  );
  if (!html) return null;
  return <div className="ai-result" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function AiPanel({ state, dispatch, prefill, clearPrefill }) {
  const toast = useToast();
  const [cfg, setCfg] = useState(getAiConfig());
  const [tab, setTab] = useState('shenlun');
  const [testing, setTesting] = useState(false);

  /* 申论批改表单 */
  const [slType, setSlType] = useState('大作文（策论文）');
  const [slScore, setSlScore] = useState(40);
  const [slReq, setSlReq] = useState('');
  const [slAns, setSlAns] = useState('');
  const [slLoading, setSlLoading] = useState(false);
  const [slResult, setSlResult] = useState('');
  const [slError, setSlError] = useState('');

  /* 错题解析 */
  const [mkId, setMkId] = useState('');
  const [mkLoading, setMkLoading] = useState(false);
  const [mkResult, setMkResult] = useState('');
  const [mkError, setMkError] = useState('');

  /* 错题画像 */
  const [pfLoading, setPfLoading] = useState(false);
  const [pfResult, setPfResult] = useState('');
  const [pfError, setPfError] = useState('');

  /* 变式题（举一反三） */
  const [vrLoading, setVrLoading] = useState(false);
  const [vrResult, setVrResult] = useState('');
  const [vrError, setVrError] = useState('');

  /* 模考分析 */
  const [exLoading, setExLoading] = useState(false);
  const [exResult, setExResult] = useState('');
  const [exError, setExError] = useState('');

  /* 从错题本跳转预填：单条解析 / 全本画像 */
  useEffect(() => {
    if (prefill && prefill.mistake) {
      setTab('mistake');
      setMkId(prefill.mistake.id);
      clearPrefill();
    } else if (prefill && prefill.profile) {
      setTab('profile');
      clearPrefill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const saveCfg = (patch) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveAiConfig(next);
  };

  const testConn = async () => {
    setTesting(true);
    try {
      const t = await aiChat([{ role: 'user', content: '回复两个字：正常' }], cfg);
      toast('连接成功：' + (t || '').slice(0, 20));
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setTesting(false);
    }
  };

  const runShenlun = async () => {
    if (!slAns.trim()) { toast('请先粘贴你的作答', 'err'); return; }
    setSlLoading(true); setSlError(''); setSlResult('');
    try {
      const t = await aiChat(shenlunMessages(slType, slScore, slReq, slAns), cfg);
      setSlResult(mdToHtml(t));
    } catch (e) {
      setSlError(e.message);
    } finally {
      setSlLoading(false);
    }
  };

  const selectedMk = state.mistakes.find(x => x.id === mkId) || null;
  const canVision = providerSupportsVision(cfg);

  /* 错题解析：服务商支持视觉且错题带图 → 图片一起发给 AI */
  const runMistake = async () => {
    const m = selectedMk;
    if (!m) { toast('请选择一条错题', 'err'); return; }
    setMkLoading(true); setMkError(''); setMkResult('');
    try {
      let imgs = null;
      if (m.imgs && m.imgs.length && canVision) {
        const map = await imgStore.getMany(m.imgs);
        imgs = m.imgs.map(k => map[k]).filter(Boolean);
      }
      const t = await aiChat(mistakeMessages(m, imgs), cfg);
      setMkResult(mdToHtml(t));
    } catch (e) {
      setMkError(e.message);
    } finally {
      setMkLoading(false);
    }
  };

  /* 幂等写入：已有 AI 解析则整段替换，避免重复点击堆出多份雷同内容 */
  const saveMkResult = () => {
    if (!mkId || !mkResult) return;
    const m = state.mistakes.find(x => x.id === mkId);
    if (!m) return;
    const note = withAiNote(m.note, htmlToText(mkResult).slice(0, 800));
    if (note === m.note) { toast('该解析已存入，未重复写入'); return; }
    dispatch(actions.updateMistake(mkId, { note }));
    toast(hasAiNote(m.note) ? 'AI 解析已更新' : 'AI 解析已存入错题笔记');
  };

  /* 变式题：同一考点原创 2 道，做完存回错题本继续追踪 */
  const runVariant = async () => {
    const m = selectedMk;
    if (!m) { toast('请先选择一条错题', 'err'); return; }
    setVrLoading(true); setVrError(''); setVrResult('');
    try {
      const t = await aiChat(variantMessages(m), cfg);
      setVrResult(mdToHtml(t));
    } catch (e) {
      setVrError(e.message);
    } finally {
      setVrLoading(false);
    }
  };

  const saveVariant = () => {
    const m = selectedMk;
    if (!m || !vrResult) return;
    const text = htmlToText(vrResult).slice(0, 1500);
    const source = 'AI 变式题 · 基于「' + (m.knowledge || '') + '」';
    /* 同一份内容重复点「存入」不产生副本 */
    if (state.mistakes.some(x => x.source === source && x.note === text)) {
      toast('这组变式题已存过，未重复添加'); return;
    }
    /* err 必须落在 ERR_OPTIONS 内，否则错题本按错因筛不出来；沿用原错题错因，缺失则取首项 */
    const err = ERR_OPTIONS.includes(m.err) ? m.err : ERR_OPTIONS[0];
    dispatch(actions.addMistake({
      id: uid('mk'),
      date: todayStr(),
      sub: m.sub,
      err,
      source,
      knowledge: '【变式】' + (m.knowledge || ''),
      note: text,
      state: 'pending',
      imgs: []
    }));
    toast('变式题已存入错题本，做完记得标记已重做');
  };

  /* 错题画像：全本错题打包找共性规律 */
  const runProfile = async () => {
    setPfLoading(true); setPfError(''); setPfResult('');
    try {
      const t = await aiChat(mistakeProfileMessages(state.mistakes), cfg);
      setPfResult(mdToHtml(t));
    } catch (e) {
      setPfError(e.message);
    } finally {
      setPfLoading(false);
    }
  };

  const runExam = async () => {
    setExLoading(true); setExError(''); setExResult('');
    try {
      const t = await aiChat(examAnalysisMessages(state.exams, state.mistakes), cfg);
      setExResult(mdToHtml(t));
    } catch (e) {
      setExError(e.message);
    } finally {
      setExLoading(false);
    }
  };

  return (
    <div>
      <div className="card ai-settings" style={{ marginBottom: 14 }}>
        <div className="card-title"><span className="ic">⚙️</span>AI 设置（数据仅存本机）</div>
        <div className="form-row">
          <div>
            <label>服务商</label>
            <select value={cfg.provider} onChange={e => { const p = AI_PROVIDERS.find(x => x.key === e.target.value); saveCfg({ provider: e.target.value, baseUrl: p.baseUrl, model: p.model }); }}>
              {AI_PROVIDERS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div><label>API Key</label>
            <input type="password" value={cfg.apiKey} placeholder="sk-..." onChange={e => saveCfg({ apiKey: e.target.value })} />
          </div>
        </div>
        {cfg.provider === 'custom' && (
          <div className="form-row">
            <div><label>接口地址（OpenAI 兼容）</label><input value={cfg.baseUrl} placeholder="https://api.xxx.com/v1" onChange={e => saveCfg({ baseUrl: e.target.value })} /></div>
            <div><label>模型名</label><input value={cfg.model} placeholder="gpt-4o-mini" onChange={e => saveCfg({ model: e.target.value })} /></div>
          </div>
        )}
        {cfg.provider === 'custom' && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--sub)', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!cfg.vision} onChange={e => saveCfg({ vision: e.target.checked })} />
            该模型支持看图（多模态视觉模型，如 gpt-4o / qwen-vl / GLM-4V，勾选后错题解析会带原题图片）
          </label>
        )}
        <div className="btn-row">
          <button className="btn ghost sm" onClick={testConn} disabled={testing}>{testing ? '测试中…' : '测试连接'}</button>
          <span className="hint" style={{ alignSelf: 'center' }}>
            {canVision ? '📷 当前服务商支持看图，错题图片会一起发给 AI' : '纯文字服务商；需要看图解析请选「通义千问 VL」或自定义视觉模型'}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="ai-tabs">
          <button className={'ai-tab' + (tab === 'shenlun' ? ' active' : '')} onClick={() => setTab('shenlun')}>✍️ 申论批改</button>
          <button className={'ai-tab' + (tab === 'mistake' ? ' active' : '')} onClick={() => setTab('mistake')}>📌 错题解析</button>
          <button className={'ai-tab' + (tab === 'profile' ? ' active' : '')} onClick={() => setTab('profile')}>🔍 错题画像</button>
          <button className={'ai-tab' + (tab === 'exam' ? ' active' : '')} onClick={() => setTab('exam')}>📊 模考分析</button>
        </div>

        {tab === 'shenlun' && (
          <div>
            <div className="section-sub">把题目要求和你的作答粘进来，AI 按 B 类申论评分标准给出：总分评定 / 分项点评 / 主要问题 / 修改建议 / 示范改写。</div>
            <div className="form-row">
              <div>
                <label>题型</label>
                <select value={slType} onChange={e => setSlType(e.target.value)}>
                  <option>大作文（策论文）</option><option>大作文（议论文）</option>
                  <option>归纳概括</option><option>提出对策</option><option>应用文（公文写作）</option>
                </select>
              </div>
              <div><label>满分</label><input type="number" min="1" max="100" value={slScore} onChange={e => setSlScore(Number(e.target.value))} /></div>
            </div>
            <label>题目要求（可粘贴材料要点）</label>
            <textarea rows="4" value={slReq} onChange={e => setSlReq(e.target.value)} placeholder="粘贴题目要求…（留空则按通用标准）" />
            <label>我的作答</label>
            <textarea rows="9" value={slAns} onChange={e => setSlAns(e.target.value)} placeholder="把你的作文/答案完整粘贴进来，越完整批改越准" />
            <div className="btn-row">
              <button className="btn" onClick={runShenlun} disabled={slLoading}>✨ 开始批改</button>
            </div>
            <AiResult html={slResult} loading={slLoading} error={slError} onRetry={runShenlun} />
          </div>
        )}

        {tab === 'mistake' && (
          <div>
            <div className="section-sub">选一条错题，AI 生成「考点定位 / 正确思路 / 我的错因 / 避坑提醒」，可一键存回错题本；还能基于同一考点原创变式题，检验是否真正掌握。</div>
            <label>选择错题</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={mkId} onChange={e => { setMkId(e.target.value); setVrResult(''); setVrError(''); }} style={{ flex: 1 }}>
                <option value="">— 请选择 —</option>
                {state.mistakes.map(m => (
                  <option key={m.id} value={m.id}>{m.sub} · {m.knowledge}</option>
                ))}
              </select>
              <button className="btn" onClick={runMistake} disabled={mkLoading}>✨ AI 解析</button>
            </div>
            {selectedMk && selectedMk.imgs && selectedMk.imgs.length > 0 && (
              <div className="hint" style={{ marginTop: 8 }}>
                {canVision
                  ? '📷 该错题有 ' + selectedMk.imgs.length + ' 张图片，解析时会带前 2 张原题一起发给 AI'
                  : '⚠️ 该错题有图片，但当前服务商不支持看图，将仅按文字信息解析。想看图请切换「通义千问 VL」，或在自定义服务商里勾选视觉模型。'}
              </div>
            )}
            <AiResult html={mkResult} loading={mkLoading} error={mkError} onRetry={runMistake} />
            {mkResult && (
              <div className="btn-row">
                <button className="btn ghost sm" onClick={saveMkResult}>💾 存入错题笔记</button>
              </div>
            )}

            {selectedMk && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--line, #e5e7eb)' }}>
                <div className="section-sub">🎯 举一反三：让 AI 基于这道错题的考点原创 2 道变式题（含参考答案），做完自动进入你的错题追踪。</div>
                <div className="btn-row">
                  <button className="btn ghost" onClick={runVariant} disabled={vrLoading}>🎯 生成变式题</button>
                </div>
                <AiResult html={vrResult} loading={vrLoading} error={vrError} onRetry={runVariant} />
                {vrResult && (
                  <div className="btn-row">
                    <button className="btn ghost sm" onClick={saveVariant}>💾 变式题存入错题本</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'profile' && (
          <div>
            <div className="section-sub">汇总全部错题（{state.mistakes.length} 条），AI 从错题数据里找共性规律，输出「错误模式聚类 / 薄弱环节定位 / 下周针对性训练清单」。</div>
            <div className="btn-row">
              <button className="btn" onClick={runProfile} disabled={pfLoading}>✨ 生成错题画像</button>
              {!state.mistakes.length && <span className="hint" style={{ alignSelf: 'center' }}>还没有错题记录，先去错题本录入几条</span>}
            </div>
            <AiResult html={pfResult} loading={pfLoading} error={pfError} onRetry={runProfile} />
          </div>
        )}

        {tab === 'exam' && (
          <div>
            <div className="section-sub">基于你的模考记录 + 错题分布，AI 输出「强弱项诊断 / 与 145 的差距 / 未来两周训练重点 / 选岗参考」。</div>
            <div className="btn-row">
              <button className="btn" onClick={runExam} disabled={exLoading}>📊 一键分析</button>
              {!state.exams.length && <span className="hint" style={{ alignSelf: 'center' }}>还没有模考记录，分析会基于示例数据</span>}
            </div>
            <AiResult html={exResult} loading={exLoading} error={exError} onRetry={runExam} />
          </div>
        )}
      </div>
    </div>
  );
}
