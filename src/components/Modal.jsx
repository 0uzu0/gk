import { useEffect } from 'react';

export default function Modal({ open, title, icon, children, footer, wide, onClose }) {
  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-mask" onClick={e => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="modal-head">
          <h3>{icon ? <span style={{ marginRight: 2 }}>{icon}</span> : null}{title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        {children}
        {footer ? <div className="m-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
