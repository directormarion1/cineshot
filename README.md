# CineShot (影鏡) - 商業影視視聽語言智能檢索與分鏡收割庫

> 專為影視廣告導演、攝影指導（DP）、創意總監、企劃提案團隊打造的下一代 **AI 視聽語言拆解、微分鏡檢索與客戶靈感對焦工具**。

[![Railway Deploy](https://img.shields.io/badge/Deploy-Railway-0B0D0E?logo=railway)](https://web-production-cafae.up.railway.app)
[![Google Gemini](https://img.shields.io/badge/AI%20Brain-Google%20Gemini-4285F4?logo=google)](https://ai.google.dev/)
[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?logo=googlechrome)](cineshot-extension/)
[![Python 3.9+](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python)](server.py)

---

## 🎬 專案緣起：它解決什麼痛點？

在傳統廣告導演與影視團隊的工作流程中：
* **傳統找片太慢**：在 YouTube、新片場、Vimeo 搜尋，搜出來的都是整支 1~3 分鐘的長片，導演必須手動快轉拉進度條才能找到那 3 秒鐘心儀的「推鏡頭」或「暗調光影」。
* **語意鴻溝難以對焦**：導演腦海中有畫面（如「兩個人在對峙」、「火花自發光」），客戶或企劃卻難以理解，需要具體的 3 秒鐘參考分鏡（Ref Shot）。
* **收錄手續極其繁瑣**：平時滑網頁看到好的廣告片，手動下載、剪輯、轉檔、打標籤往往耗費數小時。

**CineShot（影鏡）將全鏈路完全打通**：
看到好片按一下鍵盤 `Alt + S` ➔ 雲端 AI 視覺大腦自動逐幀解析 ➔ 拆解為 3~5 秒黃金分鏡並提煉 11 個專業視聽參數 ➔ 導演輸入一句行話即可精準搜尋、一鍵加入提案畫布！

---

## 🌟 四大核心系統架構

```
                           【 CineShot 全鏈路閉環架構 】

   ┌─────────────────────────────────────────────────────────────┐
   │ 1. 全網一鍵採集 (Capture)                                    │
   │    Chrome MV3 擴充套件 / 油猴腳本 (Alt+S 一鍵嗅探 CDN 串流)   │
   │    支援新片場 (繞道 WAF)、YouTube、Bilibili、Vimeo           │
   └──────────────────────────────┬──────────────────────────────┘
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 2. AI 多模態視覺大腦 (AI Shot Breakdown Engine)              │
   │    Gemini 視覺模型逐幀審查 ➔ 提取 11 種導演專業視聽參數      │
   │    (景別、運鏡、光影、色彩、情緒、微動作、時間碼、構圖)      │
   └──────────────────────────────┬──────────────────────────────┘
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 3. 多線程串流後端 (Multi-Threaded Streaming Server)         │
   │    Python ThreadingHTTPServer + HTTP 206 Partial Content    │
   │    秒級並發分段加載，卡片懸浮預覽即播，零黑屏、零緩存卡頓    │
   └──────────────────────────────┬──────────────────────────────┘
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 4. 導演視聽語意檢索台 & 提案板 (Director Canvas UI)          │
   │    中英繁三語切換 ➔ 語意防誤召回 ➔ 一鍵加入畫布 ➔ 提案時長統計 │
   └─────────────────────────────────────────────────────────────┘
```

### 1. 全網一鍵影視收割助手 (`cineshot-extension/`)
* **智慧偵測**：僅在檢測到真實影片播放器時，右下角自動浮現金標按鈕 `[ 🎬 存入 CineShot ]`。
* **全局快捷鍵**：在任何網頁隨時按下 `Alt + S`（Mac 為 `Option + S`）一秒傳送。
* **新片場反爬防護突破**：動態嗅探底層真實 CDN 影片直連（`oss-xpc0.xpccdn.com`），繞過 Wangsu WAF 403 阻擋。
* **零依賴通用腳本**：同步提供 Tampermonkey 油猴腳本（`cineshot_sniffer.user.js`）。

### 2. Gemini 多模態 AI 逐幀拉片管線 (`auto_crawler_pipeline.py`)
* 將長影片自動切割為 3~5 秒的黃金動態分鏡。
* 提煉 **11 個專業影視視聽參數**：
  * **微動作標籤 (Micro-action)**：如「假動作傳球與趣味碎步舞蹈」、「機械拉伸鞋身測試」
  * **攝影機運鏡 (Motion)**：如「低角度滑軌拉鏡頭」、「定鏡特寫」、「手持跟拍呼吸感」
  * **光影氛圍 (Lighting)**：如「自然戶外日光」、「工業冷調均勻光」、「火花自發光與暗調背景」
  * **色彩調色 (Color Tone)**：如「復古寫實膠片調」、「冷灰金屬質感」、「工業藍灰」
  * **情緒節奏 (Mood)**：如「極限測試與張力」、「悠閒反差幽默」、「精準科技感」
  * **基礎參數**：品牌客戶 (Client)、導演 (Director)、年份 (Year)、時碼 (Timecode)、景別 (Scale)、畫幅 (Aspect Ratio)

### 3. 高並發多線程串流伺服器 (`server.py`)
* 基於 Python `ThreadingHTTPServer`，徹底解決傳統單線程伺服器在並發請求時卡死的問題。
* 完美實現 **HTTP 206 Partial Content** 範圍請求，支援 macOS Safari / Chrome 的影片分段點播。
* 內建即時任務看板接口 `/api/tasks`，實時監控拉片與切片狀態。

### 4. 導演視聽語意檢索台 (`public/`)
* **語意消歧搜尋引擎**：
  * 支援自然語言搜尋（例如「打架」、「開車」、「特寫」、「逆光」）。
  * 獨立體育運動分類隔離（籃球、橄欖球、足球互不污染）。
  * 智慧消歧機制：搜尋「球」精準鎖定球類運動與傳球，主動排除「球鞋/鞋底機械測試」。
* **動態細分情境標籤 (Dynamic Sub-Action Chips)**：根據搜尋關鍵字，即時萃取該主題底下的微動作標籤（如搜「球」出現「起跳傳球」、「指尖轉球」）。
* **分鏡提案對焦板 (Storyboard Canvas)**：卡片右上角「+」一鍵收藏至畫布抽屜，自動累計提案鏡頭數量與秒數。
* **三語國際化**：繁體中文、簡體中文、English 即時切換。

---

## 🚀 快速啟動

### 1. 本地啟動 (Local Development)

```bash
# 1. 複製專案
git clone https://github.com/directormarion1/cineshot.git
cd cineshot

# 2. 安裝依賴 (yt-dlp)
pip3 install -r requirements.txt

# 3. 配置環境變數 (填入 Google Gemini API Key)
cp .env.example .env
# 編輯 .env 填入 GEMINI_API_KEY=your_key_here

# 4. 啟動多線程串流伺服器
python3 server.py
```

打開瀏覽器訪問：👉 **http://localhost:8765**

### 2. 安裝 Chrome 擴充套件

1. 打開 Chrome 瀏覽器，進入 `chrome://extensions/`。
2. 開啟右上角 **「開發人員模式」**。
3. 點擊 **「載入未打包項目」**，選擇本專案中的 `cineshot-extension/` 目錄。
4. 打開任意新片場、YouTube 影片，點擊播放後按 `Alt + S` 即可一鍵收割！

### 3. 雲端部署 (Railway 1-Click)

本專案自帶 `Procfile` 與自動適配配置，直接連結 GitHub 倉庫至 Railway 即可自動構建並享有雲端全球 CDN 分鏡檢索服務。

---

## 📁 專案目錄結構

```
cineshot/
├── server.py                  # 多線程串流伺服器 (HTTP 206 Range + Ingest API)
├── auto_crawler_pipeline.py    # Gemini 多模態 AI 逐幀切片與視聽參數萃取引擎
├── batch_crawler.py           # 批次自動收割機 (支援 YouTube/Bilibili 播放清單)
├── run_nb_crawl.py            # New Balance 商業廣告批次示範抓取腳本
├── requirements.txt           # Python 依賴套件 (yt-dlp)
├── Procfile                   # Railway 雲端一鍵啟動入口
├── README.md                  # 專案詳細架構與使用說明書
│
├── cineshot-extension/        # Chrome MV3 全網一鍵收割外掛
│   ├── manifest.json          # MV3 設定檔 (權限、Service Worker)
│   ├── background.js          # 背景服務 (免疫網頁 CSP/CORS)
│   ├── content.js             # 頁面注入腳本 (影片串流嗅探、Alt+S 快捷鍵、懸浮按鈕)
│   ├── content.css            # 懸浮按鈕與 Toast 視覺樣式
│   ├── popup.html / popup.js  # 外掛彈窗面板
│   └── icon*.png              # 擴充套件圖標
│
├── cineshot_sniffer.user.js   # Tampermonkey 油猴通用獨立嗅探腳本
│
└── public/                    # 前端純原生 SPA 檢索台 (零依賴極速響應)
    ├── index.html             # 主頁結構 (極簡雜誌質感、導演工作台)
    ├── style.css              # 暗黑電影感 UI 系統 (金色主題、玻璃擬態)
    ├── app.js                 # 語意搜尋、同義詞消歧、動態標籤、分鏡畫布邏輯
    ├── data/
    │   └── clips.json         # 精選 3~5 秒商業分鏡資料庫 (含 11 維視聽參數)
    └── videos/                # 雲端切片影片儲存目錄
```

---

## 📄 License

MIT License. Designed with ❤️ for Filmmakers & Commercial Directors.
