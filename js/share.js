// 玩家看板分享：把「過濾後的快照」（pkr-view/1）存到 Firebase Realtime Database 的 trackers/{id}。
// GM 備註、隱藏的參戰者、後備、不公開的條目、不該給玩家看的 HP 都不會上傳。
// 只有建立者（匿名 uid）能更新或刪除；玩家用連結讀取，不需登入。
// Firebase 以動態 import 載入，所以沒有分享時完全不會連線，用 file:// 開啟也能用。
(function (root) {
  'use strict';
  const F = root.PKF, R = root.PKR;
  const SH = {};
  const VER = '10.12.2';
  const CFG = {
    apiKey: 'AIzaSyC5za4VacV_u0GWw5nKczafpShNpVgnpzs',
    authDomain: 'pokerole-battle.firebaseapp.com',
    databaseURL: 'https://pokerole-battle-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'pokerole-battle',
    storageBucket: 'pokerole-battle.firebasestorage.app',
    messagingSenderId: '1021588929953',
    appId: '1:1021588929953:web:92999662e3489896f91fe0',
  };
  // 玩家看板網址（file:// 或本機開啟時，連結用這個正式網址）
  SH.HOSTED = 'https://bpmw0711.github.io/pokerole-tracker/';
  SH.CFG = CFG;
  SH.VER = VER;
  const KEY = 'pkr-tracker-share/1';

  SH.saved = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const setSaved = (v) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* 略 */ } };

  SH.linkFor = (id) => {
    // 網頁是用網址開的就用同一個資料夾；用檔案（file://）開的話，玩家打不開本機檔，改用正式網址
    const base = location.protocol.startsWith('http') ? location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '') : SH.HOSTED;
    return base + 'view.html#' + id;
  };

  // ───────── 快照 ─────────
  const pub = (e) => !e.hidden;
  SH.snapshot = (S) => {
    const sideById = Object.fromEntries(S.sides.map((s) => [s.id, s]));
    const visible = S.order.map((id) => S.combatants.find((c) => c.id === id)).filter((c) => c && !c.benched && !c.hidden);
    const eff = (e) => Object.assign({ id: e.id, name: e.name, kind: e.kind, rounds: e.rounds, card: !!e.card, pos: e.pos || null }, e.layers > 1 ? { layers: e.layers } : {});
    const list = visible.map((c) => {
      const sd = sideById[c.side] || S.sides[0];
      const mode = c.hpMode || sd.hp || 'bar';
      const max = Math.max(1, R.maxHp(c, S.settings)), cur = Math.max(0, c.state.hp);
      const o = {
        id: c.id, name: c.character.name || F.charName(root.PKDB, c.character), side: c.side, owner: c.owner || '', pos: c.pos || null,
        trainer: c.character.kind === 'trainer', down: R.isDown(c),
        status: c.state.status.map((st) => ({ kind: st.kind, level: st.level, rounds: st.rounds, note: st.kind === 'custom' ? st.note : '' })),
        mods: F.STAT_KEYS.filter((k) => c.state.mods[k]).map((k) => ({ stat: k, v: c.state.mods[k] })),
        actionCount: c.state.actionCount, mark: c.state.turnMark,
        effects: S.effects.filter((e) => e.scope === c.id && pub(e)).map(eff),
        hp: { mode },
      };
      const x = R.dex(c); if (x) o.img = x.img;
      if (mode === 'exact') { o.hp.cur = cur; o.hp.max = max; } else if (mode === 'bar') o.hp.pct = Math.min(100, Math.round(cur / max * 100));
      return o;
    });
    return {
      schema: 'pkr-view/1', title: S.title || '', round: S.round, location: S.field.location || '', turn: S.turn.combatant && visible.some((c) => c.id === S.turn.combatant) ? S.turn.combatant : null,
      sides: S.sides.map((s) => ({ id: s.id, name: s.name, color: s.color })),
      effects: S.effects.filter((e) => (e.scope === 'field' || sideById[e.scope]) && pub(e)).map((e) => Object.assign(eff(e), { scope: e.scope })),
      order: list.map((o) => o.id), list,
    };
  };

  // ───────── Firebase ─────────
  let fb = null;
  async function load() {
    if (fb) return fb;
    const base = `https://www.gstatic.com/firebasejs/${VER}/`;
    const [app, auth, db] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-database.js')]);
    const a = app.initializeApp(CFG, 'tracker');
    const au = auth.getAuth(a);
    await auth.setPersistence(au, auth.browserLocalPersistence);
    const cred = au.currentUser ? { user: au.currentUser } : await auth.signInAnonymously(au);
    fb = { db: db.getDatabase(a), m: db, uid: cred.user.uid };
    return fb;
  }
  const newId = () => {
    const A = '23456789abcdefghijkmnpqrstuvwxyz';
    return Array.from({ length: 10 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  };
  const friendly = (e) => (/PERMISSION_DENIED|permission/i.test(e.message || '') ? '沒有權限：可能是 Firebase 規則還沒加上 trackers 區塊，或這個連結不是用這台瀏覽器建立的。' : e.message || String(e));

  SH.status = { id: null, last: null, error: null, busy: false };
  const st = SH.status;
  const saved = SH.saved();
  if (saved && saved.id) st.id = saved.id;

  SH.create = async (S) => {
    const { db, m, uid } = await load();
    st.busy = true;
    try {
      for (let t = 0; t < 5; t++) {
        const id = newId();
        const r = await m.runTransaction(m.ref(db, 'trackers/' + id), (cur) => (cur === null ? { owner: uid, created: Date.now(), updated: Date.now(), view: JSON.stringify(SH.snapshot(S)) } : undefined));
        if (r.committed) { st.id = id; st.last = new Date(); st.error = null; setSaved({ id }); return id; }
      }
      throw new Error('建立連結失敗，請再試一次');
    } catch (e) { st.error = friendly(e); throw new Error(st.error); } finally { st.busy = false; }
  };
  SH.push = async (S) => {
    if (!st.id) return;
    const { db, m } = await load();
    try {
      await m.update(m.ref(db, 'trackers/' + st.id), { view: JSON.stringify(SH.snapshot(S)), updated: Date.now() });
      st.last = new Date(); st.error = null;
    } catch (e) { st.error = friendly(e); throw new Error(st.error); }
  };
  SH.stop = async () => {
    if (!st.id) return;
    const { db, m } = await load();
    try { await m.remove(m.ref(db, 'trackers/' + st.id)); } catch (e) { throw new Error(friendly(e)); }
    st.id = null; st.last = null; st.error = null; setSaved(null);
  };
  SH.forget = () => { st.id = null; st.last = null; st.error = null; setSaved(null); };

  // 每次存檔後呼叫；稍微等一下再送，避免連續修改時一直寫入
  let timer = null;
  SH.schedule = (getS, onDone) => {
    if (!st.id) return;
    clearTimeout(timer);
    timer = setTimeout(() => { SH.push(getS()).then(() => onDone && onDone(), () => onDone && onDone()); }, 900);
  };
  SH.load = load;
  root.PKShare = SH;
})(window);
