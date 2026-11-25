// 戰場圖：白色底，中間左右分成綠（玩家方）、紅（敵方）的戰鬥區；棋子與條目卡可以拖動。
// 拖到綠區＝玩家方（s1）、紅區＝敵方（s2）、白區＝中立（s3）；條目卡拖到綠／紅／白＝玩家方／敵方／全場，放到棋子上＝附在他身上。
// GM 板（可拖動）與玩家看板（唯讀）共用這份。座標是占戰場圖寬高的百分比。
(function (root) {
  'use strict';
  const B = {};
  const SHORT = { burn: '灼', poison: '毒', badPoison: '劇', para: '麻', sleep: '眠', freeze: '凍', confuse: '混', flinch: '縮', infat: '迷', disable: '定', block: '阻', custom: '＊' };
  // 固定的格子：天氣、場地在白色區頂部；防護力場、入場危害在綠、紅兩區的頂部
  const SLOTS = [
    { id: 'weather', kind: 'weather', scope: 'field', label: '天氣', box: { l: 27, t: 3, w: 21, h: 14 } },
    { id: 'terrain', kind: 'terrain', scope: 'field', label: '場地', box: { l: 52, t: 3, w: 21, h: 14 } },
    { id: 'ff1', kind: 'forceField', scope: 's1', label: '防護力場', box: { l: 18, t: 22, w: 15, h: 14 } },
    { id: 'hz1', kind: 'hazard', scope: 's1', label: '入場危害', box: { l: 34, t: 22, w: 15, h: 14 } },
    { id: 'ff2', kind: 'forceField', scope: 's2', label: '防護力場', box: { l: 51, t: 22, w: 15, h: 14 } },
    { id: 'hz2', kind: 'hazard', scope: 's2', label: '入場危害', box: { l: 67, t: 22, w: 15, h: 14 } },
  ];
  B.SLOTS = SLOTS;
  const MAIN = ['s1', 's2', 's3'];
  B.MAIN = MAIN;

  // 哪個效果占哪個格子：同種類、同範圍、沒有被標成「自由卡片」的第一個
  B.slotted = (effects) => {
    const map = {};
    for (const sl of SLOTS) {
      const e = effects.find((x) => !x.card && x.kind === sl.kind && x.scope === sl.scope);
      if (e) map[sl.id] = e;
    }
    return map;
  };
  B.zoneAt = (x, y) => (y >= 20 && x >= 17 && x < 50 ? 's1' : y >= 20 && x >= 50 && x < 83 ? 's2' : 's3');

  // 沒有存位置時的預設位置：依在同一區裡的順序排成格子
  function autoPos(side, i, kind) {
    if (side === 's1' || side === 's2') {
      const x0 = side === 's1' ? 18 : 51, w = 31, cols = 3;
      if (kind === 'card') return { x: x0 + w * ((i % cols) + 0.5) / cols, y: 43 + Math.floor(i / cols) * 9 };
      return { x: x0 + w * ((i % cols) + 0.5) / cols, y: Math.min(93, 62 + Math.floor(i / cols) * 16) };
    }
    if (kind === 'card') return { x: 88, y: 12 + (i % 9) * 9 };
    return { x: 4 + (i % 2) * 6.5 + 4, y: Math.min(92, 24 + Math.floor(i / 2) * 16) };
  }

  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'value') el.value = v;
      else if (k === 'selected') el.selected = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : String(k));
    return el;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 讓元素可以拖動。onDrop(drop)：{ x, y（百分比，限制在戰場圖內）, inside（是否在戰場圖內）, strip（落在哪個額外側）, token（落在哪個棋子上） }
  function draggable(el, board, selfId, onDrop, onClick) {
    el.classList.add('dragable');
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest('button,input,select,textarea,a')) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      let moved = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 略 */ }
      const base = el.classList.contains('flow') ? '' : 'translate(-50%,-50%) ';
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = true; el.classList.add('drag');
        el.style.transform = `${base}translate(${dx}px,${dy}px)`;
      };
      const up = (ev) => {
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel);
        try { el.releasePointerCapture(e.pointerId); } catch (err) { /* 略 */ }
        el.classList.remove('drag'); el.style.transform = base ? 'translate(-50%,-50%)' : '';
        if (!moved) { if (onClick) onClick(); return; }
        const r = board.getBoundingClientRect();
        const px = (ev.clientX - r.left) / r.width * 100, py = (ev.clientY - r.top) / r.height * 100;
        const stack = document.elementsFromPoint(ev.clientX, ev.clientY);
        const strip = stack.find((n) => n.classList && n.classList.contains('strip'));
        const tok = stack.find((n) => n.classList && n.classList.contains('tok') && n.dataset.id && n.dataset.id !== selfId);
        onDrop({ x: clamp(px, 3, 97), y: clamp(py, 4, 96), inside: px >= 0 && px <= 100 && py >= 0 && py <= 100, strip: strip ? strip.dataset.side : null, token: tok ? tok.dataset.id : null });
      };
      const cancel = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); el.classList.remove('drag'); el.style.transform = base ? 'translate(-50%,-50%)' : ''; };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', cancel);
    });
  }

  // model：{ location, sides:[{id,name,color}], tokens:[{id,name,img,trainer,side,pos,hp:{pct,cur,max}|null,down,current,hidden,status:[kind…],attached:[{id,name,rounds}]}],
  //         effects:[{id,kind,name,rounds,scope,pos,card}], targets:{sideId:n}, suggest:{kind:[名稱…]}, sprBase }
  // opts（有 editable 才能操作）：onTokenMove(id, {side,pos})、onTokenClick(id)、onSlot(slot, patch)、onCardMove(id, {scope,pos})、
  //   onCardClick(id)、onCardRounds(id, delta)、onCardRemove(id)、onTargets(sideId, value)
  B.render = (model, opts) => {
    opts = opts || {};
    const ed = !!opts.editable;
    const side = Object.fromEntries(model.sides.map((s) => [s.id, s]));
    const col = (id) => (side[id] ? side[id].color : '#9aa3b2');
    const board = h('div', { class: 'board' + (ed ? ' ed' : '') });
    // 底圖：戰鬥區、中線、球、球門
    board.append(h('div', { class: 'combat' }, h('div', { class: 'half g' }), h('div', { class: 'half r' }), h('div', { class: 'goal l' }), h('div', { class: 'goal r' }), h('div', { class: 'ball0' }),
      h('div', { class: 'zname g' }, side.s1 ? side.s1.name : '玩家方'), h('div', { class: 'zname r' }, side.s2 ? side.s2.name : '敵方')));
    board.append(h('div', { class: 'wname' }, side.s3 ? side.s3.name + '（場外）' : '中立（場外）'));
    if (model.location) board.append(h('div', { class: 'loc' }, '📍 ' + model.location));

    // 固定格子
    const slotted = B.slotted(model.effects);
    const sug = model.suggest || {};
    for (const sl of SLOTS) {
      const e = slotted[sl.id];
      const box = { left: sl.box.l + '%', top: sl.box.t + '%', width: sl.box.w + '%', height: sl.box.h + '%' };
      const cell = h('div', { class: 'slot2' + (e && e.rounds === 0 ? ' expired' : '') + (e ? ' full' : ''), style: box, 'data-slot': sl.id }, h('small', {}, sl.label));
      if (ed) {
        const names = sug[sl.kind] || [];
        const sel = h('select', { 'aria-label': sl.label },
          h('option', { value: '' }, '（無）'),
          names.map((n) => h('option', { value: n, selected: e && e.name === n }, n)),
          e && !names.includes(e.name) ? h('option', { value: e.name, selected: true }, e.name) : null,
          h('option', { value: '__custom' }, '自訂…'));
        sel.addEventListener('change', () => {
          let v = sel.value;
          if (v === '__custom') { v = (prompt(`自訂${sl.label}名稱`) || '').trim(); if (!v) { sel.value = e ? e.name : ''; return; } }
          opts.onSlot(sl, { name: v });
        });
        const rd = h('input', { type: 'number', min: '0', placeholder: '輪', value: e && e.rounds != null ? e.rounds : '', 'aria-label': sl.label + '剩餘輪數', disabled: !e });
        rd.addEventListener('change', () => opts.onSlot(sl, { rounds: rd.value === '' ? null : Math.max(0, parseInt(rd.value, 10) || 0) }));
        cell.append(h('div', { class: 'srow2' }, sel, rd));
      } else {
        cell.append(e ? h('div', { class: 'sview' }, h('b', {}, e.name), e.rounds != null ? h('span', {}, e.rounds === 0 ? '到期' : `剩 ${e.rounds} 輪`) : null) : h('div', { class: 'sview none' }, '—'));
      }
      board.append(cell);
    }

    // 目標數
    const tg = h('div', { class: 'targets' }, h('small', {}, '目標數'));
    for (const id of ['s1', 's2']) {
      const v = model.targets ? model.targets[id] : null;
      tg.append(ed ? h('input', { type: 'number', min: '0', value: v == null ? '' : v, style: { borderColor: col(id) }, 'aria-label': (side[id] ? side[id].name : id) + ' 目標數', onchange: (e) => opts.onTargets(id, e.target.value) })
        : h('span', { class: 'tv', style: { borderColor: col(id) } }, v == null ? '—' : v));
    }
    board.append(tg);

    // 自由卡片（不在固定格子的條目）
    const cardIdx = {};
    for (const e of model.effects) {
      if (Object.values(slotted).includes(e)) continue;
      if (e.scope !== 'field' && !side[e.scope]) continue; // 附在棋子身上的，畫在棋子上
      const sc = e.scope === 'field' ? 's3' : e.scope;
      let pos = e.pos;
      if (!pos) { const i = cardIdx[sc] = (cardIdx[sc] == null ? 0 : cardIdx[sc] + 1); pos = autoPos(MAIN.includes(sc) ? sc : 's3', i, 'card'); }
      const card = h('div', { class: 'card' + (e.rounds === 0 ? ' expired' : ''), 'data-id': e.id, style: { left: pos.x + '%', top: pos.y + '%', borderColor: sc === 's3' ? '#7a8799' : col(sc) }, title: e.note || '' },
        h('b', {}, e.name || '（未命名）'), e.rounds != null ? h('small', {}, e.rounds === 0 ? '到期' : `剩 ${e.rounds} 輪`) : null,
        ed && e.rounds != null ? h('span', { class: 'cb' }, h('button', { type: 'button', 'aria-label': '減少一輪', onclick: () => opts.onCardRounds(e.id, -1) }, '−'), h('button', { type: 'button', 'aria-label': '增加一輪', onclick: () => opts.onCardRounds(e.id, 1) }, '＋')) : null,
        ed ? h('button', { class: 'cx', type: 'button', 'aria-label': '移除', onclick: () => opts.onCardRemove(e.id) }, '×') : null);
      if (ed) draggable(card, board, e.id, (d) => {
        if (d.token) return opts.onCardMove(e.id, { scope: d.token, pos: null });
        if (d.strip) return opts.onCardMove(e.id, { scope: d.strip, pos: null });
        if (!d.inside) return;
        const z = B.zoneAt(d.x, d.y);
        opts.onCardMove(e.id, { scope: z === 's3' ? 'field' : z, pos: { x: d.x, y: d.y } });
      }, () => opts.onCardClick(e.id));
      board.append(card);
    }

    // 棋子
    const tokIdx = {};
    const mkTok = (t, flow) => {
      const color = MAIN.includes(t.side) && t.side !== 's3' ? col(t.side) : (t.side === 's3' ? '#7a8799' : col(t.side));
      const tok = h('div', { class: 'tok' + (flow ? ' flow' : '') + (t.current ? ' cur' : '') + (t.down ? ' down' : '') + (t.hidden ? ' hid' : ''), 'data-id': t.id, title: t.name },
        h('div', { class: 'ball', style: { borderColor: color } },
          t.img != null ? h('img', { src: (model.sprBase || '') + t.img + '.png', alt: '', draggable: 'false', onerror: (e) => { e.target.style.visibility = 'hidden'; } }) : h('span', { class: 'ph' }, t.trainer ? '🧑' : '？'),
          t.status && t.status.length ? h('span', { class: 'sbadge' }, t.status.slice(0, 3).map((k) => h('i', {}, SHORT[k] || '＊'))) : null),
        h('div', { class: 'tn' }, t.name),
        t.hp ? h('div', { class: 'thp' }, h('i', { style: { width: t.hp.pct + '%', background: t.hp.pct > 50 ? 'var(--hp-hi)' : t.hp.pct > 25 ? 'var(--hp-mid)' : 'var(--hp-lo)' } })) : null,
        t.attached && t.attached.length ? h('div', { class: 'tatt' }, t.attached.map((a) => h('span', { class: 'achip' + (a.rounds === 0 ? ' expired' : ''), 'data-eid': a.id }, a.name + (a.rounds != null ? (a.rounds === 0 ? '·到期' : `·${a.rounds}`) : '')))) : null);
      return tok;
    };
    const extras = model.sides.filter((s) => !MAIN.includes(s.id));
    const dropTok = (t) => (d) => {
      if (d.strip) return opts.onTokenMove(t.id, { side: d.strip, pos: null });
      if (!d.inside) return;
      opts.onTokenMove(t.id, { side: B.zoneAt(d.x, d.y), pos: { x: d.x, y: d.y } });
    };
    for (const t of model.tokens) {
      if (!MAIN.includes(t.side)) continue;
      let pos = t.pos;
      if (!pos) { const i = tokIdx[t.side] = (tokIdx[t.side] == null ? 0 : tokIdx[t.side] + 1); pos = autoPos(t.side, i, 'tok'); }
      else tokIdx[t.side] = (tokIdx[t.side] == null ? 0 : tokIdx[t.side] + 1);
      const tok = mkTok(t, false);
      tok.style.left = pos.x + '%'; tok.style.top = pos.y + '%';
      if (ed) draggable(tok, board, t.id, dropTok(t), () => opts.onTokenClick(t.id));
      board.append(tok);
    }

    const wrap = h('div', { class: 'boardwrap' }, h('div', { class: 'boardscroll' }, board));
    // 額外的側：在戰場圖下面各一條，棋子拖進去就換成那一側
    if (extras.length || ed) {
      const strips = h('div', { class: 'strips' });
      for (const s of extras) {
        const strip = h('div', { class: 'strip', 'data-side': s.id, style: { borderColor: s.color } }, h('span', { class: 'sname', style: { background: s.color } }, s.name));
        for (const t of model.tokens.filter((x) => x.side === s.id)) {
          const tok = mkTok(t, true);
          if (ed) draggable(tok, board, t.id, dropTok(t), () => opts.onTokenClick(t.id));
          strip.append(tok);
        }
        strips.append(strip);
      }
      if (extras.length) wrap.append(strips);
    }
    if (ed) wrap.append(h('p', { class: 'muted small boardhint' }, '拖動棋子：放到綠區＝玩家方、紅區＝敵方、白區＝中立。拖動條目卡：綠區＝玩家方、紅區＝敵方、白區＝全場，放到棋子上＝附在他身上。點棋子會展開他的資料。'));
    return wrap;
  };

  root.PKBoard = B;
})(window);
