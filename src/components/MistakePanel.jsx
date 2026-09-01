import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Lightbox from './Lightbox.jsx';
import { SUB_OPTIONS, ERR_OPTIONS, MISTAKE_STATES } from '../lib/stats.js';
import { imgStore, compressImageFile } from '../lib/imgstore.js';
import { todayStr, fmtMD } from '../lib/dates.js';
import { actions } from '../store/useAppState.js';
import { useToast } from './Toast.jsx';

/* 按 id 数组从 imgstore 异步取图片 */
function useImgs(ids) {
  const [imgs, setImgs] = useState([]);
  useEffect(() => {
    let alive = true;
    setImgs([]);
    (async () => {
      const list = [];
      for (const id of (ids || [])) {
        const v = await imgStore.get(id);
        if (alive && v) list.push({ id, dataUrl: v });
      }
      if (alive) setImgs(list);
    })();
    return () => { alive = false; };
  }, [ids]);
  return imgs;
}

/* 添加/编辑错题弹窗（含图片上传） */
function MistakeModal({ open, onClose, onSave, initial }) {
  const toast = useToast();
  const d = initial || {};
  const [form, setForm] = useState({
    date: d.date || todayStr(),
    sub: d.sub || '资料分析',
    err: d.err || '知识不会',
    source: d.source || '',
    knowledge: d.knowledge || '',
    note: d.note || '',
    state: d.state || 'pending'
  });
  /* 预览图：{id, dataUrl}[]；已有错题的图片先加载 */
  const [preview, setPreview] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const initIds = useMemo(() => (d.id ? (d.imgs || []) : []), [d.id, d.imgs]);
  const loadedImgs = useImgs(initIds);

  useEffect(() => {
    if (d.id && loadedImgs.length) {
      setPreview(loadedImgs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedImgs.length]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const pick = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (preview.length + files.length > 4) { toast('最多 4 张图片'); e.target.value = ''; return; }
    Promise.all(files.map(f => compressImageFile(f).catch(() => null)))
      .then(results => {
        const ok = results.filter(Boolean);
        if (ok.length !== files.length) toast('部分图片处理失败（超8MB或格式不支持）');
        if (!ok.length) { e.target.value = ''; return; }
        setPreview(p => p.concat(ok.map(dataUrl => ({ id: 'tmp_' + Math.random().toString(36).slice(2, 8), dataUrl }))));
        e.target.value = '';
      });
  };

  const delPreview = (pid) => setPreview(p => p.filter(x => x.id !== pid));

  const submit = async () => {
    if (!form.knowledge.trim()) { toast('请填写知识点'); return; }
    setSaving(true);
    try {
      /* 存入图片，得到 id 数组 */
      const ids = [];
      for (const p of preview) {
        let id = p.id;
        if (id.startsWith('tmp_')) {
          id = 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
          await imgStore.put(id, p.dataUrl);
        }
        ids.push(id);
      }
      /* 编辑时删除被移除的旧图 */
      if (d.id && d.imgs) {
        for (const oldId of d.imgs) {
          if (!ids.includes(oldId)) await imgStore.del(oldId);
        }
      }
      onSave({ ...form, imgs: ids });
    } catch (err) {
      toast('图片保存失败：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={d.id ? '编辑错题' : '添加错题'} icon="📌" wide
      footer={<>
        <button className="btn ghost" onClick={onClose} disabled={saving}>取消</button>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
      </>}>
      <div className="form-row">
        <div><label>科目</label>
          <select value={form.sub} onChange={e => set('sub', e.target.value)}>
            {SUB_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div><label>错因</label>
          <select value={form.err} onChange={e => set('err', e.target.value)}>
            {ERR_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div><label>日期</label><input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
        <div><label>题目来源</label><input value={form.source} placeholder="如：2025真题-资料第3题" onChange={e => set('source', e.target.value)} /></div>
      </div>
      <label>知识点（一句话）</label>
      <input value={form.knowledge} placeholder="如：年均增长率公式" onChange={e => set('knowledge', e.target.value)} />
      <label>错因分析 / 正确思路</label>
      <textarea rows="3" value={form.note} placeholder="为什么错，下次怎么避免" onChange={e => set('note', e.target.value)} />

      <label>📷 题目图片（最多 4 张，自动压缩存储）</label>
      <div className="upload-zone" onClick={() => fileRef.current && fileRef.current.click()}>
        ＋ 点击选择图片 / 拍照上传
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pick} />
      </div>
      {preview.length > 0 && (
        <div className="img-preview">
          {preview.map((p, i) => (
            <div key={p.id} className="pv">
              <img src={p.dataUrl} alt={'图片' + (i + 1)} />
              <button className="x" onClick={() => delPreview(p.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function MistakePanel({ state, dispatch, onAiAnalyze }) {
  const toast = useToast();
  const [filter, setFilter] = useState({ sub: '', err: '', st: '' });
  const [modal, setModal] = useState(null);
  const [lb, setLb] = useState(null); // {imgs:[dataUrl], index}

  const list = useMemo(() => {
    let l = state.mistakes.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (filter.sub) l = l.filter(m => m.sub === filter.sub);
    if (filter.err) l = l.filter(m => m.err === filter.err);
    if (filter.st) l = l.filter(m => m.state === filter.st);
    return l;
  }, [state.mistakes, filter]);

  const stateLabel = k => (MISTAKE_STATES.find(s => s.key === k) || {}).label || k;
  const stateCls = k => (MISTAKE_STATES.find(s => s.key === k) || {}).cls || 's-pending';

  const nextState = (m) => {
    if (m.state === 'pending') return 'redo';
    if (m.state === 'redo') return 'done';
    return 'pending';
  };

  const openLb = async (m, idx) => {
    const imgs = [];
    for (const id of (m.imgs || [])) {
      const v = await imgStore.get(id);
      if (v) imgs.push(v);
    }
    if (imgs.length) setLb({ imgs, index: idx });
  };

  const save = (data) => {
    if (modal && modal.editId) {
      dispatch(actions.updateMistake(modal.editId, data));
      toast('错题已更新');
    } else {
      dispatch(actions.addMistake({ id: 'mk_' + Math.random().toString(36).slice(2, 8), ...data }));
      toast('错题已添加');
    }
    setModal(null);
  };

  return (
    <div>
      <div className="card">
        <div className="today-head">
          <div className="d">📌 错题本（{state.mistakes.length}）</div>
          <button className="btn sm" onClick={() => setModal({ editId: null })}>＋ 添加错题</button>
        </div>
        <div className="form-row three" style={{ marginBottom: 10 }}>
          <div><select value={filter.sub} onChange={e => setFilter({ ...filter, sub: e.target.value })}>
            <option value="">全部科目</option>{SUB_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select></div>
          <div><select value={filter.err} onChange={e => setFilter({ ...filter, err: e.target.value })}>
            <option value="">全部错因</option>{ERR_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select></div>
          <div><select value={filter.st} onChange={e => setFilter({ ...filter, st: e.target.value })}>
            <option value="">全部状态</option>{MISTAKE_STATES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select></div>
        </div>

        {list.length ? list.map(m => (
          <MistakeCard key={m.id} m={m} stateLabel={stateLabel} stateCls={stateCls}
            onToggle={() => dispatch(actions.setMistakeState(m.id, nextState(m)))}
            onEdit={() => setModal({ editId: m.id })}
            onDelete={() => { if (confirm('删除这条错题？图片也会一并删除')) { (m.imgs || []).forEach(id => imgStore.del(id)); dispatch(actions.deleteMistake(m.id)); } }}
            onLb={(i) => openLb(m, i)}
            onAi={() => onAiAnalyze(m)} />
        )) : (
          <div className="empty-tip">
            {state.mistakes.length ? '当前筛选条件下没有错题' : '还没有错题记录。做题遇到不会的、做错的，随手录进来，周五集中重做。'}
          </div>
        )}
      </div>

      {modal && <MistakeModal
        open onClose={() => setModal(null)} onSave={save}
        initial={modal.editId ? state.mistakes.find(m => m.id === modal.editId) : null} />}

      {lb && <Lightbox imgs={lb.imgs} index={lb.index} onClose={() => setLb(null)} />}
    </div>
  );
}

function MistakeCard({ m, stateLabel, stateCls, onToggle, onEdit, onDelete, onLb, onAi }) {
  const imgs = useImgs(m.imgs);
  return (
    <div className="mk-card">
      <div className="mk-head">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="tag">{m.sub}</span>
          <span className={'state-chip ' + stateCls(m.state)}>{stateLabel(m.state)}</span>
          <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>{fmtMD(m.date)}</span>
        </div>
        <span className="state-chip" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{m.err}</span>
      </div>
      <div className="mk-title">{m.knowledge}</div>
      {m.source && <div className="mk-detail">📌 来源：{m.source}</div>}
      {m.note && <div className="mk-detail">💡 <b>错因分析：</b>{m.note}</div>}
      {imgs.length > 0 && (
        <div className="mk-thumbs">
          {imgs.map((im, i) => (
            <img key={im.id} className="mk-thumb" src={im.dataUrl} alt="错题图" onClick={() => onLb(i)} />
          ))}
        </div>
      )}
      <div className="mk-ops">
        <button className="mini-btn" onClick={onToggle}>{m.state === 'done' ? '↩ 待重做' : m.state === 'pending' ? '✓ 标记已重做' : '✓ 标记已掌握'}</button>
        <button className="mini-btn" onClick={onEdit}>编辑</button>
        <button className="mini-btn" style={{ color: 'var(--primary)', borderColor: '#d8caf5' }} onClick={onAi}>✨ AI 解析</button>
        <button className="mini-btn danger" onClick={onDelete}>删除</button>
      </div>
    </div>
  );
}
