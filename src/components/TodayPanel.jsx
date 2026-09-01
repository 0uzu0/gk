import { useEffect, useMemo } from 'react';
import { todayStr, addDays, fmtMD, getStage, weekLabel } from '../lib/dates.js';
import { templateForDate } from '../lib/templates.js';
import { actions } from '../store/useAppState.js';
import { useToast } from './Toast.jsx';

const CAT_CLS = {
  '行测': 'chip-xc', '申论': 'chip-sl', '常识': 'chip-cs',
  '错题': 'chip-ct', '复盘': 'chip-fp', '素材': 'chip-fp', '其他': 'chip-qt', '准备': 'chip-qt'
};

/* 今日打卡 + 本周概览 + 自动生成 */
export default function TodayPanel({ state, dispatch, examDate }) {
  const toast = useToast();
  const today = todayStr();
  const stage = getStage(today);

  /* 今日任务自动注入（模板缺失时补录，收敛后不再触发） */
  useEffect(() => {
    const existing = state.tasks.filter(t => t.date === today);
    const tmpl = templateForDate(today);
    const missing = tmpl.filter(t => !existing.some(x => x.title === t.title));
    if (missing.length) {
      const newTasks = missing.map(t => ({ id: 'auto_' + Math.random().toString(36).slice(2, 8), date: today, ...t, done: false, auto: true }));
      dispatch(actions.addTasks(newTasks));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const tasksToday = useMemo(() =>
    state.tasks.filter(t => t.date === today).sort((a, b) => (a.done - b.done)),
    [state.tasks, today]);

  /* 逾期任务（今天之前未完成，示例除外） */
  const overdue = useMemo(() =>
    state.tasks.filter(t => t.date < today && !t.done && !t.demo)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [state.tasks, today]);

  const doneCount = tasksToday.filter(t => t.done).length;

  /* 本周任务分布（周一到周日） */
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

  return (
    <div>
      <div className="card">
        <div className="today-head">
          <div>
            <div className="d">🗓️ 今日打卡 · {fmtMD(today)}</div>
            <div className="n">{weekLabel(today)} ｜ {stage.name}：{stage.desc} ｜ 已完成 {doneCount}/{tasksToday.length}</div>
          </div>
          <button className="btn ghost sm" onClick={() => { dispatch(actions.addTasks(templateForDate(today).map(t => ({ id: 'auto_' + Math.random().toString(36).slice(2, 8), date: today, ...t, done: false, auto: true })))); toast('已补齐今日任务'); }}>
            ↻ 重新生成今日任务
          </button>
        </div>

        {overdue.length > 0 && (
          <div style={{ background: '#fffaf5', border: '1px solid #f5d78e', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gold)', marginBottom: 8 }}>⚠️ 逾期未完成（{overdue.length}）</div>
            {overdue.slice(0, 6).map(t => (
              <div key={t.id} className="task overdue">
                <input type="checkbox" checked={t.done} onChange={() => dispatch(actions.toggleTask(t.id))} />
                <div className="t-body">
                  <div className="t-title">{t.title}</div>
                  <div className="t-meta">📅 {fmtMD(t.date)} 逾期</div>
                </div>
                <div className="t-ops">
                  <button className="mini-btn gold" onClick={() => { dispatch(actions.shiftTask(t.id, today)); toast('已顺延到今天'); }}>顺延今天</button>
                  <button className="mini-btn danger" onClick={() => dispatch(actions.deleteTask(t.id))}>删除</button>
                </div>
              </div>
            ))}
            {overdue.length > 6 && <div className="hint" style={{ marginTop: 6 }}>…还有 {overdue.length - 6} 条，请到打卡记录处理</div>}
          </div>
        )}

        {tasksToday.length === 0 ? (
          <div className="today-empty">今天没有任务，休息或自行加练 🎯</div>
        ) : (
          tasksToday.map(t => (
            <div key={t.id} className={'task' + (t.done ? ' done' : '')}>
              <input type="checkbox" checked={t.done} onChange={() => dispatch(actions.toggleTask(t.id))} />
              <div className="t-body">
                <div className="t-title">{t.title}</div>
                <div className="t-meta">
                  <span className={'chip ' + (CAT_CLS[t.cat] || 'chip-qt')}>{t.cat}</span>
                  {t.time && <span>⏱ {t.time}</span>}
                  {t.auto && <span style={{ opacity: .7 }}>· 自动</span>}
                </div>
              </div>
              <div className="t-ops">
                <button className="mini-btn danger" onClick={() => dispatch(actions.deleteTask(t.id))}>✕</button>
              </div>
            </div>
          ))
        )}

        <div className="week-grid">
          {weekDays.map(w => (
            <div key={w.d} className="wd">
              <div className={'cell' + (w.isToday ? ' today' : '')}>
                <b>{fmtMD(w.d)}</b>
                <div className={'bar' + (w.total && w.done === w.total ? ' full' : '')}>
                  <i style={{ width: w.total ? (w.done / w.total * 100) + '%' : 0 }} />
                </div>
                <span>{w.done}/{w.total}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
