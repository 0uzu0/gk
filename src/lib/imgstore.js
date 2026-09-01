/* ============================================================
 * imgstore.js —— 图片存储适配器
 * 优先 IndexedDB（容量大，解决 5MB 上限），失败自动降级 localStorage。
 * 统一异步接口：put / get / del / exists
 * ============================================================ */

const DB_NAME = 'wb_gk_imgs';
const DB_VER = 1;
const STORE = 'imgs';
const LS_PREFIX = 'wb_gk_img_';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbPut(key, value) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

async function idbGet(key) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

async function idbDel(key) {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) { resolve(); }
  });
}

/* 暴露接口 */
export const imgStore = {
  async put(key, dataUrl) {
    const ok = await idbPut(key, dataUrl);
    if (!ok) {
      try { localStorage.setItem(LS_PREFIX + key, dataUrl); return true; }
      catch (e) { return false; }
    }
    return true;
  },
  async get(key) {
    if (!key) return null;
    const v = await idbGet(key);
    if (v) return v;
    try { return localStorage.getItem(LS_PREFIX + key); } catch (e) { return null; }
  },
  async del(key) {
    await idbDel(key);
    try { localStorage.removeItem(LS_PREFIX + key); } catch (e) { /* noop */ }
  },
  async has(key) {
    return !!(await this.get(key));
  },
  /* 批量取回（用于导出/渲染） */
  async getMany(keys) {
    const out = {};
    await Promise.all((keys || []).map(async (k) => {
      out[k] = await this.get(k);
    }));
    return out;
  }
};

/* 压缩图片：最长边 maxSide、JPEG 质量 quality，返回 dataURL */
export function compressImageFile(file, maxSide = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      reject(new Error('请选择图片文件'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('单张图片超过 8MB，请压缩后上传'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // 透明底转白
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        let dataUrl;
        try {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        } catch (e) {
          dataUrl = reader.result; // 降级：原图
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('图片解析失败'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}
