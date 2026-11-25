// 戰場記錄板（GM 用）：畫面與操作。資料格式見 format.js、規則計算見 rules.js、戰場圖見 board.js。
// 原則：像一張紙，任何欄位都能手動改；自動計算只是建議。
// 版面：上方工具列與行動順序條；中間是戰場圖（主角）＋右邊抽屜（選取的角色／名單／紀錄）；底部固定的回合按鈕。
// 這裡新加的 class 都用 tk- 開頭，避免和從對戰網頁複製來的 base.css 撞名。
(function () {
  'use strict';
  const DB = window.PKDB, F = window.PKF, R = window.PKR, BD = window.PKBoard;
  const SITE = 'https://bpmw0711.github.io/pokerole3.0-zh-TW/';
  const SPR = SITE + 'assets/spr/';
  const KEY = 'pkr-tracker-session/1';
  const PREF_KEY = 'pkr-tracker-ui/1';
  const TPL_KEY = 'pkr-tracker-templates/1';
  const RECENT_KEY = 'pkr-tracker-recent/1';
  const MAX_ACTIONS = 5;
  let S = null, P = null;
  let undo = [], redo = [];
  // 畫面狀態（不存進場次）：選取的角色、抽屜分頁、手機上抽屜是否打開、各角色的傷害目標、最近擲骰結果、展開的招式…
  const UI = { sel: null, lastSel: null, tab: 'char', sheet: false, tgt: {}, last: {}, mvOpen: {}, view: 'board', showPri: false, lastSide: 's2', rank: '2', fx: [], focusK: null, drag: null };

  // ───────── 小工具 ─────────
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (tag === 'button' && !(attrs && attrs.type)) el.type = 'button';
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') { for (const [p, q] of Object.entries(v)) { if (p.startsWith('--')) el.style.setProperty(p, q); else el.style[p] = q; } }
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'selected') el.selected = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : String(k));
    return el;
  }
  function toast(msg) {
    const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const byId = (id) => S.combatants.find((c) => c.id === id);
  const cname = (c) => (c ? c.character.name || F.charName(DB, c.character) : '');
  const sideOf = (c) => S.sides.find((s) => s.id === c.side) || S.sides[0];
  const sprite = (c, size) => {
    const x = R.dex(c), cls = 'tk-spr' + (size ? ' ' + size : '');
    if (!x) return h('span', { class: cls + ' ph' }, R.isTrainer(c) ? '🧑' : '？');
    return h('img', { class: cls, src: SPR + x.img + '.png', alt: '', draggable: 'false', onerror: (e) => { e.target.style.visibility = 'hidden'; } });
  };
  const typeChip = (t) => h('span', { class: 'type', style: { background: DB.typeColor[t] || '#888', color: DB.typeInk[t] || '#fff' } }, t);
  const num = (v, d = 0) => { const n = parseInt(String(v).replace(/[−–]/g, '-'), 10); return Number.isFinite(n) ? n : d; };
  const signed = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + -n : '0');
  const pad2 = (n) => String(n).padStart(2, '0');
  const nowStr = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const pct = (c) => Math.min(100, Math.round(Math.max(0, c.state.hp) / Math.max(1, R.maxHp(c, S.settings)) * 100));
  const dots = (n) => Array.from({ length: MAX_ACTIONS }, (_, k) => h('i', { class: k < n ? 'on' : '' }));
  const stDot = (kind) => { const c = BD.STATUS_COLOR[kind] || BD.STATUS_COLOR.custom; return h('i', { class: 'tk-sd', style: { background: c[0], color: c[1] }, title: F.STATUS_ZH[kind] || kind }, BD.SHORT[kind] || '＊'); };
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 無痕模式或空間不足 */ } };
  const savePref = () => lsSet(PREF_KEY, { view: UI.view, showPri: UI.showPri, lastSide: UI.lastSide, rank: UI.rank });
  const dexLabel = (x) => x.z + (x.n !== x.z ? ` (${x.n})` : '');
  const findIdx = (t) => { t = String(t || '').trim().toLowerCase(); if (!t) return -1; return DB.dex.findIndex((x) => x.z === t || x.n.toLowerCase() === t || dexLabel(x).toLowerCase() === t); };

  // ───────── 存檔、復原 ─────────
  function persist() {
    try { S.saved = new Date().toISOString(); localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 無痕模式或空間不足 */ }
    if (window.PKShare) window.PKShare.schedule(() => S, refreshShareBtn);
  }
  const shareLabel = () => {
    const st = window.PKShare && window.PKShare.status;
    return ['📡', h('span', { class: 'tk-bl' }, ' 分享給玩家'), st && st.id ? h('b', { class: 'tk-live' }, st.error ? ' ⚠' : ' ●') : null];
  };
  function refreshShareBtn() { const b = document.getElementById('sharebtn'); if (b) { b.replaceChildren(...shareLabel().filter(Boolean)); b.classList.toggle('live', !!(window.PKShare && window.PKShare.status.id)); } }
  function loadSaved() {
    try { const t = localStorage.getItem(KEY); if (t) return F.normalize(JSON.parse(t)); } catch (e) { /* 壞掉就重來 */ }
    return F.newSession();
  }
  function syncOrder() {
    const ids = new Set(S.combatants.filter((c) => !c.benched).map((c) => c.id));
    const seen = new Set();
    S.order = S.order.filter((id) => ids.has(id) && !seen.has(id) && seen.add(id));
    ids.forEach((id) => { if (!seen.has(id)) S.order.push(id); });
    if (S.turn.combatant && !ids.has(S.turn.combatant)) S.turn.combatant = null;
  }
  function addLog(text) { S.log.push({ round: S.round, text, t: nowStr() }); if (S.log.length > 600) S.log.splice(0, S.log.length - 600); }
  // 所有會改資料的操作都走這裡：先存一份復原點（附上這一步的說明），改完同步順序、寫紀錄、存檔、重畫
  function commit(fn, log) {
    undo.push({ s: JSON.stringify(S), label: log || '修改' }); if (undo.length > 120) undo.shift();
    redo = [];
    fn();
    syncOrder();
    if (log) addLog(log);
    persist(); render();
  }
  function logOnly(text) { addLog(text); persist(); }
  function doUndo() {
    if (!undo.length) return toast('沒有可以復原的操作');
    const u = undo.pop(); redo.push({ s: JSON.stringify(S), label: u.label });
    S = F.normalize(JSON.parse(u.s)); persist(); render(); toast('已復原：' + u.label);
  }
  function doRedo() {
    if (!redo.length) return toast('沒有可以重做的操作');
    const r = redo.pop(); undo.push({ s: JSON.stringify(S), label: r.label });
    S = F.normalize(JSON.parse(r.s)); persist(); render(); toast('已重做：' + r.label);
  }

  // ───────── 回饋：浮動數字、橫幅 ─────────
  function fx(id, text, cls) { UI.fx.push({ id, text, cls }); }
  function runFx() {
    const list = UI.fx; UI.fx = [];
    for (const f of list) {
      document.querySelectorAll(`.tok[data-id="${f.id}"], .tk-chip[data-id="${f.id}"], .tk-lcard[data-id="${f.id}"]`).forEach((el) => {
        const s = h('span', { class: 'tk-fx ' + (f.cls || '') }, f.text);
        el.append(s); setTimeout(() => s.remove(), 1400);
      });
    }
  }
  function banner(text, sub) {
    const b = h('div', { class: 'tk-rbanner', role: 'status' }, h('b', {}, text), sub ? h('small', {}, sub) : null);
    document.body.append(b); setTimeout(() => b.remove(), 1900);
  }

  // ───────── 小彈窗（點血條、點格子時出現）─────────
  let pop = null;
  function closePop() {
    if (!pop) return;
    pop.el.remove(); document.removeEventListener('pointerdown', pop.out, true);
    pop = null;
  }
  function popover(anchor, build, cls) {
    closePop();
    const el = h('div', { class: 'tk-pop ' + (cls || ''), role: 'dialog' });
    const p = pop = { el, build, out: null };
    const content = build(); if (!content) { pop = null; return; }
    el.append(...[content].flat().filter(Boolean));
    document.body.append(el);
    const r = anchor.getBoundingClientRect();
    const pw = el.offsetWidth, ph = el.offsetHeight;
    let x = r.left + r.width / 2 - pw / 2, y = r.bottom + 8;
    if (y + ph > innerHeight - 96) y = Math.max(8, r.top - ph - 8);
    x = Math.max(8, Math.min(innerWidth - pw - 8, x));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    p.out = (e) => { if (!el.contains(e.target)) closePop(); };
    setTimeout(() => { if (pop === p) document.addEventListener('pointerdown', p.out, true); }, 0);
    const f = el.querySelector('[data-autofocus]'); if (f) f.focus();
  }
  function refreshPop() {
    if (!pop) return;
    const ae = document.activeElement, k = ae && pop.el.contains(ae) ? ae.getAttribute('data-k') : null;
    const content = pop.build();
    if (!content) return closePop();
    pop.el.replaceChildren(...[content].flat().filter(Boolean));
    if (k) { const n = pop.el.querySelector(`[data-k="${k}"]`); if (n) n.focus(); }
  }

  // ───────── 規則站產生器（pkcore）接線 ─────────
  function genData() {
    return {
      dex: DB.dex.map((d) => ({
        ...d, leg: !!d.leg,
        ab: d.ab.map((n) => ({ n, z: (DB.abilities[n.replace(/ \(Hidden\)/, '')] || {}).z || n })),
        mv: [...d.mv.map(([k, r]) => ({ k, n: k, z: DB.moves[k].z, t: DB.moves[k].t, r })), ...(d.any ? [{ n: 'Any Move', z: '任意招式', t: '', r: d.any, k: '' }] : [])],
      })),
      moves: DB.moves, abilities: DB.abilities, natures: DB.natures, chart: DB.chart, typeColor: DB.typeColor, typeInk: DB.typeInk,
      rankZh: DB.rankZh, statZh: DB.statZh, genZh: DB.genZh,
    };
  }
  const core = () => (P || (P = window.PKCORE.make(genData(), { img: SITE + 'assets/art/', rules: SITE + 'rules/', data: SITE + 'data/', blank: true })));

  // ───────── 模態視窗 ─────────
  function modal(title, body, opts = {}) {
    closePop();
    const back = h('div', { class: 'pkio-back' });
    const box = h('div', { class: 'pkio' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'tk-mhead' }, h('h3', {}, title), h('button', { class: 'tk-mclose', onclick: () => close(), 'aria-label': opts.closeText || '關閉' }, opts.closeText || '關閉')), body);
    back.append(box);
    if (!opts.sticky) back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    function onKey(e) { if (e.key === 'Escape' && !opts.sticky) { e.stopPropagation(); close(); } }
    function close() { document.removeEventListener('keydown', onKey); back.remove(); if (opts.onClose) opts.onClose(); }
    document.addEventListener('keydown', onKey);
    document.body.append(back);
    return { close, box };
  }
  function copyText(t, done) {
    const fb = () => { const a = h('textarea', {}); a.value = t; document.body.append(a); a.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 略 */ } a.remove(); done(ok); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => done(true), fb); else fb();
  }
  function download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'application/json' })), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ───────── 骰子 ─────────
  function rollFor(c, label, n) {
    n = Math.max(0, n | 0);
    const r = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
    const s = r.filter((x) => x >= 4).length;
    const txt = `[${r.join(' ')}] → ${s} 成功`;
    UI.last[c.id + '|' + label] = txt;
    logOnly(`${cname(c)} ${label}：${n} 骰 ${txt}`);
    fx(c.id, `🎲 ${s}`, 'roll');
    render();
  }

  // ───────── 資料操作 ─────────
  function uniqueName(name) {
    const names = new Set(S.combatants.map(cname));
    if (!names.has(name)) return name;
    let i = 2; while (names.has(`${name} ${i}`)) i++;
    return `${name} ${i}`;
  }
  function addChars(chars, sideId, owner) {
    if (!chars.length) return;
    commit(() => {
      for (const ch of chars) {
        const c = F.newCombatant(F.clone(ch), sideId, owner || ch.player || '');
        c.character.name = uniqueName(c.character.name || F.charName(DB, c.character));
        c.state.hp = R.maxHp(c, S.settings); c.state.will = R.maxWill(c);
        S.combatants.push(c);
      }
    }, `加入參戰者：${chars.map((x) => x.name || F.charName(DB, x)).join('、')}`);
  }
  // 可以輸入 7（直接設定）、-3 或 +2（增減）
  function parseDelta(raw, cur) {
    raw = String(raw).trim().replace(/[−–]/g, '-').replace('＋', '+').replace(/\s/g, '');
    if (/^[+-]\d+$/.test(raw)) return cur + parseInt(raw, 10);
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    return null;
  }
  function setHp(c, raw) {
    let v = parseDelta(raw, c.state.hp);
    if (v == null) { toast('請輸入數字，例如 7、-3 或 +2'); return render(); }
    v = Math.max(0, v);
    const old = c.state.hp;
    if (v === old) return render();
    fx(c.id, signed(v - old), v < old ? 'dmg' : 'heal');
    commit(() => {
      c.state.hp = v;
      if (v <= 0) c.state.fainted = true; else if (c.state.fainted) c.state.fainted = false;
    }, `${cname(c)} HP ${old} → ${v}${v <= 0 ? '，倒下' : ''}`);
  }
  function setWill(c, raw) {
    let v = parseDelta(raw, c.state.will);
    if (v == null) return render();
    v = Math.max(0, v);
    const old = c.state.will;
    if (v === old) return render();
    commit(() => { c.state.will = v; }, `${cname(c)} 意志 ${old} → ${v}`);
  }
  const activeOrder = () => S.order.map(byId).filter((c) => c && !c.benched);
  const effectsOf = (scope) => S.effects.filter((e) => e.scope === scope);

  function sortByInit() {
    commit(() => {
      const val = (c) => [c.state.init.priority || 0, c.state.init.roll == null ? -1 : c.state.init.roll, R.stat(c, 'dex', S.settings) + ((c.character.skills || {}).alert || 0)];
      const list = activeOrder().map((c, i) => ({ c, i, v: val(c) }));
      list.sort((a, b) => b.v[0] - a.v[0] || b.v[1] - a.v[1] || b.v[2] - a.v[2] || a.i - b.i);
      S.order = list.map((x) => x.c.id);
    }, '依先攻重新排序');
  }
  function move(c, d) {
    const i = S.order.indexOf(c.id), j = i + d;
    if (i < 0 || j < 0 || j >= S.order.length) return;
    commit(() => { const o = S.order; [o[i], o[j]] = [o[j], o[i]]; }, `調整順序：${cname(c)}${d < 0 ? '上移' : '下移'}`);
  }
  function select(id, tab) { UI.sel = id; UI.tab = tab || 'char'; UI.sheet = true; render(); }

  // 換下一位：mode = 'act'（他行動了：行動次數 +1）、'hold'（保留）、'start'（還沒開始，從第一位開始）
  // 指標往後找下一位沒倒下的；如果你正在看目前這位，抽屜會跟著換到下一位
  function nextTurn(mode) {
    const ord = activeOrder();
    if (!ord.length) return toast('還沒有參戰者：先按「＋ 新增參戰者」');
    if (!ord.some((c) => !R.isDown(c))) return toast('所有參戰者都倒下了');
    const cur = byId(S.turn.combatant);
    const live = cur && !cur.benched;
    const n = ord.length, start = live ? ord.indexOf(cur) : -1;
    let pick = null;
    for (let i = 1; i <= n; i++) { const cand = ord[(start + i + n) % n]; if (!R.isDown(cand)) { pick = cand; break; } }
    let msg = `輪到 ${cname(pick)}`;
    if (live && mode === 'act') { msg = `${cname(cur)} 行動（第 ${cur.state.actionCount + 1} 個行動）`; fx(cur.id, '✓ 行動', 'act'); }
    else if (live && mode === 'hold') { msg = `${cname(cur)} 保留`; fx(cur.id, '✗ 保留', 'hold'); }
    const follow = !UI.sel || (cur && UI.sel === cur.id);
    commit(() => {
      if (live) {
        if (mode === 'act') { cur.state.actionCount++; S.turn.passStreak = 0; }
        else if (mode === 'hold') S.turn.passStreak = (S.turn.passStreak || 0) + 1;
        cur.state.turnMark = null;
      }
      S.turn.combatant = pick ? pick.id : null;
      if (follow && pick) UI.sel = pick.id;
    }, msg);
    if (pick) fx(pick.id, '輪到我！', 'turn');
    if (allHeld()) toast('大家都保留了（或行動用完），可以按「結束本輪」。');
  }
  function allHeld() {
    const live = activeOrder().filter((c) => !R.isDown(c));
    if (!live.length) return false;
    return (S.turn.passStreak || 0) >= live.length || live.every((c) => c.state.actionCount >= MAX_ACTIONS);
  }

  // ───────── 畫面 ─────────
  function render() {
    syncOrder();
    if (UI.sel && !byId(UI.sel)) UI.sel = null;
    const app = document.getElementById('app');
    const ob = app.querySelector('.tk-dbody'), ds = ob ? ob.scrollTop : 0;
    const oc = app.querySelector('.tk-chips'), cs = oc ? oc.scrollLeft : 0;
    const y = window.scrollY;
    app.replaceChildren(topBar(), orderBar(), h('div', { class: 'tk-main' }, stage(), drawer()), dock());
    const nb = app.querySelector('.tk-dbody'); if (nb) nb.scrollTop = UI.sel === UI.lastSel ? ds : 0;
    const nc = app.querySelector('.tk-chips'); if (nc) nc.scrollLeft = cs;
    UI.lastSel = UI.sel;
    window.scrollTo(0, y);
    document.body.classList.toggle('tk-sheet-open', !!UI.sheet);
    if (UI.focusK) { const f = app.querySelector(`[data-k="${UI.focusK}"]`); UI.focusK = null; if (f) { f.focus(); if (f.select) f.select(); } }
    refreshPop(); runFx();
  }

  function topBar() {
    const title = h('input', { class: 'tk-title', value: S.title, placeholder: '場次名稱（例如：雨中草原遭遇戰）', 'aria-label': '場次名稱',
      onchange: (e) => { S.title = e.target.value.trim(); persist(); } });
    const live = window.PKShare && window.PKShare.status.id;
    return h('header', { class: 'tk-top' },
      h('div', { class: 'tk-brand' }, h('span', { class: 'tk-logo', 'aria-hidden': 'true' }), h('span', {}, h('b', {}, '戰場記錄板'), h('small', {}, 'Pokérole 3.0・GM 用'))),
      title,
      h('div', { class: 'tk-tools' },
        h('button', { class: 'tk-add', onclick: () => openAdd() }, '＋ 新增參戰者'),
        h('button', { id: 'sharebtn', class: live ? 'live' : '', onclick: openShare, title: '產生唯讀連結，玩家用手機就能看戰況' }, shareLabel()),
        h('button', { onclick: openDiscord, title: '把目前戰況整理成文字，貼到 Discord' }, '📋', h('span', { class: 'tk-bl' }, ' Discord')),
        h('button', { onclick: openIO, title: '匯出／匯入場次存檔、開新場次' }, '💾', h('span', { class: 'tk-bl' }, ' 存檔')),
        h('button', { class: 'tk-icon', onclick: openSettings, title: '設定', 'aria-label': '設定' }, '⚙'),
        h('button', { class: 'tk-icon', onclick: openHelp, title: '說明與快捷鍵（?）', 'aria-label': '說明' }, '？')));
  }

  // 行動順序條：依先攻排好的頭像，點一下選取、拖動改順序
  function orderBar() {
    const list = activeOrder();
    const bar = h('nav', { class: 'tk-order', 'aria-label': '行動順序' }, h('span', { class: 'tk-olab' }, '行動順序'));
    if (!list.length) { bar.append(h('span', { class: 'tk-ohint' }, '加入參戰者後，這裡會依先攻排出順序。')); return bar; }
    bar.append(h('div', { class: 'tk-chips' }, list.map(orderChip)),
      h('button', { class: 'tk-mini', onclick: () => { UI.tab = 'list'; UI.sheet = true; render(); }, title: '輸入先攻、依先攻排序' }, '先攻 ✎'));
    return bar;
  }
  function orderChip(c) {
    const cur = S.turn.combatant === c.id, down = R.isDown(c), p = pct(c);
    const chip = h('div', { class: 'tk-chip' + (cur ? ' cur' : '') + (UI.sel === c.id ? ' sel' : '') + (down ? ' down' : '') + (c.hidden ? ' hid' : ''),
      'data-id': c.id, role: 'button', tabindex: '0', draggable: 'true', style: { '--side': sideOf(c).color },
      title: `${cname(c)}　HP ${Math.max(0, c.state.hp)}/${R.maxHp(c, S.settings)}（拖動可以調整順序）`,
      onclick: () => select(c.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(c.id); } } },
    cur ? h('span', { class: 'tk-curmark' }, '▶') : null,
    sprite(c, 'sm'),
    h('span', { class: 'tk-cn' }, h('b', {}, cname(c)),
      h('span', { class: 'tk-cbar' }, h('i', { style: { width: p + '%', background: BD.hpColor(p) } })),
      h('span', { class: 'tk-cdots' }, dots(c.state.actionCount))),
    c.state.status.length ? h('span', { class: 'tk-cst' }, c.state.status.slice(0, 3).map((st) => stDot(st.kind))) : null);
    const after = (e) => { const r = chip.getBoundingClientRect(); return e.clientX > r.left + r.width / 2; };
    chip.addEventListener('dragstart', (e) => { UI.drag = c.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', c.id); } catch (er) { /* 略 */ } chip.classList.add('dragging'); });
    chip.addEventListener('dragend', () => { UI.drag = null; chip.classList.remove('dragging'); });
    chip.addEventListener('dragover', (e) => {
      if (!UI.drag || UI.drag === c.id) return;
      e.preventDefault(); const a = after(e); chip.classList.toggle('dropafter', a); chip.classList.toggle('dropbefore', !a);
    });
    chip.addEventListener('dragleave', () => chip.classList.remove('dropbefore', 'dropafter'));
    chip.addEventListener('drop', (e) => {
      e.preventDefault(); const from = UI.drag, a = after(e); UI.drag = null;
      chip.classList.remove('dropbefore', 'dropafter');
      if (!from || from === c.id) return;
      commit(() => { const o = S.order.filter((x) => x !== from); o.splice(o.indexOf(c.id) + (a ? 1 : 0), 0, from); S.order = o; }, `調整順序：${cname(byId(from))} 移到 ${cname(c)} ${a ? '後面' : '前面'}`);
    });
    return chip;
  }

  // ───────── 中間：戰場圖或清單 ─────────
  function stage() {
    const loc = h('input', { class: 'tk-loc', value: S.field.location, placeholder: '地點（例如：常磐森林外的草原）', 'aria-label': '地點',
      onchange: (e) => { const v = e.target.value.trim(); commit(() => { S.field.location = v; }, v ? '地點：' + v : '清除地點'); } });
    const seg = h('div', { class: 'tk-seg', role: 'group', 'aria-label': '顯示方式' },
      [['board', '戰場圖'], ['list', '清單']].map(([k, t]) => h('button', { class: UI.view === k ? 'on' : '', 'aria-pressed': String(UI.view === k), onclick: () => { UI.view = k; savePref(); render(); } }, t)));
    const s = h('section', { class: 'tk-stage panel' },
      h('div', { class: 'tk-shead' }, h('span', { class: 'tk-pin', 'aria-hidden': 'true' }, '📍'), loc,
        h('button', { class: 'tk-mini', onclick: () => openEffect(null, 'field'), title: '新增自訂條目（陷阱、倒數事件、掩護…）' }, '＋ 條目'), seg));
    const box = h('div', { class: 'tk-boardbox' });
    if (UI.view === 'list') box.append(rosterView());
    else box.append(BD.render(boardModel(), boardOpts()));
    if (!S.combatants.length) box.append(emptyCard());
    s.append(box);
    if (UI.view === 'board' && S.combatants.length) {
      s.append(h('p', { class: 'tk-hint' }, h('b', {}, '拖棋子'), ' 換陣營（綠＝', S.sides[0].name, '、紅＝', (S.sides[1] || {}).name, '、白＝中立）・',
        h('b', {}, '拖到另一個棋子上'), ' 指定傷害目標・', h('b', {}, '點血條'), ' 快速加減 HP・', h('b', {}, '雙擊空白處'), ' 新增條目'));
    }
    return s;
  }
  function emptyCard() {
    return h('div', { class: 'tk-empty' },
      h('h3', {}, '開始一場戰鬥'),
      h('ol', {},
        h('li', {}, h('b', {}, '加入參戰者'), '：輸入物種快速加入、貼上玩家隊伍，或手動新增。'),
        h('li', {}, h('b', {}, '拖棋子'), '到綠區（玩家方）、紅區（敵方）或白區（中立）。'),
        h('li', {}, '在「名單・先攻」輸入先攻，按底下的 ', h('b', {}, '▶ 開始'), '；之後每回合按 ', h('b', {}, '✓ 行動了', ), ' 或 ', h('b', {}, '✗ 保留'), ' 換下一位。')),
      h('div', { class: 'tk-erow' },
        h('button', { class: 'primary big', onclick: () => openAdd('quick') }, '＋ 新增參戰者'),
        h('button', { onclick: () => openAdd('paste') }, '匯入玩家隊伍'),
        h('button', { onclick: openIO }, '讀取存檔')));
  }

  const r1 = (n) => Math.round(n * 10) / 10;
  function boardModel() {
    const tokens = activeOrder().map((c) => {
      const x = R.dex(c);
      return {
        id: c.id, name: cname(c), img: x ? x.img : null, trainer: R.isTrainer(c), side: c.side, pos: c.pos || null,
        hp: { pct: pct(c), text: `${Math.max(0, c.state.hp)}/${R.maxHp(c, S.settings)}` }, actions: c.state.actionCount,
        down: R.isDown(c), current: S.turn.combatant === c.id, sel: UI.sel === c.id, hidden: !!c.hidden,
        status: c.state.status.map((s) => s.kind), attached: effectsOf(c.id).map((e) => ({ id: e.id, name: e.name, rounds: e.rounds })),
      };
    });
    return { location: S.field.location, sides: S.sides, tokens, effects: S.effects, sprBase: SPR };
  }
  const scopeName = (scope) => (scope === 'field' ? '全場' : (S.sides.find((s) => s.id === scope) || {}).name || (byId(scope) ? '附在 ' + cname(byId(scope)) : scope));
  const slotList = (sl) => S.effects.filter((x) => !x.card && x.kind === sl.kind && x.scope === sl.scope);
  const effName = BD.effName;
  function boardOpts() {
    const eff = (id) => S.effects.find((e) => e.id === id);
    return {
      editable: true,
      onTokenMove: (id, d) => {
        const c = byId(id), sd = S.sides.find((s) => s.id === d.side);
        if (!c || !sd) return;
        const changed = c.side !== d.side;
        commit(() => { c.side = d.side; if (d.pos) c.pos = { x: r1(d.pos.x), y: r1(d.pos.y) }; else delete c.pos; }, changed ? `${cname(c)} 移到「${sd.name}」` : `移動 ${cname(c)} 的棋子`);
      },
      onTokenClick: (id, part) => {
        UI.sel = id; UI.tab = 'char';
        if (part === 'hp') {
          render();
          const a = document.querySelector(`.boardwrap .tok[data-id="${id}"] .tbar`);
          if (a) popover(a, hpPop(id), 'tk-hppop');
        } else { UI.sheet = true; render(); }
      },
      onTokenOnToken: (from, to) => {
        UI.tgt[from] = to; UI.sel = from; UI.tab = 'char'; UI.sheet = true; render();
        toast(`${cname(byId(from))} 的傷害目標：${cname(byId(to))}`);
        const m = document.getElementById('tk-moves'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      onSlotPick: (sl, anchor) => popover(anchor, slotPop(sl), 'tk-slotpop'),
      onSlotItemRounds: (id, d) => { const e = eff(id); if (e) commit(() => { e.rounds = Math.max(0, (e.rounds || 0) + d); }, `${e.name}（${scopeName(e.scope)}）剩 ${Math.max(0, (e.rounds || 0) + d)} 輪`); },
      onSlotItemRemove: (id) => { const e = eff(id); if (e) commit(() => { S.effects = S.effects.filter((x) => x !== e); }, `${e.name}（${scopeName(e.scope)}）解除`); },
      onCardMove: (id, d) => {
        const e = eff(id); if (!e) return;
        commit(() => { e.scope = d.scope; e.card = true; if (d.pos) e.pos = { x: r1(d.pos.x), y: r1(d.pos.y) }; else delete e.pos; }, `條目「${e.name}」→ ${scopeName(d.scope)}`);
      },
      onCardClick: (id) => { const e = eff(id); if (e) openEffect(e); },
      onCardRounds: (id, dl) => { const e = eff(id); if (e) commit(() => { e.rounds = Math.max(0, (e.rounds || 0) + dl); }, `條目「${e.name}」剩 ${Math.max(0, (e.rounds || 0) + dl)} 輪`); },
      onCardRemove: (id) => { const e = eff(id); if (e) commit(() => { S.effects = S.effects.filter((x) => x !== e); }, `移除條目：${e.name}`); },
      onBoardDbl: (d) => openEffect(null, d.zone === 's3' ? 'field' : d.zone, { x: r1(d.x), y: r1(d.y) }),
    };
  }

  // 清單模式（手機或喜歡清單的人）：依側分組的卡片
  function rosterView() {
    const act = activeOrder();
    return h('div', { class: 'tk-roster' }, S.sides.map((sd) => {
      const mem = act.filter((c) => c.side === sd.id);
      const eff = effectsOf(sd.id).concat(sd.id === 's3' ? effectsOf('field') : []);
      return h('div', { class: 'tk-rgroup', style: { '--side': sd.color } },
        h('h4', {}, sd.name, h('small', {}, `${mem.length} 位`), eff.map(effChip)),
        mem.length ? h('div', { class: 'tk-rcards' }, mem.map(lcard)) : h('p', { class: 'tk-note' }, '（沒有）'));
    }));
  }
  function lcard(c) {
    const max = R.maxHp(c, S.settings), hp = Math.max(0, c.state.hp), p = pct(c);
    return h('div', { class: 'tk-lcard' + (S.turn.combatant === c.id ? ' cur' : '') + (UI.sel === c.id ? ' sel' : '') + (R.isDown(c) ? ' down' : ''), 'data-id': c.id, role: 'button', tabindex: '0',
      onclick: (e) => { if (e.target.closest('select,button,input')) return; select(c.id); } },
    sprite(c, 'sm'),
    h('div', { class: 'tk-lc' }, h('b', {}, cname(c)),
      h('div', { class: 'tk-lbar' }, h('span', { class: 'tk-cbar' }, h('i', { style: { width: p + '%', background: BD.hpColor(p) } })), h('small', {}, `${hp}/${max}`)),
      h('div', { class: 'tk-lmeta' }, h('span', { class: 'tk-cdots' }, dots(c.state.actionCount)), c.state.status.map((st) => stDot(st.kind)))),
    h('select', { class: 'tk-moveto', 'aria-label': '移到哪一側', title: '移到哪一側', onchange: (e) => { const to = S.sides.find((x) => x.id === e.target.value); commit(() => { c.side = to.id; delete c.pos; }, `${cname(c)} 移到「${to.name}」`); } },
      S.sides.map((x) => h('option', { value: x.id, selected: x.id === c.side }, x.name))));
  }

  // ───────── 右邊抽屜 ─────────
  function drawer() {
    const tabs = [['char', '角色'], ['list', '名單・先攻'], ['log', '紀錄']];
    const c = byId(UI.sel);
    const body = UI.tab === 'list' ? listPane() : UI.tab === 'log' ? logPane() : c ? charPane(c) : noSel();
    return h('aside', { class: 'tk-drawer' + (UI.sheet ? ' open' : ''), 'aria-label': '詳細資料' },
      h('div', { class: 'tk-dtabs', role: 'tablist' },
        tabs.map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(UI.tab === k), class: UI.tab === k ? 'on' : '', onclick: () => { UI.tab = k; render(); } }, t, k === 'log' && S.log.length ? h('small', {}, S.log.length) : null)),
        h('button', { class: 'tk-dclose', 'aria-label': '關閉面板', onclick: () => { UI.sheet = false; render(); } }, '×')),
      h('div', { class: 'tk-dbody' }, body));
  }
  function noSel() {
    const cur = byId(S.turn.combatant);
    return h('div', { class: 'tk-nosel' },
      h('div', { class: 'tk-nosel-ic', 'aria-hidden': 'true' }, '👆'),
      S.combatants.length ? [h('p', {}, '點戰場上的棋子，或上方行動順序裡的頭像，這裡就會顯示他的 HP、狀態和招式。'),
        cur ? h('button', { class: 'primary', onclick: () => select(cur.id) }, `看 ${cname(cur)}（正在行動）`) : null]
        : [h('p', {}, '還沒有參戰者。'), h('button', { class: 'primary', onclick: () => openAdd('quick') }, '＋ 新增參戰者')]);
  }

  function charPane(c) {
    const sd = sideOf(c), cur = S.turn.combatant === c.id;
    const sideSel = h('select', { class: 'tk-sidesel', 'aria-label': '陣營', title: '陣營（也可以直接拖棋子）', onchange: (e) => { const to = S.sides.find((x) => x.id === e.target.value); commit(() => { c.side = to.id; delete c.pos; }, `${cname(c)} 移到「${to.name}」`); } },
      S.sides.map((x) => h('option', { value: x.id, selected: x.id === c.side }, x.name)));
    const head = h('div', { class: 'tk-chead', style: { '--side': sd.color } },
      h('div', { class: 'tk-cimg' }, sprite(c, 'lg')),
      h('div', { class: 'tk-cmeta' },
        h('h2', {}, cname(c), c.hidden ? h('span', { class: 'tk-tag' }, '隱藏中') : null),
        h('div', { class: 'tk-csub' }, R.types(c).map(typeChip), R.isTrainer(c) ? h('span', { class: 'tk-tag' }, '訓練家') : null, c.owner ? h('span', { class: 'tk-owner' }, '玩家：' + c.owner) : null),
        h('div', { class: 'tk-csub' }, sideSel,
          cur ? h('span', { class: 'tk-now' }, '▶ 正在行動') : h('button', { class: 'tk-mini', onclick: () => commit(() => { S.turn.combatant = c.id; }, `指定輪到 ${cname(c)}`) }, '▶ 指定輪到他'))),
      h('button', { class: 'tk-mini tk-edit', onclick: () => openEdit(c), title: '編輯角色資料（能力值、招式、物種、最大 HP）' }, '✎ 編輯'));
    return [head, hpSec(c), actSec(c), statusSec(c), modsSec(c), movesSec(c), effSec(c), infoSec(c), moreSec(c)];
  }

  function hpBar(c, mode) {
    const max = Math.max(1, R.maxHp(c, S.settings)), hp = Math.max(0, c.state.hp);
    const p = Math.min(100, Math.round(hp / max * 100));
    return h('div', { class: 'tk-bar' + (mode ? ' ' + mode : ''), title: `${hp}/${max}` }, h('i', { style: { width: p + '%', background: BD.hpColor(p) } }));
  }
  // HP 滑塊：拖動時即時顯示數字，放開才記下來（也可以用鍵盤左右鍵微調）。旁邊的小輸入框可以打 -3、+2 或 7。
  function hpSlider(c, k, onLive) {
    const max = Math.max(1, R.maxHp(c, S.settings)), hp = Math.max(0, c.state.hp), top = Math.max(max, hp);
    const paint = (el, v) => { el.style.setProperty('--p', (v / top * 100) + '%'); el.style.setProperty('--c', BD.hpColor(Math.round(v / max * 100))); };
    const sl = h('input', { type: 'range', class: 'tk-hps', min: '0', max: String(top), step: '1', value: hp, 'data-k': k, 'aria-label': `${cname(c)} HP`, title: '拖動調整 HP，放開才記下' });
    paint(sl, hp);
    sl.addEventListener('input', () => { const v = +sl.value; paint(sl, v); if (onLive) onLive(v); });
    sl.addEventListener('change', () => setHp(c, sl.value));
    return sl;
  }
  const hpInput = (c, k) => h('input', { class: 'tk-hpin', 'data-k': k, placeholder: '−3／+2', 'aria-label': 'HP：輸入 -3 或 +2 增減，或直接輸入數字', title: '輸入 -3 或 +2 增減，輸入 7 直接設定，按 Enter',
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value; e.target.value = ''; if (v.trim()) setHp(c, v); } } });
  function hpPop(id) {
    return () => {
      const c = byId(id); if (!c) return null;
      const max = R.maxHp(c, S.settings), hp = Math.max(0, c.state.hp);
      const val = h('b', {}, hp);
      return [h('div', { class: 'tk-poph' }, sprite(c, 'xs'), h('b', {}, cname(c)), h('span', { class: 'tk-popv' }, 'HP ', val, ` / ${max}`)),
        h('div', { class: 'tk-hpctl' }, hpSlider(c, 'pophp', (v) => { val.textContent = v; }), hpInput(c, 'pophpin'))];
    };
  }
  function hpSec(c) {
    const max = R.maxHp(c, S.settings), hp = Math.max(0, c.state.hp), down = R.isDown(c), pain = R.pain(c, S.settings);
    const val = h('span', {}, hp);
    return h('section', { class: 'tk-sec tk-hpsec' },
      h('div', { class: 'tk-hprow' }, h('span', { class: 'tk-lab' }, 'HP'), h('b', { class: 'tk-hpnum' }, val, h('small', {}, ' / ' + max)),
        down ? h('span', { class: 'tk-tag bad' }, '倒下') : pain ? h('span', { class: 'tk-tag warn', title: '命中、傷害的成功數各扣這麼多（骰池不變，擲完再扣）' }, `疼痛 −${pain} 成功`) : null,
        h('span', { class: 'grow' }),
        h('span', { class: 'tk-will', title: '意志點' }, h('span', { class: 'tk-lab' }, '意志'),
          h('button', { class: 'tk-step', onclick: () => setWill(c, '-1'), 'aria-label': '意志減 1' }, '−'), h('b', {}, c.state.will), h('small', {}, '/' + R.maxWill(c)),
          h('button', { class: 'tk-step', onclick: () => setWill(c, '+1'), 'aria-label': '意志加 1' }, '+'))),
      h('div', { class: 'tk-hpctl' }, hpSlider(c, 'hp', (v) => { val.textContent = v; }), hpInput(c, 'hpin')));
  }
  function actSec(c) {
    const n = c.state.actionCount;
    return h('section', { class: 'tk-sec tk-actsec' }, h('span', { class: 'tk-lab' }, '本輪行動'),
      h('span', { class: 'tk-abox' }, Array.from({ length: MAX_ACTIONS }, (_, k) => {
        const to = n === k + 1 ? k : k + 1;
        return h('button', { class: 'tk-ad' + (k < n ? ' on' : ''), 'aria-label': `行動次數設為 ${to}`, title: '點一下修正行動次數',
          onclick: () => commit(() => { c.state.actionCount = to; }, `${cname(c)} 行動次數改為 ${to}`) }, k + 1);
      }), n > MAX_ACTIONS ? h('b', {}, '+' + (n - MAX_ACTIONS)) : null),
      h('small', { class: 'tk-need' }, `下個行動需 `, h('b', {}, n + 1), ` 成功`));
  }

  function statusText(st) {
    let t = F.STATUS_ZH[st.kind] || st.kind;
    if (st.kind === 'custom') t = st.note || '自訂狀態';
    if (st.kind === 'burn') t += ` ${st.level || 1} 級`;
    if (st.rounds != null && st.rounds !== '') t += `（${st.rounds === 0 ? '到期' : '剩 ' + st.rounds + ' 輪'}）`;
    return t;
  }
  function toggleStatus(c, k) {
    const i = c.state.status.findIndex((s) => s.kind === k);
    if (k === 'burn' && i >= 0) {
      const st = c.state.status[i], lv = st.level || 1;
      if (lv < 3) return commit(() => { st.level = lv + 1; }, `${cname(c)} 灼傷升為 ${lv + 1} 級`);
      return commit(() => { c.state.status.splice(i, 1); }, `${cname(c)} 解除灼傷`);
    }
    if (i >= 0) return commit(() => { c.state.status.splice(i, 1); }, `${cname(c)} 解除${F.STATUS_ZH[k]}`);
    fx(c.id, F.STATUS_ZH[k], 'st');
    commit(() => { c.state.status.push({ kind: k, level: k === 'burn' ? 1 : undefined, rounds: null, n: 0, note: '' }); }, `${cname(c)} 陷入${F.STATUS_ZH[k]}`);
  }
  const numIn = (v, set, attrs) => h('input', Object.assign({ type: 'number', min: '0', value: v, onchange: (e) => set(num(e.target.value)) }, attrs || {}));
  function statusSec(c) {
    const kinds = Object.keys(F.STATUS_ZH).filter((k) => k !== 'custom');
    const btns = kinds.map((k) => {
      const st = c.state.status.find((s) => s.kind === k), col = BD.STATUS_COLOR[k];
      return h('button', { class: 'tk-st' + (st ? ' on' : ''), style: { '--c': col[0], '--ci': col[1] }, 'aria-pressed': String(!!st),
        title: k === 'burn' ? '點擊循環：1 級 → 2 級 → 3 級 → 解除' : st ? '點一下解除' : '點一下加上', onclick: () => toggleStatus(c, k) },
      F.STATUS_ZH[k], k === 'burn' && st ? h('small', {}, ` ${st.level || 1}級`) : null);
    });
    btns.push(h('button', { class: 'tk-st add', onclick: () => {
      const t = prompt('自訂狀態名稱（例如：寄生種子、被綁緊、替身）');
      if (t && t.trim()) commit(() => { c.state.status.push({ kind: 'custom', rounds: null, n: 0, note: t.trim() }); }, `${cname(c)}：${t.trim()}`);
    } }, '＋ 自訂'));
    const rows = c.state.status.map((st, i) => h('div', { class: 'tk-strow' }, stDot(st.kind), h('b', {}, st.kind === 'custom' ? (st.note || '自訂') : F.STATUS_ZH[st.kind]),
      st.kind === 'burn' ? h('label', {}, numIn(st.level || 1, (v) => commit(() => { st.level = Math.max(1, Math.min(3, v || 1)); }), { min: '1', max: '3', 'aria-label': '灼傷等級' }), '級') : null,
      h('label', { title: '持續輪數；空白＝不倒數，結束本輪時自動減一' }, '剩', h('input', { type: 'number', min: '0', value: st.rounds == null ? '' : st.rounds, placeholder: '—', 'aria-label': '剩餘輪數',
        onchange: (e) => commit(() => { st.rounds = e.target.value === '' ? null : Math.max(0, num(e.target.value)); }) }), '輪'),
      st.kind === 'badPoison' || st.kind === 'burn' ? h('label', { title: '戰鬥輪結束已結算幾次（劇毒、三級灼傷每輪遞增用）' }, '已過', numIn(st.n || 0, (v) => commit(() => { st.n = Math.max(0, v); }), { 'aria-label': '已結算輪數' }), '輪') : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'tk-x', 'aria-label': '解除', title: '解除', onclick: () => commit(() => { c.state.status.splice(i, 1); }, `${cname(c)} 解除${statusText(st)}`) }, '×')));
    return h('section', { class: 'tk-sec' }, h('h3', {}, '異常狀態', h('small', {}, '點一下加上／解除')), h('div', { class: 'tk-stgrid' }, btns), rows.length ? h('div', { class: 'tk-strows' }, rows) : null);
  }

  function modsSec(c) {
    const any = F.STAT_KEYS.some((k) => c.state.mods[k]);
    const grid = h('div', { class: 'tk-mods' }, F.STAT_KEYS.map((k) => {
      const m = c.state.mods[k] || 0;
      return h('div', { class: 'tk-mod' + (m > 0 ? ' up' : m < 0 ? ' dn' : '') },
        h('span', { class: 'tk-mk' }, F.ATTR_ZH[k]),
        h('button', { class: 'tk-step', 'aria-label': F.ATTR_ZH[k] + '降一級', onclick: () => commit(() => { c.state.mods[k] = m - 1; }, `${cname(c)} ${F.ATTR_ZH[k]} ${signed(m - 1)}`) }, '−'),
        h('b', {}, signed(m)),
        h('button', { class: 'tk-step', 'aria-label': F.ATTR_ZH[k] + '升一級', onclick: () => commit(() => { c.state.mods[k] = m + 1; }, `${cname(c)} ${F.ATTR_ZH[k]} ${signed(m + 1)}`) }, '+'),
        h('small', { title: '現在的能力值（含升降、麻痺與大師級加成）' }, '＝' + R.stat(c, k, S.settings)));
    }));
    return h('section', { class: 'tk-sec' }, h('h3', {}, '能力升降', any ? h('button', { class: 'tk-link', onclick: () => commit(() => { c.state.mods = {}; }, `${cname(c)} 能力升降全部還原`) }, '全部還原') : null), grid);
  }

  const muCls = (m) => (m.delta == null ? 'imm' : m.delta > 0 ? 'up' : m.delta < 0 ? 'dn' : '');
  function movesSec(c) {
    const target = byId(UI.tgt[c.id]);
    const others = S.combatants.filter((x) => x !== c && !x.benched);
    const sel = h('select', { class: 'tk-tgt', 'aria-label': '傷害目標', onchange: (e) => { UI.tgt[c.id] = e.target.value; render(); } },
      h('option', { value: '' }, '不指定（不扣防禦）'),
      others.map((x) => h('option', { value: x.id, selected: x.id === UI.tgt[c.id] }, `${cname(x)}（${sideOf(x).name}）`)));
    const keys = [...(c.character.moves || [])];
    for (const k of ['Evasion', 'Clash']) if (DB.moves[k] && !keys.includes(k)) keys.push(k);
    const used = c.state.usedMoves;
    keys.sort((a, b) => (used.includes(a) ? 1 : 0) - (used.includes(b) ? 1 : 0));
    const pain = R.pain(c, S.settings);
    return h('section', { class: 'tk-sec', id: 'tk-moves' },
      h('h3', {}, '招式', h('small', {}, '點骰數就會擲骰・點招式名看效果')),
      h('label', { class: 'tk-tgtrow' }, '🎯 傷害目標', sel),
      pain ? h('p', { class: 'tk-tag warn tk-block' }, `疼痛：命中、傷害的成功數各 −${pain}（擲完再扣）`) : null,
      h('div', { class: 'tk-mvs' }, keys.map((k) => moveRow(c, k, target)).filter(Boolean)),
      h('p', { class: 'tk-note' }, '骰池只是建議，天氣、特性、道具、特殊效果請自己加減。打勾＝本輪已用（每招每輪一次，結束本輪會清掉）。'));
  }
  function moveRow(c, key, target) {
    const info = R.moveInfo(key);
    if (!info) return null;
    const k = c.id + '|' + key, open = !!UI.mvOpen[k];
    const used = c.state.usedMoves.includes(key);
    const hit = R.hitPool(c, info, S.settings), dmg = R.dmgPool(c, info, target, S.settings);
    const maneuver = key === 'Evasion' || key === 'Clash';
    const hitL = maneuver ? '骰池' : '命中';
    const roll = (label, n, extra) => h('button', { class: 'tk-pool', title: `擲 ${n} 顆骰`, onclick: () => rollFor(c, `${info.zh} ${label}`, n) }, h('small', {}, label), h('b', {}, n), extra || null);
    const last = (label) => UI.last[c.id + '|' + info.zh + ' ' + label];
    const hitEl = hit ? roll(hitL, hit.size) : h('span', { class: 'tk-pool na', title: info.accText || '' }, h('small', {}, '命中'), h('b', {}, '—'));
    const dmgEl = dmg && !dmg.manual ? roll('傷害', dmg.size, dmg.matchup && dmg.matchup.delta !== 0 ? h('i', { class: 'tk-mu ' + muCls(dmg.matchup) }, dmg.matchup.label) : null)
      : dmg && dmg.manual ? h('span', { class: 'tk-pool na', title: info.dmgText || '' }, h('small', {}, '傷害'), h('b', {}, '手動')) : h('span', { class: 'tk-pool none' });
    const react = info.tags.find((t) => /反應|先制/.test(t));
    const row = h('div', { class: 'tk-mv' + (used ? ' used' : '') + (open ? ' open' : '') },
      h('label', { class: 'tk-mvuse', title: '本輪已用' }, h('input', { type: 'checkbox', checked: used, 'aria-label': `${info.zh} 本輪已用`, onchange: (e) => {
        const on = e.target.checked;
        commit(() => { const u = c.state.usedMoves; const i = u.indexOf(key); if (on && i < 0) u.push(key); else if (!on && i >= 0) u.splice(i, 1); }, `${cname(c)} ${on ? '使用' : '取消使用'}「${info.zh}」`);
      } })),
      h('button', { class: 'tk-mvname', 'aria-expanded': String(open), onclick: () => { UI.mvOpen[k] = !open; render(); } },
        h('span', { class: 'tk-tdot', style: { background: DB.typeColor[info.type] || '#aaa' }, title: info.type || '' }),
        h('b', {}, info.zh), react ? h('i', { class: 'tk-react' }, react) : null, h('span', { class: 'tk-chev', 'aria-hidden': 'true' }, open ? '▾' : '▸')),
      hitEl, dmgEl);
    const out = [row];
    const lh = last(hitL), ld = last('傷害');
    if (lh || ld) out.push(h('div', { class: 'tk-mvres' }, lh ? h('span', {}, h('small', {}, hitL + ' '), lh) : null, ld ? h('span', {}, h('small', {}, '傷害 '), ld) : null));
    if (open) {
      const cat = { phys: '物理', spec: '特殊', status: '變化' }[info.cat] || '';
      out.push(h('div', { class: 'tk-mvd' },
        h('div', { class: 'tk-mvmeta' }, info.type ? typeChip(info.type) : null, h('span', {}, cat + (info.power && !/^[-—]$/.test(String(info.power)) ? `・威力 ${info.power}` : '')), info.tags.map((t) => h('span', { class: 'tag2' + (/反應|先制/.test(t) ? ' react' : '') }, t))),
        hit ? h('div', {}, h('span', { class: 'tk-lb' }, hitL), `${hit.text} ＝ ${hit.size} 骰`,
          h('small', {}, maneuver || info.reaction ? '（反應，不受多重行動難度影響）' : `（需 ${hit.need} 成功${info.lowAcc ? `，低命中再 −${info.lowAcc}` : ''}）`))
          : info.accText && !/^[-—]$/.test(info.accText) ? h('div', {}, h('span', { class: 'tk-lb' }, '命中'), info.accText, h('small', {}, '（無法自動計算）')) : null,
        dmg && !dmg.manual ? h('div', {}, h('span', { class: 'tk-lb' }, '傷害'), `${dmg.text} ＝ ${dmg.size} 骰`) : dmg && dmg.manual ? h('div', {}, h('span', { class: 'tk-lb' }, '傷害'), info.dmgText, h('small', {}, '（請手動算）')) : null,
        info.text ? h('p', {}, info.text) : null,
        h('a', { href: SITE + 'data/moves.html?n=' + encodeURIComponent(key), target: '_blank', rel: 'noopener' }, '在規則站查看 ↗')));
    }
    return out;
  }

  function effChip(e) {
    const expired = e.rounds === 0;
    return h('span', { class: 'tk-echip' + (expired ? ' expired' : '') + (e.hidden ? ' secret' : ''), title: e.note || '' },
      h('button', { class: 'tk-en', onclick: () => openEffect(e), title: '編輯條目' }, e.hidden ? '🔒 ' : '', effName(e)),
      e.rounds != null ? h('small', {}, expired ? '到期' : `${e.rounds} 輪`) : null,
      e.rounds != null ? h('button', { class: 'tk-step', 'aria-label': '減少一輪', onclick: () => commit(() => { e.rounds = Math.max(0, e.rounds - 1); }, `條目「${e.name}」剩 ${Math.max(0, e.rounds - 1)} 輪`) }, '−') : null,
      h('button', { class: 'tk-x', 'aria-label': '移除', onclick: () => commit(() => { S.effects = S.effects.filter((x) => x !== e); }, `移除條目：${e.name}`) }, '×'));
  }
  function effSec(c) {
    const list = effectsOf(c.id);
    return h('section', { class: 'tk-sec' }, h('h3', {}, '附在身上的條目', h('button', { class: 'tk-link', onclick: () => openEffect(null, c.id) }, '＋ 新增')),
      list.length ? h('div', { class: 'tk-effs' }, list.map(effChip)) : h('p', { class: 'tk-note' }, '例如寄生種子、替身、守住。也可以把戰場上的條目卡拖到棋子上。'));
  }
  function infoSec(c) {
    const ch = c.character, info = [];
    if (!R.isTrainer(c)) {
      const ab = DB.abilities[ch.ability || ''];
      info.push(h('div', {}, h('b', {}, '特性：'), ab ? ab.z || ch.ability : ch.ability || '—', ab && ab.e ? h('p', { class: 'tk-note' }, ab.e) : null));
      if (ch.item) info.push(h('div', {}, h('b', {}, '持有物：'), ch.item));
      info.push(h('div', {}, h('b', {}, '階級：'), DB.rankZh[ch.rank] || ch.rank));
    } else {
      info.push(h('div', {}, h('b', {}, '階級：'), DB.rankZh[ch.rank] || ch.rank, ch.concept ? '　概念：' + ch.concept : ''));
      info.push(h('div', {}, h('b', {}, '能力：'), F.ATTR.filter((k) => k !== 'spe').map((k) => `${F.ATTR_ZH[k]} ${(ch.attr || {})[k] || 0}`).join('　')));
      const sk = Object.keys(ch.skills || {}).filter((k) => ch.skills[k]).map((k) => `${F.SK_ZH[k] || k} ${ch.skills[k]}`);
      if (sk.length) info.push(h('div', {}, h('b', {}, '技能：'), sk.join('　')));
    }
    return h('section', { class: 'tk-sec' },
      h('details', { class: 'tk-det', open: UI.infoOpen ? true : undefined, ontoggle: (e) => { UI.infoOpen = e.target.open; } }, h('summary', {}, '角色資料（特性、持有物、階級）'), h('div', { class: 'tk-detb' }, info)),
      h('label', { class: 'tk-gmnote' }, h('span', {}, '🔒 GM 備註（玩家看不到）'),
        h('textarea', { rows: '2', value: c.gmNote || '', placeholder: '例如：這隻打算第 3 輪逃走', onchange: (e) => { c.gmNote = e.target.value; persist(); } })));
  }
  function moreSec(c) {
    const del = () => {
      if (!confirm(`刪除「${cname(c)}」？（可以用復原找回）`)) return;
      commit(() => { S.combatants = S.combatants.filter((x) => x !== c); S.effects = S.effects.filter((e) => e.scope !== c.id); }, `刪除參戰者：${cname(c)}`);
    };
    return h('section', { class: 'tk-sec' }, h('details', { class: 'tk-det', open: UI.moreOpen ? true : undefined, ontoggle: (e) => { UI.moreOpen = e.target.open; } }, h('summary', {}, '更多操作'),
      h('div', { class: 'tk-more' },
        h('button', { onclick: () => commit(() => { c.state.fainted = !R.isDown(c); }, `${cname(c)} ${R.isDown(c) ? '起身' : '倒下'}`) }, R.isDown(c) ? '標為起身' : '標為倒下'),
        h('button', { onclick: () => commit(() => { c.benched = true; if (S.turn.combatant === c.id) S.turn.combatant = null; }, `${cname(c)} 收回／離場`) }, '收回（移到後備）'),
        h('button', { onclick: () => commit(() => { const copy = F.clone(c); copy.id = F.uid('c'); copy.character.name = uniqueName(cname(c)); delete copy.pos; S.combatants.push(copy); }, `複製 ${cname(c)}`) }, '複製一隻'),
        h('button', { onclick: () => download(`${cname(c)}.json`, JSON.stringify(c.character, null, 2)) }, '匯出角色 JSON'),
        !R.isTrainer(c) ? h('button', { onclick: () => {
          const sh = F.charToSheet(DB, core(), c.character); if (!sh) return toast('找不到這隻的物種');
          copyText(core().toPaste(sh), (ok) => toast(ok ? '已複製 pokepast 文字' : '無法複製'));
        } }, '複製 pokepast 文字') : null,
        h('button', { class: 'danger2', onclick: del }, '刪除')),
      h('label', { class: 'tk-chk' }, h('input', { type: 'checkbox', checked: c.hidden, onchange: (e) => commit(() => { c.hidden = e.target.checked; }, `${cname(c)} ${e.target.checked ? '對玩家隱藏' : '對玩家公開'}`) }), ' 對玩家隱藏（玩家看板與 Discord 文字都不顯示）'),
      h('label', { class: 'tk-chk' }, '玩家看板的 HP：', h('select', { onchange: (e) => commit(() => { if (e.target.value) c.hpMode = e.target.value; else delete c.hpMode; }, `${cname(c)} 玩家看板 HP 顯示方式`) },
        [['', `跟著「${sideOf(c).name}」`], ['exact', '數字'], ['bar', '只有血條'], ['hidden', '不顯示']].map(([v, t]) => h('option', { value: v, selected: (c.hpMode || '') === v }, t))))));
  }

  // 名單・先攻：輸入先攻、排序、後備
  function listPane() {
    const list = activeOrder();
    const anyPri = list.some((c) => c.state.init.priority);
    const showPri = UI.showPri || anyPri;
    const initKey = (c, f) => `${f}:${c.id}`;
    const nextFocus = (i, f) => { const n = list[i + 1]; return n ? initKey(n, f) : null; };
    const initIn = (c, i, f, val, set, label) => h('input', { type: 'number', 'data-k': initKey(c, f), value: val, 'aria-label': `${cname(c)} ${label}`,
      onchange: (e) => set(e.target.value),
      onkeydown: (e) => { if (e.key !== 'Enter') return; e.preventDefault(); UI.focusK = nextFocus(i, f); e.target.blur(); setTimeout(() => { if (UI.focusK) { const n = document.querySelector(`[data-k="${UI.focusK}"]`); UI.focusK = null; if (n) { n.focus(); n.select(); } } }, 0); } });
    const rows = list.map((c, i) => h('div', { class: 'tk-lrow' + (S.turn.combatant === c.id ? ' cur' : '') + (R.isDown(c) ? ' down' : ''), style: { '--side': sideOf(c).color } },
      h('span', { class: 'tk-lord' }, i + 1),
      h('span', { class: 'tk-lmv' }, h('button', { class: 'tk-step', disabled: i === 0, 'aria-label': '上移', onclick: () => move(c, -1) }, '▲'), h('button', { class: 'tk-step', disabled: i === list.length - 1, 'aria-label': '下移', onclick: () => move(c, 1) }, '▼')),
      sprite(c, 'xs'),
      h('button', { class: 'tk-lname', onclick: () => select(c.id) }, h('b', {}, cname(c)), h('small', {}, sideOf(c).name)),
      h('label', { class: 'tk-init', title: '先攻擲骰的成功數' }, h('small', {}, '先攻'), initIn(c, i, 'init', c.state.init.roll == null ? '' : c.state.init.roll,
        (v) => commit(() => { c.state.init.roll = v === '' ? null : num(v); }, `${cname(c)} 先攻 ${v === '' ? '清除' : num(v)}`), '先攻')),
      showPri ? h('label', { class: 'tk-init', title: '先制等級（先制招式）；越高越先，結束本輪會歸零' }, h('small', {}, '先制'), initIn(c, i, 'pri', c.state.init.priority || 0,
        (v) => commit(() => { c.state.init.priority = num(v); }, `${cname(c)} 先制 ${num(v)}`), '先制')) : null));
    const bench = S.combatants.filter((c) => c.benched);
    return [
      h('div', { class: 'tk-lhead' }, h('button', { class: 'primary', onclick: sortByInit, disabled: !list.length }, '依先攻排序'),
        h('label', { class: 'tk-chk', title: anyPri ? '有人設定了先制，所以一直顯示' : '' }, h('input', { type: 'checkbox', checked: showPri, disabled: anyPri, onchange: (e) => { UI.showPri = e.target.checked; savePref(); render(); } }), ' 先制欄'),
        h('span', { class: 'grow' }),
        h('button', { class: 'tk-link', onclick: () => commit(() => { S.turn.combatant = null; S.turn.passStreak = 0; }, '清除目前輪到') }, '清除目前輪到')),
      h('p', { class: 'tk-note' }, '輸入先攻（按 Enter 跳到下一位），再按「依先攻排序」：先制高的先，再比先攻，同分比靈巧＋警覺。也可以直接拖上方的行動順序。'),
      list.length ? h('div', { class: 'tk-lrows' }, rows) : h('p', { class: 'tk-note' }, '還沒有參戰者。'),
      h('h3', { class: 'tk-h3' }, '後備／已離場', h('small', {}, `${bench.length} 位`)),
      bench.length ? bench.map((c) => h('div', { class: 'tk-brow' }, sprite(c, 'xs'), h('b', {}, cname(c)),
        h('small', {}, `${sideOf(c).name}${R.isDown(c) ? '・倒下' : `・HP ${c.state.hp}/${R.maxHp(c, S.settings)}`}`), h('span', { class: 'grow' }),
        h('button', { class: 'tk-mini', onclick: () => commit(() => { c.benched = false; }, `${cname(c)} 上場`) }, '上場'),
        h('button', { class: 'tk-mini', onclick: () => openEdit(c) }, '編輯'),
        h('button', { class: 'tk-x', 'aria-label': '刪除', onclick: () => { if (!confirm(`刪除「${cname(c)}」？`)) return; commit(() => { S.combatants = S.combatants.filter((x) => x !== c); S.effects = S.effects.filter((e) => e.scope !== c.id); }, `刪除參戰者：${cname(c)}`); } }, '×')))
        : h('p', { class: 'tk-note' }, '倒下後收回、或暫時不上場的角色會放在這裡。'),
    ];
  }

  function logPane() {
    const note = h('input', { class: 'grow', placeholder: '手動記一筆（Enter 送出）', 'aria-label': '手動記一筆' });
    const add = () => { const t = note.value.trim(); if (!t) return; logOnly('【備註】' + t); render(); };
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    return [h('div', { class: 'tk-lognew' }, note, h('button', { onclick: add }, '記下')),
      S.log.length ? h('div', { class: 'tk-log' }, [...S.log].reverse().map((e) => h('div', { class: 'tk-le' + (/^──/.test(e.text) ? ' sep' : /^【備註】/.test(e.text) ? ' memo' : '') }, h('small', {}, `第 ${e.round} 輪・${e.t || ''}`), h('span', {}, e.text))))
        : h('p', { class: 'tk-note' }, '每一步操作都會自動記在這裡。'),
      S.log.length ? h('button', { class: 'tk-link danger2', onclick: () => { if (confirm('清空所有紀錄？')) { S.log = []; persist(); render(); } } }, '清空紀錄') : null];
  }

  // ───────── 底部固定的回合按鈕 ─────────
  function dock() {
    const cur = byId(S.turn.combatant), held = allHeld(), ord = activeOrder();
    const lastU = undo[undo.length - 1];
    const nowEl = cur
      ? h('button', { class: 'tk-nowbtn', onclick: () => select(cur.id), title: '看他的資料', style: { '--side': sideOf(cur).color } }, sprite(cur, 'sm'),
        h('span', { class: 'tk-nowt' }, h('small', {}, '輪到'), h('b', {}, cname(cur))), h('small', { class: 'tk-need' }, `需 ${cur.state.actionCount + 1} 成功`))
      : h('span', { class: 'tk-nowbtn idle' }, ord.length ? '按「▶ 開始」從第一位開始' : '還沒有參戰者');
    const btns = cur ? [
      h('button', { class: 'tk-go act', onclick: () => nextTurn('act'), title: '他這回合有行動：行動次數 +1，換下一位（快捷鍵 N）' }, h('span', {}, '✓ 行動了'), h('small', {}, '換下一位'), h('kbd', {}, 'N')),
      h('button', { class: 'tk-go hold', onclick: () => nextTurn('hold'), title: '他這回合保留不行動，換下一位（快捷鍵 H）' }, h('span', {}, '✗ 保留'), h('small', {}, '換下一位'), h('kbd', {}, 'H')),
    ] : [h('button', { class: 'tk-go act', disabled: !ord.length, onclick: () => nextTurn('start'), title: '從行動順序的第一位開始（快捷鍵 N）' }, h('span', {}, '▶ 開始'), h('small', {}, '從第一位'), h('kbd', {}, 'N'))];
    return h('footer', { class: 'tk-dock' + (held ? ' held' : '') },
      h('div', { class: 'tk-dockin' },
        h('label', { class: 'tk-round', title: '第幾輪（可以手動改）' }, h('small', {}, '第'), h('input', { type: 'number', min: '1', value: S.round, 'aria-label': '第幾輪',
          onchange: (e) => { const v = Math.max(1, num(e.target.value, 1)); commit(() => { S.round = v; }, `改為第 ${v} 輪`); } }), h('small', {}, '輪')),
        nowEl,
        held ? h('span', { class: 'tk-heldmsg' }, '大家都保留了 → 可以結束本輪') : null,
        h('span', { class: 'grow' }),
        btns,
        h('button', { class: 'tk-go end' + (held ? ' pulse' : ''), onclick: openRoundEnd, title: '結算灼傷、中毒、天氣傷害與倒數，進入下一輪（快捷鍵 E）' }, h('span', {}, '⏭ 結束本輪'), h('small', {}, '結算與倒數'), h('kbd', {}, 'E')),
        h('span', { class: 'tk-undos' },
          h('button', { class: 'tk-undo', disabled: !undo.length, onclick: doUndo, title: lastU ? `復原：${lastU.label}（Ctrl+Z）` : '沒有可以復原的操作' }, h('span', { 'aria-hidden': 'true' }, '↶'), h('span', { class: 'tk-ul' }, lastU ? lastU.label : '復原')),
          h('button', { class: 'tk-undo r', disabled: !redo.length, onclick: doRedo, title: '重做（Ctrl+Y）', 'aria-label': '重做' }, '↷'))));
  }

  // ───────── 格子的小彈窗 ─────────
  const SUGGEST = {
    weather: ['大晴天', '下雨', '沙暴', '下雪', '冰雹', '大日照', '暴風雨', '亂流'],
    terrain: ['電氣場地', '青草場地', '薄霧場地', '精神場地', '戲法空間', '重力'],
    forceField: ['光牆', '反射壁', '極光幕', '神秘守護', '白霧', '順風'],
    hazard: ['撒菱', '隱形岩', '毒菱', '黏黏網'],
    cover: ['半身掩護', '全掩護'],
    other: [],
  };
  // 點天氣／場地／防護力場／入場危害格子出現的選項：已經有的條目（各自的輪數、層數、×）＋可以加的名稱＋自訂名稱
  function slotPop(sl) {
    return () => {
      const list = slotList(sl);
      const names = SUGGEST[sl.kind] || [];
      const where = scopeName(sl.scope);
      const addName = (n) => {
        n = String(n || '').trim(); if (!n) return;
        const ex = list.find((e) => e.name === n);
        if (ex && sl.stack) return commit(() => { ex.layers = (ex.layers || 1) + 1; }, `${n}（${where}）疊到 ${(ex.layers || 1) + 1} 層`);
        if (ex) return toast(`「${n}」已經在了`);
        commit(() => {
          if (sl.single) S.effects = S.effects.filter((e) => !list.includes(e));
          S.effects.push({ id: F.uid('e'), kind: sl.kind, name: n, scope: sl.scope, rounds: null, note: '' });
        }, `${sl.label}（${where}）：${n}` + (sl.single && list.length ? `（取代${list.map((e) => e.name).join('、')}）` : ''));
      };
      const custom = h('input', { placeholder: '自訂名稱，Enter 加入', 'data-k': 'slotname', 'aria-label': '自訂名稱', onkeydown: (ev) => { if (ev.key === 'Enter') { const v = ev.target.value; ev.target.value = ''; addName(v); } } });
      const rows = list.map((e) => h('div', { class: 'tk-sirow' + (e.rounds === 0 ? ' expired' : '') },
        h('b', {}, e.name),
        sl.stack ? h('span', { class: 'tk-layers', title: '層數' },
          h('button', { class: 'tk-step', 'aria-label': '少一層', disabled: (e.layers || 1) <= 1, onclick: () => commit(() => { e.layers = Math.max(1, (e.layers || 1) - 1); }, `${e.name}（${where}）剩 ${Math.max(1, (e.layers || 1) - 1)} 層`) }, '−'),
          h('span', {}, `${e.layers || 1} 層`),
          h('button', { class: 'tk-step', 'aria-label': '多一層', onclick: () => commit(() => { e.layers = (e.layers || 1) + 1; }, `${e.name}（${where}）疊到 ${(e.layers || 1) + 1} 層`) }, '+')) : null,
        h('label', { class: 'tk-sird', title: '剩餘輪數；空白＝不倒數，結束本輪時自動減一' }, '剩',
          h('input', { type: 'number', min: '0', placeholder: '—', 'data-k': 'rd-' + e.id, value: e.rounds == null ? '' : e.rounds, 'aria-label': `${e.name} 剩餘輪數`,
            onchange: (ev) => { const v = ev.target.value === '' ? null : Math.max(0, num(ev.target.value)); commit(() => { e.rounds = v; }, `${e.name}（${where}）${v == null ? '不倒數' : `剩 ${v} 輪`}`); } }), '輪'),
        h('button', { class: 'tk-x', 'aria-label': `解除 ${e.name}`, title: '解除', onclick: () => commit(() => { S.effects = S.effects.filter((x) => x !== e); }, `${e.name}（${where}）解除`) }, '×')));
      const hint = sl.single ? '天氣同時只有一種：選新的會取代舊的。' : sl.stack ? '可以同時有好幾種；同一種再點一次＝多疊一層。每種各自倒數。' : '可以同時有好幾個，各自倒數。';
      return [h('div', { class: 'tk-poph' }, h('b', {}, `${sl.icon} ${sl.label}`), h('small', {}, where)),
        list.length ? h('div', { class: 'tk-sirows' }, rows) : null,
        h('div', { class: 'tk-optlab' }, list.length ? (sl.single ? '換成：' : '再加：') : '選一個：'),
        h('div', { class: 'tk-opts' }, names.map((n) => {
          const ex = list.find((e) => e.name === n);
          return h('button', { class: ex ? 'on' : '', onclick: () => addName(n), title: ex ? (sl.stack ? '再疊一層' : '已經在了') : '加上' }, ex && !sl.stack ? '✓ ' + n : n, ex && sl.stack ? h('small', {}, ' ＋1層') : null);
        })),
        h('div', { class: 'tk-prow' }, custom, h('button', { onclick: () => { const v = custom.value; custom.value = ''; addName(v); } }, '加入')),
        h('p', { class: 'tk-note' }, hint),
        h('div', { class: 'tk-prow end' }, h('button', { class: 'primary', onclick: closePop }, '完成'))];
    };
  }

  // ───────── 條目編輯 ─────────
  function openEffect(e, scope, pos) {
    const isNew = !e;
    const d = e || { id: F.uid('e'), kind: 'other', name: '', scope: scope || 'field', rounds: null, note: '', card: true };
    if (isNew && pos) d.pos = pos;
    const kind = h('select', {}, Object.keys(F.EFFECT_KIND_ZH).map((k) => h('option', { value: k, selected: k === d.kind }, F.EFFECT_KIND_ZH[k])));
    const dl = h('datalist', { id: 'effsug' });
    const fillDl = () => { dl.replaceChildren(...(SUGGEST[kind.value] || []).map((s) => h('option', { value: s }))); };
    kind.addEventListener('change', fillDl); fillDl();
    const name = h('input', { value: d.name, list: 'effsug', placeholder: '名稱（例如：下雨、撒菱、火山 5 輪後爆發）' });
    const rounds = h('input', { type: 'number', min: '0', value: d.rounds == null ? '' : d.rounds, placeholder: '不倒數請留空' });
    const layers = h('input', { type: 'number', min: '1', value: d.layers || 1, title: '入場危害可以疊好幾層（例如撒菱 3 層）' });
    const note = h('input', { value: d.note || '', placeholder: '備註（可空白）' });
    const secret = h('input', { type: 'checkbox', checked: !!d.hidden });
    const scopeSel = h('select', {}, h('option', { value: 'field', selected: d.scope === 'field' }, '全場'),
      S.sides.map((sd) => h('option', { value: sd.id, selected: d.scope === sd.id }, `${sd.name}那一側`)),
      S.combatants.map((c) => h('option', { value: c.id, selected: d.scope === c.id }, `附在 ${cname(c)} 身上`)));
    const save = () => {
      if (!name.value.trim()) return toast('請填名稱');
      commit(() => {
        Object.assign(d, { kind: kind.value, name: name.value.trim(), rounds: rounds.value === '' ? null : Math.max(0, num(rounds.value)), scope: scopeSel.value, note: note.value.trim() });
        const ly = Math.max(1, num(layers.value, 1)); if (ly > 1) d.layers = ly; else delete d.layers;
        if (secret.checked) d.hidden = true; else delete d.hidden;
        if (isNew) S.effects.push(d);
      }, `${isNew ? '新增' : '修改'}條目：${d.name}${d.rounds != null ? `（${d.rounds} 輪）` : ''}`);
      m.close();
    };
    name.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') save(); });
    const body = h('div', { class: 'form' },
      h('label', {}, '名稱', name, dl), h('div', { class: 'tk-f3' }, h('label', {}, '種類', kind), h('label', {}, '剩餘輪數', rounds), h('label', {}, '層數', layers)), h('label', {}, '作用範圍', scopeSel), h('label', {}, '備註', note),
      h('label', { class: 'rad' }, secret, ' 🔒 不對玩家公開（玩家看板不會顯示，例如還沒觸發的事件）'),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: save }, isNew ? '新增' : '儲存'), h('button', { onclick: () => m.close() }, '取消'),
        !isNew ? h('button', { class: 'danger2', onclick: () => { commit(() => { S.effects = S.effects.filter((x) => x !== d); }, `移除條目：${d.name}`); m.close(); } }, '移除') : null));
    const m = modal(isNew ? '新增條目' : '編輯條目', body);
    name.focus();
  }

  // ───────── 新增參戰者 ─────────
  function openAdd(tab) {
    const state = { tab: tab || 'quick', side: S.sides.some((s) => s.id === UI.lastSide) ? UI.lastSide : S.sides[0].id, owner: '' };
    const body = h('div', {});
    const m = modal('新增參戰者', body, { wide: true });
    const head = () => {
      const sideSel = h('select', { 'aria-label': '加入哪一側', onchange: (e) => { state.side = e.target.value; UI.lastSide = state.side; savePref(); } }, S.sides.map((sd) => h('option', { value: sd.id, selected: sd.id === state.side }, sd.name)));
      const owner = h('input', { value: state.owner, placeholder: '玩家名（可空白）', 'aria-label': '玩家名', onchange: (e) => { state.owner = e.target.value; } });
      const tabs = [['quick', '快速加入'], ['gen', '產生器（詳細條件）'], ['paste', '貼上隊伍／匯入檔案'], ['tpl', '遭遇範本'], ['manual', '手動新增']];
      return h('div', {}, h('div', { class: 'row addhead' }, h('label', {}, '加入哪一側 ', sideSel), h('label', {}, '玩家 ', owner)),
        h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, t]) => h('button', { class: 'tab' + (state.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(state.tab === k), onclick: () => { state.tab = k; draw(); } }, t))));
    };
    const add = (chars) => { addChars(chars, state.side, state.owner); toast(`已加入 ${chars.length} 位到「${(S.sides.find((s) => s.id === state.side) || {}).name}」`); };
    function draw() {
      body.replaceChildren(head());
      ({ quick: drawQuick, gen: drawGen, paste: drawPaste, tpl: drawTpl, manual: drawManual }[state.tab] || drawQuick)();
    }
    function drawQuick() {
      const Pc = core();
      const dl = h('datalist', { id: 'spq' }, DB.dex.map((x) => h('option', { value: dexLabel(x) }, `#${x.num}`)));
      const sp = h('input', { list: 'spq', class: 'tk-qsp', placeholder: '輸入物種，例如：波波、Zubat', 'aria-label': '物種' });
      const rank = h('select', { 'aria-label': '階級', onchange: (e) => { UI.rank = e.target.value; savePref(); } }, Object.keys(DB.rankZh).map((r) => h('option', { value: r, selected: r === String(UI.rank) }, DB.rankZh[r])));
      const cnt = h('input', { type: 'number', min: '1', max: '12', value: '1', 'aria-label': '數量' });
      const msg = h('div', { class: 'pkio-msg', role: 'status' });
      const recent = lsGet(RECENT_KEY, []);
      const make = (i, n) => {
        const chars = [];
        for (let k = 0; k < n; k++) chars.push(F.sheetToChar(DB, Pc, Pc.roll(Pc.D[i], +rank.value)));
        add(chars);
        const r = lsGet(RECENT_KEY, []).filter((x) => x !== i); r.unshift(i); lsSet(RECENT_KEY, r.slice(0, 12));
        msg.className = 'pkio-msg'; msg.textContent = `已加入 ${n} 隻 ${DB.dex[i].z}（${DB.rankZh[rank.value]}）。可以繼續輸入下一個。`;
      };
      const go = () => {
        const i = findIdx(sp.value);
        if (i < 0) { msg.className = 'pkio-msg bad'; msg.textContent = sp.value.trim() ? '找不到這個物種，請從清單裡選。' : '請先輸入物種。'; return; }
        make(i, Math.max(1, Math.min(12, num(cnt.value, 1)))); sp.value = ''; sp.focus();
      };
      sp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      body.append(h('div', { class: 'tk-quickadd' },
        h('div', { class: 'tk-qrow' }, sp, dl, h('label', {}, '階級 ', rank), h('label', {}, '× ', cnt, ' 隻'), h('button', { class: 'primary', onclick: go }, '加入')),
        msg,
        recent.length ? h('div', { class: 'tk-recent' }, h('small', {}, '最近用過（點一下加一隻）：'), recent.filter((i) => DB.dex[i]).map((i) => h('button', { class: 'tk-rchip', onclick: () => make(i, 1), title: DB.dex[i].n },
          h('img', { src: SPR + DB.dex[i].img + '.png', alt: '', onerror: (e) => { e.target.remove(); } }), DB.dex[i].z))) : null,
        h('p', { class: 'tk-note' }, '每隻都依物種與階級隨機分配能力值與招式（和規則站的產生器相同）。要指定性格、風格等條件請用「產生器」分頁；加入後也可以按角色的「✎ 編輯」微調。')));
      setTimeout(() => sp.focus(), 0);
    }
    function drawGen() {
      const Pc = core();
      const wrap = h('div', { class: 'genwrap' });
      wrap.innerHTML = `<aside class="genl">${Pc.panelHTML('<div class="row2"><label class="small">一次加入 <input id="gcount" type="number" min="1" max="12" value="1" style="width:56px"> 隻（每隻重新隨機，野生群戰用）</label></div><button type="button" class="gbtn" id="ggo">產生並加入戰場</button><p class="note">條件決定要產生誰；點數依階級表隨機分配。加入後可以按角色的「✎ 編輯」微調。</p>')}</aside><div class="genhint note">左邊設好條件（物種、階級、風格…）後按「產生並加入戰場」。只想打物種名字的話，用「快速加入」比較快。</div>`;
      body.append(wrap);
      const pg = Pc.panel();
      document.getElementById('ggo').addEventListener('click', () => {
        const n = Math.max(1, Math.min(12, num(document.getElementById('gcount').value, 1)));
        const chars = [];
        for (let i = 0; i < n; i++) { const s = pg.make(); if (!s) { toast('沒有符合條件的寶可夢'); break; } chars.push(F.sheetToChar(DB, Pc, s)); }
        if (chars.length) add(chars);
      });
    }
    function readText(text) {
      return new Promise((resolve) => {
        text = String(text || '').trim();
        if (!text) return resolve({ chars: [], msg: '請先貼上內容或選擇檔案。' });
        if (/^[[{]/.test(text)) {
          try { const chars = F.charsFromJSON(JSON.parse(text)); if (chars.length) return resolve({ chars, msg: '' }); } catch (e) { /* 當成文字處理 */ }
        }
        core().importAny(text).then((r) => {
          if (!r.sets.length) return resolve({ chars: [], msg: r.errs.length ? r.errs.join('；') : '沒有讀到寶可夢，請確認內容。' });
          resolve({ chars: r.sets.map((s) => F.sheetToChar(DB, core(), s)), msg: [...r.warns, ...r.errs].join('；') });
        }, (e) => resolve({ chars: [], msg: e.message }));
      });
    }
    function drawPaste() {
      const ta = h('textarea', { rows: '10', spellcheck: 'false', placeholder: '貼上：\n・pokepast.es 網址或文字（Showdown 格式也行）\n・角色 JSON（單一角色或整隊）' });
      const msg = h('div', { class: 'pkio-msg', role: 'status' });
      const file = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', onchange: (e) => {
        const f = e.target.files[0]; if (!f) return;
        const rd = new FileReader(); rd.onload = () => { ta.value = String(rd.result); msg.textContent = `已讀入 ${f.name}，按「加入戰場」。`; }; rd.readAsText(f);
      } });
      body.append(h('div', { class: 'paste' }, ta, h('div', { class: 'row' }, h('label', { class: 'small' }, '或選擇檔案 ', file)), msg,
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: async () => {
          msg.textContent = '讀取中…';
          const r = await readText(ta.value);
          if (!r.chars.length) { msg.textContent = r.msg; msg.className = 'pkio-msg bad'; return; }
          add(r.chars); msg.className = 'pkio-msg'; msg.textContent = `已加入 ${r.chars.length} 位。` + (r.msg ? '注意：' + r.msg : ''); ta.value = '';
        } }, '加入戰場'))));
    }
    function drawTpl() {
      const list = lsGet(TPL_KEY, []);
      const act = activeOrder();
      const from = h('select', { 'aria-label': '要存哪一側' }, S.sides.map((sd) => { const n = act.filter((c) => c.side === sd.id).length; return h('option', { value: sd.id, selected: sd.id === 's2', disabled: !n }, `${sd.name}（${n} 位）`); }));
      const name = h('input', { placeholder: '範本名稱（例如：常磐森林的蟲群）', 'aria-label': '範本名稱' });
      body.append(h('div', { class: 'tk-tpl' },
        h('h4', {}, '已存的範本'),
        list.length ? list.map((t, i) => h('div', { class: 'tk-tplrow' }, h('div', { class: 'grow' }, h('b', {}, t.name), h('small', {}, t.chars.map((ch) => ch.name || F.charName(DB, ch)).join('、'))),
          h('button', { class: 'primary', onclick: () => add(F.clone(t.chars)) }, '放上場'),
          h('button', { class: 'tk-x', 'aria-label': '刪除範本', onclick: () => { if (!confirm(`刪除範本「${t.name}」？`)) return; list.splice(i, 1); lsSet(TPL_KEY, list); draw(); } }, '×')))
          : h('p', { class: 'tk-note' }, '還沒有範本。備團時把敵人放上場、存成範本，開打時一鍵放上場。'),
        h('h4', {}, '把目前場上的一側存成範本'),
        h('div', { class: 'row' }, from, name, h('button', { onclick: () => {
          const mem = act.filter((c) => c.side === from.value);
          if (!mem.length) return toast('那一側沒有參戰者');
          const nm = name.value.trim() || `${S.title || '遭遇'}・${mem.length} 位`;
          list.unshift({ name: nm, chars: mem.map((c) => F.clone(c.character)) }); lsSet(TPL_KEY, list.slice(0, 40)); toast(`已存成範本「${nm}」`); draw();
        } }, '存成範本')),
        h('p', { class: 'tk-note' }, '範本存在這個瀏覽器裡，只存角色資料（不含 HP 等戰鬥狀態）。放上場時加到上面選的那一側。')));
    }
    function drawManual() {
      const Pc = core();
      const dl = h('datalist', { id: 'spl' }, DB.dex.map((x) => h('option', { value: dexLabel(x) }, `#${x.num}`)));
      const sp = h('input', { list: 'spl', placeholder: '輸入或選擇物種（中文或英文）', 'aria-label': '物種' });
      const rank = h('select', {}, Object.keys(DB.rankZh).map((r) => h('option', { value: r, selected: r === '2' }, DB.rankZh[r])));
      const tn = h('input', { placeholder: '訓練家名稱' });
      body.append(h('div', { class: 'manual' },
        h('div', { class: 'form' }, h('h4', {}, '空白寶可夢（能力值取圖鑑下限，再到「✎ 編輯」填）'), h('label', {}, '物種', sp, dl), h('label', {}, '階級', rank),
          h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => {
            const i = findIdx(sp.value); if (i < 0) return toast('找不到這個物種');
            add([F.sheetToChar(DB, Pc, F.blankSheet(DB, Pc, i, +rank.value))]);
          } }, '加入寶可夢'))),
        h('div', { class: 'form' }, h('h4', {}, '訓練家（空白，能力值 1）'), h('label', {}, '名稱', tn),
          h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => {
            const t = F.blankTrainer(); t.name = tn.value.trim() || '訓練家'; t.player = state.owner; add([t]); tn.value = '';
          } }, '加入訓練家')))));
    }
    draw();
    return m;
  }

  // ───────── 編輯參戰者 ─────────
  function openEdit(c) {
    if (R.isTrainer(c)) return openEditTrainer(c);
    const Pc = core();
    let sheet = F.charToSheet(DB, Pc, c.character) || F.blankSheet(DB, Pc, 0, c.character.rank || 1);
    const old = c.character;
    const body = h('div', {});
    const ownerIn = h('input', { value: c.owner || '', placeholder: '玩家名' });
    const sideSel = h('select', {}, S.sides.map((sd) => h('option', { value: sd.id, selected: sd.id === c.side }, sd.name)));
    const maxHp = h('input', { type: 'number', min: '0', value: old.override && old.override.maxHp != null ? old.override.maxHp : '', placeholder: `自動 ${R.maxHp(c, S.settings)}` });
    const dl = h('datalist', { id: 'spl2' }, DB.dex.map((x) => h('option', { value: dexLabel(x) })));
    const sp = h('input', { list: 'spl2', value: dexLabel(DB.dex[sheet.i]), onchange: (e) => {
      const i = findIdx(e.target.value);
      if (i < 0) return toast('找不到這個物種');
      sheet.i = i; sheet.ab = Pc.abName(DB.dex[i].ab[0] || sheet.ab); sheet.free = true; v.render(); toast('已換物種（進化或形態變化）。已開啟「不受規則限制」，請自己檢查能力值與招式。');
    } });
    const top = h('div', { class: 'form edtop' }, h('label', {}, '玩家', ownerIn), h('label', {}, '陣營（側）', sideSel), h('label', {}, '物種（進化／形態變化時改這裡）', sp, dl),
      h('label', {}, '最大 HP 覆寫', maxHp), h('p', { class: 'muted small' }, '下面是規則站的角色卡編輯畫面；改完按底下「完成」才會套用到戰場。HP、異常狀態、能力升降請在右邊的角色面板改。'));
    const box = h('div', { id: 'gsheet' });
    const done = h('button', { class: 'primary', onclick: () => {
      commit(() => {
        const nc = F.sheetToChar(DB, Pc, sheet);
        const ov = Object.assign({}, old.override || {}, { maxHp: maxHp.value === '' ? null : num(maxHp.value), free: sheet.free || undefined });
        c.character = Object.assign({}, old, nc, { override: ov });
        c.owner = ownerIn.value.trim(); c.side = sideSel.value;
      }, `編輯 ${cname(c)}`);
      m.close();
    } }, '完成');
    body.append(top, box, h('div', { class: 'row edfoot' }, done, h('button', { onclick: () => m.close() }, '取消')));
    const m = modal(`編輯：${cname(c)}`, body, { wide: true, sticky: true, closeText: '取消' });
    const v = Pc.view(box, { get: () => sheet, change: () => {}, tools: [], action: () => {} });
    v.render();
  }
  function openEditTrainer(c) {
    const old = c.character, t = F.clone(old);
    t.attr = t.attr || {}; t.social = t.social || {}; t.skills = t.skills || {};
    const f = (label, el) => h('label', {}, label, el);
    const txt = (k) => h('input', { value: t[k] ?? '', onchange: (e) => { t[k] = e.target.value; } });
    const nm = (obj, k) => h('input', { type: 'number', min: '0', value: obj[k] ?? 0, onchange: (e) => { obj[k] = num(e.target.value); } });
    const rank = h('select', { onchange: (e) => { t.rank = +e.target.value; } }, Object.keys(DB.rankZh).map((r) => h('option', { value: r, selected: +r === (t.rank || 1) }, DB.rankZh[r])));
    const ownerIn = h('input', { value: c.owner || '' });
    const sideSel = h('select', {}, S.sides.map((sd) => h('option', { value: sd.id, selected: sd.id === c.side }, sd.name)));
    const maxHp = h('input', { type: 'number', min: '0', value: old.override && old.override.maxHp != null ? old.override.maxHp : '', placeholder: `自動 ${R.maxHp(c, S.settings)}（4＋體魄）` });
    const grid = (title, keys, obj, zh) => h('div', { class: 'tg' }, h('h4', {}, title), h('div', { class: 'tgrid' }, keys.map((k) => h('label', {}, zh[k] || k, nm(obj, k)))));
    const body = h('div', { class: 'form' },
      f('名稱', txt('name')), f('玩家', ownerIn), f('陣營（側）', sideSel), f('階級', rank), f('年齡', txt('age')), f('概念', txt('concept')), f('性格', txt('nature')), f('最大 HP 覆寫', maxHp),
      grid('能力值', ['str', 'dex', 'vit', 'ins'], t.attr, F.ATTR_ZH), grid('社交能力值', F.SOC, t.social, F.SOC_ZH),
      grid('技能', [...F.SK_TRAINER, 'throw'], t.skills, F.SK_ZH),
      f('備註', h('textarea', { rows: '3', value: t.note || '', onchange: (e) => { t.note = e.target.value; } })),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => {
        commit(() => {
          t.override = Object.assign({}, t.override || {}, { maxHp: maxHp.value === '' ? null : num(maxHp.value) });
          c.character = t; c.owner = ownerIn.value.trim(); c.side = sideSel.value;
        }, `編輯 ${cname(c)}`);
        m.close();
      } }, '完成'), h('button', { onclick: () => m.close() }, '取消')));
    const m = modal(`編輯訓練家：${cname(c)}`, body, { sticky: true, closeText: '取消' });
  }

  // ───────── 結束本輪 ─────────
  function openRoundEnd() {
    const items = R.eorItems(S);
    const auto = h('input', { type: 'checkbox', checked: !!S.settings.eorAuto });
    const checks = items.map((it) => h('input', { type: 'checkbox', checked: it.dmg > 0 }));
    const timers = [
      ...S.effects.filter((e) => e.rounds != null && e.rounds > 0).map((e) => ({ text: e.name, left: e.rounds })),
      ...S.combatants.flatMap((c) => c.state.status.filter((st) => st.rounds != null && st.rounds > 0).map((st) => ({ text: `${cname(c)}：${statusText(st).replace(/（.*）/, '')}`, left: st.rounds }))),
    ];
    const downs = S.combatants.filter((c) => !c.benched && R.isDown(c));
    const bench = downs.map(() => h('input', { type: 'checkbox' }));
    const body = h('div', { class: 'eor' },
      h('h4', {}, '戰鬥輪結束時要處理的效果'),
      items.length ? h('div', {}, items.map((it, i) => h('label', { class: 'eoritem' }, checks[i], h('span', {}, it.text), it.dmg ? h('b', { class: 'dmg' }, `−${it.dmg} HP`) : h('small', { class: 'muted' }, '（提醒）'))))
        : h('p', { class: 'muted small' }, '沒有需要結算的異常狀態或天氣傷害。'),
      items.length ? h('label', { class: 'autoeor' }, auto, ' 自動扣除勾選項目的 HP（關著就只是提醒，由你自己改血量）') : null,
      items.length ? h('p', { class: 'muted small' }, '灼傷 1／2／3 級每輪 1／2／3 點（3 級每輪再 +1）、中毒 2 點、劇毒 2 點每輪 +1、沙暴與冰雹 1 點。實際以你的判定為準，打勾才會處理。') : null,
      timers.length ? [h('h4', {}, '倒數'), h('ul', { class: 'timers' }, timers.map((t) => h('li', {}, t.text, '　剩 ', h('b', {}, t.left), ' 輪 → ', t.left - 1 <= 0 ? h('b', { class: 'dn' }, '到期') : `剩 ${t.left - 1} 輪`)))] : null,
      downs.length ? [h('h4', {}, '倒下的參戰者（戰鬥輪結束時，訓練家可以收回並換新的）'),
        downs.map((c, i) => h('label', { class: 'eoritem' }, bench[i], h('span', {}, `${cname(c)} 收回，移到後備`)))] : null,
      h('p', { class: 'muted small' }, '確認後：所有人的行動次數、已用招式、先制歸零，從行動順序的第一位開始。'),
      h('div', { class: 'row end' }, h('button', { class: 'primary big', onclick: () => {
        const autoOn = auto.checked;
        commit(() => {
          S.settings.eorAuto = autoOn;
          const lines = [];
          items.forEach((it, i) => {
            const c = byId(it.cid);
            if (it.sid) it.sid.n = (it.sid.n || 0) + 1; // 不論有沒有扣血，這一輪已經過了（遞增用）
            if (autoOn && checks[i].checked && it.dmg > 0 && c) {
              const old = c.state.hp; c.state.hp = Math.max(0, old - it.dmg);
              if (c.state.hp <= 0) c.state.fainted = true;
              fx(c.id, '−' + it.dmg, 'dmg');
              lines.push(`${it.text} −${it.dmg}（HP ${old} → ${c.state.hp}）`);
            }
          });
          S.effects.forEach((e) => { if (e.rounds != null && e.rounds > 0) e.rounds--; });
          S.combatants.forEach((c) => c.state.status.forEach((st) => { if (st.rounds != null && st.rounds > 0) st.rounds--; }));
          downs.forEach((c, i) => { if (bench[i].checked) { c.benched = true; lines.push(`${cname(c)} 收回`); } });
          S.combatants.forEach((c) => { c.state.actionCount = 0; c.state.usedMoves = []; c.state.turnMark = null; c.state.init.priority = 0; });
          addLog(`── 第 ${S.round} 輪結束 ──` + (lines.length ? '：' + lines.join('；') : ''));
          S.round++;
          S.turn.passStreak = 0;
          syncOrder();
          const first = activeOrder().find((c) => !R.isDown(c));
          S.turn.combatant = first ? first.id : null;
          if (first) UI.sel = first.id;
        }, `── 第 ${S.round + 1} 輪開始 ──`);
        m.close();
        const first = byId(S.turn.combatant);
        banner(`第 ${S.round} 輪`, first ? `由 ${cname(first)} 開始` : '');
      } }, `確認，進入第 ${S.round + 1} 輪`), h('button', { onclick: () => m.close() }, '取消')));
    const m = modal(`結束第 ${S.round} 輪`, body, { sticky: true, closeText: '取消' });
  }

  // ───────── Discord 文字 ─────────
  function discordText() {
    const ICON = ['🟩', '🟥', '⬜', '🟦', '🟨', '🟪', '🟧'];
    const lines = [];
    const cur = byId(S.turn.combatant);
    const pubEff = (e) => !e.hidden;
    const field = S.effects.filter((e) => e.scope === 'field' && pubEff(e)).map((e) => effName(e) + (e.rounds != null ? (e.rounds === 0 ? '（到期）' : `（剩 ${e.rounds} 輪）`) : ''));
    lines.push(`**${S.title ? S.title + '｜' : ''}第 ${S.round} 輪**` + (S.field.location ? `｜${S.field.location}` : '') + (field.length ? `｜${field.join('、')}` : ''));
    const ord = activeOrder().filter((c) => !c.hidden);
    if (ord.length) lines.push('行動順序：' + ord.map((c) => (cur && c.id === cur.id ? `**▶${cname(c)}**` : R.isDown(c) ? `~~${cname(c)}~~` : cname(c))).join(' → '));
    S.sides.forEach((sd, si) => {
      const mem = ord.filter((c) => c.side === sd.id);
      const eff = S.effects.filter((e) => e.scope === sd.id && pubEff(e)).map((e) => effName(e) + (e.rounds != null ? (e.rounds === 0 ? '（到期）' : `（剩 ${e.rounds} 輪）`) : ''));
      if (!mem.length && !eff.length) return;
      lines.push(`${ICON[si % ICON.length]} **${sd.name}**` + (eff.length ? `｜${eff.join('、')}` : ''));
      mem.forEach((c) => {
        const mode = c.hpMode || sd.hp, max = R.maxHp(c, S.settings), hp = Math.max(0, c.state.hp);
        const hpT = mode === 'hidden' ? '' : mode === 'exact' ? `HP ${hp}/${max}` : `HP ${'▓'.repeat(Math.round(hp / Math.max(1, max) * 10))}${'░'.repeat(10 - Math.round(hp / Math.max(1, max) * 10))}`;
        const st = [...c.state.status.map(statusText), ...F.STAT_KEYS.filter((k) => c.state.mods[k]).map((k) => F.ATTR_ZH[k] + signed(c.state.mods[k])), ...effectsOf(c.id).filter(pubEff).map(effName)];
        const tail = [hpT, mode === 'exact' ? `意志 ${c.state.will}/${R.maxWill(c)}` : '', st.length ? st.join('、') : '', `行動 ${c.state.actionCount}/${MAX_ACTIONS}`, R.isDown(c) ? '倒下' : ''].filter(Boolean);
        lines.push(`　${cname(c)}${c.owner ? `（${c.owner}）` : ''}　${tail.join('｜')}`);
      });
    });
    return lines.join('\n');
  }
  function openDiscord() {
    const text = discordText();
    const ta = h('textarea', { rows: '14', spellcheck: 'false', readonly: true }); ta.value = text;
    const msg = h('div', { class: 'pkio-msg', role: 'status' });
    const body = h('div', {}, h('p', { class: 'muted small' }, 'HP 依各側（或單隻）的設定顯示數字、血條或不顯示；隱藏的參戰者與不公開的條目不會出現。直接貼到 Discord 就能顯示粗體與刪除線。'), ta, msg,
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => copyText(text, (ok) => { msg.textContent = ok ? '已複製，去 Discord 貼上吧。' : '無法複製，請手動選取。'; }) }, '複製')));
    modal('複製 Discord 文字', body);
    copyText(text, (ok) => { if (ok) msg.textContent = '已自動複製，去 Discord 貼上吧。'; });
  }

  // ───────── 存檔（匯入／匯出）─────────
  function openIO() {
    const msg = h('div', { class: 'pkio-msg', role: 'status' });
    const file = h('input', { type: 'file', accept: '.json,application/json', onchange: (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const obj = JSON.parse(String(rd.result));
          if (obj && obj.schema === F.SESSION) {
            if (!confirm(`用「${f.name}」取代目前的場次？（目前的內容可以用復原找回）`)) return;
            commit(() => { S = F.normalize(obj); UI.sel = null; }, '匯入場次存檔');
            m.close(); toast('已匯入場次');
          } else {
            const chars = F.charsFromJSON(obj);
            if (!chars.length) { msg.className = 'pkio-msg bad'; msg.textContent = '這不是場次存檔，也不是角色檔。'; return; }
            m.close(); openAdd('paste'); toast('這是角色檔：請在這裡選擇檔案，加入戰場。');
          }
        } catch (err) { msg.className = 'pkio-msg bad'; msg.textContent = '讀取失敗：' + err.message; }
      };
      rd.readAsText(f);
    } });
    const saved = S.saved ? new Date(S.saved) : null;
    const body = h('div', { class: 'io' },
      h('p', { class: 'tk-okline' }, '✔ 每次修改都會自動存在這個瀏覽器裡', saved ? `（上次：${pad2(saved.getHours())}:${pad2(saved.getMinutes())}）` : '', '。換電腦、換瀏覽器或清除網站資料就會消失，跑完團請匯出一份。'),
      h('h4', {}, '匯出'),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => {
          const d = new Date(); const name = `${S.title || '戰場記錄'}-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.json`;
          download(name, JSON.stringify(Object.assign({}, S, { saved: d.toISOString() }), null, 2)); msg.className = 'pkio-msg'; msg.textContent = '已下載 ' + name;
        } }, '匯出場次存檔 (.json)'),
        h('button', { onclick: () => {
          const list = S.combatants.map((c) => c.character);
          download(`${S.title || '戰場記錄'}-角色.json`, JSON.stringify({ schema: F.CHAR, list }, null, 2));
        } }, '只匯出所有角色 (.json)')),
      h('h4', {}, '匯入'),
      h('p', { class: 'muted small' }, '選擇場次存檔會取代目前的場次；角色檔（或 pokepast 文字）請用「＋ 新增參戰者」的「貼上隊伍／匯入檔案」。'),
      h('div', { class: 'row' }, file), msg,
      h('h4', {}, '開新場次'),
      h('div', { class: 'row' }, h('button', { class: 'danger', onclick: () => {
        if (!confirm('開新場次？目前的場次會被清空（可以用復原找回，但關掉分頁就沒了，建議先匯出）。')) return;
        const keep = { sides: S.sides, settings: S.settings };
        commit(() => { S = Object.assign(F.newSession(), keep); UI.sel = null; }, '開新場次'); m.close();
      } }, '開新場次（清空）'), h('small', { class: 'muted' }, '會保留側的名稱、顏色與規則設定。')));
    const m = modal('存檔', body);
  }

  // ───────── 分享給玩家 ─────────
  function openShare() {
    const SH = window.PKShare, st = SH.status;
    const body = h('div', {});
    const m = modal('分享給玩家（唯讀看板）', body, { onClose: refreshShareBtn });
    function draw() {
      const msg = h('div', { class: 'pkio-msg', role: 'status' });
      const say = (t, bad) => { msg.textContent = t; msg.className = 'pkio-msg' + (bad ? ' bad' : ''); };
      const intro = h('p', { class: 'muted small' }, '玩家用連結就能看到戰場、行動順序、各參戰者的狀態與行動次數，不需要登入，也不能修改。GM 備註、隱藏的參戰者、後備、不公開的條目都不會上傳；HP 依各側（或單隻）的設定顯示數字、血條或不顯示。只有你這台瀏覽器能更新看板。');
      if (!st.id) {
        body.replaceChildren(intro,
          location.protocol === 'file:' ? h('p', { class: 'warn small' }, '你現在是用檔案（file://）開啟的，玩家打不開本機檔案，所以連結會用正式網址（' + SH.HOSTED + '）。') : null,
          h('div', { class: 'row' }, h('button', { class: 'primary', onclick: async (ev) => {
            ev.target.disabled = true; say('建立中…');
            try { await SH.create(S); draw(); refreshShareBtn(); } catch (e) { ev.target.disabled = false; say(e.message, true); refreshShareBtn(); }
          } }, '建立玩家看板連結')), msg);
        return;
      }
      const link = SH.linkFor(st.id);
      const ta = h('input', { value: link, readonly: true, class: 'grow', onfocus: (e) => e.target.select() });
      const lastT = st.last ? `${pad2(st.last.getHours())}:${pad2(st.last.getMinutes())}:${pad2(st.last.getSeconds())}` : '尚未同步';
      body.replaceChildren(intro, h('div', { class: 'row' }, ta, h('button', { class: 'primary', onclick: () => copyText(link, (ok) => say(ok ? '已複製連結，貼給玩家吧。' : '無法複製，請手動選取。')) }, '複製連結'),
        h('a', { href: link, target: '_blank', rel: 'noopener' }, '開啟看看')),
        h('p', { class: 'small' }, '狀態：', st.error ? h('b', { class: 'dn' }, '同步失敗　' + st.error) : h('b', {}, '● 已連線，每次修改都會自動同步'), `（上次同步：${lastT}）`),
        h('div', { class: 'row' },
          h('button', { onclick: async () => { say('同步中…'); try { await SH.push(S); draw(); refreshShareBtn(); } catch (e) { say(e.message, true); refreshShareBtn(); } } }, '立即同步'),
          h('button', { class: 'danger', onclick: async () => {
            if (!confirm('停止分享並刪除連結？玩家之後就看不到了。（想再分享要重新建立，網址會不同）')) return;
            try { await SH.stop(); } catch (e) { if (confirm('刪除失敗：' + e.message + '\n要放棄這個連結、不再同步嗎？')) SH.forget(); else return; }
            draw(); refreshShareBtn();
          } }, '停止分享並刪除'),
          st.error ? h('button', { onclick: () => { if (confirm('放棄舊連結，重新建立一個新的？')) { SH.forget(); draw(); refreshShareBtn(); } } }, '放棄舊連結') : null), msg);
    }
    draw();
  }

  // ───────── 設定 ─────────
  function openSettings() {
    const body = h('div', {});
    modal('設定', body);
    function draw() {
      const st = S.settings;
      const sideRows = S.sides.map((sd) => {
        const main = BD.MAIN.includes(sd.id);
        const nm = h('input', { value: sd.name, 'aria-label': '名稱', onchange: (e) => { commit(() => { sd.name = e.target.value.trim() || sd.name; }, `側改名：${e.target.value.trim()}`); draw(); } });
        const col = h('input', { type: 'color', value: sd.color, 'aria-label': '顏色', onchange: (e) => { commit(() => { sd.color = e.target.value; }, `${sd.name} 換顏色`); draw(); } });
        const hp = h('select', { 'aria-label': '玩家看板 HP', onchange: (e) => commit(() => { sd.hp = e.target.value; }, `${sd.name} 玩家看板 HP 顯示方式`) }, [['exact', '數字'], ['bar', '只有血條'], ['hidden', '不顯示']].map(([v, t]) => h('option', { value: v, selected: sd.hp === v }, t)));
        const del = h('button', { class: 'clear danger2', disabled: main, title: main ? '戰場圖上的三個區域（綠、紅、白）不能刪除，可以改名改色' : '', onclick: () => {
          const mem = S.combatants.filter((c) => c.side === sd.id);
          if (!confirm(`刪除「${sd.name}」？` + (mem.length ? `裡面 ${mem.length} 位參戰者會移到「${S.sides.find((x) => x !== sd).name}」。` : ''))) return;
          commit(() => {
            const to = S.sides.find((x) => x !== sd).id;
            mem.forEach((c) => { c.side = to; });
            S.effects.forEach((e) => { if (e.scope === sd.id) e.scope = to; });
            S.sides = S.sides.filter((x) => x !== sd);
          }, `刪除側：${sd.name}`); draw();
        } }, '刪除');
        return h('div', { class: 'srow' }, col, nm, h('small', { class: 'muted' }, main ? { s1: '綠區', s2: '紅區', s3: '白區' }[sd.id] : '額外'), h('label', { class: 'small' }, '玩家看板 HP：', hp), del);
      });
      body.replaceChildren(
        h('h4', {}, '側（陣營）'),
        h('p', { class: 'muted small' }, '戰場圖有三個固定區域：綠（玩家方）、紅（敵方）、白（中立／全場），可以改名改色但不能刪。再新增的側會在戰場圖下面多一條，棋子拖進去就換成那一側。'),
        sideRows,
        h('div', { class: 'row' }, h('button', { onclick: () => { commit(() => { S.sides.push({ id: F.uid('s'), name: '新的一側', color: '#e3a33b', hp: 'bar' }); }, '新增一側'); draw(); } }, '＋ 新增一側')),
        h('h4', {}, '規則（影響最大 HP、防禦與特防的計算）'),
        h('label', { class: 'rad' }, h('input', { type: 'radio', name: 'dm', checked: st.defMode !== 2, onchange: () => { commit(() => { st.defMode = 1; }, '雙防：選項 1'); draw(); } }), ' 選項 1：防禦與特防都等於體魄'),
        h('label', { class: 'rad' }, h('input', { type: 'radio', name: 'dm', checked: st.defMode === 2, onchange: () => { commit(() => { st.defMode = 2; }, '雙防：選項 2'); draw(); } }), ' 選項 2：防禦＝體魄、特防＝洞察'),
        st.defMode === 2 ? h('label', { class: 'rad' }, h('input', { type: 'checkbox', checked: st.hpStat === 'ins', onchange: (e) => { commit(() => { st.hpStat = e.target.checked ? 'ins' : 'vit'; }, '最大 HP 計算方式'); draw(); } }), ' 最大 HP 改用洞察計算') : null,
        h('p', { class: 'muted small' }, '個別參戰者的最大 HP 可以在「✎ 編輯」裡覆寫。'));
    }
    draw();
  }

  // ───────── 說明 ─────────
  function openHelp() {
    const kb = (k, t) => h('div', { class: 'tk-kb' }, h('kbd', {}, k), h('span', {}, t));
    const body = h('div', { class: 'tk-help' },
      h('h4', {}, '三個步驟'),
      h('ol', {},
        h('li', {}, h('b', {}, '＋ 新增參戰者'), '：輸入物種快速加入野生寶可夢，或貼上玩家的 pokepast／角色 JSON。'),
        h('li', {}, h('b', {}, '拖棋子'), '：綠區＝玩家方、紅區＝敵方、白區＝中立。'),
        h('li', {}, h('b', {}, '跑回合'), '：在「名單・先攻」輸入先攻並排序，按底下 ▶ 開始；每位行動完按「✓ 行動了」，保留就按「✗ 保留」；大家都保留後按「⏭ 結束本輪」。')),
      h('h4', {}, '名詞'),
      h('dl', { class: 'tk-dl' },
        h('dt', {}, '輪'), h('dd', {}, '戰鬥輪。所有人都保留（或行動用完）就結束，結算灼傷、中毒、天氣傷害與倒數。'),
        h('dt', {}, '回合'), h('dd', {}, '輪到某一位行動的時候。一輪裡每個人可以行動很多次。'),
        h('dt', {}, '行動次數'), h('dd', {}, '本輪已經行動幾次（棋子下面的小圓點）。下個行動需要「次數＋1」個成功。'),
        h('dt', {}, '先攻'), h('dd', {}, '開打時擲的先攻成功數，決定行動順序。'),
        h('dt', {}, '先制'), h('dd', {}, '先制招式的等級，比先攻優先；結束本輪會歸零。')),
      h('h4', {}, '小技巧'),
      h('ul', {},
        h('li', {}, '點棋子的', h('b', {}, '血條'), '：快速加減 HP。HP 欄可以輸入 ', h('code', {}, '-3'), '、', h('code', {}, '+2'), ' 或直接輸入數字。'),
        h('li', {}, '把棋子', h('b', {}, '拖到另一個棋子上'), '：指定傷害目標，招式的傷害骰池會扣對方的防禦並顯示相剋。'),
        h('li', {}, '在戰場圖的空白處', h('b', {}, '雙擊'), '：在那裡新增條目；條目卡拖到棋子上就附在他身上。'),
        h('li', {}, '底下的「↶」會寫出最近一步，按錯了就按它。'),
        h('li', {}, '手機或想看清單時，切到「清單」。')),
      h('h4', {}, '快捷鍵（不在輸入框時）'),
      h('div', { class: 'tk-kbs' }, kb('N', '行動了，換下一位（還沒開始時＝開始）'), kb('H', '保留，換下一位'), kb('E', '結束本輪'), kb('Ctrl+Z', '復原'), kb('Ctrl+Y', '重做'), kb('Esc', '關閉彈窗'), kb('?', '這份說明')));
    modal('說明', body);
  }

  // ───────── 啟動 ─────────
  function boot() {
    const pref = lsGet(PREF_KEY, null);
    if (pref) Object.assign(UI, { view: pref.view || 'board', showPri: !!pref.showPri, lastSide: pref.lastSide || 's2', rank: pref.rank || '2' });
    else if (window.innerWidth < 700) UI.view = 'list';
    S = loadSaved();
    syncOrder();
    UI.sel = S.turn.combatant || null;
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('.pkio-back')) return; // 視窗開著時交給視窗處理
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
      const k = (e.key || '').toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (typing) return;
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); }
        return;
      }
      if (k === 'escape') { if (pop) closePop(); else if (UI.sheet) { UI.sheet = false; render(); } return; }
      if (typing || e.altKey) return;
      if (k === 'n') { e.preventDefault(); nextTurn(byId(S.turn.combatant) ? 'act' : 'start'); }
      else if (k === 'h') { if (byId(S.turn.combatant)) { e.preventDefault(); nextTurn('hold'); } }
      else if (k === 'e') { e.preventDefault(); openRoundEnd(); }
      else if (e.key === '?') { e.preventDefault(); openHelp(); }
    });
    window.addEventListener('resize', () => closePop());
    render();
    if (window.PKShare && window.PKShare.status.id) window.PKShare.schedule(() => S, refreshShareBtn); // 重新整理後把目前狀態再同步一次
  }
  window.PKT = { get state() { return S; }, ui: UI, render, commit, discordText, nextTurn, select };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
