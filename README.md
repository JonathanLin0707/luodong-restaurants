# 附近餐廳推薦系統

依使用者選定的地點（本地鄉鎮市區搜尋、選用的 Google 地址搜尋或目前位置），抓取附近 Google Maps 上的餐廳星數與資訊，提供地圖顯示、分類／最低評分／價位篩選、依星數／距離／人氣（評論數）排序、只看營業中、搜尋半徑調整、載入更多（最多 3 頁 60 筆）、收藏、抽 5 家候選、點擊直連 Google 地圖。評分低於 3.0 的店家不顯示。

## 架構

```
luodong-restaurants/
├── backend/   Express API，預設 port 3002，依 lat/lng 用 Google Places API (New) 抓資料並快取
└── frontend/  React + Vite，Google Maps JavaScript API 地圖 + 清單 + 地點選擇（本地鄉鎮市區搜尋為主，Google PlaceAutocompleteElement 為選用的地址/地標搜尋）
```

地點選擇欄位的主要輸入是**本地搜尋**：資料來自 `frontend/src/data/taiwan-districts.json`（全台 368 個鄉鎮市區中心點，見該檔與 `scripts/build-districts.mjs` 的來源說明），不呼叫任何外部 API，因此不受 Google Places Autocomplete 每日配額限制影響。Google 地址/地標搜尋收在「用地址或地標搜尋（Google，選用）」這個預設收合的區塊裡，沒有金鑰、額度用完或載入失敗時都不影響本地搜尋。

## 事前準備：Google Maps Platform API 金鑰

前端與後端各需要一支 API 金鑰，啟用的項目不同：

- **前端**（`frontend/.env`）需要啟用：
  - **Maps JavaScript API**（顯示地圖）
  - **Places API (New)**（選用的「用地址或地標搜尋」欄位用新版 `google.maps.places.PlaceAutocompleteElement`，走 Places API (New)；較新建立的 Google Cloud 專案通常已無法啟用舊版 Places API，不受影響。這支 API 每日呼叫次數有配額限制，用完時該欄位會載入失敗，但不影響主要的本地鄉鎮市區搜尋）
- **後端**（`backend/.env`）需要啟用：
  - **Places API (New)**（依座標抓附近餐廳）

金鑰分別放進 `backend/.env` 與 `frontend/.env`（見下方），**不要**提交到版本控制。

## 後端

```bash
cd backend
npm install
npm start          # http://localhost:3002
npm test           # Jest（測試會 mock 掉 Google API，不會真的打 API）
```

`backend/.env`：

```
GOOGLE_MAPS_API_KEY=你的金鑰
PORT=3002
FRONTEND_ORIGIN=http://localhost:5173
```

| 變數 | 說明 | 預設值 |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Places API (New) 金鑰（必填） | — |
| `PORT` | 伺服器 port | `3002` |
| `FRONTEND_ORIGIN` | CORS 允許來源，逗號分隔 | `http://localhost:5173` |

### API

每個端點都要帶地點座標；`lat`/`lng` 必填，`radius` 選填（公尺，範圍 `100`～`10000`，預設 `1000`；超出範圍或不是數字時用預設值）。同一個地點（依 `lat`/`lng`/`radius`，以及 `pages` 大於 1 時的頁數組成快取鍵）24 小時內會直接用快取，超過才會重新呼叫 Google Places API。

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/health` | 健康檢查 |
| GET | `/api/restaurants?lat=<number>&lng=<number>&radius=<meters>&pages=1-3&category=<string>&minRating=<number>&priceLevel=0-4&sort=rating|distance|popular&openNow=1` | 該地點附近的餐廳清單。`pages`：抓幾頁（每頁最多 20 筆，上限 3 頁）；`category`、`priceLevel` 可用逗號帶多個值（任一符合即可，`priceLevel` 0＝免費、1～4＝便宜到很貴）；`minRating`：最低星數；`sort=rating` 依星數高到低、`sort=distance` 依距離由近到遠、`sort=popular` 依評論數多到少（同數再比星數）；`openNow=1` 只看營業中。篩選與排序都在快取之後做，不會多打 Google API |
| GET | `/api/categories?lat=<number>&lng=<number>&radius=<meters>` | 該地點快取中出現過的分類清單 |
| POST | `/api/restaurants/refresh?lat=<number>&lng=<number>&radius=<meters>` | 強制重新呼叫 Google Places API 更新該地點的快取，**會產生 Google API 費用，請手動觸發，不要排程頻繁呼叫** |

資料抓取範圍：以指定座標為圓心、依 `radius` 做 Nearby Search，每頁最多 20 筆，依 `pages` 最多接著抓到第 3 頁（Google 沒有下一頁時就停）。分類是先比對店名關鍵字，比對不到再用 Google 回傳的 `types` 欄位輔助判斷，兩者都沒命中才歸類「其他」——這是啟發式規則，不保證 100% 準確。

## 前端

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173，/api 透過 Vite proxy 轉送到後端 3002
npm test           # Vitest（測試會 mock 掉 API 呼叫與 Google Maps script 載入）
npm run build       # 產出 dist/
```

`frontend/.env`：

```
VITE_GOOGLE_MAPS_API_KEY=你的金鑰
```

`VITE_` 開頭的變數會被 Vite 自動注入 `import.meta.env`，用來載入 Google Maps JavaScript API。

## 使用流程

1. 啟動後端與前端（見上方指令）。
2. 開啟 `http://localhost:5173`，先在「地點」欄位輸入縣市或鄉鎮市區（例如「羅東」「信義」），從下拉選單選一個，或點「使用目前位置」；也可以展開「用地址或地標搜尋（Google，選用）」用 Google 搜尋地址或地標。
3. 選定地點後，前端才會帶該地點的 `lat`/`lng` 呼叫後端，後端若該地點快取已過期（超過 24 小時）或是第一次查詢，會即時呼叫 Google Places API 抓資料並快取；地圖與清單才會顯示該地點附近的餐廳資料。
4. 換一個地點會重新走一次上述流程；原本選擇的分類若新地點沒有，會自動重置為「全部分類」。
5. 清單上方可以調整「搜尋半徑」、分類、價位與排序（含「依人氣（評論數多到少）」）；查詢條件會同步到網址，重新整理或分享連結會保留。改任何條件都會回到第 1 頁。
6. 清單底部的「載入更多」會多抓一頁，最多到第 3 頁。
7. 每張卡片可以「☆ 收藏」，收藏存在瀏覽器的 localStorage（存店名、星數、評論數、地址、分類、價位與地圖連結，不存距離與營業狀態這類會變的資料），重新整理後仍在。

## 安裝成 App（PWA）

網站可以像 App 一樣裝到手機主畫面或電腦（需 https，Render 正式網址符合；本機 `localhost` 也可以）。

- **Android / 桌機 Chrome、Edge**：頁首出現「安裝成 App」按鈕時點它；或用網址列右側的安裝圖示、選單裡的「安裝應用程式／加到主畫面」。已安裝或瀏覽器不支援時，按鈕不會出現。
- **iPhone / iPad（Safari）**：iOS 不支援安裝按鈕，請點 Safari 的「分享」→「加入主畫面」。

說明：
- 只快取離線頁（`/offline.html`）、帶 hash 的 `/assets/*`、圖示與 manifest；`/api/*` 與 Google Maps 等外部請求一律不快取，餐廳資料永遠是最新的。斷網時開啟會看到「目前沒有網路，連線後才能查附近餐廳。」頁面。
- `frontend/public/sw.js` 裡的 `__SW_VERSION__` 在 `npm run build` 時自動換成 `RENDER_GIT_COMMIT`（本機為建置時間），每次部署都會清掉舊快取；不要手改。開發模式（`npm run dev`）與測試不註冊 service worker。
- 後端對 `/sw.js`、`/manifest.webmanifest` 送 `Cache-Control: no-cache`，`/assets/*` 送一年 immutable；帶副檔名但不存在的路徑（例如 `/not-exist.png`）回 404，不回首頁。
- 圖示原始檔：`frontend/public/icons/icon.svg`、`icon-maskable.svg`；PNG 已產生好放在同資料夾（192、512、512 maskable、180 apple-touch-icon），不需要額外轉換工具。

### 回退預案（PWA 出問題時）

**不能只刪掉 `sw.js`**：已安裝的 service worker 會繼續控制使用者的頁面。要部署一個「自我解除」版本的 `frontend/public/sw.js` 取代它：

```js
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((client) => client.navigate(client.url))),
  )
})
```

部署後使用者下次開網站就會清掉快取並解除註冊。之後可另外移除 `main.jsx` 裡的 `registerServiceWorker()`。

## 部署到 Render（單一服務）

這個專案改成「單一 Node 服務」部署：後端 Express 在所有 `/api` 路由之後，也會把前端 build 出來的 `frontend/dist` 當成靜態檔案服務（非 `/api` 的路徑一律回 `index.html`，讓前端的路由自己接手；未知的 `/api/*` 路徑則回 JSON 404）。本機開發時 `frontend/dist` 通常不存在，後端會自動跳過靜態服務，不影響 Vite 5173 + 後端 3002 的 proxy 開發模式。

### 步驟

1. **把專案推上 GitHub**（這一步由你自己處理，不透過這裡）。
2. 到 [Render Dashboard](https://dashboard.render.com/)：
   - 若要用 Blueprint（推薦）：New → Blueprint → 選剛推上去的 repo，Render 會讀取根目錄的 `render.yaml` 自動建立一個 Free 方案的 Web Service。
   - 或手動建立：New → Web Service → 選 repo，設定：
     - Build Command：`npm --prefix backend install --omit=dev && npm --prefix frontend install --include=dev && npm --prefix frontend run build`
     - Start Command：`node backend/src/server.js`
     - Health Check Path：`/api/health`
     - Plan：Free

   前端 build 需要 devDependencies（vite 本身就是 devDependency），Render 的 build 階段常以 `NODE_ENV=production` 執行，`npm install` 預設會跳過 devDependencies 導致 build 失敗，所以 frontend 那段用 `--include=dev` 強制安裝；backend 不需要 devDependencies，用 `--omit=dev` 省掉不必要的安裝。
3. 在該 Web Service 的 Environment 設定兩個環境變數（`render.yaml` 已標記為 `sync: false`，需要自己在 Render 介面輸入）：
   - `GOOGLE_MAPS_API_KEY`：後端用的 Places API (New) 金鑰。
   - `VITE_GOOGLE_MAPS_API_KEY`：前端瀏覽器用的 Maps JavaScript API 金鑰（build 時會被內嵌進前端程式碼，所以改了這個值要重新 Deploy 才會生效）。
4. 部署完成後，Render 會給一個網址，例如 `https://luodong-restaurants.onrender.com`。把這個網址加到 `VITE_GOOGLE_MAPS_API_KEY` 那支金鑰的 **HTTP referrer** 允許清單裡（Google Cloud Console → API 和服務 → 憑證），否則前端地圖會因為網域未授權而載入失敗。
5. 用手機或電腦開這個網址，就可以直接用；不需要另外啟動前端。

### 已知限制（Free 方案）

- **會 idle sleep**：免費方案閒置一段時間後會進入休眠，下次有請求進來時才會喚醒，第一次請求可能會等個十幾秒到幾十秒。
- **檔案系統是暫時的**：後端的快取檔 `backend/data/restaurants.json` 存在服務的本機磁碟上，服務重啟或從 sleep 喚醒時檔案系統會被重置，快取會清空（之後重新查詢時會再次呼叫 Google Places API 重建快取，行為正常、不是 bug）。
