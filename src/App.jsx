import { useState } from 'react';
import Header from './components/Header.jsx';
import TodayPanel from './components/TodayPanel.jsx';
import ProgressPanel from './components/ProgressPanel.jsx';
import ExamPanel from './components/ExamPanel.jsx';
import MistakePanel from './components/MistakePanel.jsx';
import AiPanel from './components/AiPanel.jsx';
import DataPanel from './components/DataPanel.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { useAppState } from './store/useAppState.js';
import { actions } from './store/useAppState.js';

const TABS = [
  { key: 'today', label: '今日打卡', ic: '🗓️' },
  { key: 'progress', label: '备考进度', ic: '📈' },
  { key: 'exam', label: '模考复盘', ic: '📝' },
  { key: 'mistake', label: '错题本', ic: '📌' },
  { key: 'ai', label: 'AI 助手', ic: '✨' },
  { key: 'data', label: '数据管理', ic: '🗄️' }
];

function Shell() {
  const { state, dispatch } = useAppState();
  const [tab, setTab] = useState('today');
  const [aiPrefill, setAiPrefill] = useState(null);
  const toast = useToast();

  const examDate = state.examDate || '2026-12-05';

  const aiAnalyze = (mistake) => {
    setAiPrefill({ mistake });
    setTab('ai');
  };

  return (
    <div className="wrap">
      <Header examDate={examDate} />

      <nav className="tabs">
        {TABS.map(t => (
          <button key={t.key} className={'tab' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
            {t.ic} {t.label}
            {t.key === 'mistake' && state.mistakes.some(m => m.state !== 'done') && <span className="dot" />}
            {t.key === 'ai' && !getAiKey() && <span className="dot" style={{ background: 'var(--gold)' }} />}
          </button>
        ))}
      </nav>

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
  );
}

function getAiKey() {
  try {
    const raw = localStorage.getItem('wb_gk_2027_ai_config');
    if (raw) return JSON.parse(raw).apiKey;
  } catch (e) { /* noop */ }
  return '';
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
