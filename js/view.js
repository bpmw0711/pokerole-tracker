// 玩家看板（唯讀）：用連結 view.html#<id> 開啟，即時顯示 GM 分享的戰場狀態。
// 只讀 trackers/{id}/view（GM 過濾後的快照），不需登入。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const F = window.PKF, DB = window.PKDB;
const SPR = 'https://bpmw0711.github.io/pokerole3.0-zh-TW/assets/spr/';
const CFG = {
  apiKey: 'AIzaSyC5za4VacV_u0GWw5nKczafpShNpVgnpzs', authDomain: 'pokerole-battle.firebaseapp.com',
  databaseURL: 'https://pokerole-battle-default-rtdb.asia-southeast1.firebasedatabase.app', projectId: 'pokerole-battle',
  storageBucket: 'pokerole-battle.firebasestorage.app', messagingSenderId: '1021588929953', appId: '1:1021588929953:web:92999662e3489896f91fe0',
};

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}
const signed = (n) => (n > 0 ? '+' + n : String(n));
const app = document.getElementById('app');
const id = decodeURIComponent(location.hash.replace(/^#/, '')).trim();
let lastTime = null;

function statusText(st) {
  let t = F.STATUS_ZH[st.kind] || st.kind;
  if (st.kind === 'custom') t = st.note || '狀態';
  if (st.kind === 'burn') t += ` ${st.level || 1} 級`;
  if (st.rounds != null && st.rounds !== '') t += `（${st.rounds === 0 ? '到期' : '剩 ' + st.rounds + ' 輪'}）`;
  return t;
}
function effChip(e) {
  const expired = e.rounds === 0;
  return h('span', { class: 'chip eff' + (expired ? ' expired' : '') }, h('b', {}, e.name || ''), e.rounds != null ? h('small', {}, expired ? '到期' : `剩 ${e.rounds} 輪`) : null);
}

function draw(v) {
  const side = Object.fromEntries(v.sides.map((s) => [s.id, s]));
  const model = {
    location: v.location, sides: v.sides, effects: v.effects, targets: v.targets || {}, suggest: {}, sprBase: SPR,
    tokens: v.list.map((c) => {
      const hp = c.hp || {};
      const pct = hp.mode === 'exact' ? Math.min(100, Math.round(hp.cur / Math.max(1, hp.max) * 100)) : hp.pct;
      return { id: c.id, name: c.name, img: c.img != null ? c.img : null, trainer: c.trainer, side: c.side, pos: c.pos || null, hp: hp.mode === 'hidden' || pct == null ? null : { pct },
        down: c.down, current: v.turn === c.id, status: c.status.map((s) => s.kind), attached: c.effects.map((e) => ({ id: e.id, name: e.name, rounds: e.rounds })) };
    }),
  };
  const rows = v.list.map((c) => {
    const sd = side[c.side] || { color: '#888', name: '' }, cur = v.turn === c.id;
    const hp = c.hp || {};
    const pct = hp.mode === 'exact' ? Math.min(100, Math.round(hp.cur / Math.max(1, hp.max) * 100)) : hp.pct;
    const boxes = Array.from({ length: 5 }, (_, k) => h('span', { class: 'abox ro' + (k < c.actionCount ? ' on' : '') }, k + 1));
    return h('div', { class: 'orow ro' + (cur ? ' cur' : '') + (c.down ? ' down' : ''), style: { borderLeftColor: sd.color } },
      h('div', { class: 'ptrro' }, cur ? '▶' : ''),
      h('div', { class: 'who' }, c.img != null ? h('img', { class: 'sprite', src: SPR + c.img + '.png', alt: '', onerror: (e) => { e.target.style.visibility = 'hidden'; } }) : h('span', { class: 'sprite ph' }, c.trainer ? '🧑' : '？'),
        h('div', { class: 'wn' }, h('b', { class: 'nm' }, c.name), h('small', {}, h('span', { class: 'sdot', style: { background: sd.color } }), sd.name, c.owner ? '・' + c.owner : ''))),
      h('div', { class: 'hpc' },
        hp.mode === 'hidden' ? h('small', { class: 'muted' }, 'HP 不公開') : [
          h('div', { class: 'bar' }, h('i', { style: { width: pct + '%', background: pct > 50 ? 'var(--hp-hi)' : pct > 25 ? 'var(--hp-mid)' : 'var(--hp-lo)' } })),
          hp.mode === 'exact' ? h('div', { class: 'hpn' }, h('b', {}, `${hp.cur} / ${hp.max}`)) : null],
        c.down ? h('small', { class: 'dead' }, '倒下') : null),
      h('div', { class: 'stc' }, c.status.map((s) => h('span', { class: 'chip st-' + s.kind }, statusText(s))),
        c.mods.map((m) => h('span', { class: 'chip mod ' + (m.v > 0 ? 'up' : 'dn') }, F.ATTR_ZH[m.stat] + signed(m.v))), c.effects.map(effChip)),
      h('div', { class: 'acts' }, h('div', { class: 'aboxes' }, boxes, c.actionCount > 5 ? h('small', {}, '+' + (c.actionCount - 5)) : null)));
  });
  const cur = v.list.find((c) => c.id === v.turn);
  app.replaceChildren(
    h('div', { class: 'panel head' }, h('div', { class: 'hero' }, h('span', { class: 'pball' }),
      h('div', { class: 'grow' }, h('h1', {}, v.title || '戰場看板'), h('small', {}, '玩家看板（唯讀）・GM 更新後會自動刷新'))),
      h('div', { class: 'row vround' }, h('b', { class: 'rd' }, `第 ${v.round} 輪`), cur ? h('span', {}, '目前輪到：', h('b', {}, cur.name)) : null,
        h('span', { class: 'grow' }), lastTime ? h('small', { class: 'muted' }, `更新於 ${lastTime}`) : null)),
    h('div', { class: 'panel' }, h('h2', { class: 'ptitle' }, '戰場'), window.PKBoard.render(model, { editable: false })),
    h('div', { class: 'panel' }, h('h2', { class: 'ptitle' }, '先攻順序', h('small', {}, `${v.list.length} 位`)),
      v.list.length ? rows : h('p', { class: 'muted empty' }, '目前沒有公開的參戰者。')));
}

function fail(msg) { app.replaceChildren(h('div', { class: 'panel' }, h('h2', { class: 'ptitle' }, '玩家看板'), h('p', {}, msg))); }

window.PKVIEW = { draw }; // 測試用：可以直接餵快照
if (!id) fail('這個網址沒有看板代碼。請向 GM 要完整的連結。');
else if (id === 'demo') fail('示範模式：不連線。');
else {
  try {
    const db = getDatabase(initializeApp(CFG, 'view'));
    onValue(ref(db, 'trackers/' + id), (snap) => {
      if (!snap.exists()) return fail('找不到這個看板。GM 可能已經停止分享，或連結不完整。');
      const val = snap.val();
      try {
        const v = JSON.parse(val.view);
        const d = new Date(val.updated || Date.now());
        lastTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        v.list = v.list || []; v.effects = v.effects || []; v.sides = v.sides || [];
        draw(v);
      } catch (e) { fail('資料格式讀不懂：' + e.message); }
    }, (err) => fail('無法讀取：' + err.message));
  } catch (e) { fail('連線失敗：' + e.message); }
}
