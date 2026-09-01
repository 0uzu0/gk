import { useRef, useState } from 'react';
import { exportData, parseImport, downloadJSON, getAiConfig, AI_KEY } from '../lib/storage.js';
import { imgStore } from '../lib/imgstore.js';
import { useToast } from './Toast.jsx';

export default function DataPanel({ state, dispatch, examDate, onExamDate }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const data = await exportData(state, imgStore);
      downloadJSON(data, '公考备考工作台备份_' + new Date().toISOString().slice(0, 10) + '.json');
      toast('备份已导出（含图片）');
    } catch (e) {
      toast('导出失败：' + e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file) => {
    setBusy(true);
    try {
      const { state: newState, imageCount } = await parseImport(file, imgStore);
      dispatch({ type: 'REPLACE', state: { ...newState, examDate } });
      toast('导入成功' + (imageCount ? '（含 ' + imageCount + ' 张图片）' : ''));
    } catch (e) {
      toast('导入失败：' + e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const clearExamples = () => {
    /* 同时清理示例错题可能带的图片 */
    state.mistakes.filter(m => m.demo).forEach(m => (m.imgs || []).forEach(id => imgStore.del(id)));
    dispatch({ type: 'CLEAR_EXAMPLES' });
    toast('示例数据已清空，你的记录已保留');
  };

  return (
    <div>
      <div className="card">
        <div className="card-title"><span className="ic">🗄️</span>数据管理</div>
        <div className="dm-row">
          <div className="l">
            <div className="t">💾 导出备份（含图片）</div>
            <div className="d">导出全部数据 + 错题图片为 JSON 文件。建议每周日导出一份，放到 Syncthing 同步目录即可多端留存。</div>
          </div>
          <button className="btn sm" onClick={doExport} disabled={busy}>导出</button>
        </div>
        <div className="dm-row">
          <div className="l">
            <div className="t">📥 导入备份</div>
            <div className="d">从 JSON 备份恢复数据，会覆盖当前内容。图片会一并写入本机存储。</div>
          </div>
          <button className="btn ghost sm" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>选择文件</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden
            onChange={e => { const f = e.target.files[0]; if (f) doImport(f); e.target.value = ''; }} />
        </div>
        <div className="dm-row">
          <div className="l">
            <div className="t">🧹 清空示例数据</div>
            <div className="d">删除预置的摸底任务/示例错题/示例模考（带「示例」标记的），你自己的记录不受影响。</div>
          </div>
          <button className="btn ghost sm" onClick={clearExamples}>清空示例</button>
        </div>
        <div className="dm-row">
          <div className="l">
            <div className="t">🗓️ 笔试日期</div>
            <div className="d">按公告调整实际笔试日，倒计时与阶段进度自动重算（默认 2026-12-05）。</div>
          </div>
          <input type="date" value={examDate} style={{ width: 150 }} onChange={e => onExamDate(e.target.value)} />
        </div>
        <div className="dm-row">
          <div className="l">
            <div className="t" style={{ color: 'var(--red)' }}>⚠️ 清除全部数据</div>
            <div className="d">删除所有任务/模考/错题/复盘记录（含图片）。不可恢复，请先导出备份！</div>
          </div>
          {confirmClear ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn red sm" onClick={() => { dispatch({ type: 'CLEAR_ALL' }); setConfirmClear(false); toast('已清空全部数据'); }}>确认清除</button>
              <button className="btn ghost sm" onClick={() => setConfirmClear(false)}>取消</button>
            </div>
          ) : (
            <button className="btn ghost sm" style={{ color: 'var(--red)', borderColor: '#f3b3b3' }} onClick={() => setConfirmClear(true)}>清除全部</button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title"><span className="ic">ℹ️</span>关于本工作台</div>
        <div className="hint">
          React 重构版 v2.0 · 数据存本机浏览器（localStorage + IndexedDB 图片）· 离线可用
          <br />AI 功能需要自行配置 API Key（仅存本机，不上传）
          <br />备份文件建议放 Syncthing 同步目录实现多端留存
        </div>
      </div>
    </div>
  );
}
