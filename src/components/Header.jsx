import { totalProgress, getStage, fmtMD, diffDays, START_DATE } from '../lib/dates.js';

export default function Header({ examDate }) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const prog = totalProgress(todayStr, examDate);
  const stage = getStage(todayStr);
  const wd = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 周${wd}`;

  let dayLabel;
  if (stage.name === '备战预热') {
    const d = Math.max(1, diffDays(todayStr, START_DATE));
    dayLabel = `距开跑 ${d} 天`;
  } else {
    dayLabel = `备考第 ${prog.used} 天`;
  }

  return (
    <header className="hd">
      <div className="hd-top">
        <div>
          <h1>📚 江苏省考 B 类法学岗 · 备考工作台</h1>
          <div className="sub">{dateLabel} ｜ 目标 145（行测 70 + 申论 75）｜ 笔试 {fmtMD(examDate)}</div>
        </div>
        <div className="hd-right">
          <div className="cd">
            <b className="num">{prog.left}<small>天</small></b>
            <div className="cd-label">距笔试</div>
          </div>
          <div className="cd">
            <b className="num">{prog.used}<small>天</small></b>
            <div className="cd-label">已备考</div>
          </div>
        </div>
      </div>
      <div className="hd-bar"><i style={{ width: prog.pct + '%' }} /></div>
      <div className="hd-meta">
        <span className="stage-chip">{stage.name} · {stage.desc}</span>
        <span>{dayLabel} ｜ 总进度 {prog.pct}%</span>
      </div>
    </header>
  );
}
