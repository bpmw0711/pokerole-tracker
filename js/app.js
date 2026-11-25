// 戰場記錄板（GM 用）：畫面與操作。資料格式見 format.js、規則計算見 rules.js。
// 原則：像一張紙，任何欄位都能手動改；自動計算只是建議。
(function () {
  'use strict';
  const DB = window.PKDB, F = window.PKF, R = window.PKR;
  const SITE = 'https://bpmw0711.github.io/pokerole3.0-zh-TW/';
  const SPR = SITE + 'assets/spr/';
  const KEY = 'pkr-tracker-session/1';
  const MAX_ACTIONS = 5;
  let S = null, P = null;
  let undo = [], redo = [];
  const UI = { open: {}, tgt: {}, last: {}, log: false, bench: true };

  // ───────── 小工具 ─────────
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'selected') el.selected = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : String(k));
    return el;
  }
  const toastEl = () => document.getElementById('toast');
  function toast(msg) {
    const t = toastEl(); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
  }
  const byId = (id) => S.combatants.find((c) => c.id === id);
  const cname = (c) => c.character.name || F.charName(DB, c.character);
  const sideOf = (c) => S.sides.find((s) => s.id === c.side) || S.sides[0];
  const sprite = (c) => {
    const x = R.dex(c);
    if (!x) return h('span', { class: 'sprite ph' }, R.isTrainer(c) ? '🧑' : '？');
    return h('img', { class: 'sprite', src: SPR + x.img + '.png', alt: '', onerror: (e) => { e.target.style.visibility = 'hidden'; } });
  };
  const typeChip = (t) => h('span', { class: 'type', style: { background: DB.typeColor[t] || '#888', color: DB.typeInk[t] || '#fff' } }, t);
  const num = (v, d = 0) => { const n = parseInt(String(v).replace('−', '-'), 10); return Number.isFinite(n) ? n : d; };
  const signed = (n) => (n > 0 ? '+' + n : String(n));
  const pad2 = (n) => String(n).padStart(2, '0');
  const nowStr = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

  // ───────── 存檔、復原 ─────────
  function persist() {
    try { S.saved = new Date().toISOString(); localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 無痕模式或空間不足 */ }
    if (window.PKShare) window.PKShare.schedule(() => S, refreshShareBtn);
  }
  const shareLabel = () => {
    const st = window.PKShare && window.PKShare.status;
    return '分享給玩家' + (st && st.id ? (st.error ? ' ⚠' : ' ●') : '');
  };
  function refreshShareBtn() { const b = document.getElementById('sharebtn'); if (b) b.textContent = shareLabel(); }
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
  // 所有會改資料的操作都走這裡：先存一份復原點，改完同步順序、寫紀錄、存檔、重畫
  function commit(fn, log) {
    undo.push(JSON.stringify(S)); if (undo.length > 120) undo.shift();
    redo = [];
    fn();
    syncOrder();
    if (log) addLog(log);
    persist(); render();
  }
  function logOnly(text) { addLog(text); persist(); }
  function doUndo() { if (!undo.length) return toast('沒有可以復原的操作'); redo.push(JSON.stringify(S)); S = F.normalize(JSON.parse(undo.pop())); persist(); render(); }
  function doRedo() { if (!redo.length) return toast('沒有可以重做的操作'); undo.push(JSON.stringify(S)); S = F.normalize(JSON.parse(redo.pop())); persist(); render(); }

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
    const back = h('div', { class: 'pkio-back' });
    const box = h('div', { class: 'pkio' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'row sp' }, h('h3', {}, title), h('button', { class: 'clear', type: 'button', onclick: () => close() }, opts.closeText || '關閉')), body);
    back.append(box);
    if (!opts.sticky) back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    function onKey(e) { if (e.key === 'Escape' && !opts.sticky) close(); }
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
  function setHp(c, raw) {
    raw = String(raw).trim().replace('−', '-');
    let v;
    if (/^[+-]\d+$/.test(raw)) v = c.state.hp + parseInt(raw, 10);
    else if (/^\d+$/.test(raw)) v = parseInt(raw, 10);
    else return render();
    v = Math.max(0, v);
    const old = c.state.hp;
    if (v === old) return render();
    commit(() => {
      c.state.hp = v;
      if (v <= 0) c.state.fainted = true; else if (c.state.fainted) c.state.fainted = false;
    }, `${cname(c)} HP ${old} → ${v}${v <= 0 ? '，倒下' : ''}`);
  }
  function setWill(c, raw) {
    raw = String(raw).trim().replace('−', '-');
    let v;
    if (/^[+-]\d+$/.test(raw)) v = c.state.will + parseInt(raw, 10);
    else if (/^\d+$/.test(raw)) v = parseInt(raw, 10);
    else return render();
    v = Math.max(0, v);
    if (v === c.state.will) return render();
    commit(() => { c.state.will = v; }, `${cname(c)} 意志 ${c.state.will} → ${v}`);
  }
  const activeOrder = () => S.order.map(byId).filter((c) => c && !c.benched);

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
    commit(() => { const o = S.order; [o[i], o[j]] = [o[j], o[i]]; });
  }

  // 下一回合：目前這位如果標了 ✓ 就行動計數 +1，標記清掉，指標移到下一位（跳過倒下的）
  function nextTurn() {
    const ord = activeOrder();
    if (!ord.length) return toast('還沒有參戰者');
    commit(() => {
      const cur = byId(S.turn.combatant);
      let msg = '';
      if (cur && !cur.benched) {
        if (cur.state.turnMark === 'act') { cur.state.actionCount++; S.turn.passStreak = 0; msg = `${cname(cur)} 行動（第 ${cur.state.actionCount} 個行動）`; }
        else if (cur.state.turnMark === 'skip') { S.turn.passStreak = (S.turn.passStreak || 0) + 1; msg = `${cname(cur)} 保留`; }
        cur.state.turnMark = null;
      }
      const n = ord.length;
      const start = cur ? ord.indexOf(cur) : -1;
      let pick = null;
      for (let i = 1; i <= n; i++) {
        const cand = ord[(start + i + n) % n];
        if (!R.isDown(cand)) { pick = cand; break; }
      }
      S.turn.combatant = pick ? pick.id : null;
      if (msg) addLog(msg);
    });
  }
  function allHeld() {
    const live = activeOrder().filter((c) => !R.isDown(c));
    if (!live.length) return false;
    return (S.turn.passStreak || 0) >= live.length || live.every((c) => c.state.actionCount >= MAX_ACTIONS);
  }

  // ───────── 畫面 ─────────
  function render() {
    syncOrder();
    const app = document.getElementById('app');
    const y = window.scrollY;
    app.replaceChildren(header(), fieldPanel(), controlPanel(), orderPanel(), benchPanel(), logPanel());
    window.scrollTo(0, y);
  }

  function header() {
    const title = h('input', { class: 'ttl', value: S.title, placeholder: '場次名稱（例如：雨中草原遭遇戰）', 'aria-label': '場次名稱',
      onchange: (e) => { S.title = e.target.value.trim(); persist(); } });
    return h('div', { class: 'panel head' },
      h('div', { class: 'hero' }, h('span', { class: 'pball' }),
        h('div', { class: 'grow' }, h('h1', {}, '戰場記錄板'), h('small', {}, 'GM 專用・Pokerole 3.0・像一張紙，所有欄位都能手動改'))),
      h('div', { class: 'toolbar' }, title,
        h('button', { class: 'primary', type: 'button', onclick: openAdd }, '＋ 新增參戰者'),
        h('button', { type: 'button', onclick: doUndo, disabled: !undo.length }, '↶ 復原'),
        h('button', { type: 'button', onclick: doRedo, disabled: !redo.length }, '↷ 重做'),
        h('button', { type: 'button', onclick: openDiscord }, '複製 Discord 文字'),
        h('button', { id: 'sharebtn', type: 'button', onclick: openShare }, shareLabel()),
        h('button', { type: 'button', onclick: openIO }, '匯入／匯出'),
        h('button', { type: 'button', onclick: openSettings }, '設定')));
  }

  // 條目（天氣、場地、力場、危害、掩護、自訂事件）
  function effChip(e) {
    const expired = e.rounds === 0;
    return h('span', { class: 'chip eff' + (expired ? ' expired' : ''), title: e.note || '' },
      h('b', { onclick: () => openEffect(e), role: 'button', tabindex: '0' }, e.name || '（未命名）'),
      e.rounds != null ? h('small', {}, expired ? '到期' : `剩 ${e.rounds} 輪`) : null,
      e.rounds != null ? h('button', { class: 'mini', type: 'button', 'aria-label': '減少一輪', onclick: () => commit(() => { e.rounds = Math.max(0, e.rounds - 1); }) }, '−') : null,
      e.rounds != null ? h('button', { class: 'mini', type: 'button', 'aria-label': '增加一輪', onclick: () => commit(() => { e.rounds++; }) }, '+') : null,
      h('button', { class: 'mini x', type: 'button', 'aria-label': '移除', onclick: () => commit(() => { S.effects = S.effects.filter((x) => x !== e); }, `移除條目：${e.name}`) }, '×'));
  }
  const effectsOf = (scope) => S.effects.filter((e) => e.scope === scope);
  function effBlock(scope, label) {
    const list = effectsOf(scope);
    return h('div', { class: 'effs' }, label ? h('span', { class: 'lab' }, label) : null,
      list.map(effChip), h('button', { class: 'mini add', type: 'button', onclick: () => openEffect(null, scope) }, '＋ 條目'));
  }
  // ───────── 戰場圖 ─────────
  const r1 = (n) => Math.round(n * 10) / 10;
  function boardModel() {
    const tokens = activeOrder().map((c) => {
      const x = R.dex(c);
      return {
        id: c.id, name: cname(c), img: x ? x.img : null, trainer: R.isTrainer(c), side: c.side, pos: c.pos || null,
        hp: { pct: Math.min(100, Math.round(Math.max(0, c.state.hp) / Math.max(1, R.maxHp(c, S.settings)) * 100)) },
        down: R.isDown(c), current: S.turn.combatant === c.id, hidden: !!c.hidden,
        status: c.state.status.map((s) => s.kind), attached: effectsOf(c.id).map((e) => ({ id: e.id, name: e.name, rounds: e.rounds })),
      };
    });
    return { location: S.field.location, sides: S.sides, tokens, effects: S.effects, suggest: SUGGEST, sprBase: SPR };
  }
  const scopeName = (scope) => (scope === 'field' ? '全場' : (S.sides.find((s) => s.id === scope) || {}).name || (byId(scope) ? '附在 ' + cname(byId(scope)) : scope));
  function boardOpts() {
    const eff = (id) => S.effects.find((e) => e.id === id);
    return {
      editable: true,
      onTokenMove: (id, d) => {
        const c = byId(id), sd = S.sides.find((s) => s.id === d.side);
        if (!c || !sd) return;
        const changed = c.side !== d.side;
        commit(() => { c.side = d.side; if (d.pos) c.pos = { x: r1(d.pos.x), y: r1(d.pos.y) }; else delete c.pos; }, changed ? `${cname(c)} 移到「${sd.name}」` : null);
      },
      onTokenClick: (id) => {
        UI.open[id] = true; render();
        const el = document.querySelector(`[data-cid="${id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
      onSlot: (sl, patch) => {
        const find = () => S.effects.find((x) => !x.card && x.kind === sl.kind && x.scope === sl.scope);
        let msg = null;
        if (patch.name !== undefined) msg = patch.name ? `${sl.label}（${scopeName(sl.scope)}）：${patch.name}` : `${sl.label}（${scopeName(sl.scope)}）解除`;
        commit(() => {
          const e = find();
          if (patch.name !== undefined) {
            if (patch.name === '') { if (e) S.effects = S.effects.filter((x) => x !== e); }
            else if (e) e.name = patch.name;
            else S.effects.push({ id: F.uid('e'), kind: sl.kind, name: patch.name, scope: sl.scope, rounds: null, note: '' });
          }
          if (patch.rounds !== undefined && e) e.rounds = patch.rounds;
        }, msg);
      },
      onCardMove: (id, d) => {
        const e = eff(id); if (!e) return;
        commit(() => { e.scope = d.scope; e.card = true; if (d.pos) e.pos = { x: r1(d.pos.x), y: r1(d.pos.y) }; else delete e.pos; }, `條目「${e.name}」→ ${scopeName(d.scope)}`);
      },
      onCardClick: (id) => { const e = eff(id); if (e) openEffect(e); },
      onCardRounds: (id, dl) => { const e = eff(id); if (e) commit(() => { e.rounds = Math.max(0, (e.rounds || 0) + dl); }); },
      onCardRemove: (id) => { const e = eff(id); if (e) commit(() => { S.effects = S.effects.filter((x) => x !== e); }, `移除條目：${e.name}`); },
    };
  }
  function fieldPanel() {
    return h('div', { class: 'panel' }, h('h2', { class: 'ptitle' }, '戰場'),
      h('div', { class: 'row' }, h('label', { class: 'grow row' }, '地點 ', h('input', { class: 'grow', value: S.field.location, placeholder: '例如：常磐森林外的草原',
        onchange: (e) => commit(() => { S.field.location = e.target.value; }) })),
        h('button', { class: 'primary', type: 'button', onclick: () => openEffect(null, 'field') }, '＋ 新增條目')),
      window.PKBoard.render(boardModel(), boardOpts()));
  }

  function controlPanel() {
    const cur = byId(S.turn.combatant);
    const held = allHeld();
    return h('div', { class: 'panel ctl' + (held ? ' held' : '') },
      h('div', { class: 'ctlrow' },
        h('div', { class: 'round' }, '第 ', h('input', { type: 'number', min: '1', value: S.round, 'aria-label': '戰鬥輪', onchange: (e) => commit(() => { S.round = Math.max(1, num(e.target.value, 1)); }) }), ' 輪'),
        h('div', { class: 'cur' }, cur ? ['目前輪到：', h('b', {}, cname(cur))] : '還沒有指定誰先行動'),
        h('div', { class: 'grow' }),
        h('button', { class: 'big primary', type: 'button', onclick: nextTurn }, '下一回合 ▶'),
        h('button', { class: 'big' + (held ? ' danger' : ''), type: 'button', onclick: openRoundEnd }, '下一輪 ⏭')),
      h('div', { class: 'row small muted' },
        held ? h('b', { class: 'hint' }, '所有人都保留了（或行動用完），可以進下一輪。') : '回合：標 ✓ 代表這回合有行動，按「下一回合」會把他的行動計數 +1 並移到下一位。',
        h('span', { class: 'grow' }), h('button', { class: 'clear', type: 'button', onclick: sortByInit }, '依先攻排序'),
        h('button', { class: 'clear', type: 'button', onclick: () => commit(() => { S.turn.combatant = null; S.turn.passStreak = 0; activeOrder().forEach((c) => { c.state.turnMark = null; }); }) }, '清除目前輪到')));
  }

  function statusText(st) {
    let t = F.STATUS_ZH[st.kind] || st.kind;
    if (st.kind === 'custom') t = st.note || '自訂狀態';
    if (st.kind === 'burn') t += ` ${st.level || 1} 級`;
    if (st.rounds != null && st.rounds !== '') t += `（${st.rounds === 0 ? '到期' : '剩 ' + st.rounds + ' 輪'}）`;
    return t;
  }
  function hpBar(c, mode) {
    const max = Math.max(1, R.maxHp(c, S.settings)), hp = Math.max(0, c.state.hp);
    const p = Math.min(100, Math.round(hp / max * 100));
    return h('div', { class: 'bar' + (mode ? ' ' + mode : ''), title: `${hp}/${max}` }, h('i', { style: { width: p + '%', background: p > 50 ? 'var(--hp-hi)' : p > 25 ? 'var(--hp-mid)' : 'var(--hp-lo)' } }));
  }

  function orderPanel() {
    const list = activeOrder();
    const p = h('div', { class: 'panel' }, h('h2', { class: 'ptitle' }, '先攻順序', h('small', {}, `${list.length} 位參戰者`)));
    if (!list.length) { p.append(h('p', { class: 'muted empty' }, '還沒有參戰者。按上方「＋ 新增參戰者」，可以產生寶可夢、貼上文字匯入、或手動新增，隨時都能加。')); return p; }
    p.append(h('div', { class: 'ohead' }, h('span', {}, ''), h('span', {}, '先攻／先制'), h('span', {}, '參戰者'), h('span', {}, 'HP／意志'), h('span', {}, '狀態'), h('span', {}, '行動計數'), h('span', {}, '回合')));
    list.forEach((c, i) => p.append(row(c, i, list.length)));
    return p;
  }

  function row(c, i, n) {
    const sd = sideOf(c), cur = S.turn.combatant === c.id, down = R.isDown(c);
    const max = R.maxHp(c, S.settings), maxW = R.maxWill(c);
    const mods = F.STAT_KEYS.filter((k) => (c.state.mods[k] || 0) !== 0);
    const boxes = [];
    for (let k = 0; k < MAX_ACTIONS; k++) {
      boxes.push(h('button', { class: 'abox' + (k < c.state.actionCount ? ' on' : ''), type: 'button', 'aria-label': `行動 ${k + 1}`,
        onclick: () => commit(() => { c.state.actionCount = c.state.actionCount === k + 1 ? k : k + 1; }) }, k + 1));
    }
    const pain = R.pain(c, S.settings);
    const who = h('div', { class: 'who' },
      h('button', { class: 'ptr' + (cur ? ' on' : ''), type: 'button', title: '指定輪到他', 'aria-label': '指定輪到他', onclick: () => commit(() => { S.turn.combatant = c.id; }) }, cur ? '▶' : '▷'),
      sprite(c),
      h('div', { class: 'wn' },
        h('b', { class: 'nm', role: 'button', tabindex: '0', onclick: () => { UI.open[c.id] = !UI.open[c.id]; render(); } }, cname(c)),
        h('small', {}, h('span', { class: 'sdot', style: { background: sd.color } }), sd.name, c.owner ? '・' + c.owner : '', R.isTrainer(c) ? '・訓練家' : ''),
        h('span', { class: 'tys' }, R.types(c).map(typeChip))));
    const el = h('div', { class: 'orow' + (cur ? ' cur' : '') + (down ? ' down' : '') + (c.hidden ? ' hid' : ''), style: { borderLeftColor: sd.color } },
      h('div', { class: 'reorder' }, h('button', { class: 'mini', type: 'button', disabled: i === 0, 'aria-label': '上移', onclick: () => move(c, -1) }, '▲'),
        h('button', { class: 'mini', type: 'button', disabled: i === n - 1, 'aria-label': '下移', onclick: () => move(c, 1) }, '▼')),
      h('div', { class: 'init' },
        h('label', {}, '先攻', h('input', { type: 'number', value: c.state.init.roll == null ? '' : c.state.init.roll, onchange: (e) => commit(() => { c.state.init.roll = e.target.value === '' ? null : num(e.target.value); }) })),
        h('label', {}, '先制', h('input', { type: 'number', value: c.state.init.priority || 0, onchange: (e) => commit(() => { c.state.init.priority = num(e.target.value); }) }))),
      who,
      h('div', { class: 'hpc' }, hpBar(c),
        h('div', { class: 'hpn' },
          h('button', { class: 'mini', type: 'button', onclick: () => setHp(c, '-1'), 'aria-label': 'HP 減 1' }, '−'),
          h('input', { class: 'hpi', value: c.state.hp, 'aria-label': 'HP（可輸入 +3 或 -3 增減）', onchange: (e) => setHp(c, e.target.value) }),
          h('span', {}, '/ ' + max),
          h('button', { class: 'mini', type: 'button', onclick: () => setHp(c, '+1'), 'aria-label': 'HP 加 1' }, '+')),
        h('div', { class: 'hpn will' }, '意志',
          h('input', { class: 'hpi', value: c.state.will, 'aria-label': '意志點', onchange: (e) => setWill(c, e.target.value) }), h('span', {}, '/ ' + maxW)),
        pain && !down ? h('small', { class: 'warn' }, `疼痛 −${pain} 成功`) : null,
        down ? h('small', { class: 'dead' }, '倒下') : null),
      h('div', { class: 'stc' }, c.state.status.map((st) => h('span', { class: 'chip st-' + st.kind }, statusText(st))),
        mods.map((k) => h('span', { class: 'chip mod ' + (c.state.mods[k] > 0 ? 'up' : 'dn') }, F.ATTR_ZH[k] + signed(c.state.mods[k]))),
        effectsOf(c.id).map((e) => h('span', { class: 'chip eff' + (e.rounds === 0 ? ' expired' : '') }, e.name + (e.rounds != null ? (e.rounds === 0 ? '（到期）' : `（${e.rounds}）`) : '')))),
      h('div', { class: 'acts' }, h('div', { class: 'aboxes' }, boxes, c.state.actionCount > MAX_ACTIONS ? h('small', {}, '+' + (c.state.actionCount - MAX_ACTIONS)) : null),
        h('small', { class: 'muted' }, `下個行動需 ${c.state.actionCount + 1} 成功`)),
      h('div', { class: 'tm' },
        h('button', { class: 'mark ok' + (c.state.turnMark === 'act' ? ' on' : ''), type: 'button', title: '這回合有行動', onclick: () => commit(() => { c.state.turnMark = c.state.turnMark === 'act' ? null : 'act'; }) }, '✓'),
        h('button', { class: 'mark no' + (c.state.turnMark === 'skip' ? ' on' : ''), type: 'button', title: '這回合沒有行動（保留）', onclick: () => commit(() => { c.state.turnMark = c.state.turnMark === 'skip' ? null : 'skip'; }) }, '✗'),
        h('button', { class: 'mini', type: 'button', onclick: () => { UI.open[c.id] = !UI.open[c.id]; render(); } }, UI.open[c.id] ? '收合 ▴' : '展開 ▾')));
    const wrap = h('div', { class: 'owrap', 'data-cid': c.id }, el);
    if (UI.open[c.id]) wrap.append(details(c));
    return wrap;
  }

  // ───────── 展開的詳細資料 ─────────
  function details(c) {
    const box = h('div', { class: 'det' });
    box.append(h('div', { class: 'dcols' }, statusBlock(c), modsBlock(c), notesBlock(c)));
    box.append(movesBlock(c));
    box.append(actionsBlock(c));
    return box;
  }

  function statusBlock(c) {
    const kinds = Object.keys(F.STATUS_ZH);
    const sel = h('select', { 'aria-label': '新增異常狀態' }, kinds.map((k) => h('option', { value: k }, F.STATUS_ZH[k])));
    const lv = h('input', { type: 'number', min: '1', max: '3', value: '1', title: '灼傷等級', 'aria-label': '等級' });
    const rd = h('input', { type: 'number', min: '0', placeholder: '輪數', title: '持續輪數（可空白）', 'aria-label': '持續輪數' });
    const nt = h('input', { placeholder: '名稱／備註', 'aria-label': '名稱或備註' });
    const list = c.state.status.map((st, i) => h('div', { class: 'strow' },
      h('b', {}, statusText(st)),
      st.kind === 'burn' ? h('label', {}, '等級', h('input', { type: 'number', min: '1', max: '3', value: st.level || 1, onchange: (e) => commit(() => { st.level = num(e.target.value, 1); }) })) : null,
      h('label', {}, '剩', h('input', { type: 'number', min: '0', value: st.rounds == null ? '' : st.rounds, placeholder: '—', onchange: (e) => commit(() => { st.rounds = e.target.value === '' ? null : num(e.target.value); }) }), '輪'),
      h('label', {}, '已結算', h('input', { type: 'number', min: '0', value: st.n || 0, title: '戰鬥輪結束已結算幾次（劇毒、三級灼傷遞增用）', onchange: (e) => commit(() => { st.n = num(e.target.value); }) })),
      h('input', { class: 'sn', value: st.note || '', placeholder: '備註', onchange: (e) => commit(() => { st.note = e.target.value; }) }),
      h('button', { class: 'mini x', type: 'button', onclick: () => commit(() => { c.state.status.splice(i, 1); }, `${cname(c)} 解除${statusText(st)}`) }, '×')));
    return h('div', { class: 'dblock' }, h('h4', {}, '異常狀態'), list.length ? list : h('p', { class: 'muted small' }, '（沒有）'),
      h('div', { class: 'row add' }, sel, lv, rd, nt, h('button', { type: 'button', class: 'clear', onclick: () => commit(() => {
        const kind = sel.value;
        const st = { kind, level: kind === 'burn' ? num(lv.value, 1) : undefined, rounds: rd.value === '' ? null : num(rd.value), n: 0, note: nt.value.trim() };
        c.state.status.push(st);
      }, `${cname(c)} 陷入${F.STATUS_ZH[sel.value]}`) }, '加入')));
  }

  function modsBlock(c) {
    const grid = h('div', { class: 'modgrid' }, F.STAT_KEYS.map((k) => {
      const m = c.state.mods[k] || 0;
      const cur = R.stat(c, k, S.settings);
      return h('div', { class: 'mg' }, h('span', {}, F.ATTR_ZH[k]),
        h('button', { class: 'mini', type: 'button', onclick: () => commit(() => { c.state.mods[k] = m - 1; }, `${cname(c)} ${F.ATTR_ZH[k]} ${signed(m - 1)}`) }, '−'),
        h('b', { class: m > 0 ? 'up' : m < 0 ? 'dn' : '' }, m ? signed(m) : '0'),
        h('button', { class: 'mini', type: 'button', onclick: () => commit(() => { c.state.mods[k] = m + 1; }, `${cname(c)} ${F.ATTR_ZH[k]} ${signed(m + 1)}`) }, '+'),
        h('small', { class: 'muted' }, `＝ ${cur}`));
    }));
    return h('div', { class: 'dblock' }, h('h4', {}, '能力升降'), grid,
      h('p', { class: 'muted small' }, '＝ 後面是現在的能力值（含麻痺與大師級加成）。防禦與特防的原值依設定的雙防算法。'));
  }

  function notesBlock(c) {
    const ch = c.character;
    const info = [];
    if (!R.isTrainer(c)) {
      const ab = DB.abilities[ch.ability || ''];
      info.push(h('div', { class: 'ab' }, h('b', {}, '特性：'), ab ? `${ab.z || ch.ability}　` : (ch.ability || '—') + '　', h('small', { class: 'muted' }, ab ? ab.e : '')));
      if (ch.item) info.push(h('div', {}, h('b', {}, '持有物：'), ch.item));
      info.push(h('div', {}, h('b', {}, '階級：'), DB.rankZh[ch.rank] || ch.rank));
    } else {
      info.push(h('div', {}, h('b', {}, '階級：'), DB.rankZh[ch.rank] || ch.rank, '　', ch.concept ? '概念：' + ch.concept : ''));
      const sk = Object.keys(ch.skills || {}).filter((k) => ch.skills[k]).map((k) => `${F.SK_ZH[k] || k} ${ch.skills[k]}`);
      info.push(h('div', {}, h('b', {}, '能力：'), F.ATTR.filter((k) => k !== 'spe').map((k) => `${F.ATTR_ZH[k]} ${(ch.attr || {})[k] || 0}`).join('　')));
      if (sk.length) info.push(h('div', {}, h('b', {}, '技能：'), sk.join('　')));
    }
    return h('div', { class: 'dblock' }, h('h4', {}, '資料與備註'), info,
      h('label', { class: 'blk' }, 'GM 備註（玩家看不到）', h('textarea', { rows: '3', value: c.gmNote || '', onchange: (e) => { c.gmNote = e.target.value; persist(); } })),
      effBlock(c.id, '附在他身上的條目'));
  }

  function movesBlock(c) {
    const settings = S.settings;
    const target = byId(UI.tgt[c.id]);
    const others = S.combatants.filter((x) => x !== c && !x.benched);
    const sel = h('select', { 'aria-label': '傷害計算的目標', onchange: (e) => { UI.tgt[c.id] = e.target.value; render(); } },
      h('option', { value: '' }, '（不指定目標，不扣防禦）'),
      others.map((x) => h('option', { value: x.id, selected: x.id === UI.tgt[c.id] }, `${cname(x)}（${sideOf(x).name}）`)));
    const keys = [...(c.character.moves || [])];
    for (const k of ['Evasion', 'Clash']) if (DB.moves[k] && !keys.includes(k)) keys.push(k);
    const pain = R.pain(c, settings);
    const rows = keys.map((k) => moveRow(c, k, target, settings, pain)).filter(Boolean);
    return h('div', { class: 'dblock mvblock' }, h('div', { class: 'row sp' }, h('h4', {}, '招式與骰池'), h('label', { class: 'small' }, '傷害目標：', sel)),
      pain ? h('p', { class: 'warn small' }, `疼痛懲罰：命中、傷害的成功數各 −${pain}（骰池不變，擲完再扣）。`) : null,
      rows.length ? rows : h('p', { class: 'muted small' }, '（沒有招式）'),
      h('p', { class: 'muted small' }, '骰池只是算給你看的建議，天氣、特性、道具、特殊效果請自己加減；🎲 是方便擲骰，結果也會寫進紀錄。'));
  }
  function moveRow(c, key, target, settings, pain) {
    const info = R.moveInfo(key);
    if (!info) return null;
    const used = c.state.usedMoves.includes(key);
    const hit = R.hitPool(c, info, settings);
    const dmg = R.dmgPool(c, info, target, settings);
    const tagChips = info.tags.map((t) => h('span', { class: 'tag2' + (/反應|先制/.test(t) ? ' react' : '') }, t));
    const rollBtn = (label, n) => h('button', { class: 'mini dice', type: 'button', title: `擲 ${n} 顆骰`, onclick: () => rollFor(c, `${info.zh} ${label}`, n) }, '🎲');
    const last = (label) => UI.last[c.id + '|' + info.zh + ' ' + label];
    const line1 = h('div', { class: 'm1' },
      h('label', { class: 'usedlab', title: '本輪已使用（每個招式每輪只能用一次）' }, h('input', { type: 'checkbox', checked: used, onchange: (e) => commit(() => {
        const u = c.state.usedMoves; const i = u.indexOf(key);
        if (e.target.checked && i < 0) u.push(key); else if (!e.target.checked && i >= 0) u.splice(i, 1);
      }) }), '已用'),
      h('a', { href: SITE + 'data/moves.html?n=' + encodeURIComponent(key), target: '_blank', rel: 'noopener', class: 'mname' }, info.zh),
      info.type ? typeChip(info.type) : null,
      h('span', { class: 'cat' }, { phys: '物理', spec: '特殊', status: '變化' }[info.cat] + (info.power && info.power !== '-' && info.power !== '—' ? ` 威力 ${info.power}` : '')),
      tagChips);
    const parts = [line1];
    if (hit) {
      const maneuver = info.key === 'Evasion' || info.key === 'Clash';
      parts.push(h('div', { class: 'm2' }, h('span', { class: 'lb' }, maneuver ? '骰池' : '命中'), `${hit.text} ＝ `, h('b', {}, hit.size + ' 骰'),
        info.reaction || info.key === 'Evasion' || info.key === 'Clash' ? h('small', { class: 'muted' }, '（反應，不受多重行動難度影響）') : h('small', { class: 'muted' }, `（需 ${hit.need} 成功${info.lowAcc ? `，低命中再 −${info.lowAcc}` : ''}）`),
        rollBtn('命中', hit.size), last('命中') ? h('span', { class: 'rr' }, last('命中')) : null));
    } else if (info.accText && info.accText !== '-' && info.accText !== '—') {
      parts.push(h('div', { class: 'm2' }, h('span', { class: 'lb' }, '命中'), info.accText, h('small', { class: 'muted' }, '（無法自動計算）')));
    }
    if (dmg && dmg.manual) {
      parts.push(h('div', { class: 'm2' }, h('span', { class: 'lb' }, '傷害'), info.dmgText, h('small', { class: 'muted' }, '（請手動算）')));
    } else if (dmg) {
      parts.push(h('div', { class: 'm2' }, h('span', { class: 'lb' }, '傷害'), `${dmg.text} ＝ `, h('b', {}, dmg.size + ' 骰'),
        dmg.matchup ? h('span', { class: 'mu' + (dmg.matchup.delta == null ? ' imm' : dmg.matchup.delta > 0 ? ' up' : dmg.matchup.delta < 0 ? ' dn' : '') }, dmg.matchup.label) : null,
        rollBtn('傷害', dmg.size), last('傷害') ? h('span', { class: 'rr' }, last('傷害')) : null));
    }
    if (info.text) parts.push(h('details', { class: 'eff-t' }, h('summary', {}, '效果'), h('p', {}, info.text)));
    return h('div', { class: 'mvrow' + (used ? ' used' : '') }, parts);
  }

  function actionsBlock(c) {
    const btns = [];
    btns.push(h('button', { class: 'clear', type: 'button', onclick: () => openEdit(c) }, '編輯資料'));
    btns.push(h('button', { class: 'clear', type: 'button', onclick: () => commit(() => { c.state.fainted = !c.state.fainted; }, `${cname(c)} ${c.state.fainted ? '起身' : '倒下'}`) }, R.isDown(c) ? '標為起身' : '標為倒下'));
    btns.push(h('button', { class: 'clear', type: 'button', onclick: () => commit(() => { c.benched = true; if (S.turn.combatant === c.id) S.turn.combatant = null; }, `${cname(c)} 收回／離場`) }, '收回（移到後備）'));
    btns.push(h('label', { class: 'small hid' }, h('input', { type: 'checkbox', checked: c.hidden, onchange: (e) => commit(() => { c.hidden = e.target.checked; }) }), '隱藏（玩家看板不顯示）'));
    btns.push(h('label', { class: 'small' }, '玩家看板的 HP：', h('select', { onchange: (e) => commit(() => { if (e.target.value) c.hpMode = e.target.value; else delete c.hpMode; }) },
      [['', `跟著「${sideOf(c).name}」`], ['exact', '數字'], ['bar', '只有血條'], ['hidden', '不顯示']].map(([v, t]) => h('option', { value: v, selected: (c.hpMode || '') === v }, t)))));
    btns.push(h('button', { class: 'clear', type: 'button', onclick: () => commit(() => {
      const copy = F.clone(c); copy.id = F.uid('c'); copy.character.name = uniqueName(cname(c)); S.combatants.push(copy);
    }, `複製 ${cname(c)}`) }, '複製一隻'));
    btns.push(h('button', { class: 'clear', type: 'button', onclick: () => download(`${cname(c)}.json`, JSON.stringify(c.character, null, 2)) }, '匯出角色 JSON'));
    if (!R.isTrainer(c)) btns.push(h('button', { class: 'clear', type: 'button', onclick: () => {
      const sh = F.charToSheet(DB, core(), c.character); if (!sh) return toast('找不到這隻的物種');
      copyText(core().toPaste(sh), (ok) => toast(ok ? '已複製 pokepast 文字' : '無法複製')); } }, '複製 pokepast 文字'));
    btns.push(h('button', { class: 'clear danger2', type: 'button', onclick: () => {
      if (!confirm(`刪除「${cname(c)}」？（可以用復原找回）`)) return;
      commit(() => { S.combatants = S.combatants.filter((x) => x !== c); S.effects = S.effects.filter((e) => e.scope !== c.id); }, `刪除參戰者：${cname(c)}`); } }, '刪除'));
    return h('div', { class: 'dblock acts2 row' }, btns);
  }

  function benchPanel() {
    const list = S.combatants.filter((c) => c.benched);
    if (!list.length) return h('div', {});
    const p = h('div', { class: 'panel' }, h('h2', { class: 'ptitle' }, '後備／已離場', h('small', {}, `${list.length} 位`)));
    list.forEach((c) => {
      p.append(h('div', { class: 'brow' }, sprite(c), h('b', {}, cname(c)), h('small', { class: 'muted' }, `${sideOf(c).name}${R.isDown(c) ? '・倒下' : ` ・HP ${c.state.hp}/${R.maxHp(c, S.settings)}`}`),
        h('span', { class: 'grow' }),
        h('button', { class: 'clear', type: 'button', onclick: () => commit(() => { c.benched = false; }, `${cname(c)} 上場`) }, '上場'),
        h('button', { class: 'clear', type: 'button', onclick: () => openEdit(c) }, '編輯'),
        h('button', { class: 'clear danger2', type: 'button', onclick: () => { if (!confirm(`刪除「${cname(c)}」？`)) return; commit(() => { S.combatants = S.combatants.filter((x) => x !== c); S.effects = S.effects.filter((e) => e.scope !== c.id); }, `刪除參戰者：${cname(c)}`); } }, '刪除')));
    });
    return p;
  }

  function logPanel() {
    const open = UI.log;
    const p = h('div', { class: 'panel' }, h('h2', { class: 'ptitle clickable', onclick: () => { UI.log = !UI.log; render(); } }, '紀錄', h('small', {}, `${S.log.length} 筆　${open ? '（點擊收合）' : '（點擊展開）'}`)));
    if (!open) return p;
    const note = h('input', { class: 'grow', placeholder: '手動記一筆（例如：訓練家小明踏入戰場、無極汰那出現）' });
    const add = () => { const t = note.value.trim(); if (!t) return; note.value = ''; logOnly('【備註】' + t); render(); };
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    p.append(h('div', { class: 'row' }, note, h('button', { type: 'button', onclick: add }, '記下'),
      h('button', { class: 'clear', type: 'button', onclick: () => { if (confirm('清空所有紀錄？')) { S.log = []; persist(); render(); } } }, '清空')));
    const box = h('div', { class: 'logbox' });
    for (const e of [...S.log].reverse()) box.append(h('div', { class: 'le' }, h('small', { class: 'muted' }, `第 ${e.round} 輪 ${e.t || ''}`), ' ', e.text));
    p.append(box);
    return p;
  }

  // ───────── 條目編輯 ─────────
  const SUGGEST = {
    weather: ['大晴天', '下雨', '沙暴', '下雪', '冰雹', '大日照', '暴風雨', '亂流'],
    terrain: ['電氣場地', '青草場地', '薄霧場地', '精神場地', '戲法空間', '重力'],
    forceField: ['光牆', '反射壁', '極光幕', '神秘守護', '白霧', '順風'],
    hazard: ['撒菱', '隱形岩', '毒菱', '黏黏網'],
    cover: ['半身掩護', '全掩護'],
    other: [],
  };
  function openEffect(e, scope) {
    const isNew = !e;
    const d = e || { id: F.uid('e'), kind: 'other', name: '', scope: scope || 'field', rounds: null, note: '', card: true };
    const kind = h('select', {}, Object.keys(F.EFFECT_KIND_ZH).map((k) => h('option', { value: k, selected: k === d.kind }, F.EFFECT_KIND_ZH[k])));
    const dl = h('datalist', { id: 'effsug' });
    const fillDl = () => { dl.replaceChildren(...(SUGGEST[kind.value] || []).map((s) => h('option', { value: s }))); };
    kind.addEventListener('change', fillDl); fillDl();
    const name = h('input', { value: d.name, list: 'effsug', placeholder: '名稱（例如：下雨、撒菱、火山 5 輪後爆發）' });
    const rounds = h('input', { type: 'number', min: '0', value: d.rounds == null ? '' : d.rounds, placeholder: '不倒數請留空' });
    const note = h('input', { value: d.note || '', placeholder: '備註（可空白）' });
    const secret = h('input', { type: 'checkbox', checked: !!d.hidden });
    const scopeSel = h('select', {}, h('option', { value: 'field', selected: d.scope === 'field' }, '全場'),
      S.sides.map((sd) => h('option', { value: sd.id, selected: d.scope === sd.id }, `${sd.name}那一側`)),
      S.combatants.map((c) => h('option', { value: c.id, selected: d.scope === c.id }, `附在 ${cname(c)} 身上`)));
    const body = h('div', { class: 'form' },
      h('label', {}, '種類', kind), h('label', {}, '名稱', name, dl), h('label', {}, '剩餘輪數', rounds), h('label', {}, '作用範圍', scopeSel), h('label', {}, '備註', note),
      h('label', { class: 'rad' }, secret, ' 不對玩家公開（玩家看板不會顯示這個條目，例如還沒觸發的事件）'),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', onclick: () => {
        if (!name.value.trim()) return toast('請填名稱');
        commit(() => {
          Object.assign(d, { kind: kind.value, name: name.value.trim(), rounds: rounds.value === '' ? null : Math.max(0, num(rounds.value)), scope: scopeSel.value, note: note.value.trim() });
          if (secret.checked) d.hidden = true; else delete d.hidden;
          if (isNew) S.effects.push(d);
        }, `${isNew ? '新增' : '修改'}條目：${d.name}${d.rounds != null ? `（${d.rounds} 輪）` : ''}`);
        m.close();
      } }, isNew ? '新增' : '儲存'), h('button', { type: 'button', onclick: () => m.close() }, '取消')));
    const m = modal(isNew ? '新增條目' : '編輯條目', body);
    name.focus();
  }

  // ───────── 新增參戰者 ─────────
  function openAdd() {
    const state = { tab: 'gen', side: S.sides[0].id, owner: '' };
    const body = h('div', {});
    const m = modal('新增參戰者', body, { wide: true });
    const head = () => {
      const sideSel = h('select', { 'aria-label': '陣營（側）', onchange: (e) => { state.side = e.target.value; } }, S.sides.map((sd) => h('option', { value: sd.id, selected: sd.id === state.side }, sd.name)));
      const owner = h('input', { value: state.owner, placeholder: '玩家名（可空白）', 'aria-label': '玩家名', onchange: (e) => { state.owner = e.target.value; } });
      const tabs = [['gen', '產生寶可夢'], ['paste', '貼上文字／匯入檔案'], ['manual', '手動新增']];
      return h('div', {}, h('div', { class: 'row addhead' }, h('label', {}, '加入哪一側 ', sideSel), h('label', {}, '玩家 ', owner)),
        h('div', { class: 'tabs' }, tabs.map(([k, t]) => h('button', { class: 'tab' + (state.tab === k ? ' on' : ''), type: 'button', onclick: () => { state.tab = k; draw(); } }, t))));
    };
    const add = (chars) => { addChars(chars, state.side, state.owner); toast(`已加入 ${chars.length} 位`); };
    function draw() {
      body.replaceChildren(head());
      if (state.tab === 'gen') drawGen(); else if (state.tab === 'paste') drawPaste(); else drawManual();
    }
    function drawGen() {
      const Pc = core();
      const wrap = h('div', { class: 'genwrap' });
      wrap.innerHTML = `<aside class="genl">${Pc.panelHTML('<div class="row2"><label class="small">一次加入 <input id="gcount" type="number" min="1" max="12" value="1" style="width:56px"> 隻（每隻重新隨機，野生群戰用）</label></div><button type="button" class="gbtn" id="ggo">產生並加入戰場</button><p class="note">條件決定要產生誰；點數依階級表隨機分配。加入後可以在參戰者的「編輯資料」微調。</p>')}</aside><div class="genhint note">左邊設好條件（物種、階級、風格…）後按「產生並加入戰場」。需要完全手動時，用上方「手動新增」。</div>`;
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
        h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', onclick: async () => {
          msg.textContent = '讀取中…';
          const r = await readText(ta.value);
          if (!r.chars.length) { msg.textContent = r.msg; msg.className = 'pkio-msg bad'; return; }
          add(r.chars); msg.className = 'pkio-msg'; msg.textContent = `已加入 ${r.chars.length} 位。` + (r.msg ? '注意：' + r.msg : ''); ta.value = '';
        } }, '加入戰場'))));
    }
    function drawManual() {
      const Pc = core();
      const dl = h('datalist', { id: 'spl' }, DB.dex.map((x, i) => h('option', { value: x.z + (x.n !== x.z ? ` (${x.n})` : '') }, `#${x.num}`)));
      const sp = h('input', { list: 'spl', placeholder: '輸入或選擇物種（中文或英文）', 'aria-label': '物種' });
      const rank = h('select', {}, Object.keys(DB.rankZh).map((r) => h('option', { value: r, selected: r === '2' }, DB.rankZh[r])));
      const findIdx = (t) => { t = t.trim().toLowerCase(); return DB.dex.findIndex((x) => x.z === t || x.n.toLowerCase() === t || (x.z + ` (${x.n})`).toLowerCase() === t); };
      const tn = h('input', { placeholder: '訓練家名稱' });
      body.append(h('div', { class: 'manual' },
        h('div', { class: 'form' }, h('h4', {}, '空白寶可夢（能力值取圖鑑下限，再到「編輯資料」填）'), h('label', {}, '物種', sp, dl), h('label', {}, '階級', rank),
          h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', onclick: () => {
            const i = findIdx(sp.value); if (i < 0) return toast('找不到這個物種');
            add([F.sheetToChar(DB, Pc, F.blankSheet(DB, Pc, i, +rank.value))]);
          } }, '加入寶可夢'))),
        h('div', { class: 'form' }, h('h4', {}, '訓練家（空白，能力值 1）'), h('label', {}, '名稱', tn),
          h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', onclick: () => {
            const t = F.blankTrainer(); t.name = tn.value.trim() || '訓練家'; t.player = state.owner; add([t]); tn.value = '';
          } }, '加入訓練家')))));
    }
    draw();
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
    const dl = h('datalist', { id: 'spl2' }, DB.dex.map((x) => h('option', { value: x.z + (x.n !== x.z ? ` (${x.n})` : '') })));
    const sp = h('input', { list: 'spl2', value: DB.dex[sheet.i].z + (DB.dex[sheet.i].n !== DB.dex[sheet.i].z ? ` (${DB.dex[sheet.i].n})` : ''), onchange: (e) => {
      const t = e.target.value.trim().toLowerCase();
      const i = DB.dex.findIndex((x) => x.z === t || x.n.toLowerCase() === t || (x.z + ` (${x.n})`).toLowerCase() === t);
      if (i < 0) return toast('找不到這個物種');
      sheet.i = i; sheet.ab = Pc.abName(DB.dex[i].ab[0] || sheet.ab); sheet.free = true; v.render(); toast('已換物種（進化或形態變化）。已開啟「不受規則限制」，請自己檢查能力值與招式。');
    } });
    const top = h('div', { class: 'form edtop' }, h('label', {}, '玩家', ownerIn), h('label', {}, '陣營（側）', sideSel), h('label', {}, '物種（進化／形態變化時改這裡）', sp, dl),
      h('label', {}, '最大 HP 覆寫', maxHp), h('p', { class: 'muted small' }, '下面是規則站的角色卡編輯畫面；改完按底下「完成」才會套用到戰場。能力值升降與異常狀態請在先攻順序裡改。'));
    const box = h('div', { id: 'gsheet' });
    const done = h('button', { class: 'primary', type: 'button', onclick: () => {
      commit(() => {
        const nc = F.sheetToChar(DB, Pc, sheet);
        const ov = Object.assign({}, old.override || {}, { maxHp: maxHp.value === '' ? null : num(maxHp.value), free: sheet.free || undefined });
        c.character = Object.assign({}, old, nc, { override: ov });
        c.owner = ownerIn.value.trim(); c.side = sideSel.value;
      }, `編輯 ${cname(c)}`);
      m.close();
    } }, '完成');
    body.append(top, box, h('div', { class: 'row edfoot' }, done, h('button', { type: 'button', onclick: () => m.close() }, '取消')));
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
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', onclick: () => {
        commit(() => {
          t.override = Object.assign({}, t.override || {}, { maxHp: maxHp.value === '' ? null : num(maxHp.value) });
          c.character = t; c.owner = ownerIn.value.trim(); c.side = sideSel.value;
        }, `編輯 ${cname(c)}`);
        m.close();
      } }, '完成'), h('button', { type: 'button', onclick: () => m.close() }, '取消')));
    const m = modal(`編輯訓練家：${cname(c)}`, body, { sticky: true, closeText: '取消' });
  }

  // ───────── 下一輪 ─────────
  function openRoundEnd() {
    const items = R.eorItems(S);
    const auto = h('input', { type: 'checkbox', checked: !!S.settings.eorAuto });
    const checks = items.map((it) => h('input', { type: 'checkbox', checked: it.dmg > 0 }));
    const timers = [
      ...S.effects.filter((e) => e.rounds != null && e.rounds > 0).map((e) => ({ kind: 'effect', ref: e, text: e.name, left: e.rounds })),
      ...S.combatants.flatMap((c) => c.state.status.filter((st) => st.rounds != null && st.rounds > 0).map((st) => ({ kind: 'status', ref: st, text: `${cname(c)}：${statusText(st).replace(/（.*）/, '')}`, left: st.rounds }))),
    ];
    const downs = S.combatants.filter((c) => !c.benched && R.isDown(c));
    const bench = downs.map(() => h('input', { type: 'checkbox' }));
    const body = h('div', { class: 'eor' },
      h('h4', {}, '戰鬥輪結束時要處理的效果'),
      items.length ? h('div', {}, items.map((it, i) => h('label', { class: 'eoritem' }, checks[i], h('span', {}, it.text), it.dmg ? h('b', { class: 'dmg' }, `−${it.dmg} HP`) : h('small', { class: 'muted' }, '（提醒）'))))
        : h('p', { class: 'muted small' }, '沒有需要結算的異常狀態或天氣傷害。'),
      h('label', { class: 'autoeor' }, auto, ' 自動扣除勾選項目的 HP（預設關閉，關著就只是提醒，由你自己改血量）'),
      h('p', { class: 'muted small' }, '灼傷 1／2／3 級每輪 1／2／3 點（3 級每輪再 +1）、中毒 2 點、劇毒 2 點每輪 +1、沙暴與冰雹 1 點。實際以你的判定為準，打勾才會處理。'),
      timers.length ? [h('h4', {}, '倒數'), h('ul', { class: 'timers' }, timers.map((t) => h('li', {}, t.text, '　剩 ', h('b', {}, t.left), ' 輪 → ', t.left - 1 <= 0 ? h('b', { class: 'dn' }, '到期') : `剩 ${t.left - 1} 輪`)))] : null,
      downs.length ? [h('h4', {}, '倒下的參戰者（戰鬥輪結束時，訓練家可以收回並換新的）'),
        downs.map((c, i) => h('label', { class: 'eoritem' }, bench[i], h('span', {}, `${cname(c)} 收回，移到後備`)))] : null,
      h('div', { class: 'row end' }, h('button', { class: 'primary big', type: 'button', onclick: () => {
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
          addLog(`── 第 ${S.round} 輪開始 ──`);
        });
        m.close();
      } }, `確認，進入第 ${S.round + 1} 輪`), h('button', { type: 'button', onclick: () => m.close() }, '取消')));
    const m = modal(`第 ${S.round} 輪結束`, body, { sticky: true, closeText: '取消' });
  }

  // ───────── Discord 文字 ─────────
  function discordText() {
    const ICON = ['🟦', '🟥', '⬜', '🟩', '🟨', '🟪', '🟧'];
    const lines = [];
    const cur = byId(S.turn.combatant);
    const field = S.effects.filter((e) => e.scope === 'field').map((e) => e.name + (e.rounds != null ? (e.rounds === 0 ? '（到期）' : `（剩 ${e.rounds} 輪）`) : ''));
    lines.push(`**${S.title ? S.title + '｜' : ''}第 ${S.round} 輪**` + (S.field.location ? `｜${S.field.location}` : '') + (field.length ? `｜${field.join('、')}` : ''));
    const ord = activeOrder().filter((c) => !c.hidden);
    if (ord.length) lines.push('先攻順序：' + ord.map((c) => (cur && c.id === cur.id ? `**▶${cname(c)}**` : R.isDown(c) ? `~~${cname(c)}~~` : cname(c))).join(' → '));
    S.sides.forEach((sd, si) => {
      const mem = ord.filter((c) => c.side === sd.id);
      const eff = S.effects.filter((e) => e.scope === sd.id).map((e) => e.name + (e.rounds != null ? (e.rounds === 0 ? '（到期）' : `（剩 ${e.rounds} 輪）`) : ''));
      if (!mem.length && !eff.length) return;
      lines.push(`${ICON[si % ICON.length]} **${sd.name}**` + (eff.length ? `｜${eff.join('、')}` : ''));
      mem.forEach((c) => {
        const mode = sd.hp, max = R.maxHp(c, S.settings), hp = Math.max(0, c.state.hp);
        const hpT = mode === 'hidden' ? '' : mode === 'exact' ? `HP ${hp}/${max}` : `HP ${'▓'.repeat(Math.round(hp / Math.max(1, max) * 10))}${'░'.repeat(10 - Math.round(hp / Math.max(1, max) * 10))}`;
        const st = [...c.state.status.map(statusText), ...F.STAT_KEYS.filter((k) => c.state.mods[k]).map((k) => F.ATTR_ZH[k] + signed(c.state.mods[k])), ...effectsOf(c.id).map((e) => e.name)];
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
    const body = h('div', {}, h('p', { class: 'muted small' }, '會依各側的 HP 顯示設定（設定裡改）：數字／血條／不顯示；標為「隱藏」的參戰者不會出現。直接貼到 Discord 就能顯示粗體與刪除線。'), ta, msg,
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', onclick: () => copyText(text, (ok) => { msg.textContent = ok ? '已複製，去 Discord 貼上吧。' : '無法複製，請手動選取。'; }) }, '複製')));
    modal('複製 Discord 文字', body);
    copyText(text, (ok) => { if (ok) msg.textContent = '已自動複製，去 Discord 貼上吧。'; });
  }

  // ───────── 匯入／匯出 ─────────
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
            commit(() => { S = F.normalize(obj); }, '匯入場次存檔');
            msg.className = 'pkio-msg'; msg.textContent = '已匯入場次。'; m.close();
          } else {
            const chars = F.charsFromJSON(obj);
            if (!chars.length) { msg.className = 'pkio-msg bad'; msg.textContent = '這不是場次存檔，也不是角色檔。'; return; }
            m.close(); openAdd(); toast('這是角色檔：請在「貼上文字／匯入檔案」分頁選擇檔案，加入戰場。');
          }
        } catch (err) { msg.className = 'pkio-msg bad'; msg.textContent = '讀取失敗：' + err.message; }
      };
      rd.readAsText(f);
    } });
    const body = h('div', { class: 'io' },
      h('h4', {}, '匯出'),
      h('p', { class: 'muted small' }, '存檔包含整個場次（戰場、先攻順序、所有參戰者與紀錄）。跑完團存一份，下次匯入就能接著跑。'),
      h('div', { class: 'row' },
        h('button', { class: 'primary', type: 'button', onclick: () => {
          const d = new Date(); const name = `${S.title || '戰場記錄'}-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.json`;
          download(name, JSON.stringify(Object.assign({}, S, { saved: d.toISOString() }), null, 2)); msg.className = 'pkio-msg'; msg.textContent = '已下載 ' + name;
        } }, '匯出場次存檔 (.json)'),
        h('button', { type: 'button', onclick: () => {
          const list = S.combatants.map((c) => c.character);
          download(`${S.title || '戰場記錄'}-角色.json`, JSON.stringify({ schema: F.CHAR, list }, null, 2));
        } }, '只匯出所有角色 (.json)')),
      h('h4', {}, '匯入'),
      h('p', { class: 'muted small' }, '選擇場次存檔會取代目前的場次；選擇角色檔（或貼上 pokepast 文字）請用「＋ 新增參戰者」。'),
      h('div', { class: 'row' }, file), msg,
      h('h4', {}, '自動儲存'),
      h('p', { class: 'muted small' }, '每次修改都會自動存在這個瀏覽器裡，重新整理或關掉分頁不會不見；換瀏覽器或清除網站資料就會消失，所以跑完團請匯出存檔。'),
      h('div', { class: 'row' }, h('button', { class: 'danger', type: 'button', onclick: () => {
        if (!confirm('開新場次？目前的場次會被清空（可以用復原找回，但關掉分頁就沒了，建議先匯出）。')) return;
        const keep = { sides: S.sides, settings: S.settings };
        commit(() => { S = Object.assign(F.newSession(), keep); }); m.close();
      } }, '開新場次（清空）')));
    const m = modal('匯入／匯出', body);
  }

  // ───────── 分享給玩家（第二段） ─────────
  function openShare() {
    const SH = window.PKShare, st = SH.status;
    const body = h('div', {});
    const m = modal('分享給玩家（唯讀看板）', body, { onClose: refreshShareBtn });
    function draw() {
      const msg = h('div', { class: 'pkio-msg', role: 'status' });
      const say = (t, bad) => { msg.textContent = t; msg.className = 'pkio-msg' + (bad ? ' bad' : ''); };
      const intro = h('p', { class: 'muted small' }, '玩家用連結就能看到戰場、先攻順序、各參戰者的狀態與行動計數，不需要登入，也不能修改。GM 備註、標為「隱藏」的參戰者、後備、不公開的條目都不會上傳；HP 依各側（或單隻）的設定顯示數字、血條或不顯示。只有你這台瀏覽器能更新看板。');
      if (!st.id) {
        body.replaceChildren(intro,
          location.protocol === 'file:' ? h('p', { class: 'warn small' }, '你現在是用檔案（file://）開啟的，玩家打不開本機檔案，所以連結會用正式網址（' + SH.HOSTED + '）。請確認那個網址已經發布這個工具。') : null,
          h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', onclick: async (ev) => {
            ev.target.disabled = true; say('建立中…');
            try { await SH.create(S); draw(); refreshShareBtn(); } catch (e) { ev.target.disabled = false; say(e.message, true); refreshShareBtn(); }
          } }, '建立玩家看板連結')), msg);
        return;
      }
      const link = SH.linkFor(st.id);
      const ta = h('input', { value: link, readonly: true, class: 'grow', onfocus: (e) => e.target.select() });
      const lastT = st.last ? `${pad2(st.last.getHours())}:${pad2(st.last.getMinutes())}:${pad2(st.last.getSeconds())}` : '尚未同步';
      body.replaceChildren(intro, h('div', { class: 'row' }, ta, h('button', { class: 'primary', type: 'button', onclick: () => copyText(link, (ok) => say(ok ? '已複製連結，貼給玩家吧。' : '無法複製，請手動選取。')) }, '複製連結'),
        h('a', { href: link, target: '_blank', rel: 'noopener' }, '開啟看看')),
        h('p', { class: 'small' }, '狀態：', st.error ? h('b', { class: 'dn' }, '同步失敗　' + st.error) : h('b', {}, '已連線，每次修改都會自動同步'), `（上次同步：${lastT}）`),
        h('div', { class: 'row' },
          h('button', { type: 'button', onclick: async () => { say('同步中…'); try { await SH.push(S); draw(); refreshShareBtn(); } catch (e) { say(e.message, true); refreshShareBtn(); } } }, '立即同步'),
          h('button', { class: 'danger', type: 'button', onclick: async () => {
            if (!confirm('停止分享並刪除連結？玩家之後就看不到了。（想再分享要重新建立，網址會不同）')) return;
            try { await SH.stop(); } catch (e) { if (confirm('刪除失敗：' + e.message + '\n要放棄這個連結、不再同步嗎？')) SH.forget(); else return; }
            draw(); refreshShareBtn();
          } }, '停止分享並刪除'),
          st.error ? h('button', { type: 'button', onclick: () => { if (confirm('放棄舊連結，重新建立一個新的？')) { SH.forget(); draw(); refreshShareBtn(); } } }, '放棄舊連結') : null), msg);
    }
    draw();
  }

  // ───────── 設定 ─────────
  function openSettings() {
    const body = h('div', {});
    const m = modal('設定', body);
    function draw() {
      const st = S.settings;
      const sideRows = S.sides.map((sd, i) => {
        const nm = h('input', { value: sd.name, onchange: (e) => commit(() => { sd.name = e.target.value.trim() || sd.name; }) });
        const col = h('input', { type: 'color', value: sd.color, onchange: (e) => commit(() => { sd.color = e.target.value; }) });
        const hp = h('select', { onchange: (e) => commit(() => { sd.hp = e.target.value; }) }, [['exact', '數字'], ['bar', '只有血條'], ['hidden', '不顯示']].map(([v, t]) => h('option', { value: v, selected: sd.hp === v }, t)));
        const del = h('button', { class: 'clear danger2', type: 'button', disabled: window.PKBoard.MAIN.includes(sd.id), title: window.PKBoard.MAIN.includes(sd.id) ? '戰場圖上的三個區域（綠、紅、白）不能刪除，可以改名改色' : '', onclick: () => {
          const mem = S.combatants.filter((c) => c.side === sd.id);
          if (!confirm(`刪除「${sd.name}」？` + (mem.length ? `裡面 ${mem.length} 位參戰者會移到「${S.sides.find((x) => x !== sd).name}」。` : ''))) return;
          commit(() => {
            const to = S.sides.find((x) => x !== sd).id;
            mem.forEach((c) => { c.side = to; });
            S.effects.forEach((e) => { if (e.scope === sd.id) e.scope = to; });
            S.sides = S.sides.filter((x) => x !== sd);
          }, `刪除側：${sd.name}`); draw();
        } }, '刪除');
        return h('div', { class: 'srow' }, col, nm, h('label', { class: 'small' }, '玩家看板 HP：', hp), del);
      });
      body.replaceChildren(
        h('h4', {}, '側（陣營）'),
        h('p', { class: 'muted small' }, '戰場圖有三個固定區域：綠（玩家方）、紅（敵方）、白（中立／全場），可以改名改色但不能刪。再新增的側會在戰場圖下面多一條，棋子拖進去就換成那一側。'),
        sideRows,
        h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => { commit(() => { S.sides.push({ id: F.uid('s'), name: '新的一側', color: '#f59e0b', hp: 'bar' }); }); draw(); } }, '＋ 新增一側')),
        h('h4', {}, '規則（影響最大 HP、防禦與特防的計算）'),
        h('label', { class: 'rad' }, h('input', { type: 'radio', name: 'dm', checked: st.defMode !== 2, onchange: () => { commit(() => { st.defMode = 1; }); draw(); } }), ' 選項 1：防禦與特防都等於體魄'),
        h('label', { class: 'rad' }, h('input', { type: 'radio', name: 'dm', checked: st.defMode === 2, onchange: () => { commit(() => { st.defMode = 2; }); draw(); } }), ' 選項 2：防禦＝體魄、特防＝洞察'),
        st.defMode === 2 ? h('label', { class: 'rad' }, h('input', { type: 'checkbox', checked: st.hpStat === 'ins', onchange: (e) => { commit(() => { st.hpStat = e.target.checked ? 'ins' : 'vit'; }); draw(); } }), ' 最大 HP 改用洞察計算') : null,
        h('p', { class: 'muted small' }, '個別參戰者的最大 HP 可以在「編輯資料」裡覆寫。'));
    }
    draw();
  }

  // ───────── 啟動 ─────────
  function boot() {
    S = loadSaved();
    syncOrder();
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); doUndo(); }
    });
    render();
    if (window.PKShare && window.PKShare.status.id) window.PKShare.schedule(() => S, refreshShareBtn); // 重新整理後把目前狀態再同步一次
  }
  window.PKT ={ get state() { return S; }, render, commit, discordText };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
