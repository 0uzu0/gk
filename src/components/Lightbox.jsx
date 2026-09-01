import { useEffect, useState } from 'react';

/* 图片灯箱：多图左右切换，键盘 Esc/←/→ 支持 */
export default function Lightbox({ imgs, index, onClose }) {
  const [idx, setIdx] = useState(index || 0);

  useEffect(() => { setIdx(index || 0); }, [index]);

  useEffect(() => {
    if (!imgs || !imgs.length) return;
    const h = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') nav(-1);
      if (e.key === 'ArrowRight') nav(1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgs]);

  if (!imgs || !imgs.length) return null;
  const cur = ((idx % imgs.length) + imgs.length) % imgs.length;
  const nav = d => setIdx(cur + d);

  return (
    <div className="lb-mask" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="lb-x" onClick={onClose} aria-label="关闭">✕</button>
      <img className="lb-img" src={imgs[cur]} alt="错题图片" />
      <div className="lb-meta">
        {imgs.length > 1 && <button className="lb-nav" onClick={() => nav(-1)}>‹</button>}
        <span>{cur + 1} / {imgs.length}</span>
        {imgs.length > 1 && <button className="lb-nav" onClick={() => nav(1)}>›</button>}
      </div>
    </div>
  );
}
