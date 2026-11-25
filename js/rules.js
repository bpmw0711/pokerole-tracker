// 規則計算：最大 HP、能力值、命中與傷害骰池、相剋、戰鬥輪結束效果。
// 這些都只是「算給 GM 看」的建議，不會限制任何手動輸入。
(function (root) {
  'use strict';
  const F = root.PKF;
  const R = {};
  const DB = () => root.PKDB;

  const ATTR_ZH2KEY = { 力量: 'str', 靈巧: 'dex', 體魄: 'vit', 特殊: 'spe', 洞察: 'ins', 強壯: 'tough', 帥氣: 'cool', 美麗: 'beauty', 可愛: 'cute', 聰明: 'clever', 意志: 'will' };
  const SKILL_ZH2KEY = {};
  Object.keys(F.SK_ZH).forEach((k) => { SKILL_ZH2KEY[F.SK_ZH[k]] = k; });

  R.isTrainer = (c) => c.character.kind === 'trainer';
  R.dex = (c) => {
    const ch = c.character;
    if (ch.kind !== 'pokemon') return null;
    const i = F.dexIndex(DB(), ch.species, ch.num);
    return i < 0 ? null : DB().dex[i];
  };
  R.types = (c) => (c.character.override && c.character.override.types) || (R.dex(c) ? R.dex(c).ty : []);
  R.rank = (c) => c.character.rank || 1;
  const master = (c) => (R.rank(c) >= 7 ? 3 : 0);

  R.base = (c, k, settings) => {
    const a = c.character.attr || {};
    if (k === 'def') return a.vit || 0;
    if (k === 'spdef') return settings.defMode === 2 ? a.ins || 0 : a.vit || 0;
    return a[k] || 0;
  };
  // 現在的能力值：原值＋手動升降＋麻痺（靈巧 −2）＋大師級防禦加成
  R.stat = (c, k, settings) => {
    let v = R.base(c, k, settings) + ((c.state.mods && c.state.mods[k]) || 0);
    if (k === 'dex' && c.state.status.some((s) => s.kind === 'para')) v -= 2;
    if ((k === 'def' || k === 'spdef') && R.rank(c) >= 7) v += 3;
    return Math.max(0, v);
  };
  R.maxHp = (c, settings) => {
    const o = c.character.override && c.character.override.maxHp;
    if (o != null && o !== '') return +o;
    const a = c.character.attr || {};
    const hpAttr = settings.defMode === 2 && settings.hpStat === 'ins' ? a.ins || 0 : a.vit || 0;
    const base = R.isTrainer(c) ? 4 : (R.dex(c) ? R.dex(c).hp || 0 : 0);
    return base + hpAttr + master(c);
  };
  R.maxWill = (c) => ((c.character.attr || {}).ins || 0) + 3 + master(c);
  R.isDown = (c) => !!c.state.fainted || c.state.hp <= 0;
  R.pain = (c, settings) => {
    const max = R.maxHp(c, settings), hp = c.state.hp;
    if (hp <= 1) return 2;
    return hp <= Math.floor(max / 2) ? 1 : 0;
  };

  // ───────── 招式 ─────────
  function parsePool(s) {
    if (!s) return null;
    s = String(s).replace(/\s+/g, '');
    if (/[*＊]/.test(s)) return null;
    const parts = s.split('+');
    if (parts.length > 2) return null;
    const attrs = parts[0].split('/').map((x) => ATTR_ZH2KEY[x]);
    if (!attrs.length || attrs.some((x) => !x)) return null;
    let skills = [];
    if (parts[1] !== undefined) {
      skills = parts[1].split('/').map((x) => SKILL_ZH2KEY[x]);
      if (skills.some((x) => !x)) return null;
    }
    return { attrs, skills };
  }
  R.parsePool = parsePool;

  R.moveInfo = (key) => {
    const m = DB().moves[key];
    if (!m) return null;
    const en = m.en || '';
    const cat = { 物理: 'phys', 特殊: 'spec' }[m.c] || 'status';
    const tags = [];
    const re = en.match(/(Late )?Reaction (\d+)/);
    if (re) tags.push((re[1] ? '後制反應 ' : '先制反應 ') + re[2]);
    const la = en.match(/Low Accuracy (\d+)/i);
    if (la) tags.push('低命中 −' + la[1]);
    if (/High Critical/i.test(en)) tags.push('高要害率');
    if (/Never Miss/i.test(en)) tags.push('必中');
    if (/Ignore Defenses/i.test(en)) tags.push('無視防禦');
    if (/Charge Move/i.test(en)) tags.push('蓄力');
    if (/Must Recharge/i.test(en)) tags.push('重新充能');
    if (/Successive Actions/i.test(en)) tags.push('連續行動');
    else if (/Triple Action/i.test(en)) tags.push('三連行動');
    else if (/Double Action/i.test(en)) tags.push('二連行動');
    if (/Area Move/i.test(en)) tags.push('範圍');
    if (/Priority/i.test(en)) tags.push('先制');
    let dmg = null;
    if (cat !== 'status' && m.d && !/^[-—]$/.test(String(m.d).trim())) {
      const mm = String(m.d).replace(/\s+/g, '').match(/^([^+]+)\+(\d+)(\*+)?$/);
      const attrs = mm ? mm[1].split('/').map((x) => ATTR_ZH2KEY[x]) : [];
      if (mm && attrs.length && !attrs.some((x) => !x)) dmg = { attrs, power: parseInt(m.p, 10) || parseInt(mm[2], 10) || 0, star: !!mm[3] };
      else dmg = { manual: true };
      if (/Fixed Damage|定傷/.test(en + m.d)) dmg = { manual: true };
    }
    return {
      key, zh: m.z || key, type: m.t === '無' || !m.t ? null : m.t, cat, power: m.p, accText: m.a, dmgText: m.d,
      acc: parsePool(m.a), dmg, tags, ignoreDef: /Ignore Defenses/i.test(en), lowAcc: la ? +la[1] : 0,
      reaction: re ? { late: !!re[1], num: +re[2] } : null, text: m.e || '',
    };
  };

  // 取較高的能力值與技能組成骰池
  function best(c, spec, settings) {
    const attrKey = (k) => (k === 'will' ? null : k);
    let av = -1, an = '', bonus = 0;
    for (const k of spec.attrs) {
      const v = k === 'will' ? R.maxWill(c) : F.SOC.includes(k) ? (c.character.social || {})[k] || 0 : R.stat(c, attrKey(k), settings);
      if (v > av) { av = v; an = k === 'will' ? '意志' : F.SOC_ZH[k] || F.ATTR_ZH[k]; }
    }
    let sv = 0, sn = '';
    for (const k of spec.skills) {
      const v = (c.character.skills || {})[k] || 0;
      if (!sn || v > sv) { sv = v; sn = F.SK_ZH[k]; }
    }
    if (spec.skills.length && master(c)) bonus = 2;
    return { av, an, sv, sn, bonus };
  }

  // 命中骰池：{ size, text, need }。need＝下一個行動需要的成功數（行動次數＋1）
  R.hitPool = (c, info, settings) => {
    if (!info.acc) return null;
    const b = best(c, info.acc, settings);
    const size = b.av + b.sv + b.bonus;
    let text = `${b.an} ${b.av}` + (b.sn ? ` ＋ ${b.sn} ${b.sv}` : '') + (b.bonus ? ' ＋ 大師級 2' : '');
    return { size, text, need: (c.state.actionCount || 0) + 1 };
  };

  // 相剋：回傳加減的傷害（免疫為 null）
  R.matchup = (atkType, defTypes) => {
    const CH = DB().chart;
    if (!atkType || !defTypes.length) return { delta: 0, label: '' };
    let n = 0;
    for (const d of defTypes) {
      const c = CH[d];
      if (!c) continue;
      if (c.i.includes(atkType)) return { delta: null, label: '無效' };
      if (c.w.includes(atkType)) n++;
      else if (c.r.includes(atkType)) n--;
    }
    if (n >= 2) return { delta: 2, label: '無比絕佳 +2' };
    if (n === 1) return { delta: 1, label: '效果絕佳 +1' };
    if (n === -1) return { delta: -1, label: '效果不好 −1' };
    if (n <= -2) return { delta: -2, label: '相當不好 −2' };
    return { delta: 0, label: '普通' };
  };

  // 傷害骰池：力量或特殊＋威力＋屬性一致 1 −（目標的）防禦或特防。target 可為 null（不扣防禦）
  R.dmgPool = (c, info, target, settings) => {
    if (!info.dmg) return null;
    if (info.dmg.manual) return { manual: true, text: info.dmgText };
    const b = best(c, { attrs: info.dmg.attrs, skills: [] }, settings);
    const stab = info.type && R.types(c).includes(info.type) ? 1 : 0;
    let def = 0, defName = '';
    if (target && !info.ignoreDef) {
      const k = info.cat === 'spec' ? 'spdef' : 'def';
      def = R.stat(target, k, settings);
      defName = F.ATTR_ZH[k];
    }
    const raw = b.av + info.dmg.power + stab - def;
    const size = Math.max(1, raw);
    let text = `${b.an} ${b.av} ＋ 威力 ${info.dmg.power}` + (stab ? ' ＋ 屬性一致 1' : '') + (target && !info.ignoreDef ? ` － ${target.character.name || '目標'}${defName} ${def}` : '');
    const mu = target && info.type ? R.matchup(info.type, R.types(target)) : null;
    return { size, text, matchup: mu, pain: R.pain(c, settings) };
  };

  // ───────── 戰鬥輪結束 ─────────
  // 回傳 [{ cid, kind, text, dmg }]；dmg 為建議扣的 HP（0 表示只是提醒）
  R.eorItems = (S) => {
    const items = [];
    const weathers = S.effects.filter((e) => e.kind === 'weather' && e.scope === 'field' && e.rounds !== 0).map((e) => e.name || '');
    const sand = weathers.some((n) => /沙/.test(n)), hail = weathers.some((n) => /冰雹/.test(n));
    for (const c of S.combatants) {
      if (c.benched || R.isDown(c)) continue;
      const nm = c.character.name || '（未命名）';
      for (const st of c.state.status) {
        const n = st.n || 0, lv = +st.level || 1;
        if (st.kind === 'burn') items.push({ cid: c.id, sid: st, kind: 'status', text: `${nm}：灼傷 ${lv} 級`, dmg: lv >= 3 ? 3 + n : lv });
        else if (st.kind === 'poison') items.push({ cid: c.id, sid: st, kind: 'status', text: `${nm}：中毒`, dmg: 2 });
        else if (st.kind === 'badPoison') items.push({ cid: c.id, sid: st, kind: 'status', text: `${nm}：劇毒（已 ${n} 輪）`, dmg: 2 + n });
        else if (st.kind === 'flinch') items.push({ cid: c.id, kind: 'note', text: `${nm}：畏縮會在這時消失`, dmg: 0 });
        else if (st.kind === 'freeze') items.push({ cid: c.id, kind: 'note', text: `${nm}：冰凍，可選一個招式打冰塊`, dmg: 0 });
      }
      const ty = R.types(c);
      if (sand && !ty.some((t) => ['岩石', '地面', '鋼'].includes(t))) items.push({ cid: c.id, kind: 'weather', text: `${nm}：沙暴`, dmg: 1 });
      if (hail && !ty.includes('冰')) items.push({ cid: c.id, kind: 'weather', text: `${nm}：冰雹`, dmg: 1 });
    }
    return items;
  };

  root.PKR = R;
})(window);
