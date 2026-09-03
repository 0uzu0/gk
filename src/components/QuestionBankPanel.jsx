import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import {
  QUESTION_TYPES, parseQuestionsText, questionStatus, STATUS_LABEL, bankStats, parseVariantJson
} from '../lib/qbank.js';
import { aiChat, bankVariantMessages } from '../lib/ai.js';
import { getAiConfig } from '../lib/storage.js';
import { SUB_OPTIONS } from '../lib/stats.js';
import { todayStr } from '../lib/dates.js';
import { uid } from '../lib/id.js';
import { actions } from '../store/useAppState.js';
import { useToast } from './Toast.jsx';

const STATUS_CLS = { new: 's-pending', wrong: 's-redo', right: 's-done' };

/* 单题录入/编辑弹窗 */
function QuestionModal({ open, onClose, onSave, initial }) {
  const toast = useToast();
  const d = initial || {};
  const [form, setForm] = useState({
    sub: d.sub || '资料分析',
    type: d.type || '单选题',
    stem: d.stem || '',
    options: d.options ? d.options.join('\n') : '',
    answer: d.answer || '',
    analysis: d.analysis || '',
    knowledge: d.knowledge || '',
    source: d.source || ''
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const isSubjective = form.type === '主观题' || form.type === '判断题';

  const submit = () => {
    if (!form.stem.trim()) { toast('请填写题干', 'err'); return; }
    if (!form.answer.trim()) { toast('请填写答案', 'err'); return; }
    const options = isSubjective ? [] : form.options.split('\n').map(s => s.trim()).filter(Boolean);
    if (!isSubjective && options.length === 0) { toast('选择题请至少填写一个选项（每行一个）', 'err'); return; }
    onSave({
      sub: form.sub,
      type: form.type,
      stem: form.stem.trim(),
      options,
      answer: form.answer.trim(),
      analysis: form.analysis.trim(),
      knowledge: form.knowledge.trim(),
      source: form.source.trim(),
      imgs: d.imgs || []
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={d.id ? '编辑真题' : '添加真题'} icon="📚" wide
      footer={<>
        <button className="btn ghost" onClick={onClose}>取消</button>
        <button className="btn" onClick={submit}>保存</button>
      </>}>
      <div className="form-row">
        <div><label>科目</label>
          <select value={form.sub} onChange={e => set('sub', e.target.value)}>
            {SUB_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div><label>题型</label>
          <select value={form.type} onChange={e => set('type', e.target.value)}>
            {QUESTION_TYPES.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <label>题干</label>
      <textarea rows="4" value={form.stem} onChange={e => set('stem', e.target.value)} placeholder="完整题目内容…" />
      {!isSubjective && (
        <>
          <label>选项（每行一个，按 A/B/C/D 顺序）</label>
          <textarea rows="4" value={form.options} onChange={e => set('options', e.target.value)} placeholder={'A. 选项一\nB. 选项二\nC. 选项三\nD. 选项四'} />
        </>
      )}
      <div className="form-row">
        <div><label>答案</label>
          <input value={form.answer} onChange={e => set('answer', e.target.value)} placeholder={isSubjective ? '参考要点 / 正确选项字母' : '如：B'} />
        </div>
        <div><label>来源（可选）</label><input value={form.source} onChange={e => set('source', e.target.value)} placeholder="如：2025江苏真题-资料第3题" /></div>
      </div>
      <label>知识点（可选）</label>
      <input value={form.knowledge} onChange={e => set('knowledge', e.target.value)} placeholder="如：基期量计算" />
      <label>解析（可选）</label>
      <textarea rows="3" value={form.analysis} onChange={e => set('analysis', e.target.value)} placeholder="答案解析与解题思路…" />
    </Modal>
  );
}

/* 批量文本导入弹窗 */
function ImportModal({ open, onClose, onImport }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null); // {questions, errors}

  const parse = () => {
    const r = parseQuestionsText(text);
    setResult(r);
    if (!r.questions.length) toast('未解析出有效题目，请检查格式', 'err');
  };

  const confirmImport = () => {
    if (!result || !result.questions.length) { toast('没有可导入的题目', 'err'); return; }
    onImport(result.questions);
    setText(''); setResult(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="批量导入真题" icon="📥" wide
      footer={<>
        <button className="btn ghost" onClick={onClose}>取消</button>
        {!result ? (
          <button className="btn" onClick={parse}>解析预览</button>
        ) : (
          <button className="btn" onClick={confirmImport}>导入 {result.questions.length} 题</button>
        )}
      </>}>
      <div className="section-sub">按格式粘贴题目，题与题之间用单独一行 <code>---</code> 分隔。每道题用【科目】【题型】【题干】【答案】【解析】【知识点】【来源】标记，选择题选项用【A】【B】【C】【D】。</div>
      <textarea rows="14" value={text} onChange={e => setText(e.target.value)} placeholder={'【科目】资料分析\n【题型】单选题\n【题干】2023年……增长率约为多少？\n【A】12.5%\n【B】13.2%\n【C】14.8%\n【D】15.6%\n【答案】B\n【解析】……\n【知识点】年均增长率\n【来源】2025江苏真题\n\n---\n\n【科目】判断推理\n……'} />
      {result && (
        <div style={{ marginTop: 8 }}>
          <div className="hint" style={{ color: 'var(--green, #059669)' }}>✓ 解析成功 {result.questions.length} 题{result.errors.length ? '，另有 ' + result.errors.length + ' 条错误被跳过' : ''}</div>
          {result.errors.length > 0 && (
            <ul className="hint" style={{ marginTop: 4, paddingLeft: 18, color: 'var(--red)' }}>
              {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function QuestionBankPanel({ state, dispatch, onStartQuiz }) {
  const toast = useToast();
  const [filterSub, setFilterSub] = useState('');
  const [filterSt, setFilterSt] = useState('');
  const [modal, setModal] = useState(null); // {editId} | 'import'
  const [variant, setVariant] = useState(null); // {q, loading, error, result}
  const stats = useMemo(() => bankStats(state.questions, state.attempts), [state.questions, state.attempts]);

  const list = useMemo(() => {
    let l = state.questions.slice();
    if (filterSub) l = l.filter(q => q.sub === filterSub);
    if (filterSt) l = l.filter(q => questionStatus(q, state.attempts) === filterSt);
    return l.sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [state.questions, state.attempts, filterSub, filterSt]);

  const save = (data) => {
    if (modal && modal.editId) {
      dispatch(actions.updateQuestion(modal.editId, data));
      toast('真题已更新');
    } else {
      dispatch(actions.addQuestions([{ id: uid('q'), date: todayStr(), ...data }]));
      toast('真题已添加');
    }
    setModal(null);
  };

  const importQ = (qs) => {
    const withMeta = qs.map(q => ({ id: uid('q'), date: todayStr(), imgs: [], ...q }));
    dispatch(actions.addQuestions(withMeta));
    toast('已导入 ' + qs.length + ' 道真题');
    setModal(null);
  };

  /* AI 变式题：基于单题考点生成结构化变式题并入库 */
  const genVariant = async (q) => {
    setVariant({ q, loading: true, error: '', result: null });
    try {
      const cfg = getAiConfig();
      const t = await aiChat(bankVariantMessages(q), cfg);
      const arr = parseVariantJson(t);
      const withMeta = arr.map(v => ({
        id: uid('q'),
        date: todayStr(),
        sub: q.sub,
        type: q.type,
        source: 'AI 变式 · 基于「' + (q.knowledge || q.stem.slice(0, 20)) + '」',
        imgs: [],
        ...v
      }));
      setVariant({ q, loading: false, error: '', result: withMeta });
    } catch (e) {
      setVariant({ q, loading: false, error: e.message, result: null });
    }
  };

  const saveVariant = () => {
    if (!variant || !variant.result) return;
    dispatch(actions.addQuestions(variant.result));
    toast('已生成 ' + variant.result.length + ' 道变式题入库');
    setVariant(null);
  };

  const nonDemo = state.questions.filter(q => !q.demo).length;

  return (
    <div>
      {/* 统计卡 */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpis">
          <div className="kpi"><div className="k">题库总数</div><div className="v">{stats.total}</div></div>
          <div className="kpi"><div className="k">已做</div><div className="v">{stats.done}</div></div>
          <div className="kpi"><div className="k">正确率</div><div className="v">{stats.rightRate == null ? '—' : stats.rightRate + '%'}</div></div>
          <div className="kpi"><div className="k">覆盖科目</div><div className="v">{Object.keys(stats.bySub).length}</div></div>
        </div>
      </div>

      <div className="card">
        <div className="today-head">
          <div>
            <div className="d">📚 真题库（{nonDemo} 题）</div>
            <div className="n">自定义上传题库 · 在线作答 · 错题自动归档</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" onClick={() => setModal('import')}>📥 批量导入</button>
            <button className="btn sm" onClick={() => setModal({ editId: null })}>＋ 添加真题</button>
            <button className="btn gold sm" onClick={() => onStartQuiz && onStartQuiz()} disabled={!nonDemo}>▶ 在线练习</button>
          </div>
        </div>

        <div className="form-row three" style={{ marginBottom: 10 }}>
          <div><select value={filterSub} onChange={e => setFilterSub(e.target.value)}>
            <option value="">全部科目</option>{SUB_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select></div>
          <div><select value={filterSt} onChange={e => setFilterSt(e.target.value)}>
            <option value="">全部状态</option>
            <option value="new">未做</option><option value="wrong">做错</option><option value="right">做对</option>
          </select></div>
        </div>

        {list.length ? list.map(q => (
          <QCard key={q.id} q={q} status={questionStatus(q, state.attempts)}
            onEdit={() => setModal({ editId: q.id })}
            onDelete={() => { if (confirm('删除这道真题？')) { dispatch(actions.deleteQuestion(q.id)); toast('已删除'); } }}
            onVariant={() => genVariant(q)} />
        )) : (
          <div className="empty-tip">
            {state.questions.length ? '当前筛选条件下没有真题' : '题库为空。点右上「添加真题」或「批量导入」，把你收集的真题、模拟题放进来自测。'}
          </div>
        )}
      </div>

      {modal === 'import'
        ? <ImportModal open onClose={() => setModal(null)} onImport={importQ} />
        : modal
          ? <QuestionModal open onClose={() => setModal(null)} onSave={save}
              initial={modal.editId ? state.questions.find(q => q.id === modal.editId) : null} />
          : null}

      {variant && (
        <Modal open onClose={() => setVariant(null)} title="AI 变式题" icon="🎯" wide
          footer={variant.result && (
            <>
              <button className="btn ghost" onClick={() => setVariant(null)}>取消</button>
              <button className="btn" onClick={saveVariant}>存入真题库（{variant.result.length} 题）</button>
            </>
          )}>
          {variant.loading && <div className="loading"><span className="spin" />AI 正在基于「{variant.q.knowledge || variant.q.stem.slice(0, 20)}」出变式题…</div>}
          {variant.error && <p style={{ color: 'var(--red)' }}>⚠️ {variant.error}</p>}
          {variant.result && variant.result.map((v, i) => (
            <div key={i} className="quiz-review" style={{ borderLeft: '3px solid var(--primary)' }}>
              <div className="r-stem"><b>{i + 1}.</b> {v.stem}</div>
              {v.options && v.options.length > 0 && (
                <div className="mk-detail" style={{ lineHeight: 1.7 }}>
                  {v.options.map((o, j) => <div key={j}><b>{String.fromCharCode(65 + j)}.</b> {o}</div>)}
                </div>
              )}
              <div className="mk-detail">✅ 答案：{v.answer}</div>
              {v.analysis && <div className="mk-detail">💡 {v.analysis}</div>}
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}

function QCard({ q, status, onEdit, onDelete, onVariant }) {
  const stCls = STATUS_CLS[status] || 's-pending';
  return (
    <div className="mk-card">
      <div className="mk-head">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="tag">{q.sub}</span>
          <span className="tag" style={{ background: '#eef2ff', color: '#4f46e5' }}>{q.type}</span>
          {q.demo && <span className="state-chip">示例</span>}
          <span className={'state-chip ' + stCls}>{STATUS_LABEL[status]}</span>
        </div>
      </div>
      <div className="mk-title">{q.stem}</div>
      {q.options && q.options.length > 0 && (
        <div className="mk-detail" style={{ lineHeight: 1.7 }}>
          {q.options.map((o, i) => (
            <div key={i}><b>{String.fromCharCode(65 + i)}.</b> {o}</div>
          ))}
        </div>
      )}
      <div className="mk-detail">✅ 答案：{q.answer}</div>
      {q.knowledge && <div className="mk-detail">🏷 知识点：{q.knowledge}</div>}
      {q.source && <div className="mk-detail">📌 来源：{q.source}</div>}
      {q.analysis && <div className="mk-detail">💡 <b>解析：</b>{q.analysis}</div>}
      <div className="mk-ops">
        <button className="mini-btn" style={{ color: 'var(--primary)', borderColor: '#d8caf5' }} onClick={onVariant}>🎯 AI 变式题</button>
        <button className="mini-btn" onClick={onEdit}>编辑</button>
        <button className="mini-btn danger" onClick={onDelete}>删除</button>
      </div>
    </div>
  );
}
