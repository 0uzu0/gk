import { useEffect, useMemo, useState } from 'react';
import { todayStr, addDays, fmtMD, getStage, weekLabel } from '../lib/dates.js';
import { mergeDailyTasks, dismissBaseline } from '../lib/templates.js';
import { actions } from '../store/useAppState.js';
import { useToast } from './Toast.jsx';

const CAT_CLS = {
  '行测': 'chip-xc', '申论': 'chip-sl', '常识': 'chip-cs',
  '错题': 'chip-ct', '复盘': 'chip-fp', '素材': 'chip-fp', '其他': 'chip-qt', '准备': 'chip-qt'
};

/* 今日打卡 + 任意日期回看/补录 + 本周概览 + 自动生成 */
export default function TodayPanel({ state, dispatch, examDate, onGoBank }) {
  const toast = useToast();
  const today = todayStr();

  /* 当前查看的日期（默认今天），可切换到任意历史/未来日期回看与补录 */
  const [viewDate, setViewDate] = useState(today);

  /* 日期切换时若目标日期在备考起点之后，自动补齐当天模板任务
     （exams：薄弱模块按最近模考定向；mistakes：到期错题复习；questions/attempts：真题刷题；含摸底阶段追赶） */
  useEffect(() => {
    if (viewDate < '2026-09-01') return; // 起点之前不注入模板
    const added = mergeDailyTasks(state.tasks, viewDate, {
      exams: state.exams, mistakes: state.mistakes, questions: state.questions, attempts: state.attempts
    });
    if (added.length) dispatch(actions.addTasks(added));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  const stage = getStage(viewDate);

  const tasksOnView = useMemo(() =>
    state.tasks.filter(t => t.date === viewDate).sort((a, b) => (a.done - b.done)),
    [state.tasks, viewDate]);

  /* 逾期任务：始终以「真实今天」为界（只算今天之前未完成的），
     查看未来日期时不叠加历史未完成任务 */
  const overdue = useMemo(() =>
    state.tasks.filter(t => t.date < today && !t.done && !t.demo)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [state.tasks, today]);

  /* 逾期提醒仅在查看「今天」时展示，回看历史/未来日期时不出现该区块 */
  const showOverdue = viewDate === today;

  const doneCount = tasksOnView.filter(t => t.done).length;
  const isToday = viewDate === today;

  /* 本周任务分布（周一到周日）——始终按「真实今天」所在周 */
  const weekDays = useMemo(() => {
    const wd = new Date(today + 'T00:00:00').getDay() || 7;
    const mon = addDays(today, 1 - wd);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(mon, i);
      const dayTasks = state.tasks.filter(t => t.date === d);
      const done = dayTasks.filter(t => t.done).length;
      return { d, isToday: d === today, total: dayTasks.length, done };
    });
  }, [state.tasks, today]);

  const shiftBy = (n) => setViewDate(addDays(viewDate, n));

  /* 删除任务：若是摸底基线任务，记住「用户已放弃」，不再自动补发 */
  const delTask = (t) => {
    if (t.key && String(t.key).startsWith('baseline_')) dismissBaseline(t.key);
    dispatch(actions.deleteTask(t.id));
  };

  return (
    <div>
      <div className="card">
        {/* 日期回看条：可切换任意日期 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="mini-btn" onClick={() => shiftBy(-1)}>‹ 前一天</button>
          <input
            type="date"
            value={viewDate}
            onChange={e => e.target.value && setViewDate(e.target.value)}
            style={{ width: 150, padding: '6px 10px' }}
          />
          <button className="mini-btn" onClick={() => shiftBy(1)}>后一天 ›</button>
          {!isToday && (
            <button className="mini-btn gold" onClick={() => setViewDate(today)}>回到今天</button>
          )}
        </div>

        <div className="today-head">
          <div>
            <div className="d">🗓️ {isToday ? '今日打卡' : '打卡回看'} · {fmtMD(viewDate)}</div>
            <div className="n">{weekLabel(viewDate)} ｜ {stage.name}：{stage.desc} ｜ 已完成 {doneCount}/{tasksOnView.length}</div>
          </div>
          <button className="btn ghost sm" onClick={() => {
            const added = mergeDailyTasks(state.tasks, viewDate, {
              exams: state.exams, mistakes: state.mistakes, questions: state.questions, attempts: state.attempts
            });
            if (added.length) {
              dispatch(actions.addTasks(added));
              toast('已补齐 ' + added.length + ' 项任务');
            } else {
              toast('该日期任务已齐全，无需重复生成');
            }
          }}>
            ↻ 生成/补齐任务
          </button>
        </div>

        {/* 逾期提醒：仅在查看「今天」时展示，避免未来日期堆积历史任务 */}
        {showOverdue && overdue.length > 0 && (
          <div style={{ background: '#fffaf5', border: '1px solid #f5d78e', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gold)' }}>⚠️ 逾期未完成（{overdue.length}）</div>
              <button
                className="mini-btn gold"
                onClick={() => {
                  overdue.forEach(t => dispatch(actions.shiftTask(t.id, today)));
                  toast('已顺延 ' + overdue.length + ' 项到今天');
                }}
              >
                ⇥ 全部顺延到今天
              </button>
            </div>
            {overdue.slice(0, 6).map(t => (
              <div key={t.id} className="task overdue">
                <input type="checkbox" checked={t.done} onChange={() => dispatch(actions.toggleTask(t.id))} />
                <div className="t-body">
                  <div className="t-title">{t.title}</div>
                  <div className="t-meta">📅 {fmtMD(t.date)} 逾期</div>
                </div>
                <div className="t-ops">
                  <button className="mini-btn gold" onClick={() => { dispatch(actions.shiftTask(t.id, today)); toast('已顺延到今天'); }}>顺延到今天</button>
                  <button className="mini-btn danger" onClick={() => delTask(t)}>删除</button>
                </div>
              </div>
            ))}
            {overdue.length > 6 && <div className="hint" style={{ marginTop: 6 }}>…还有 {overdue.length - 6} 条，请到对应日期查看</div>}
          </div>
        )}

        {tasksOnView.length === 0 ? (
          <div className="today-empty">
            {isToday ? '今天没有任务，休息或自行加练 🎯' : '该日期没有任务，可点右上「生成/补齐任务」补录'}
          </div>
        ) : (
          tasksOnView.map(t => (
            <div key={t.id} className={'task' + (t.done ? ' done' : '')}>
              <input type="checkbox" checked={t.done} onChange={() => dispatch(actions.toggleTask(t.id))} />
              <div className="t-body">
                <div className="t-title">{t.title}</div>
                <div className="t-meta">
                  <span className={'chip ' + (CAT_CLS[t.cat] || 'chip-qt')}>{t.cat}</span>
                  {t.time && <span>⏱ {t.time}</span>}
                  {t.auto && <span style={{ opacity: .7 }}>· 自动</span>}
                  {t.catchup && <span style={{ opacity: .75, color: 'var(--gold)' }}>· 追赶</span>}
                </div>
              </div>
              <div className="t-ops">
                {/* 真题刷题任务：一键跳真题库并带上科目/题数直接开练 */}
                {t.key === 'bank_practice' && onGoBank && (
                  <button className="mini-btn" onClick={() => onGoBank({ sub: t.bankSub || '', count: t.bankCount || 10 })}>
                    ▶ 去刷题
                  </button>
                )}
                {/* 未完成任务可顺延到「今天」，历史任务补做/顺延都方便 */}
                {!t.done && (
                  <button className="mini-btn gold" onClick={() => { dispatch(actions.shiftTask(t.id, today)); toast('已顺延到今天'); }}>顺延</button>
                )}
                <button className="mini-btn danger" onClick={() => delTask(t)}>✕</button>
              </div>
            </div>
          ))
        )}

        <div className="week-grid">
          {weekDays.map(w => (
            <div key={w.d} className="wd">
              <button
                className={'cell' + (w.isToday ? ' today' : '') + (w.d === viewDate ? ' sel' : '')}
                onClick={() => setViewDate(w.d)}
                style={{ width: '100%', cursor: 'pointer', background: w.d === viewDate ? 'var(--primary-soft)' : undefined }}
              >
                <b>{fmtMD(w.d)}</b>
                <div className={'bar' + (w.total && w.done === w.total ? ' full' : '')}>
                  <i style={{ width: w.total ? (w.done / w.total * 100) + '%' : 0 }} />
                </div>
                <span>{w.done}/{w.total}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
