/* ============================================================
 * useAppState.js —— 全局状态（useReducer + localStorage 持久化）
 * 单向数据流：dispatch(action) → reducer → state → 自动保存
 * ============================================================ */
import { useReducer, useEffect, useMemo, useRef, useState } from 'react';
import {
  initState, saveState, emptyState, demoState,
  finalizeImgMigration, getExamDate, setExamDate
} from '../lib/storage.js';
import { imgStore } from '../lib/imgstore.js';
import { uid } from '../lib/id.js';

/* 作答记录上限：只保留最近 N 条。
   刷题是高频动作，attempts 只增不删会持续撑大 localStorage，最终触发配额写入失败。 */
export const MAX_ATTEMPTS = 2000;

function reducer(state, action) {
  switch (action.type) {
    case 'REPLACE': return action.state;

    case 'TOGGLE_TASK':
      return { ...state, tasks: state.tasks.map(t => t.id === action.id ? { ...t, done: !t.done } : t) };

    case 'SHIFT_TASK': {
      // 逾期任务顺延到今天
      const today = action.today;
      return { ...state, tasks: state.tasks.map(t => t.id === action.id ? { ...t, date: today } : t) };
    }

    case 'ADD_TASKS':
      return { ...state, tasks: state.tasks.concat(action.tasks) };

    case 'DELETE_TASK':
      return { ...state, tasks: state.tasks.filter(t => t.id !== action.id) };

    case 'ADD_EXAM':
      return { ...state, exams: state.exams.concat(action.exam) };

    case 'UPDATE_EXAM':
      return { ...state, exams: state.exams.map(e => e.id === action.id ? { ...e, ...action.patch } : e) };

    case 'DELETE_EXAM':
      return { ...state, exams: state.exams.filter(e => e.id !== action.id) };

    case 'ADD_MISTAKE':
      return { ...state, mistakes: state.mistakes.concat(action.mistake) };

    case 'UPDATE_MISTAKE':
      return { ...state, mistakes: state.mistakes.map(m => m.id === action.id ? { ...m, ...action.patch } : m) };

    case 'SET_MISTAKE_STATE':
      return { ...state, mistakes: state.mistakes.map(m => m.id === action.id ? { ...m, state: action.val } : m) };

    case 'DELETE_MISTAKE':
      return { ...state, mistakes: state.mistakes.filter(m => m.id !== action.id) };

    case 'ADD_REVIEW':
      return { ...state, reviews: state.reviews.concat(action.review) };

    case 'DELETE_REVIEW':
      return { ...state, reviews: state.reviews.filter(r => r.id !== action.id) };

    case 'ADD_QUESTIONS':
      return { ...state, questions: state.questions.concat(action.questions) };

    case 'UPDATE_QUESTION':
      return { ...state, questions: state.questions.map(q => q.id === action.id ? { ...q, ...action.patch } : q) };

    case 'DELETE_QUESTION':
      return { ...state, questions: state.questions.filter(q => q.id !== action.id) };

    case 'ADD_ATTEMPT': {
      const next = state.attempts.concat(action.attempt);
      return {
        ...state,
        attempts: next.length > MAX_ATTEMPTS ? next.slice(next.length - MAX_ATTEMPTS) : next
      };
    }

    case 'CLEAR_EXAMPLES':
      return {
        ...state,
        tasks: state.tasks.filter(t => !t.demo),
        exams: state.exams.filter(e => !e.demo),
        mistakes: state.mistakes.filter(m => !m.demo),
        reviews: state.reviews.filter(r => !r.demo),
        questions: state.questions.filter(q => !q.demo),
        attempts: state.attempts.filter(a => !a.demo)
      };

    case 'CLEAR_ALL':
      return { ...emptyState(), examDate: state.examDate };

    case 'SET_EXAM_DATE':
      setExamDate(action.date);
      return { ...state, examDate: action.date };

    case 'AUTO_TASKS': {
      // 每日自动任务注入（含今天 + 昨日逾期补录）
      let tasks = state.tasks.slice();
      for (const dateStr of action.dates) {
        const tmpl = action.templates[dateStr] || [];
        for (const t of tmpl) {
          const hit = tasks.some(x => x.date === dateStr && x.title === t.title);
          if (!hit) tasks.push({ id: uid(), date: dateStr, ...t, done: false, auto: true });
        }
      }
      return { ...state, tasks };
    }

    default:
      return state;
  }
}

export function useAppState() {
  // 惰性初始化：同步迁移（v2→v1→示例）+ 异步图片迁移标记
  const [state, dispatch] = useReducer(reducer, null, () => {
    const { state, pendingImgs } = initState();
    // examDate 单独 key 管理
    return { ...state, examDate: getExamDate(), _pendingImgs: pendingImgs };
  });

  const savedRef = useRef(false);
  /* 写入失败（多为 localStorage 配额耗尽）不再静默，交由上层提示用户 */
  const [saveError, setSaveError] = useState(null);

  // 持久化（跳过首轮因为首轮来自存储）
  useEffect(() => {
    if (!savedRef.current) { savedRef.current = true; return; }
    const { _pendingImgs, ...rest } = state;
    const ok = saveState(rest);
    setSaveError(ok ? null : '本地存储空间不足，本次改动可能未保存。建议到「数据管理」导出备份后清理旧数据。');
  }, [state]);

  // 异步：v1 图片迁移 → imgstore，完成后清理 pending
  useEffect(() => {
    const pending = state._pendingImgs;
    if (!pending || !pending.length) return;
    let cancelled = false;
    (async () => {
      const { migrated } = await finalizeImgMigration(state, pending, imgStore);
      if (!cancelled && migrated > 0) {
        dispatch({ type: 'REPLACE', state: { ...state, _pendingImgs: [] } });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useMemo(() => ({
    state,
    dispatch,
    saveError
  }), [state, saveError]);

  return api;
}

/* 便捷动作构造器（供组件调用） */
export const actions = {
  toggleTask: id => ({ type: 'TOGGLE_TASK', id }),
  shiftTask: (id, today) => ({ type: 'SHIFT_TASK', id, today }),
  deleteTask: id => ({ type: 'DELETE_TASK', id }),
  addTasks: tasks => ({ type: 'ADD_TASKS', tasks }),
  addExam: exam => ({ type: 'ADD_EXAM', exam }),
  deleteExam: id => ({ type: 'DELETE_EXAM', id }),
  addMistake: mistake => ({ type: 'ADD_MISTAKE', mistake }),
  updateMistake: (id, patch) => ({ type: 'UPDATE_MISTAKE', id, patch }),
  setMistakeState: (id, val) => ({ type: 'SET_MISTAKE_STATE', id, val }),
  deleteMistake: id => ({ type: 'DELETE_MISTAKE', id }),
  addReview: review => ({ type: 'ADD_REVIEW', review }),
  deleteReview: id => ({ type: 'DELETE_REVIEW', id }),
  addQuestions: questions => ({ type: 'ADD_QUESTIONS', questions }),
  updateQuestion: (id, patch) => ({ type: 'UPDATE_QUESTION', id, patch }),
  deleteQuestion: id => ({ type: 'DELETE_QUESTION', id }),
  addAttempt: attempt => ({ type: 'ADD_ATTEMPT', attempt }),
  clearExamples: () => ({ type: 'CLEAR_EXAMPLES' }),
  clearAll: () => ({ type: 'CLEAR_ALL' }),
  setExamDate: date => ({ type: 'SET_EXAM_DATE', date }),
  autoTasks: (dates, templates) => ({ type: 'AUTO_TASKS', dates, templates }),
  replace: state => ({ type: 'REPLACE', state })
};

/* 验证 demo 示例是否应存在（无任何数据时展示示例） */
export function hasAnyData(state) {
  return (state.tasks.length + state.exams.length + state.mistakes.length + state.reviews.length + state.questions.length) > 0;
}
