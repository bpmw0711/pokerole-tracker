# 戰場記錄板：資料格式（v1，2026-11-25）

> 目標：L0（GM 記數板）今天要用，但資料格式從一開始就讓第二段（玩家唯讀看板）、第三段（角色卡檢視器）、規則站與對戰網頁的產生器都能直接讀寫，**所有地方的寶可夢與訓練家都用同一份 JSON 格式**。

## 設計原則

1. **像一張紙。** 任何欄位都能手動改，工具只「算給你看」，不擋你。HP 可以超過上限、行動次數可以超過 5、先攻順序可以任意排、狀態回合可以自己改。自動計算（骰池、戰鬥輪結束扣血）都是建議，GM 可以不理它。
2. **存原始資料，不存算出來的數字。** 最大 HP、防禦、命中與傷害骰池每次載入時由程式算。
3. **名稱用英文原名當鍵**（物種 `Pikachu`、招式 `Thunderbolt`、特性 `Static`），對應 `db.json`。不用索引號，因為資料庫重建後索引會變。物種只有 Nidoran 重名，再附全國圖鑑編號 `num` 區分。
4. **每個檔案有 `schema` 版本字串**；讀到不認得的欄位原樣保留，匯出時寫回去。
5. **場次存檔自給自足**：把角色資料複製進去，不依賴別的檔案。
6. **不透露 GM 的秘密**：玩家看板只上傳過濾後的快照；GM 備註、隱藏的參戰者、敵方精確 HP 不離開 GM 的電腦。

## 三種檔案

| 檔案 | `schema` | 用途 | 階段 |
|---|---|---|---|
| 場次存檔 | `pkr-session/1` | GM 匯出／匯入 | 第一段 |
| 角色 | `pkr-character/1` | 寶可夢或訓練家，玩家角色卡、GM 備團、產生器匯出都用它 | 第一段起 |
| 玩家看板快照 | `pkr-view/1` | GM 上傳 Firebase、玩家讀 | 第二段 |

角色檔可以是單一角色，也可以是 `{ "schema": "pkr-character/1", "list": [ ... ] }`（一整個隊伍）。

## 角色 `pkr-character/1`

```json
{
  "schema": "pkr-character/1",
  "kind": "pokemon",
  "name": "皮卡",
  "species": "Pikachu", "num": 25,
  "rank": 2,
  "attr":   { "str": 2, "dex": 3, "vit": 2, "spe": 2, "ins": 2 },
  "social": { "tough": 1, "cool": 1, "beauty": 1, "cute": 3, "clever": 1 },
  "skills": { "brawl": 0, "channel": 1, "clash": 0, "evasion": 1, "alert": 1, "athletic": 0, "nature": 0, "stealth": 0, "charm": 0, "etiquette": 0, "intimidate": 0, "perform": 0 },
  "ability": "Static",
  "item": "",
  "nature": "",
  "loyalty": 1, "happiness": 1,
  "moves": ["Thunder Shock", "Quick Attack", "Growl"],
  "note": "",
  "override": { "maxHp": null, "types": null }
}
```

- 寶可夢的 `skills` 是 12 項；訓練家另有 `throw`、`empathy`、`crafts`、`lore`、`medicine`、`science` 與 `extra: [{ "name": "", "value": 0 }]`。
- 訓練家 `kind: "trainer"`：`name`、`player`（玩家名）、`age`、`money`、`concept`、`nature`、`achievements: []`、`bag: []`、`rank`、`attr`（無 `spe`）、`social`、`skills`、`note`。
- `override`：GM 想硬改的（自訂最大 HP、特殊屬性）。
- `avatar`（可省略）：自訂圖示。可以是網址（例如 Showdown 的訓練家圖 `https://play.pokemonshowdown.com/sprites/trainers/may-gen3.png`），或上傳的圖片（縮到最長邊 128px 的 `data:` 網址，放在 JSON 裡一起帶走）。沒有時：寶可夢用圖鑑小圖，訓練家用預設人像。
  之後角色卡改成「JSON＋一張圖片」兩個檔案時，`avatar` 改放圖片檔名，讀進來再換成 `data:` 網址即可，其他欄位不變。
- 衍生值（不存）：最大 HP＝基礎 HP＋體魄（大師級 +3）；意志＝洞察＋3；防禦＝體魄、特防＝洞察或體魄（設定決定）；命中與傷害骰池。

## 場次存檔 `pkr-session/1`

```json
{
  "schema": "pkr-session/1",
  "title": "雨中草原遭遇戰",
  "saved": "2026-11-25T12:00:00Z",
  "round": 3,
  "turn": { "combatant": "c2", "passStreak": 0 },
  "settings": { "defMode": 1, "hpStat": "vit", "eorAuto": false },
  "sides": [
    { "id": "s1", "name": "玩家方", "color": "#3b82f6", "hp": "exact" },
    { "id": "s2", "name": "敵方",   "color": "#ef4444", "hp": "bar" },
    { "id": "s3", "name": "中立",   "color": "#9aa3b2", "hp": "bar" }
  ],
  "field": { "location": "常磐森林外的草原" },
  "effects": [
    { "id": "e1", "kind": "weather",    "name": "下雨",     "scope": "field", "rounds": 2,    "note": "" },
    { "id": "e3", "kind": "forceField", "name": "光牆",     "scope": "s1",    "rounds": 2,    "note": "" },
    { "id": "e4", "kind": "hazard",     "name": "撒菱",     "scope": "s2",    "rounds": null, "note": "", "layers": 2 },
    { "id": "e6", "kind": "other",      "name": "火山 5 輪後爆發", "scope": "field", "rounds": 5, "note": "" },
    { "id": "e7", "kind": "other",      "name": "極巨化", "scope": "c1",    "rounds": 3,    "note": "" }
  ],
  "order": ["c2", "c1", "c3"],
  "combatants": [
    {
      "id": "c1", "side": "s1", "owner": "玩家A", "hidden": false, "benched": false, "gmNote": "",
      "character": { "...": "pkr-character/1，整份複製" },
      "state": {
        "hp": 6, "will": 3,
        "mods": { "str": -1, "dex": 0, "vit": 0, "spe": 0, "ins": 0, "def": 0, "spdef": 0 },
        "status": [ { "kind": "burn", "level": 1, "rounds": null, "n": 0, "note": "" } ],
        "actionCount": 1,
        "turnMark": null,
        "usedMoves": ["Thunder Shock"],
        "init": { "roll": 11, "priority": 0 },
        "fainted": false
      }
    }
  ],
  "log": [ { "round": 3, "text": "皮卡 行動", "t": "2026-11-25T12:03:00Z" } ]
}
```

- **側 `sides`**：玩家方／敵方／中立三個預設，GM 可增刪改名改色。`hp` 是玩家看板的預設 HP 顯示（`exact` 數字、`bar` 只有血條、`hidden` 不顯示）。
- **戰場圖與位置**：戰場圖有三個固定區域，綠＝`s1`（玩家方）、紅＝`s2`（敵方）、白＝`s3`（中立／全場）；這三個側不能刪，只能改名改色。參戰者的 `pos`（`{x, y}`，占戰場圖寬高的百分比）記棋子位置，沒有 `pos` 就依順序自動排。拖到哪一區，`side` 就改成那一側。額外新增的側在戰場圖下面有自己的一條，棋子拖進去即可，不記位置。
- **效果條目 `effects`**：天氣、場地、防護力場、入場危害、掩護、GM 自訂事件都是同一種條目。`scope` 是 `field`、某個側 id，或某個參戰者 id（例如極巨化）。`rounds` 為 `null` 表示不倒數。固定格子（天氣、場地在白區頂部；防護力場、入場危害在綠、紅區頂部）＝沒有 `card` 旗標、種類與範圍相符的**所有**條目（可以同時有光牆＋反射壁＋順風、撒菱＋隱形岩，各自倒數；天氣由介面保證同時只有一種）。`layers`（可省略，預設 1）是入場危害疊的層數，顯示成「撒菱 ×2」。`card: true` 的是自由卡片，`pos` 記位置。卡片拖到綠區＝`s1`、紅區＝`s2`、白區＝`field`、放到棋子上＝那位參戰者的 id。
- **先攻順序 `order`**：明確的清單，GM 可以手動調整。「依先攻排序」按鈕才會重排（先制數字大者先，再比先攻骰）。
- **回合標記 `turnMark`**：`null`、`act`（✓ 這回合有行動）、`skip`（✗ 沒行動／保留）。按「下一回合」時，如果是 `act` 就把 `actionCount` +1，然後清掉標記並移到下一位。
- **後備 `benched`**：已收回或尚未上場的參戰者，不在先攻順序與回合指標裡。
- **狀態 `status`**：`kind` 是 `burn`、`poison`、`badPoison`、`para`、`sleep`、`freeze`、`confuse`、`flinch`、`infat`、`disable`、`block` 或 `custom`（用 `note` 寫名稱）。`n` 是已經在戰鬥輪結束結算過幾次（用於三級灼傷與劇毒遞增）。
- **能力升降 `mods`**：單一整數，直接加減在能力值上。
- **每輪一次 `usedMoves`**：招式英文名，含 `Evasion`、`Clash`；「下一輪」時清空。

## 玩家看板快照 `pkr-view/1`（第二段）

`{ schema, title, round, turn, field, effects（只含公開的）, sides, list: [ { name, side, status, actionCount, turnMark, hp: {mode, cur, max} } ], updated }`。隱藏的參戰者、後備、GM 備註不會出現。Firebase 路徑 `trackers/{隨機 ID}`，內容 `{ owner, updated, view }`，`view` 是快照的 JSON 字串。

## 匯入匯出

- **場次存檔**：匯出 `.json`；匯入前確認會覆蓋目前場次。
- **自動儲存**：每次修改寫入瀏覽器 localStorage。
- **角色**：單隻或整隊匯出匯入 `pkr-character/1`；也能讀 pokepast.es／Showdown 文字、pokepast.es 網址。
- **舊格式轉換**：對戰網頁的隊員格式（`dex` 用索引）與規則站產生器的角色卡格式，各有轉換函式（`format.js`）。
- **之後要做**：規則站與對戰網頁的產生器加上「匯出 JSON」，格式就是這份。
