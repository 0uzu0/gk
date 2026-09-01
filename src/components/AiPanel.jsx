import { useEffect, useRef, useState } from 'react';
import { getAiConfig, saveAiConfig } from '../lib/storage.js';
import { aiChat, shenlunMessages, mistakeMessages, examAnalysisMessages, mdToHtml, AI_PROVIDERS } from '../lib/ai.js';
import { actions } from '../store/useAppState.js';
import { useToast } from './Toast.jsx';

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

  /* 模考分析 */
  const [exLoading, setExLoading] = useState(false);
  const [exResult, setExResult] = useState('');
  const [exError, setExError] = useState('');

  /* 从错题本「AI 解析」跳转预填 */
  useEffect(() => {
    if (prefill && prefill.mistake) {
      setTab('mistake');
      setMkId(prefill.mistake.id);
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

  const runMistake = async () => {
    const m = state.mistakes.find(x => x.id === mkId);
    if (!m) { toast('请选择一条错题', 'err'); return; }
    setMkLoading(true); setMkError(''); setMkResult('');
    try {
      const t = await aiChat(mistakeMessages(m), cfg);
      setMkResult(mdToHtml(t));
    } catch (e) {
      setMkError(e.message);
    } finally {
      setMkLoading(false);
    }
  };

  const saveMkResult = () => {
    if (!mkId || !mkResult) return;
    const text = mkResult.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    const m = state.mistakes.find(x => x.id === mkId);
    if (!m) return;
    const note = (m.note ? m.note + '\n\n' : '') + '【AI 解析】' + text.slice(0, 800);
    dispatch(actions.updateMistake(mkId, { note }));
    toast('AI 解析已存入错题笔记');
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
        <div className="btn-row">
          <button className="btn ghost sm" onClick={testConn} disabled={testing}>{testing ? '测试中…' : '测试连接'}</button>
          <span className="hint" style={{ alignSelf: 'center' }}>
            DeepSeek Key 在 platform.deepseek.com 申请，约 1 元/百万 token，够用很久
          </span>
        </div>
      </div>

      <div className="card">
        <div className="ai-tabs">
          <button className={'ai-tab' + (tab === 'shenlun' ? ' active' : '')} onClick={() => setTab('shenlun')}>✍️ 申论批改</button>
          <button className={'ai-tab' + (tab === 'mistake' ? ' active' : '')} onClick={() => setTab('mistake')}>📌 错题解析</button>
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
            <div className="section-sub">选一条错题，AI 生成「考点定位 / 正确思路 / 我的错因 / 避坑提醒」，可一键存回错题本。</div>
            <label>选择错题</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={mkId} onChange={e => setMkId(e.target.value)} style={{ flex: 1 }}>
                <option value="">— 请选择 —</option>
                {state.mistakes.map(m => (
                  <option key={m.id} value={m.id}>{m.sub} · {m.knowledge}</option>
                ))}
              </select>
              <button className="btn" onClick={runMistake} disabled={mkLoading}>✨ AI 解析</button>
            </div>
            <AiResult html={mkResult} loading={mkLoading} error={mkError} onRetry={runMistake} />
            {mkResult && (
              <div className="btn-row">
                <button className="btn ghost sm" onClick={saveMkResult}>💾 存入错题笔记</button>
              </div>
            )}
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
