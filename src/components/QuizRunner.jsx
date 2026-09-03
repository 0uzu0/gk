import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { pickQuestions } from '../lib/qbank.js';
import { SUB_OPTIONS } from '../lib/stats.js';
import { todayStr } from '../lib/dates.js';
import { uid } from '../lib/id.js';
import { actions } from '../store/useAppState.js';
import { useToast } from './Toast.jsx';

const SUBJECTIVE = '主观题';

/*
 * 本组件此前有一个必现崩溃：「配置」与「题目」是两个独立 state，
 * 而 App 传入的 preset 是空对象 {}（truthy），导致跳过配置弹窗、
 * 直接以 questions === null 取下标 → TypeError。
 * 现改为单一 session state：有 session 才进入作答/结果，否则必定显示配置弹窗。
 */

/* preset 校验：只有形如 {sub?, count:正整数} 的预设才直接开练 */
function normalizePreset(preset) {
  if (!preset || typeof preset !== 'object') return null;
  const count = Number(preset.count);
  if (!Number.isFinite(count) || count < 1) return null;
  return { sub: preset.sub || '', count: Math.floor(count) };
}

/* 建练习会话：抽不到题返回 null（由调用方提示，不进入作答态） */
function buildSession(bank, attempts, cfg) {
  const qs = pickQuestions(bank, attempts, cfg);
  return qs.length ? { qs, cfg } : null;
}

/* 判分：客观题答案比对；主观题以用户自评为准（未自评视为未掌握） */
function gradeOne(q, ua, selfGrade) {
  if (q.type === SUBJECTIVE) return selfGrade === true;
  return ua === String(q.answer || '').trim();
}

/* 练习配置弹窗：选科目 + 题数 */
function QuizConfig({ open, onClose, onStart, bank }) {
  const [sub, setSub] = useState('');
  const [count, setCount] = useState(10);
  const available = useMemo(() => {
    return bank.filter(q => !q.demo && (!sub || q.sub === sub)).length;
  }, [bank, sub]);
  const n = Math.max(0, Math.min(count, available));

  return (
    <Modal open={open} onClose={onClose} title="配置在线练习" icon="▶"
      footer={<>
        <button className="btn ghost" onClick={onClose}>取消</button>
        <button className="btn" onClick={() => onStart({ sub, count: n })} disabled={!available}>
          开始练习（{n} 题）
        </button>
      </>}>
      <div className="form-row">
        <div><label>科目（留空=全部）</label>
          <select value={sub} onChange={e => setSub(e.target.value)}>
            <option value="">全部科目</option>
            {SUB_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div><label>题数（可做 {available} 题）</label>
          <input type="number" min="1" max={available || 1} value={count}
            onChange={e => setCount(Math.max(1, Number(e.target.value) || 1))} />
        </div>
      </div>
      <div className="hint">
        抽题顺序：未做 → 做错 → 做对，优先把生题和错题喂给你。<br />
        主观题（申论）提交后对照参考答案<b>自评</b>，自评「没答好」才会计入错题。
      </div>
    </Modal>
  );
}

/* 单题作答卡片 */
function QuestionView({ q, idx, total, choice, onChoose, showAnswer, selfGrade, onSelfGrade }) {
  const letters = 'ABCDEF';
  return (
    <div className="quiz-q">
      <div className="quiz-q-head">
        <span className="tag">{q.sub}</span>
        <span className="tag" style={{ background: '#eef2ff', color: '#4f46e5' }}>{q.type}</span>
        <span style={{ fontSize: 12, color: 'var(--sub)', marginLeft: 'auto' }}>{idx + 1} / {total}</span>
      </div>
      <div className="quiz-stem">{q.stem}</div>

      {q.options && q.options.length > 0 && (
        <div className="quiz-opts">
          {q.options.map((o, i) => {
            const key = letters[i];
            const isSel = choice === key;
            let cls = 'opt';
            if (showAnswer) {
              if (key === q.answer) cls += ' correct';
              else if (isSel) cls += ' wrong';
            } else if (isSel) cls += ' sel';
            return (
              <div key={i} className={cls} onClick={() => !showAnswer && onChoose(key)}>
                <span className="opt-k">{key}</span>
                <span className="opt-t">{o}</span>
              </div>
            );
          })}
        </div>
      )}

      {q.type === '判断题' && !q.options.length && (
        <div className="quiz-opts">
          {['对', '错'].map((lab, i) => {
            const key = i === 0 ? '对' : '错';
            const isSel = choice === key;
            let cls = 'opt';
            if (showAnswer) {
              if (key === q.answer) cls += ' correct';
              else if (isSel) cls += ' wrong';
            } else if (isSel) cls += ' sel';
            return (
              <div key={key} className={cls} onClick={() => !showAnswer && onChoose(key)}>
                <span className="opt-k">{key === '对' ? '✓' : '✗'}</span>
                <span className="opt-t">{lab}</span>
              </div>
            );
          })}
        </div>
      )}

      {q.type === SUBJECTIVE && (
        <div>
          <textarea rows="6" value={choice || ''} onChange={e => onChoose(e.target.value)}
            placeholder="在此作答（对照参考答案自评）" disabled={showAnswer} />
          {showAnswer && (
            <>
              <div className="mk-detail" style={{ marginTop: 8 }}>✅ 参考答案：{q.answer}</div>
              <div className="self-grade">
                <span>对照参考答案，本题自评：</span>
                <button className={'sg-btn' + (selfGrade === true ? ' on' : '')} onClick={() => onSelfGrade(true)}>✓ 答到位</button>
                <button className={'sg-btn' + (selfGrade === false ? ' on bad' : '')} onClick={() => onSelfGrade(false)}>✗ 没答好</button>
              </div>
            </>
          )}
        </div>
      )}

      {showAnswer && (
        <div className="quiz-analysis">
          <div className="a-line">
            <b>{gradeOne(q, (choice || '').trim(), selfGrade) ? '✅ 回答正确' : '❌ 回答错误'}</b>
            {q.type !== SUBJECTIVE && <> 正确答案：{q.answer}</>}
          </div>
          {q.knowledge && <div className="a-line">🏷 {q.knowledge}</div>}
          {q.analysis && <div className="a-line">💡 {q.analysis}</div>}
        </div>
      )}
    </div>
  );
}

export default function QuizRunner({ state, dispatch, onClose, preset }) {
  const toast = useToast();
  /* session 为 null 时必定展示配置弹窗 —— 保证 questions 与 config 永不同步失调 */
  const [session, setSession] = useState(() => {
    const cfg = normalizePreset(preset);
    return cfg ? buildSession(state.questions, state.attempts, cfg) : null;
  });
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selfGrade, setSelfGrade] = useState({});   // 主观题自评：idx -> true/false
  const [recorded, setRecorded] = useState({});     // 已写入 attempt 的题，防重复记录
  const [done, setDone] = useState(false);
  const [archived, setArchived] = useState(false);

  const bank = Array.isArray(state.questions) ? state.questions : [];

  const start = (cfg) => {
    const s = buildSession(bank, state.attempts, cfg);
    if (!s) { toast('该条件下没有可做的题', 'err'); return; }
    setSession(s);
    setAnswers({});
    setIdx(0);
    setShowAnswer(false);
    setSelfGrade({});
    setRecorded({});
    setDone(false);
    setArchived(false);
  };

  if (!session) {
    return <QuizConfig open onClose={onClose} onStart={start} bank={bank} />;
  }

  const qs = session.qs;

  /* 结果页：统一定稿判分 */
  if (done) {
    const graded = qs.map((q, i) => {
      const ua = (answers[i] || '').trim();
      return { q, ua, correct: gradeOne(q, ua, selfGrade[i]) };
    });
    const right = graded.filter(g => g.correct).length;
    const rate = qs.length ? Math.round(right / qs.length * 100) : 0;
    const wrong = graded.filter(g => !g.correct);

    const archiveWrong = () => {
      if (archived) { toast('错题已归档'); return; }
      wrong.forEach(g => {
        dispatch(actions.addMistake({
          id: uid('mk'),
          date: todayStr(),
          sub: g.q.sub,
          err: '知识不会',
          source: g.q.source || '真题库练习',
          knowledge: g.q.knowledge || String(g.q.stem || '').slice(0, 30),
          note: '我的答案：' + (g.ua || '（未作答）') +
            (g.q.type === SUBJECTIVE ? '｜参考答案：' : '｜正确答案：') + g.q.answer +
            (g.q.analysis ? '｜解析：' + g.q.analysis : ''),
          state: 'pending',
          imgs: []
        }));
      });
      setArchived(true);
      toast('已归档 ' + wrong.length + ' 道错题到错题本');
    };

    return (
      <div className="card">
        <div className="quiz-result">
          <div className="result-head">
            <div className="score">{right}<span>/{qs.length}</span></div>
            <div className="rate">{rate}%</div>
            <div className="lbl">{rate >= 80 ? '👍 掌握扎实' : rate >= 60 ? '💪 稳步提升' : '🔍 查漏补缺中'}</div>
          </div>

          {wrong.length > 0 && (
            <div className="btn-row">
              <button className="btn" onClick={archiveWrong} disabled={archived}>
                {archived ? '✓ 已归档到错题本' : `📌 将 ${wrong.length} 道错题归档到错题本`}
              </button>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            {graded.map((g, i) => (
              <div key={i} className="quiz-review"
                style={{ borderLeft: g.correct ? '3px solid var(--green, #059669)' : '3px solid var(--red)' }}>
                <div className="r-top">
                  <span className={'state-chip ' + (g.correct ? 's-done' : 's-redo')}>{g.correct ? '做对' : '做错'}</span>
                  <span className="tag">{g.q.sub}</span>
                  <span style={{ fontSize: 12, color: 'var(--sub)' }}>
                    你的答案：{g.ua || '（未作答）'} · {g.q.type === SUBJECTIVE ? '参考答案' : '正确答案'}：{g.q.answer}
                  </span>
                </div>
                <div className="r-stem">{g.q.stem}</div>
                {g.q.analysis && <div className="mk-detail">💡 {g.q.analysis}</div>}
              </div>
            ))}
          </div>

          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn ghost" onClick={onClose}>返回题库</button>
            <button className="btn" onClick={() => start(session.cfg)}>再练一组</button>
          </div>
        </div>
      </div>
    );
  }

  const q = qs[idx];
  const isSubjective = q.type === SUBJECTIVE;
  const ua = (answers[idx] || '').trim();
  /* 客观题：有答案即可提交；主观题：需自评后才能进入下一题 */
  const canSubmit = isSubjective ? ua !== '' : !!answers[idx];
  const canNext = showAnswer && (!isSubjective || selfGrade[idx] !== undefined);

  const record = (i, correct) => {
    if (recorded[i]) return;
    const target = qs[i];
    dispatch(actions.addAttempt({
      id: uid('at'),
      qid: target.id,
      date: todayStr(),
      correct,
      answer: (answers[i] || '').trim()
    }));
    setRecorded(r => ({ ...r, [i]: true }));
  };

  const submitOne = () => {
    if (isSubjective) { setShowAnswer(true); return; } // 主观题等自评再记录
    record(idx, gradeOne(q, ua, undefined));
    setShowAnswer(true);
  };

  const onSelfGrade = (val) => {
    setSelfGrade(g => ({ ...g, [idx]: val }));
    record(idx, val);
  };

  const next = () => {
    if (idx + 1 >= qs.length) setDone(true);
    else { setIdx(idx + 1); setShowAnswer(false); }
  };

  const setAns = (val) => setAnswers(a => ({ ...a, [idx]: val }));

  return (
    <div className="card">
      <div className="today-head">
        <div className="d">▶ 在线练习 · {session.cfg.sub || '全科目'}（{qs.length} 题）</div>
        <button className="btn ghost sm" onClick={onClose}>退出练习</button>
      </div>

      <div className="quiz-progress">
        <i style={{ width: (idx / qs.length * 100) + '%' }} />
      </div>

      <QuestionView q={q} idx={idx} total={qs.length}
        choice={answers[idx] || ''} onChoose={setAns} showAnswer={showAnswer}
        selfGrade={selfGrade[idx]} onSelfGrade={onSelfGrade} />

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={() => { if (idx > 0) { setIdx(idx - 1); setShowAnswer(true); } }}
          disabled={idx === 0}>上一题</button>
        {!showAnswer ? (
          <button className="btn" onClick={submitOne} disabled={!canSubmit}>提交本题</button>
        ) : (
          <button className="btn" onClick={next} disabled={!canNext}>
            {idx + 1 >= qs.length ? '查看结果' : '下一题'}
          </button>
        )}
      </div>
    </div>
  );
}
