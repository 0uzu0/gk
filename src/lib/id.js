/* ============================================================
 * id.js —— 全工程统一 ID 生成
 * 背景：此前 6 处组件各自手写 'mk_'/'q_'/'at_'/'ex_'/'rv_'/'img_' + 随机串，
 *       格式不一、无递增序列（同毫秒内高概率碰撞）。
 * 约定：所有实体 ID 一律走 uid(prefix)，前缀标识实体类型，便于排查与日志。
 * prefix 取值：task / exam / review / mk(错题) / img(图片) / q(真题) / at(作答) / tmp(临时预览)
 * ============================================================ */

let _seq = 0;

export function uid(prefix = 'id') {
  _seq = (_seq + 1) % 46656; // 36^3，同毫秒内靠序号 + 随机双重去重
  const t = Date.now().toString(36);
  const s = _seq.toString(36).padStart(3, '0');
  const r = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${t}${s}${r}`;
}

/* 图片 ID 需要额外的序号位（一次迁移可能批量生成），单独给出 */
export function imgId(index = 0) {
  return `img_${Date.now().toString(36)}${_seq.toString(36)}_${Math.random().toString(36).slice(2, 8)}_${index}`;
}
