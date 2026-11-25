// 戰場圖：白色底，中間左右分成綠（玩家方）、紅（敵方）的戰鬥區；棋子與條目卡可以拖動。
// 拖到綠區＝玩家方（s1）、紅區＝敵方（s2）、白區＝中立（s3）；條目卡拖到綠／紅／白＝玩家方／敵方／全場，放到棋子上＝附在他身上。
// 棋子拖到另一個棋子上＝指定傷害目標（GM 板才有）。
// GM 板（可操作）與玩家看板（唯讀）共用這份。座標是占戰場圖寬高的百分比。
(function (root) {
  'use strict';
  const B = {};
  // 異常狀態的縮寫與顏色（棋子上的小圓點、GM 板的狀態按鈕共用）
  B.SHORT = { burn: '灼', poison: '毒', badPoison: '劇', para: '麻', sleep: '眠', freeze: '凍', confuse: '混', flinch: '縮', infat: '迷', disable: '定', block: '阻', custom: '＊' };
  B.STATUS_COLOR = {
    burn: ['#ee7a3c', '#fff'], poison: ['#a35bc0', '#fff'], badPoison: ['#6e2f8f', '#fff'], para: ['#f2c531', '#3d2f00'],
    sleep: ['#8d97a8', '#fff'], freeze: ['#5cc3e3', '#06323f'], confuse: ['#e872a8', '#fff'], flinch: ['#a8916a', '#fff'],
    infat: ['#f58fb5', '#4a1028'], disable: ['#66707c', '#fff'], block: ['#4f5864', '#fff'], custom: ['#3f7fb0', '#fff'],
  };
  // 固定的格子：天氣、場地在白色區頂部；防護力場、入場危害在綠、紅兩區的頂部（x＝格子中心、y＝格子上緣、w＝最大寬度，都是百分比）
  // 每個格子可以放好幾個條目（例如光牆＋反射壁、撒菱＋隱形岩），各自倒數；天氣同時只有一種。
  const SLOTS = [
    { id: 'weather', kind: 'weather', scope: 'field', label: '天氣', icon: '☀', x: 39, y: 3, w: 20, single: true },
    { id: 'terrain', kind: 'terrain', scope: 'field', label: '場地', icon: '⛰', x: 61, y: 3, w: 20 },
    { id: 'ff1', kind: 'forceField', scope: 's1', label: '防護力場', icon: '🛡', x: 25.5, y: 22.5, w: 15.5 },
    { id: 'hz1', kind: 'hazard', scope: 's1', label: '入場危害', icon: '⚠', x: 41.5, y: 22.5, w: 15.5, stack: true },
    { id: 'ff2', kind: 'forceField', scope: 's2', label: '防護力場', icon: '🛡', x: 58.5, y: 22.5, w: 15.5 },
    { id: 'hz2', kind: 'hazard', scope: 's2', label: '入場危害', icon: '⚠', x: 74.5, y: 22.5, w: 15.5, stack: true },
  ];
  B.SLOTS = SLOTS;
  const MAIN = ['s1', 's2', 's3'];
  B.MAIN = MAIN;

  // 哪些效果放在哪個格子：同種類、同範圍、沒有被標成「自由卡片」的全部
  B.slotted = (effects) => {
    const map = {};
    for (const sl of SLOTS) map[sl.id] = effects.filter((x) => !x.card && x.kind === sl.kind && x.scope === sl.scope);
    return map;
  };
  // 條目的顯示名稱：入場危害疊了幾層就寫 ×2
  B.effName = (e) => (e.name || '（未命名）') + (e.layers > 1 ? ` ×${e.layers}` : '');
  B.zoneAt = (x, y) => (y >= 20 && x >= 17 && x < 50 ? 's1' : y >= 20 && x >= 50 && x < 83 ? 's2' : 's3');

  // 沒有存位置時的預設位置：依在同一區裡的順序排成格子
  function autoPos(side, i, kind) {
    if (side === 's1' || side === 's2') {
      const x0 = side === 's1' ? 18 : 51, w = 31, cols = 3;
      if (kind === 'card') return { x: x0 + w * ((i % cols) + 0.5) / cols, y: 46 + Math.floor(i / cols) * 7 };
      return { x: x0 + w * ((i % cols) + 0.5) / cols, y: Math.min(88, 63 + Math.floor(i / cols) * 23) };
    }
    if (kind === 'card') return { x: 91.5, y: 24 + (i % 8) * 10 };
    return { x: 5 + (i % 2) * 7, y: Math.min(90, 30 + Math.floor(i / 2) * 22) };
  }

  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') { for (const [p, q] of Object.entries(v)) { if (p.startsWith('--')) el.style.setProperty(p, q); else el.style[p] = q; } }
      else if (k === 'value') el.value = v;
      else if (k === 'selected') el.selected = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : String(k));
    return el;
  };
  B.h = h;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hpColor = (p) => (p > 50 ? 'var(--hp-hi)' : p > 25 ? 'var(--hp-mid)' : 'var(--hp-lo)');
  B.hpColor = hpColor;

  // 讓元素可以拖動。onDrop(drop)：{ x, y（百分比，限制在戰場圖內）, inside（是否在戰場圖內）, strip（落在哪個額外側）, token（落在哪個棋子上） }
  // onClick(event)：沒有拖動、只是點一下
  function draggable(el, board, selfId, onDrop, onClick) {
    el.classList.add('dragable');
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest('button,input,select,textarea,a')) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, down = e;
      // 抓住的地方不一定是中心：記下指標和棋子中心的差距，放下時用「棋子中心」算落點（看到哪裡就放在哪裡）
      const r0 = el.getBoundingClientRect();
      const offX = sx - (r0.left + r0.width / 2), offY = sy - (r0.top + r0.height / 2);
      let moved = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 略 */ }
      const base = el.classList.contains('flow') ? '' : 'translate(-50%,-50%) ';
      let over = null;
      const mark = (n) => { if (over === n) return; if (over) over.classList.remove('dropon'); over = n; if (over) over.classList.add('dropon'); };
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = true; el.classList.add('drag'); board.classList.add('dragging');
        el.style.transform = `${base}translate(${dx}px,${dy}px)`;
        const stack = document.elementsFromPoint(ev.clientX, ev.clientY);
        mark(stack.find((n) => n.classList && n.classList.contains('tok') && n.dataset.id && n.dataset.id !== selfId) || null);
      };
      const finish = () => {
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel);
        try { el.releasePointerCapture(down.pointerId); } catch (err) { /* 略 */ }
        mark(null); board.classList.remove('dragging');
        el.classList.remove('drag'); el.style.transform = base ? 'translate(-50%,-50%)' : '';
      };
      const up = (ev) => {
        finish();
        if (!moved) { if (onClick) onClick(down); return; }
        const r = board.getBoundingClientRect();
        const px = (ev.clientX - offX - r.left) / r.width * 100, py = (ev.clientY - offY - r.top) / r.height * 100;
        const stack = document.elementsFromPoint(ev.clientX, ev.clientY);
        const strip = stack.find((n) => n.classList && n.classList.contains('strip'));
        const tok = stack.find((n) => n.classList && n.classList.contains('tok') && n.dataset.id && n.dataset.id !== selfId);
        onDrop({ x: clamp(px, 3, 97), y: clamp(py, 4, 96), inside: px >= 0 && px <= 100 && py >= 0 && py <= 100, strip: strip ? strip.dataset.side : null, token: tok ? tok.dataset.id : null });
      };
      const cancel = () => finish();
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', cancel);
    });
  }

  // 棋子（GM 板、玩家看板、戰場圖下面的額外側都用這個）
  B.token = (t, model, flow) => {
    const color = t.color || '#8f9aab';
    const st = (t.status || []).slice(0, 4);
    const dots = t.actions == null ? null : h('div', { class: 'tdots', title: `本輪已行動 ${t.actions} 次` },
      Array.from({ length: 5 }, (_, k) => h('i', { class: k < t.actions ? 'on' : '' })), t.actions > 5 ? h('b', {}, '+' + (t.actions - 5)) : null);
    return h('div', { class: 'tok' + (flow ? ' flow' : '') + (t.current ? ' cur' : '') + (t.sel ? ' sel' : '') + (t.down ? ' down' : '') + (t.hidden ? ' hid' : ''), 'data-id': t.id, title: t.name + (t.hp && t.hp.text ? `　HP ${t.hp.text}` : ''), style: { '--side': color } },
      t.current ? h('span', { class: 'tcur' }, '▼') : null,
      h('div', { class: 'ball' },
        t.src ? h('img', { src: t.src, alt: '', class: t.photo ? 'photo' : 'av', draggable: 'false', onerror: (e) => { e.target.style.visibility = 'hidden'; } })
          : t.img != null ? h('img', { src: (model.sprBase || '') + t.img + '.png', alt: '', draggable: 'false', onerror: (e) => { e.target.style.visibility = 'hidden'; } }) : h('span', { class: 'ph' }, t.trainer ? '🧑' : '？'),
        st.length ? h('span', { class: 'sbadge' }, st.map((k) => { const c = B.STATUS_COLOR[k] || B.STATUS_COLOR.custom; return h('i', { style: { background: c[0], color: c[1] } }, B.SHORT[k] || '＊'); })) : null,
        t.down ? h('span', { class: 'tdown' }, '倒下') : null),
      h('div', { class: 'tn' }, t.name),
      t.hp ? h('div', { class: 'tbar', 'data-part': 'hp' }, h('div', { class: 'thp' }, h('i', { style: { width: t.hp.pct + '%', background: hpColor(t.hp.pct) } })), t.hp.text ? h('span', { class: 'hpt' }, t.hp.text) : null) : null,
      dots,
      t.attached && t.attached.length ? h('div', { class: 'tatt' }, t.attached.map((a) => h('span', { class: 'achip' + (a.rounds === 0 ? ' expired' : ''), 'data-eid': a.id }, a.name + (a.rounds != null ? (a.rounds === 0 ? '·到期' : `·${a.rounds}`) : '')))) : null);
  };

  // model：{ location, sides:[{id,name,color}], tokens:[{id,name,img,src?（自訂圖示網址）,photo?（上傳的照片）,trainer,side,pos,hp:{pct,text?}|null,actions?,down,current,sel?,hidden,status:[kind…],attached:[{id,name,rounds}]}],
  //         effects:[{id,kind,name,rounds,scope,pos,card}], sprBase }
  // opts（有 editable 才能操作）：onTokenMove(id, {side,pos})、onTokenClick(id, part)、onTokenOnToken(fromId, toId)、onSlotPick(slot, anchorEl)、
  //   onSlotItemRounds(effectId, delta)、onSlotItemRemove(effectId)、onCardMove(id, {scope,pos})、onCardClick(id)、onCardRounds(id, delta)、onCardRemove(id)、onBoardDbl({x,y,zone})
  B.render = (model, opts) => {
    opts = opts || {};
    const ed = !!opts.editable;
    const side = Object.fromEntries(model.sides.map((s) => [s.id, s]));
    const col = (id) => (side[id] ? side[id].color : '#8f9aab');
    const board = h('div', { class: 'board' + (ed ? ' ed' : ''), style: { '--g': col('s1'), '--r': col('s2') } });
    // 底圖：戰鬥區、中線、球、球門
    board.append(h('div', { class: 'combat' }, h('div', { class: 'half g' }), h('div', { class: 'half r' }), h('div', { class: 'goal l' }), h('div', { class: 'goal r' }), h('div', { class: 'ball0' }),
      h('div', { class: 'zname g' }, side.s1 ? side.s1.name : '玩家方'), h('div', { class: 'zname r' }, side.s2 ? side.s2.name : '敵方')));
    board.append(h('div', { class: 'wname' }, side.s3 ? side.s3.name + '（場外）' : '中立（場外）'));
    if (model.location) board.append(h('div', { class: 'loc' }, '📍 ' + model.location));

    // 固定格子：有東西時是一個小框，列出每個條目（各自的輪數、−、×）；GM 板上空的格子是一顆淡淡的「＋天氣」。
    // 點格子（不是點 − 或 ×）就打開選項。用 div 而不是 button，避免按下去時位置跳動。
    const slotted = B.slotted(model.effects);
    for (const sl of SLOTS) {
      const list = slotted[sl.id];
      if (!list.length && !ed) continue;
      const pos = { left: sl.x + '%', top: sl.y + '%', maxWidth: sl.w + '%' };
      let el;
      if (!list.length) {
        el = h('div', { class: 'slot3 empty', style: pos, 'data-slot': sl.id, role: 'button', tabindex: '0', title: `設定${sl.label}` }, h('span', { class: 'si' }, sl.icon), '＋' + sl.label);
      } else {
        el = h('div', { class: 'slot3 full' + (ed ? ' click' : ''), style: pos, 'data-slot': sl.id, role: ed ? 'button' : null, tabindex: ed ? '0' : null, title: ed ? `點一下設定${sl.label}` : sl.label },
          h('div', { class: 'sh' }, h('span', { class: 'si' }, sl.icon), h('small', {}, sl.label), ed ? h('span', { class: 'sadd', 'aria-hidden': 'true' }, '＋') : null),
          list.map((e) => h('div', { class: 'sitem' + (e.rounds === 0 ? ' expired' : ''), 'data-eid': e.id, title: e.note || '' },
            h('b', {}, B.effName(e)),
            e.rounds != null ? h('span', { class: 'sr' }, e.rounds === 0 ? '到期' : `${e.rounds} 輪`) : null,
            ed ? h('span', { class: 'cb' },
              e.rounds != null ? h('button', { type: 'button', 'aria-label': `${e.name} 減少一輪`, onclick: (ev) => { ev.stopPropagation(); opts.onSlotItemRounds(e.id, -1); } }, '−') : null,
              h('button', { type: 'button', class: 'cx', 'aria-label': `解除 ${e.name}`, onclick: (ev) => { ev.stopPropagation(); opts.onSlotItemRemove(e.id); } }, '×')) : null)));
      }
      if (ed) {
        const open = () => opts.onSlotPick(sl, el);
        el.addEventListener('click', (ev) => { if (ev.target.closest('.cb')) return; open(); });
        el.addEventListener('dblclick', (ev) => ev.stopPropagation());
        el.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === el) { ev.preventDefault(); open(); } });
      }
      board.append(el);
    }

    // 自由卡片（不在固定格子的條目）
    const cardIdx = {};
    const inSlot = new Set(Object.values(slotted).flat());
    for (const e of model.effects) {
      if (inSlot.has(e)) continue;
      if (e.scope !== 'field' && !side[e.scope]) continue; // 附在棋子身上的，畫在棋子上
      const sc = e.scope === 'field' ? 's3' : e.scope;
      let pos = e.pos;
      if (!pos) { const i = cardIdx[sc] = (cardIdx[sc] == null ? 0 : cardIdx[sc] + 1); pos = autoPos(MAIN.includes(sc) ? sc : 's3', i, 'card'); }
      const card = h('div', { class: 'card' + (e.rounds === 0 ? ' expired' : ''), 'data-id': e.id, style: { left: pos.x + '%', top: pos.y + '%', '--side': sc === 's3' ? '#8f9aab' : col(sc) }, title: e.note || '' },
        h('b', {}, B.effName(e)), e.rounds != null ? h('small', {}, e.rounds === 0 ? '到期' : `${e.rounds} 輪`) : null,
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
    const extras = model.sides.filter((s) => !MAIN.includes(s.id));
    const dropTok = (t) => (d) => {
      if (d.token && opts.onTokenOnToken) return opts.onTokenOnToken(t.id, d.token);
      if (d.strip) return opts.onTokenMove(t.id, { side: d.strip, pos: null });
      if (!d.inside) return;
      opts.onTokenMove(t.id, { side: B.zoneAt(d.x, d.y), pos: { x: d.x, y: d.y } });
    };
    const clickTok = (t) => (ev) => opts.onTokenClick(t.id, ev && ev.target && ev.target.closest && ev.target.closest('[data-part="hp"]') ? 'hp' : null);
    for (const t of model.tokens) {
      if (!MAIN.includes(t.side)) continue;
      let pos = t.pos;
      if (!pos) { const i = tokIdx[t.side] = (tokIdx[t.side] == null ? 0 : tokIdx[t.side] + 1); pos = autoPos(t.side, i, 'tok'); }
      else tokIdx[t.side] = (tokIdx[t.side] == null ? 0 : tokIdx[t.side] + 1);
      const tok = B.token(Object.assign({ color: col(t.side) }, t), model, false);
      tok.style.left = pos.x + '%'; tok.style.top = pos.y + '%';
      if (ed) draggable(tok, board, t.id, dropTok(t), clickTok(t));
      board.append(tok);
    }
    if (ed && opts.onBoardDbl) {
      board.addEventListener('dblclick', (e) => {
        if (e.target.closest('.tok,.card,.slot3,button,input,select')) return;
        const r = board.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * 100, y = (e.clientY - r.top) / r.height * 100;
        opts.onBoardDbl({ x: clamp(x, 3, 97), y: clamp(y, 4, 96), zone: B.zoneAt(x, y) });
      });
    }

    const wrap = h('div', { class: 'boardwrap' }, h('div', { class: 'boardscroll' }, board));
    // 額外的側：在戰場圖下面各一條，棋子拖進去就換成那一側
    if (extras.length) {
      const strips = h('div', { class: 'strips' });
      for (const s of extras) {
        const strip = h('div', { class: 'strip', 'data-side': s.id, style: { borderColor: s.color } }, h('span', { class: 'sname', style: { background: s.color } }, s.name));
        for (const t of model.tokens.filter((x) => x.side === s.id)) {
          const tok = B.token(Object.assign({ color: s.color }, t), model, true);
          if (ed) draggable(tok, board, t.id, dropTok(t), clickTok(t));
          strip.append(tok);
        }
        strips.append(strip);
      }
      wrap.append(strips);
    }
    return wrap;
  };

  root.PKBoard = B;
})(window);
