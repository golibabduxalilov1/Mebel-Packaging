// Kodda ishlatilgan t('...') kalitlari uz.ts da borligini tekshiradi. Ishga tushirish: node scripts/check-i18n.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../src/', import.meta.url).pathname;
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(f) && files.push(p); });
walk(root);
const dictSrc = (n) => readFileSync(join(root, 'lib/i18n', n), 'utf8');
const keysOf = (src) => new Set([...src.matchAll(/'([a-zA-Z0-9_.]+)':/g)].map((m) => m[1]));
const uz = keysOf(dictSrc('uz.ts')), ru = keysOf(dictSrc('ru.ts'));
const used = new Set();
const prefixes = new Set();
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\b(?:t|tr|tRef\.current)\('([a-zA-Z0-9_.]+)'(\s*\+)?/g)) (m[2] ? prefixes : used).add(m[1]);
  for (const m of s.matchAll(/'(glue\.hint3[mt])'/g)) used.add(m[1]);
}
let bad = 0;
for (const k of used) if (!uz.has(k)) { console.log('uz da yo\'q:', k); bad++; }
for (const k of uz) if (!ru.has(k)) { console.log('ru da yo\'q:', k); bad++; }
for (const k of ru) if (!uz.has(k)) { console.log('uz da ortiqcha ru kaliti:', k); bad++; }
for (const p of prefixes) if (![...uz].some((k) => k.startsWith(p))) { console.log('prefiks uchun kalit yo\'q:', p); bad++; }
console.log(`kalitlar: ishlatilgan ${used.size}, prefikslar ${prefixes.size}, uz ${uz.size}, ru ${ru.size}; xato ${bad}`);
process.exit(bad ? 1 : 0);
