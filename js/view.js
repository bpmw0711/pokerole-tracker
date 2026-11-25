// 玩家看板（唯讀）：用連結 view.html#<id> 開啟，即時顯示 GM 分享的戰場狀態。
// 只讀 trackers/{id}/view（GM 過濾後的快照），不需登入。版面和 GM 的記錄板一致：上方行動順序、中間戰場圖、下面每位的狀態。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const F = window.PKF, BD = window.PKBoard;
const SPR = 'https://bpmw0711.github.io/pokerole3.0-zh-TW/assets/spr/';
const CFG = {
  apiKey: 'AIzaSyC5za4VacV_u0GWw5nKczafpShNpVgnpzs', authDomain: 'pokerole-battle.firebaseapp.com',
  databaseURL: 'https://pokerole-battle-default-rtdb.asia-southeast1.firebasedatabase.app', projectId: 'pokerole-battle',
  storageBucket: 'pokerole-battle.firebasestorage.app', messagingSenderId: '1021588929953', appId: '1:1021588929953:web:92999662e3489896f91fe0',
};

const h = BD.h;
const signed = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + -n : '0');
const app = document.getElementById('app');
const id = decodeURIComponent(location.hash.replace(/^#/, '')).trim();
let lastTime = null, prev = null;

function statusText(st) {
  let t = F.STATUS_ZH[st.kind] || st.kind;
  if (st.kind === 'custom') t = st.note || '狀態';
  if (st.kind === 'burn') t += ` ${st.level || 1} 級`;
  if (st.rounds != null && st.rounds !== '') t += `（${st.rounds === 0 ? '到期' : '剩 ' + st.rounds + ' 輪'}）`;
  return t;
}
const stDot = (kind) => { const c = BD.STATUS_COLOR[kind] || BD.STATUS_COLOR.custom; return h('i', { class: 'tk-sd', style: { background: c[0], color: c[1] }, title: F.STATUS_ZH[kind] || kind }, BD.SHORT[kind] || '＊'); };
const dots = (n) => Array.from({ length: 5 }, (_, k) => h('i', { class: k < n ? 'on' : '' }));
const hpPct = (hp) => (hp.mode === 'exact' ? Math.min(100, Math.round(hp.cur / Math.max(1, hp.max) * 100)) : hp.pct);
const sprite = (c, size) => (c.src ? h('img', { class: 'tk-spr ' + size + (/^data:/.test(c.src) ? ' photo' : ''), src: c.src, alt: '' })
  : c.img != null
  ? h('img', { class: 'tk-spr ' + size, src: SPR + c.img + '.png', alt: '', onerror: (e) => { e.target.style.visibility = 'hidden'; } })
  : h('span', { class: 'tk-spr ph ' + size }, c.trainer ? '🧑' : '？'));
const effText = (e) => BD.effName(e) + (e.rounds != null ? (e.rounds === 0 ? '（到期）' : `（${e.rounds} 輪）`) : '');

function draw(v) {
  const side = Object.fromEntries(v.sides.map((s) => [s.id, s]));
  const sideOf = (c) => side[c.side] || { color: '#8f9aab', name: '' };
  const model = {
    location: v.location, sides: v.sides, effects: v.effects, sprBase: SPR,
    tokens: v.list.map((c) => {
      const hp = c.hp || {}, pct = hpPct(hp);
      return { id: c.id, name: c.name, img: c.img != null ? c.img : null, src: c.src || null, photo: /^data:/.test(c.src || ''), trainer: c.trainer, side: c.side, pos: c.pos || null,
        hp: hp.mode === 'hidden' || pct == null ? null : { pct, text: hp.mode === 'exact' ? `${hp.cur}/${hp.max}` : null }, actions: c.actionCount,
        down: c.down, current: v.turn === c.id, status: c.status.map((s) => s.kind), attached: c.effects.map((e) => ({ id: e.id, name: e.name, rounds: e.rounds })) };
    }),
  };
  const cur = v.list.find((c) => c.id === v.turn);
  const chips = v.list.map((c) => {
    const hp = c.hp || {}, p = hpPct(hp);
    return h('div', { class: 'tk-chip ro' + (v.turn === c.id ? ' cur' : '') + (c.down ? ' down' : ''), style: { '--side': sideOf(c).color }, title: c.name },
      v.turn === c.id ? h('span', { class: 'tk-curmark' }, '▶') : null, sprite(c, 'sm'),
      h('span', { class: 'tk-cn' }, h('b', {}, c.name),
        hp.mode === 'hidden' || p == null ? h('span', { class: 'tk-cbar q' }) : h('span', { class: 'tk-cbar' }, h('i', { style: { width: p + '%', background: BD.hpColor(p) } })),
        h('span', { class: 'tk-cdots' }, dots(c.actionCount))),
      c.status.length ? h('span', { class: 'tk-cst' }, c.status.slice(0, 3).map((s) => stDot(s.kind))) : null);
  });
  const fieldEff = v.effects.filter((e) => e.scope === 'field');
  const cards = v.sides.map((sd) => {
    const mem = v.list.filter((c) => c.side === sd.id);
    const eff = v.effects.filter((e) => e.scope === sd.id);
    if (!mem.length && !eff.length) return null;
    return h('div', { class: 'tk-rgroup', style: { '--side': sd.color } },
      h('h4', {}, sd.name, h('small', {}, `${mem.length} 位`), eff.map((e) => h('span', { class: 'tk-echip' + (e.rounds === 0 ? ' expired' : '') }, h('b', {}, effText(e))))),
      mem.length ? h('div', { class: 'tk-rcards' }, mem.map((c) => {
        const hp = c.hp || {}, p = hpPct(hp);
        const tags = [...c.status.map((s) => h('span', { class: 'tk-vst' }, stDot(s.kind), statusText(s))),
          ...c.mods.map((m) => h('span', { class: 'tk-vmod ' + (m.v > 0 ? 'up' : 'dn') }, F.ATTR_ZH[m.stat] + signed(m.v))),
          ...c.effects.map((e) => h('span', { class: 'tk-echip' + (e.rounds === 0 ? ' expired' : '') }, h('b', {}, effText(e))))];
        return h('div', { class: 'tk-lcard ro' + (v.turn === c.id ? ' cur' : '') + (c.down ? ' down' : '') },
          sprite(c, 'sm'),
          h('div', { class: 'tk-lc' }, h('b', {}, c.name, c.owner ? h('small', { class: 'tk-vown' }, c.owner) : null),
            hp.mode === 'hidden' ? h('small', { class: 'tk-vnohp' }, 'HP 不公開') : h('div', { class: 'tk-lbar' }, h('span', { class: 'tk-cbar' }, h('i', { style: { width: p + '%', background: BD.hpColor(p) } })), hp.mode === 'exact' ? h('small', {}, `${hp.cur}/${hp.max}`) : null),
            h('div', { class: 'tk-lmeta' }, h('span', { class: 'tk-cdots', title: `本輪已行動 ${c.actionCount} 次` }, dots(c.actionCount)), c.down ? h('span', { class: 'tk-tag bad' }, '倒下') : null),
            tags.length ? h('div', { class: 'tk-vtags' }, tags) : null));
      })) : null);
  });
  app.replaceChildren(
    h('header', { class: 'tk-top' },
      h('div', { class: 'tk-brand' }, h('span', { class: 'tk-logo', 'aria-hidden': 'true' }), h('span', {}, h('b', {}, v.title || '戰場看板'), h('small', {}, '玩家看板（唯讀）・GM 更新後自動刷新'))),
      h('div', { class: 'tk-vround' }, h('span', { class: 'tk-vrd' }, h('small', {}, '第'), h('b', {}, v.round), h('small', {}, '輪')),
        cur ? h('span', { class: 'tk-nowbtn', style: { '--side': sideOf(cur).color } }, sprite(cur, 'sm'), h('span', { class: 'tk-nowt' }, h('small', {}, '輪到'), h('b', {}, cur.name))) : h('span', { class: 'tk-nowbtn idle' }, '還沒開始'),
        lastTime ? h('small', { class: 'tk-vtime' }, `更新於 ${lastTime}`) : null)),
    h('nav', { class: 'tk-order', 'aria-label': '行動順序' }, h('span', { class: 'tk-olab' }, '行動順序'),
      v.list.length ? h('div', { class: 'tk-chips' }, chips) : h('span', { class: 'tk-ohint' }, '目前沒有公開的參戰者。')),
    h('div', { class: 'tk-vmain' },
      h('section', { class: 'tk-stage panel' },
        fieldEff.length ? h('div', { class: 'tk-shead' }, h('span', { class: 'tk-lab' }, '全場'), fieldEff.map((e) => h('span', { class: 'tk-echip' + (e.rounds === 0 ? ' expired' : '') }, h('b', {}, effText(e))))) : null,
        BD.render(model, { editable: false })),
      h('section', { class: 'tk-stage panel' }, h('div', { class: 'tk-roster' }, cards.filter(Boolean)))));
  // 輪到的人換了，或新的一輪：短暫提示
  if (prev && v.round !== prev.round) flash(`第 ${v.round} 輪`);
  else if (prev && v.turn && v.turn !== prev.turn && cur) flash(`輪到 ${cur.name}`, true);
  prev = { round: v.round, turn: v.turn };
}
function flash(text, small) {
  const b = h('div', { class: 'tk-rbanner' + (small ? ' sm' : ''), role: 'status' }, h('b', {}, text));
  document.body.append(b); setTimeout(() => b.remove(), 1900);
}

function fail(msg) { app.replaceChildren(h('header', { class: 'tk-top' }, h('div', { class: 'tk-brand' }, h('span', { class: 'tk-logo' }), h('span', {}, h('b', {}, '玩家看板')))), h('div', { class: 'tk-vmain' }, h('div', { class: 'panel tk-vfail' }, h('p', {}, msg)))); }

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
