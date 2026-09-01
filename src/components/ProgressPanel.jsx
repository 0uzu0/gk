import { useMemo } from 'react';
import { stageProgress, stagePctInside, totalProgress, todayStr, fmtMD } from '../lib/dates.js';
import { GOAL, monthRate, goalGap, lastModuleAvg, MODULES, mistakeBySub, mistakeByErr } from '../lib/stats.js';

export default function ProgressPanel({ state, examDate }) {
  const today = todayStr();
  const prog = totalProgress(today, examDate);
  const stages = stageProgress();
  const cur = stages.find(s => today >= s.from && today <= s.to);

  const month = today.slice(0, 7);
  const rate = useMemo(() => monthRate(state.tasks, month), [state.tasks, month]);
  const lastExam = useMemo(() => {
    const list = state.exams.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    return list.length ? list[list.length - 1] : null;
  }, [state.exams]);
  const gap = goalGap(lastExam);
  const avg = lastModuleAvg(lastExam);
  const mistakeStats = useMemo(() => mistakeBySub(state.mistakes), [state.mistakes]);
  const errStats = useMemo(() => mistakeByErr(state.mistakes), [state.mistakes]);

  const chip = (v, good) => {
    if (v == null) return <span className="mid">—</span>;
    return <span className={v >= 0 ? 'up' : 'down'}>{v >= 0 ? '+' : ''}{v}</span>;
  };

  return (
    <div>
      <div className="kpis">
        <div className="kpi">
          <div className="k">距笔试</div>
          <div className="v num">{prog.left}<small> 天</small></div>
          <div className="d">备考第 {prog.used} 天 · 总进度 {prog.pct}%</div>
          <div className="bar-wrap"><i style={{ width: prog.pct + '%', background: 'var(--primary)' }} /></div>
        </div>
        <div className="kpi">
          <div className="k">目标总分 145（B类线 105）</div>
          <div className="v num">{lastExam ? lastExam.total : '—'}<small> / 145</small></div>
          <div className="d">
            {gap ? <>还差 <b className={gap.totalGap <= 0 ? 'up' : 'down'}>{Math.abs(gap.totalGap)}</b> 分{lastExam.total >= GOAL.total ? ' 🎉 已达标' : ''}</> : '先做一次摸底模考'}
          </div>
          <div className="bar-wrap"><i style={{ width: Math.min(100, (lastExam ? lastExam.total : 0) / GOAL.total * 100) + '%', background: 'var(--green)' }} /></div>
        </div>
        <div className="kpi">
          <div className="k">行测目标 70（当前 {lastExam ? lastExam.xingce : '—'}）</div>
          <div className="v num">{gap ? gap.xingceGap <= 0 ? '已达标' : '差 ' + gap.xingceGap : '—'}</div>
          <div className="d">五模块均值 {avg == null ? '—' : avg + '%'}</div>
          <div className="bar-wrap"><i style={{ width: Math.min(100, (lastExam ? lastExam.xingce : 0) / GOAL.xingce * 100) + '%', background: 'var(--blue)' }} /></div>
        </div>
        <div className="kpi">
          <div className="k">申论目标 75（当前 {lastExam ? lastExam.shenlun : '—'}）</div>
          <div className="v num">{gap ? gap.shenlunGap <= 0 ? '已达标' : '差 ' + gap.shenlunGap : '—'}</div>
          <div className="d">本机数据会随模考更新</div>
          <div className="bar-wrap"><i style={{ width: Math.min(100, (lastExam ? lastExam.shenlun : 0) / GOAL.shenlun * 100) + '%', background: 'var(--gold)' }} /></div>
        </div>
        <div className="kpi">
          <div className="k">{month} 打卡率</div>
          <div className="v num">{rate.rate}<small>%</small></div>
          <div className="d">完成 {rate.done} / 共 {rate.total} 条任务</div>
          <div className="bar-wrap"><i style={{ width: rate.rate + '%', background: rate.rate >= 80 ? 'var(--green)' : rate.rate >= 50 ? 'var(--gold)' : 'var(--red)' }} /></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><span className="ic">📈</span>五阶段备考进度</div>
        {stages.map(s => {
          const active = today >= s.from && today <= s.to;
          const passed = today > s.to;
          const pct = active ? stagePctInside(today) : (passed ? 100 : 0);
          return (
            <div key={s.name} className={'stage-row' + (active ? ' cur' : '')}>
              <div className="name" style={{ color: s.color }}>{s.name}</div>
              <div className="dates">{fmtMD(s.from)}~{fmtMD(s.to)}</div>
              <div className="track"><i style={{ width: pct + '%', background: s.color }} /></div>
              <div className="pct num">{pct}%</div>
            </div>
          );
        })}
        <div className="legend" style={{ marginTop: 10 }}>
          <span><i style={{ background: cur ? cur.color : '#ccc' }} />当前阶段</span>
          <span>目标 145 拆解：行测 70（资料90% / 判断85% / 言语85%）+ 申论 75（大作文28+/40）</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><span className="ic">🎯</span>145 目标拆解 · 最近一次模考对照</div>
        {lastExam ? (
          <table className="tbl">
            <thead>
              <tr><th>项目</th><th>目标</th><th>当前</th><th>差距</th><th>达标线</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><b>总分</b></td><td>{GOAL.total}</td><td className="num">{lastExam.total}</td>
                <td>{chip(gap ? gap.totalGap : null, true)}</td><td>B类合格线 105 ✓</td>
              </tr>
              <tr>
                <td><b>行测</b></td><td>{GOAL.xingce}</td><td className="num">{lastExam.xingce}</td>
                <td>{chip(gap ? gap.xingceGap : null, true)}</td><td>单科合格线 50 ✓</td>
              </tr>
              <tr>
                <td><b>申论</b></td><td>{GOAL.shenlun}</td><td className="num">{lastExam.shenlun}</td>
                <td>{chip(gap ? gap.shenlunGap : null, true)}</td><td>B类满分 100</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="empty-tip">还没有模考记录 → 去「模考复盘」录入一次摸底成绩，就能看到与 145 的差距</div>
        )}

        {lastExam && lastExam.m && (
          <div style={{ marginTop: 14 }}>
            <div className="section-sub">行测五模块正确率（目标 % / 当前 %）</div>
            {MODULES.map(mo => {
              const v = lastExam.m[mo.key];
              const ok = v != null && v >= mo.target;
              return (
                <div key={mo.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  <span style={{ width: 66, fontSize: 12.5, fontWeight: 600 }}>{mo.label}</span>
                  <div className="bar-wrap" style={{ flex: 1, height: 7 }}>
                    <i style={{ width: (v == null ? 0 : v) + '%', background: ok ? 'var(--green)' : (v == null ? '#ddd' : 'var(--red)') }} />
                  </div>
                  <span className="num" style={{ width: 78, fontSize: 12, textAlign: 'right', color: ok ? 'var(--green)' : 'var(--red)' }}>
                    {v == null ? '未记录' : v + '% / 目标 ' + mo.target + '%'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title"><span className="ic">🗂️</span>错题分布速览</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div className="section-sub">按科目（共 {state.mistakes.length} 条）</div>
            {mistakeStats.length ? (
              <table className="tbl">
                <tbody>
                  {mistakeStats.map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td className="num" style={{ textAlign: 'right' }}>{v} 条</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="hint">暂无错题</div>}
          </div>
          <div>
            <div className="section-sub">按错因</div>
            {errStats.length ? (
              <table className="tbl">
                <tbody>
                  {errStats.map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td className="num" style={{ textAlign: 'right' }}>{v} 条</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="hint">暂无错题</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
