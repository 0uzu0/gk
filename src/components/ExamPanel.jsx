import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { examTrend, GOAL, MODULES, SHENLUN_PARTS, SUB_OPTIONS, ERR_OPTIONS } from '../lib/stats.js';
import { todayStr, fmtMD, reviewWeekLabel } from '../lib/dates.js';
import { uid } from '../lib/id.js';
import { actions } from '../store/useAppState.js';
import { useToast } from './Toast.jsx';

/* SVG 手绘趋势折线 */
function TrendChart({ exams }) {
  const data = examTrend(exams);
  if (data.length < 2) {
    return <div className="trend-note">至少记录 2 次模考后自动生成总分趋势线 📈</div>;
  }
  const W = 640, H = 150, PAD = 26;
  const vals = data.map(e => e.total);
  const min = Math.min(...vals, GOAL.line) - 5;
  const max = Math.max(...vals, GOAL.total) + 5;
  const span = max - min || 1;
  const pts = data.map((e, i) => {
    const x = PAD + i * (W - PAD * 2) / Math.max(1, data.length - 1);
    const y = H - PAD - (e.total - min) / span * (H - PAD * 2);
    return { x, y, e };
  });
  const line = pts.map(p => `${p.x},${p.y}`).join(' ');
  const goalY = H - PAD - (GOAL.total - min) / span * (H - PAD * 2);
  const lineY = H - PAD - (GOAL.line - min) / span * (H - PAD * 2);
  const baseY = H - PAD;
  const area = `${PAD},${baseY} ` + pts.map(p => `${p.x},${p.y}`).join(' ') + ` ${W - PAD},${baseY}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="trend" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={PAD} y1={goalY} x2={W - PAD} y2={goalY} stroke="#7c3aed" strokeWidth="1.4" strokeDasharray="5 4" />
      <text x={W - PAD} y={goalY - 5} fontSize="10" fill="#7c3aed" textAnchor="end" fontWeight="600">目标 145</text>
      <line x1={PAD} y1={lineY} x2={W - PAD} y2={lineY} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 4" />
      <text x={W - PAD} y={lineY + 13} fontSize="10" fill="#94a3b8" textAnchor="end">B类线 105</text>
      <polygon points={area} fill="url(#trendFill)" />
      <polyline points={line} fill="none" stroke="#2563eb" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4.5" fill="#fff" stroke="#2563eb" strokeWidth="2" />
          <text x={p.x} y={p.y - 10} fontSize="10.5" fill="#1e293b" textAnchor="middle" fontWeight="700">{p.e.total}</text>
          <text x={p.x} y={H - 6} fontSize="9.5" fill="#94a3b8" textAnchor="middle">{fmtMD(p.e.date)}</text>
        </g>
      ))}
    </svg>
  );
}

/* 添加/编辑模考弹窗 */
function ExamModal({ open, onClose, onSave, initial }) {
  const d = initial || {};
  const [form, setForm] = useState({
    date: d.date || todayStr(),
    name: d.name || '',
    xingce: d.xingce ?? '',
    shenlun: d.shenlun ?? '',
    m: { ...(d.m || {}) },
    s: { ...(d.s || {}) }
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setM = (k, v) => setForm(f => ({ ...f, m: { ...f.m, [k]: v === '' ? null : Number(v) } }));
  const setS = (k, v) => setForm(f => ({ ...f, s: { ...f.s, [k]: v === '' ? null : Number(v) } }));

  const submit = () => {
    const xingce = Number(form.xingce);
    const shenlun = Number(form.shenlun);
    if (!form.name.trim()) { alert('请填写模考名称'); return; }
    if (!(xingce >= 0) || !(shenlun >= 0)) { alert('请填写行测和申论分数'); return; }
    onSave({
      id: d.id,
      date: form.date,
      name: form.name.trim(),
      xingce, shenlun,
      total: xingce + shenlun,
      m: form.m,
      s: form.s,
      demo: !!d.demo
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={d.id ? '编辑模考' : '录入模考'} icon="📝" wide
      footer={<>
        <button className="btn ghost" onClick={onClose}>取消</button>
        <button className="btn" onClick={submit}>保存</button>
      </>}>
      <div className="form-row">
        <div><label>日期</label><input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
        <div><label>模考名称</label><input value={form.name} placeholder="如：2025江苏B类真题" onChange={e => set('name', e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div><label>行测分（满分100）</label><input type="number" min="0" max="100" value={form.xingce} onChange={e => set('xingce', e.target.value)} /></div>
        <div><label>申论分（满分100）</label><input type="number" min="0" max="100" value={form.shenlun} onChange={e => set('shenlun', e.target.value)} /></div>
      </div>
      <label>行测模块正确率（%）</label>
      <div className="form-row three">
        {MODULES.map(mo => (
          <div key={mo.key}><label style={{ marginTop: 6 }}>{mo.label}</label>
            <input type="number" min="0" max="100" value={form.m[mo.key] ?? ''} placeholder={mo.target + '%目标'} onChange={e => setM(mo.key, e.target.value)} /></div>
        ))}
      </div>
      <label>申论各题得分</label>
      <div className="form-row">
        {SHENLUN_PARTS.map(p => (
          <div key={p.key}><label style={{ marginTop: 6 }}>{p.label}（{p.max}分）</label>
            <input type="number" min="0" max={p.max} value={form.s[p.key] ?? ''} onChange={e => setS(p.key, e.target.value)} /></div>
        ))}
      </div>
    </Modal>
  );
}

export default function ExamPanel({ state, dispatch }) {
  const toast = useToast();
  const [modal, setModal] = useState(null); // null | {edit: exam|null}
  const exams = examTrend(state.exams).slice().reverse(); // 最新在前
  /* 周复盘排序：此前按 id 字符串排序，而 id 是 rv_+随机串，顺序实为随机。
     改为「日期倒序 → 周标签倒序 → id 倒序」，老数据无 date 时也能稳定排序。 */
  const reviews = state.reviews.slice().sort((a, b) => {
    const da = String(a.date || ''), db = String(b.date || '');
    if (da !== db) return da < db ? 1 : -1;
    const wa = String(a.week || ''), wb = String(b.week || '');
    if (wa !== wb) return wa < wb ? 1 : -1;
    return String(a.id) < String(b.id) ? 1 : -1;
  });

  const [reviewOpen, setReviewOpen] = useState(false);
  const [rev, setRev] = useState({ done: '', rate: '', focus: '' });

  const saveExam = (exam) => {
    if (exam.id) dispatch({ type: 'UPDATE_EXAM', id: exam.id, patch: exam });
    else dispatch({ type: 'ADD_EXAM', exam: { ...exam, id: uid('ex') } });
    setModal(null);
    toast('模考已保存');
  };

  const submitReview = () => {
    if (!rev.done.trim()) { toast('请填写本周完成情况'); return; }
    dispatch(actions.addReview({
      id: uid('rv'),
      date: todayStr(),
      week: reviewWeekLabel(todayStr()),
      done: rev.done.trim(),
      rate: Number(rev.rate) || 0,
      focus: rev.focus.trim()
    }));
    setReviewOpen(false);
    setRev({ done: '', rate: '', focus: '' });
    toast('周复盘已存档');
  };

  return (
    <div>
      <div className="card">
        <div className="today-head">
          <div className="d">📝 模考复盘</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost sm" onClick={() => setReviewOpen(true)}>＋ 写周复盘</button>
            <button className="btn sm" onClick={() => setModal({ edit: null })}>＋ 录入模考</button>
          </div>
        </div>
        <TrendChart exams={state.exams} />
      </div>

      <div className="card">
        <div className="card-title"><span className="ic">📊</span>模考记录（{exams.length}）</div>
        {exams.length ? (
          <table className="tbl">
            <thead>
              <tr><th>日期</th><th>名称</th><th>行测</th><th>申论</th><th>总分</th><th>距145</th><th></th></tr>
            </thead>
            <tbody>
              {exams.map(e => (
                <tr key={e.id}>
                  <td className="num">{fmtMD(e.date)}</td>
                  <td>{e.name}</td>
                  <td className="num">{e.xingce}</td>
                  <td className="num">{e.shenlun}</td>
                  <td><b className="num">{e.total}</b></td>
                  <td className="num"><span className={e.total >= GOAL.total ? 'up' : 'down'}>{e.total >= GOAL.total ? '达标' : '+' + (GOAL.total - e.total)}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="mini-btn" onClick={() => setModal({ edit: e })}>编辑</button>{' '}
                    <button className="mini-btn danger" onClick={() => { if (confirm('删除这条模考记录？')) dispatch(actions.deleteExam(e.id)); }}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty-tip">还没有模考记录。9/1-9/6 摸底周做一套 2025 江苏 B 类真题，录进来建立基线。</div>}
      </div>

      <div className="card">
        <div className="card-title"><span className="ic">🗒️</span>周复盘存档（{reviews.length}）</div>
        {reviews.length ? (
          reviews.map(r => (
            <div key={r.id} className="mk-card">
              <div className="mk-head">
                <span className="tag">{r.week}</span>
                <span className="num" style={{ fontSize: 12, color: 'var(--sub)' }}>打卡率 {r.rate}%</span>
                <button className="mini-btn danger" onClick={() => dispatch(actions.deleteReview(r.id))}>✕</button>
              </div>
              <div className="mk-detail">✅ {r.done}</div>
              {r.focus && <div className="mk-detail">🎯 下周重点：{r.focus}</div>}
            </div>
          ))
        ) : <div className="empty-tip">每周日写一次周复盘，把完成情况和下周重点记下来。</div>}
      </div>

      {modal && <ExamModal open onClose={() => setModal(null)} onSave={saveExam} initial={modal.edit} />}

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="写周复盘" icon="🗒️"
        footer={<>
          <button className="btn ghost" onClick={() => setReviewOpen(false)}>取消</button>
          <button className="btn" onClick={submitReview}>保存</button>
        </>}>
        <label>本周完成情况（如：完成3套行测、2篇大作文）</label>
        <textarea rows="3" value={rev.done} onChange={e => setRev({ ...rev, done: e.target.value })} placeholder="把打卡完成的事写清楚，周末复盘时回顾" />
        <div className="form-row">
          <div><label>本周打卡率（%）</label><input type="number" min="0" max="100" value={rev.rate} onChange={e => setRev({ ...rev, rate: e.target.value })} /></div>
          <div><label>下周重点</label><input value={rev.focus} placeholder="如：资料分析提速" onChange={e => setRev({ ...rev, focus: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}
