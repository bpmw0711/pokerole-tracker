# Pokerole 戰場記錄板

跑團用的戰場記錄工具（GM 專用），加上玩家唯讀看板。像一張紙：所有欄位都能手動改，自動計算只是建議。

## 怎麼用
- **GM 板**：開 `index.html`（直接用檔案開也行，離線可用）。
  - 戰場：地點、全場條目（天氣、場地、自訂事件，可設剩餘輪數）、各側條目（防護力場、入場危害、掩護）與目標數。
  - 先攻順序：自己填先攻與先制數字，▲▼手動排，或按「依先攻排序」。
  - 參戰者：寶可夢、訓練家，分「側」（預設玩家方／敵方／中立，可在設定增減）。HP、意志、異常狀態（含剩餘輪數）、能力升降、行動計數都能改；展開可看招式、命中與傷害骰池（選目標可扣防禦並顯示相剋）、本輪已用的招式。
  - **下一回合**：目前輪到的人標 ✓ 就行動計數 +1，指標移到下一位。**下一輪**：列出戰鬥輪結束要處理的效果（可選自動扣 HP）、倒數條目 −1、倒下的可收回，行動計數與已用招式歸零。
  - 新增參戰者：規則站的隨機產生器（可一次加多隻）、貼 pokepast／Showdown 文字或角色 JSON、手動新增。
  - 匯出／匯入場次存檔；自動存在瀏覽器；「複製 Discord 文字」；復原／重做。
- **玩家看板**：GM 按「分享給玩家」建立連結，玩家開 `view.html#代碼` 即時看到狀態（唯讀、免登入）。GM 備註、隱藏的參戰者、後備、不公開的條目不會上傳。

## 資料格式
見 [docs/data-format.md](docs/data-format.md)。場次存檔 `pkr-session/1`、角色 `pkr-character/1`（訓練家與寶可夢共用，之後角色卡也用同一格式）、看板快照 `pkr-view/1`。

## 開發
- 沒有建置步驟，全部是一般 script，直接開檔案或用任何靜態伺服器。
- `js/format.js`（格式與轉換）、`js/rules.js`（骰池、相剋、戰鬥輪結束）、`js/app.js`（GM 畫面）、`js/share.js`（Firebase 分享）、`js/view.js`（玩家看板）、`js/board.js`＋`css/board.css`（戰場圖，GM 板與玩家看板共用）。
- `js/pkcore.js` 是規則站 `site/assets/pkcore.js` 的複製品；`data/db.js` 由 `tools/build-db.mjs` 從對戰網頁的 `db.json` 產生。更新後執行 `tools/sync-pkcore.bat`。
- Firebase：沿用 `pokerole-battle` 專案，資料放在 `trackers/{id}`，規則見 `docs/firebase-rules.json`。

## 發布（GitHub Pages）
儲存庫 Settings → Pages → Source 選 `main` 分支、`/ (root)`。網址 `https://bpmw0711.github.io/pokerole-tracker/`。
