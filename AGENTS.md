# AGENTS.md — 附近餐廳推薦系統（luodong-restaurants）

> 機器人開工前先讀完這份檔案。對話：#luodong-restaurants。記憶標籤：〔luodong-restaurants〕。

## 這個專案在做什麼
使用者選一個地點（本地鄉鎮市區搜尋、選用的 Google 地址搜尋或目前位置），系統抓附近 Google Maps 上的餐廳星數與資訊，提供地圖、分類／評分／距離／價位篩選與排序、人氣排序、搜尋半徑、載入更多、收藏、抽 5 家候選，點擊可直連 Google 地圖。名稱沿用「羅東」，但已不限羅東。

## 技術
- 後端 `backend/`：Node.js + Express（port 3002），用 Google Places API (New) 依座標抓資料並快取；測試 Jest（會 mock Google API）
- 前端 `frontend/`：React + Vite，Google Maps JavaScript API；測試 Vitest
- 地點清單：`frontend/src/data/taiwan-districts.json`（全台 368 個鄉鎮市區中心點，政府開放資料，經 npm `taiwan-atlas` 整理），不呼叫外部 API
- 部署：Render 免費方案（`render.yaml`），Node 22；CI：`.github/workflows/ci.yml`（後端測試、前端測試與 build、Render build smoke test）

## 建置與測試
```bash
cd backend && npm install && npm test
cd frontend && npm install && npm test && npm run build
```

## 專屬規則
- 金鑰放 `backend/.env`、`frontend/.env`（Render 上設 `GOOGLE_MAPS_API_KEY`、`VITE_GOOGLE_MAPS_API_KEY`），不進 repo。
- 舊版 Places API 不能用，只用 Places API (New)。免費 API 有每日上限，所以地點以本地清單為主，Google 地址搜尋只是預設收合的選用入口，額度用完不能影響主流程。
- 預設半徑 1000m（舊 `radius=4000` 連結仍要能用）；評分低於 3.0 不顯示。
- 收藏存在 localStorage，不存距離與營業狀態這類會變的資料。
- 前端改動要經 Rigel 在瀏覽器實測，包含 390px 窄螢幕與鍵盤操作。
- Jonathan 有在 Render 上實測正式網址的習慣；壞掉時先到 Render 回滾上一個部署。

## 目前進度（2026-11-27）
- 已上線；main 為 `d21eb29`（價位篩選與人氣排序修正），Rigel 獨立 QA 五點全 PASS，後端 102/102、前端 168/168。

## 還沒做完的事
- 價位篩選與「人氣」排序尚未在 Render 正式環境用真實 Google 資料確認（QA 用的是假後端），等 Jonathan 實測回覆。
- 前端偶發 1 筆測試失敗（出現過兩次、無法重現），列間歇性待觀察。
## 所有專案共用規則（開工前必讀）

- 一律用繁體中文、白話回覆 Jonathan。
- 所有檔案、終端機與 git 工作都在 Local VM 的 `/home/cua/workspace` 進行（只有這個資料夾會保留）；不要動 Jonathan Mac 本機上的檔案。改完 commit 並 push。
- 一個專案一個對話：這個專案的工作只在它自己的「#專案名」對話裡進行，不要混到別的專案；記憶裡屬於本專案的內容開頭標「〔專案名〕」。
- 團隊流程：Ada 寫開工說明 → Atlas 審設計並簽核 → Lin（後端）／Pixel（前端）實作 → 需要時 Lin 做安全檢查 → Rigel 獨立 QA → Ada 整合簽核並回報 Jonathan。Ada 是 Tech Lead，不自己改程式。
- 任何使用者看得到的改動都要經過 Rigel 獨立 QA，實作者自己跑測試不算完成。
- 金鑰、密碼、token 一律不進 repo、不貼聊天；GitHub token 用完請 Jonathan 撤銷。
