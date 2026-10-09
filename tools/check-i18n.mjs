// Checks that every UI string passed to the translator (L(...), tr(...), IT.i18n.t(...))
// and every data-t / data-t-html / data-t-attr text in index.html has a Serbian entry.
// Usage: node tools/check-i18n.mjs
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'de' }, document: { querySelectorAll: () => [], documentElement: {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/i18n.js', 'utf8'), ctx);
const dict = ctx.window.IT.i18n._dict;

const missing = new Set();
const CODES = new Set(['audio', 'link', 'step', 'passage', 'both', 'miss', 'wrong', 'good', 'warn', 'bad']);   // literals used in conditions
const check = (k, where) => { if (!(k in dict) && !CODES.has(k)) missing.add(`${where}: ${k}`); };

// --- JS: first argument of L( / tr( / i18n.t(
function firstArg(src, i) {
  let depth = 0, j = i, quote = null;
  for (; j < src.length; j++) {
    const c = src[j];
    if (quote) { if (c === '\\') { j++; continue; } if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { if (depth === 0) break; depth--; }
    else if (c === ',' && depth === 0) break;
  }
  return src.slice(i, j);
}
for (const f of fs.readdirSync('js').filter(f => f.endsWith('.js') && f !== 'i18n.js' && f !== 'score-data.js')) {
  const src = fs.readFileSync('js/' + f, 'utf8');
  const re = /(?:\bL|\btr|i18n\.t)\(/g;
  let m;
  while ((m = re.exec(src))) {
    const arg = firstArg(src, m.index + m[0].length);
    for (const lit of arg.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
      const k = lit[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      if (k.length > 1) check(k, f);
    }
  }
}

// --- HTML static texts
const html = fs.readFileSync('index.html', 'utf8');
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
for (const m of html.matchAll(/<(\w+)((?:[^>](?!data-t))*?)\sdata-t(?=[\s>=])(?:="([^"]*)")?([^>]*)>([^<]*)<\/\1>/g)) {
  const key = m[3] != null && m[3] !== '' ? decode(m[3]) : decode(m[5].trim());
  if (key) check(key, 'index.html data-t');
}
for (const m of html.matchAll(/<(li|p)[^>]*\sdata-t-html[^>]*>([\s\S]*?)<\/\1>/g)) check(m[2].trim(), 'index.html data-t-html');
for (const m of html.matchAll(/<[^>]*data-t-attr="([^"]+)"[^>]*>/g)) {
  for (const a of m[1].split(',')) {
    const v = new RegExp(`${a.trim()}="([^"]*)"`).exec(m[0]);
    if (v) check(decode(v[1]), 'index.html attr ' + a);
  }
}
if (missing.size) { console.log('Missing Serbian entries:\n' + [...missing].join('\n')); process.exitCode = 1; }
else console.log('i18n: all keys present (' + Object.keys(dict).length + ' entries)');
