// 把對戰網頁的資料（battle/data/db.json，由規則站資料產生）包成 data/db.js，
// 這樣用 file:// 直接開網頁也讀得到（瀏覽器不允許 file:// 用 fetch 讀本機檔）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'battle', 'data', 'db.json');
const out = join(here, '..', 'data', 'db.js');
const db = JSON.parse(readFileSync(src, 'utf8'));
writeFileSync(out, 'window.PKDB=' + JSON.stringify(db) + ';\n');
console.log('wrote', out, Object.keys(db).join(','));
