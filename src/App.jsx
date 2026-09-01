import { useState } from 'react';
import TodayPanel from './components/TodayPanel.jsx';
import ProgressPanel from './components/ProgressPanel.jsx';
import ExamPanel from './components/ExamPanel.jsx';
import MistakePanel from './components/MistakePanel.jsx';
import AiPanel from './components/AiPanel.jsx';
import DataPanel from './components/DataPanel.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { useAppState, actions } from './store/useAppState.js';
import { totalProgress, getStage, todayStr, diffDays, START_DATE } from './lib/dates.js';

const NAV = [
  { group: '每日' },
  { key: 'today', label: '今日打卡', ic: '🗓️', desc: '今日任务 · 逾期处理 · 本周概览' },
  { group: '复盘' },
  { key: 'progress', label: '备考进度', ic: '📈', desc: '关键指标 · 阶段进度 · 目标拆解' },
  { key: 'exam', label: '模考复盘', ic: '📝', desc: '模考趋势 · 成绩记录 · 周复盘' },
  { key: 'mistake', label: '错题本', ic: '📌', desc: '错题归档 · 重做追踪 · 图片留存' },
  { group: '工具' },
  { key: 'ai', label: 'AI 助手', ic: '✨', desc: '申论批改 · 错题解析 · 提分分析' },
  { key: 'data', label: '数据管理', ic: '🗄️', desc: '备份 · 导入 · 笔试日期' }
];

function getAiKey() {
  try {
    const raw = localStorage.getItem('wb_gk_2027_ai_config');
    if (raw) return JSON.parse(raw).apiKey;
  } catch (e) { /* noop */ }
  return '';
}

function Shell() {
  const { state, dispatch } = useAppState();
  const [tab, setTab] = useState('today');
  const [aiPrefill, setAiPrefill] = useState(null);
  const toast = useToast();

  const examDate = state.examDate || '2026-12-05';
  const today = todayStr();
  const prog = totalProgress(today, examDate);
  const stage = getStage(today);

  const now = new Date();
  const wd = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 · 周${wd}`;
  const dayLabel = stage.name === '备战预热'
    ? `距开跑 ${Math.max(1, diffDays(today, START_DATE))} 天`
    : `备考第 ${prog.used} 天`;

  const active = NAV.find(t => t.key === tab);
  const hasMistake = state.mistakes.some(m => m.state !== 'done');
  const hasAiKey = !!getAiKey();

  const aiAnalyze = (mistake) => { setAiPrefill({ mistake }); setTab('ai'); };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="sb-logo">📚</div>
          <div>
            <h1>备考工作台</h1>
            <div className="sb-sub">江苏省考 · B类 · 法学岗</div>
          </div>
        </div>

        <div className="sb-count">
          <div className="lbl">⏳ 距笔试</div>
          <div className="big num">{prog.left}<small>天</small></div>
          <div className="bar"><i style={{ width: prog.pct + '%' }} /></div>
          <div className="meta"><span>{dayLabel}</span><span>{prog.pct}%</span></div>
        </div>

        <nav className="sb-nav">
          {NAV.map(t => t.group
            ? <div key={t.group} className="group">{t.group}</div>
            : (
              <button key={t.key} className={'nav-item' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
                <span className="ic">{t.ic}</span>
                <span>{t.label}</span>
                {t.key === 'mistake' && hasMistake && <span className="dot" />}
                {t.key === 'ai' && !hasAiKey && <span className="dot warn" />}
              </button>
            )
          )}
        </nav>

        <div className="sb-foot">
          目标 145（行测 70 + 申论 75）<br />笔试 {examDate}
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <div className="t-title"><span className="ic">{active.ic}</span>{active.label}</div>
            <div className="t-sub">{active.desc}</div>
          </div>
          <div className="t-right">
            <span className="stage-chip">{stage.name} · {stage.desc}</span>
            <span className="t-date">{dateLabel}</span>
          </div>
        </div>

        <div className="content">
          {tab === 'today' && <TodayPanel state={state} dispatch={dispatch} examDate={examDate} />}
          {tab === 'progress' && <ProgressPanel state={state} examDate={examDate} />}
          {tab === 'exam' && <ExamPanel state={state} dispatch={dispatch} />}
          {tab === 'mistake' && <MistakePanel state={state} dispatch={dispatch} onAiAnalyze={aiAnalyze} />}
          {tab === 'ai' && <AiPanel state={state} dispatch={dispatch} prefill={aiPrefill} clearPrefill={() => setAiPrefill(null)} />}
          {tab === 'data' && (
            <DataPanel state={state} dispatch={dispatch} examDate={examDate}
              onExamDate={d => { dispatch(actions.setExamDate(d)); toast('笔试日期已更新'); }} />
          )}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
