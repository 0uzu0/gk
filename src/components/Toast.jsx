import { useMemo, useRef, useState, createContext, useContext } from 'react';

const ToastCtx = createContext(() => {});

export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const timer = useRef({});

  const push = useMemo(() => (msg, type) => {
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    setList(l => l.concat({ id, msg, type }));
    clearTimeout(timer.current[id]);
    timer.current[id] = setTimeout(() => {
      setList(l => l.filter(x => x.id !== id));
    }, 2600);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-box">
        {list.map(t => (
          <div key={t.id} className={'toast' + (t.type === 'err' ? ' err' : '')}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
