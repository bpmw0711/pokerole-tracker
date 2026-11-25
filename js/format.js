// 資料格式：場次存檔、角色（訓練家與寶可夢）。所有轉換都在這裡，格式說明見 docs/data-format.md。
// 不依賴畫面；寶可夢的規則計算在 rules.js。
(function (root) {
  'use strict';
  const F = {};
  F.CHAR = 'pkr-character/1';
  F.SESSION = 'pkr-session/1';
  F.ATTR = ['str', 'dex', 'vit', 'spe', 'ins'];
  F.ATTR_ZH = { str: '力量', dex: '靈巧', vit: '體魄', spe: '特殊', ins: '洞察', def: '防禦', spdef: '特防' };
  F.SOC = ['tough', 'cool', 'beauty', 'clever', 'cute']; // 順序與規則站相同
  F.SOC_ZH = { tough: '強壯', cool: '帥氣', beauty: '美麗', clever: '聰明', cute: '可愛' };
  F.SK_POKE = ['brawl', 'channel', 'clash', 'evasion', 'alert', 'athletic', 'nature', 'stealth', 'allure', 'etiquette', 'intimidate', 'perform'];
  F.SK_TRAINER = ['brawl', 'channel', 'clash', 'evasion', 'alert', 'athletic', 'nature', 'stealth', 'empathy', 'etiquette', 'intimidate', 'perform', 'crafts', 'lore', 'medicine', 'science'];
  F.SK_ZH = { brawl: '鬥毆', channel: '導引', clash: '對抗', evasion: '閃避', throw: '投擲', alert: '警覺', athletic: '運動', nature: '自然', stealth: '隱匿',
    allure: '魅惑', empathy: '共感', etiquette: '禮儀', intimidate: '威嚇', perform: '表演', crafts: '工藝', lore: '傳聞', medicine: '醫藥', science: '科學' };
  F.STAT_KEYS = ['str', 'dex', 'vit', 'spe', 'ins', 'def', 'spdef'];
  F.STATUS_ZH = { burn: '灼傷', poison: '中毒', badPoison: '劇毒', para: '麻痺', sleep: '睡眠', freeze: '冰凍', confuse: '混亂', flinch: '畏縮', infat: '著迷', disable: '定身法', block: '阻擋', custom: '自訂' };
  F.EFFECT_KIND_ZH = { weather: '天氣', terrain: '場地', forceField: '防護力場', hazard: '入場危害', cover: '掩護', other: '其他' };

  F.uid = (p) => (p || 'x') + Math.random().toString(36).slice(2, 7);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  F.clone = clone;

  F.defaultSides = () => [
    { id: 's1', name: '玩家方', color: '#3b82f6', hp: 'exact' },
    { id: 's2', name: '敵方', color: '#ef4444', hp: 'bar' },
    { id: 's3', name: '中立', color: '#9aa3b2', hp: 'bar' },
  ];

  F.newSession = () => ({
    schema: F.SESSION, title: '', saved: null, round: 1,
    turn: { combatant: null, passStreak: 0 },
    settings: { defMode: 1, hpStat: 'vit', eorAuto: false },
    sides: F.defaultSides(),
    field: { location: '' },
    effects: [], order: [], combatants: [], log: [],
  });

  F.blankState = () => ({
    hp: 0, will: 0, mods: {}, status: [], actionCount: 0, turnMark: null, usedMoves: [],
    init: { roll: null, priority: 0 }, fainted: false,
  });

  F.newCombatant = (character, side, owner) => ({
    id: F.uid('c'), side, owner: owner || '', hidden: false, benched: false, gmNote: '',
    character, state: F.blankState(),
  });

  // 讀進來的存檔補齊缺的欄位，不認得的欄位原樣保留
  F.normalize = (s) => {
    const d = F.newSession();
    s = Object.assign({}, d, s);
    s.settings = Object.assign({}, d.settings, s.settings || {});
    s.turn = Object.assign({}, d.turn, s.turn || {});
    s.field = Object.assign({}, d.field, s.field || {});
    if (!Array.isArray(s.sides) || !s.sides.length) s.sides = F.defaultSides();
    // 戰場圖的三個區域（綠、紅、白）對應 s1、s2、s3，缺的補回去
    F.defaultSides().forEach((d0, i) => { if (!s.sides.some((x) => x.id === d0.id)) s.sides.splice(i, 0, d0); });
    for (const k of ['effects', 'order', 'combatants', 'log']) if (!Array.isArray(s[k])) s[k] = [];
    for (const c of s.combatants) {
      c.state = Object.assign(F.blankState(), c.state || {});
      c.state.init = Object.assign({ roll: null, priority: 0 }, c.state.init || {});
      for (const k of ['status', 'usedMoves']) if (!Array.isArray(c.state[k])) c.state[k] = [];
      if (!c.state.mods || typeof c.state.mods !== 'object') c.state.mods = {};
      if (c.owner == null) c.owner = '';
      if (!c.side || !s.sides.some((x) => x.id === c.side)) c.side = s.sides[0].id;
    }
    return s;
  };

  // ───────── 角色 ─────────
  F.dexIndex = (DB, species, num) => {
    let first = -1;
    for (let i = 0; i < DB.dex.length; i++) {
      if (DB.dex[i].n !== species) continue;
      if (first < 0) first = i;
      if (num == null || DB.dex[i].num === num) return i;
    }
    return first;
  };

  F.blankTrainer = () => ({
    schema: F.CHAR, kind: 'trainer', name: '', player: '', age: '', money: 0, concept: '', nature: '', rank: 1,
    attr: { str: 1, dex: 1, vit: 1, ins: 1 },
    social: { tough: 1, cool: 1, beauty: 1, clever: 1, cute: 1 },
    skills: {}, extra: [], achievements: [], bag: [], note: '', override: { maxHp: null },
  });

  // 規則站產生器的角色卡格式（pkcore 的 s）→ 角色
  F.sheetToChar = (DB, P, s) => {
    const x = DB.dex[s.i];
    const att = {}, soc = {}, sk = {};
    F.ATTR.forEach((k, i) => { att[k] = s.st[i]; });
    F.SOC.forEach((k, i) => { soc[k] = s.so[i]; });
    F.SK_POKE.forEach((k, i) => { sk[k] = s.sk[i] || 0; });
    return {
      schema: F.CHAR, kind: 'pokemon', name: (s.nick || '').trim() || x.z || x.n, species: x.n, num: x.num, rank: s.rank,
      attr: att, social: soc, skills: sk, ability: s.ab || '', item: (s.item || '').trim(), nature: s.na || '',
      loyalty: s.loy, happiness: s.hap, moves: s.mv.slice(0, P.slots(s)).filter(Boolean), note: s.note || '',
      override: { maxHp: null, types: null, free: s.free || undefined },
    };
  };

  // 角色 → 產生器的角色卡格式；找不到物種時回傳 null
  F.charToSheet = (DB, P, c) => {
    const i = F.dexIndex(DB, c.species, c.num);
    if (i < 0) return null;
    const nick = c.name && c.name !== DB.dex[i].z && c.name !== DB.dex[i].n ? c.name : '';
    return {
      i, rank: c.rank || 1, style: 'species', nick, item: c.item || '', note: c.note || '',
      hap: c.happiness ?? 2, loy: c.loyalty ?? 2, free: !!(c.override && c.override.free), mode: 'rank',
      st: F.ATTR.map((k) => (c.attr && c.attr[k]) ?? 0), so: F.SOC.map((k) => (c.social && c.social[k]) ?? 1),
      sk: F.SK_POKE.map((k) => (c.skills && c.skills[k]) || 0),
      mv: (c.moves || []).slice(), ab: c.ability || P.abName(DB.dex[i].ab[0] || ''), na: c.nature || P.NA[0].n,
    };
  };

  // 空白寶可夢（手動新增）：能力值取圖鑑下限，其餘為 0
  F.blankSheet = (DB, P, i, rank) => {
    const x = DB.dex[i];
    return {
      i, rank: rank || 1, style: 'species', nick: '', item: '', note: '', hap: 2, loy: 2, free: false, mode: 'rank',
      st: x.st.map((a) => a[0]), so: [1, 1, 1, 1, 1], sk: F.SK_POKE.map(() => 0), mv: [], ab: P.abName(x.ab[0] || ''), na: P.NA[0].n,
    };
  };

  // 對戰網頁的隊員格式（dex 為索引）→ 角色
  F.fromLegacyMon = (DB, m) => {
    const x = DB.dex[m.dex];
    return {
      schema: F.CHAR, kind: 'pokemon', name: (m.nick || '').trim() || x.z, species: x.n, num: x.num, rank: m.rank,
      attr: Object.assign({}, m.attr), social: Object.assign({}, m.social), skills: Object.assign({}, m.skills),
      ability: m.ability || '', item: m.item || '', nature: m.nature || '', loyalty: m.loyalty, happiness: m.happiness,
      moves: (m.moves || []).slice(), note: m.note || '', override: { maxHp: null, types: null, free: m.free || undefined },
    };
  };

  // 任意 JSON → 角色清單（單一角色、{list}、存檔裡的參戰者都收）
  F.charsFromJSON = (obj) => {
    if (!obj || typeof obj !== 'object') return [];
    if (Array.isArray(obj)) return obj.flatMap(F.charsFromJSON);
    if (obj.schema === F.SESSION) return (obj.combatants || []).map((c) => c.character).filter(Boolean);
    if (Array.isArray(obj.list)) return obj.list.filter((c) => c && c.kind);
    if (obj.kind === 'pokemon' || obj.kind === 'trainer') return [obj];
    return [];
  };

  F.charName = (DB, c) => c.name || (c.kind === 'pokemon' && F.dexIndex(DB, c.species, c.num) >= 0 ? DB.dex[F.dexIndex(DB, c.species, c.num)].z : '（未命名）');

  root.PKF = F;
})(window);
