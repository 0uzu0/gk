/* 静态检查：扫描 src 下所有 .js/.jsx，找出「引用了但没有绑定」的标识符
   —— 即运行时 ReferenceError 风险（如 storage.js 用了 imgStore 却没 import）。
   用法：node _lint_undef.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

const traverse = _traverse.default || _traverse;

const ROOT = new URL('./src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/* 浏览器/语言全局白名单 */
const GLOBALS = new Set([
  'window', 'document', 'console', 'localStorage', 'sessionStorage', 'indexedDB',
  'fetch', 'Blob', 'FileReader', 'Image', 'URL', 'Date', 'Math', 'JSON', 'Object',
  'Array', 'String', 'Number', 'Boolean', 'Promise', 'Set', 'Map', 'Error',
  'RegExp', 'parseInt', 'parseFloat', 'isNaN', 'NaN', 'undefined', 'null', 'true', 'false',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'alert', 'confirm', 'prompt', 'navigator', 'location', 'history', 'crypto',
  'HTMLElement', 'Event', 'CustomEvent', 'FormData', 'File', 'FileList',
  'structuredClone', 'TextEncoder', 'TextDecoder', 'AbortController', 'Response', 'Request',
  'globalThis', 'performance', 'Intl', 'Symbol', 'Proxy', 'Reflect', 'WeakMap', 'WeakSet',
  'require', 'module', 'exports', 'process', '__dirname', '__filename', 'Buffer'
]);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(f)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
let total = 0;

for (const file of files) {
  const code = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx'],
      errorRecovery: true
    });
  } catch (e) {
    console.log('❌ 解析失败 ' + relative(ROOT, file) + ': ' + e.message);
    continue;
  }

  const issues = [];
  traverse(ast, {
    ReferencedIdentifier(path) {
      const name = path.node.name;
      if (GLOBALS.has(name)) return;
      if (path.scope.hasBinding(name, true)) return; // 自己作用域链上有
      // 排除属性访问 obj.foo（foo 不是引用）
      if (path.parentPath.isMemberExpression() && path.parentPath.node.property === path.node) return;
      if (path.parentPath.isObjectProperty() && path.parentPath.node.key === path.node
          && !path.parentPath.node.computed) return;
      // JSX 标签 <Foo /> 中 Foo 未定义
      const line = path.node.loc ? path.node.loc.start.line : '?';
      issues.push(`  L${line}: ${name}`);
    }
  });

  if (issues.length) {
    total += issues.length;
    console.log('⚠️  ' + relative(ROOT, file));
    console.log([...new Set(issues)].join('\n'));
    console.log('');
  }
}

console.log(total === 0 ? '✅ 未发现未定义引用' : `共 ${total} 处可疑未定义引用`);
