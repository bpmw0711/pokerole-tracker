@echo off
rem 把規則站的共用核心（產生器、匯入匯出）複製到這個工具。規則站那份是正本。
copy /Y "%~dp0..\..\site\assets\pkcore.js" "%~dp0..\js\pkcore.js"
rem 資料（招式、圖鑑、特性）由對戰網頁的 db.json 產生：
node "%~dp0build-db.mjs"
pause
