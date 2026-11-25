# Pokerole 戰場記錄板

跑團用的戰場記錄工具（GM 專用），加上玩家唯讀看板。像一張紙：所有欄位都能手動改，自動計算只是建議。

## 怎麼用
- **GM 板**：開 `index.html`（直接用檔案開也行，離線可用）。版面：上方行動順序條、中間戰場圖、右邊抽屜、底部回合列。按右上「？」看說明與快捷鍵。
  - 戰場圖：白底，中間左綠右紅。拖動棋子：綠區＝玩家方、紅區＝敵方、白區＝中立；拖到另一個棋子上＝指定傷害目標。棋子上直接看到 HP、狀態、行動點；點血條快速加減 HP。頂部有天氣、場地，綠紅兩區頂部有防護力場、入場危害：點一下出現選項，可以同時放好幾個（光牆＋反射壁、撒菱＋隱形岩…），各自倒數，入場危害可以疊層。雙擊空白處或按「＋ 條目」做自訂卡片，拖到哪裡就在哪裡生效（放到棋子上＝附在他身上）。「清單」模式適合手機。
  - 右邊抽屜：「角色」（HP 滑塊、意志、行動點、異常狀態、能力升降、招式骰池與擲骰、附身條目、GM 備註）、「名單・先攻」（輸入先攻、排序、後備）、「紀錄」。
  - 底部：**✓ 行動了／✗ 保留**（標記並換下一位）、**⏭ 結束本輪**（結算灼傷、中毒、天氣傷害與倒數，可選自動扣 HP，倒下的可收回，行動次數與已用招式歸零）、↶ 復原（寫出最近一步）。快捷鍵 N／H／E。
  - 新增參戰者：快速加入（輸入物種 Enter）、規則站產生器、貼 pokepast／Showdown 文字或角色 JSON、遭遇範本、手動新增。
  - 圖示：點角色面板左上的頭像，可以從 Pokémon Showdown 的訓練家圖挑，或上傳自己的圖片（寶可夢也能換）。
  - 存檔（匯出／匯入、自動存在瀏覽器）、「📋 Discord」複製戰況文字、設定（側的名稱顏色、雙防規則，預設選項 2）。
- **玩家看板**：GM 按「分享給玩家」建立連結，玩家開 `view.html#代碼` 即時看到狀態（唯讀、免登入）。GM 備註、隱藏的參戰者、後備、不公開的條目不會上傳。

## 資料格式
見 [docs/data-format.md](docs/data-format.md)。場次存檔 `pkr-session/1`、角色 `pkr-character/1`（訓練家與寶可夢共用，之後角色卡也用同一格式）、看板快照 `pkr-view/1`。

## 開發
- 沒有建置步驟，全部是一般 script，直接開檔案或用任何靜態伺服器。
- `js/format.js`（格式與轉換）、`js/rules.js`（骰池、相剋、戰鬥輪結束）、`js/app.js`（GM 畫面）、`js/share.js`（Firebase 分享）、`js/view.js`（玩家看板）、`js/board.js`＋`css/board.css`（戰場圖，GM 板與玩家看板共用）。外觀：`css/theme-hoenn.css`（豐緣配色，放最後覆蓋）；`css/tracker.css` 的 class 都用 `tk-` 開頭，避免和從對戰網頁複製的 `css/base.css` 撞名。
- `js/pkcore.js` 是規則站 `site/assets/pkcore.js` 的複製品；`data/db.js` 由 `tools/build-db.mjs` 從對戰網頁的 `db.json` 產生。更新後執行 `tools/sync-pkcore.bat`。
- Firebase：沿用 `pokerole-battle` 專案，資料放在 `trackers/{id}`，規則見 `docs/firebase-rules.json`。

## 發布（GitHub Pages）
儲存庫 Settings → Pages → Source 選 `main` 分支、`/ (root)`。網址 `https://bpmw0711.github.io/pokerole-tracker/`。
