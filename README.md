# Visionary 📸

Visionary 是一個現代化的網頁版影像濾鏡與社群分享平台。
專為攝影愛好者設計，讓您能夠輕鬆套用電影級的調色濾鏡、預覽效果，並與社群分享您的專屬配方。

## 🌟 核心功能 (Features)

### 1. Studio 專業調色室
- **WebGL LUT 渲染引擎**：使用高效能的 WebGL 技術，瞬間套用電影級的 3D LUT 色彩對應表。
- **內建系統濾鏡**：包含 Golden Hour (黃金時刻)、Midnight Neon (午夜霓虹)、Wong Kar-wai (王家衛風格)、Sakura Dream (櫻花夢境) 等高品質預設。
- **Before/After 互動滑桿**：絲滑的對比滑桿，讓您即時查看原圖與套用濾鏡後的差異。
- **快速發布 (Publish)**：將滿意的調色配方與預覽圖，一鍵發布到雲端社群資料庫。發布前會自動在客戶端將圖片壓縮至最大 800px，確保上傳速度極快。

### 2. Explore 社群探索牆
- **動態瀑布流**：瀏覽來自全球使用者的精彩調色作品。
- **一鍵試用 (Try Preset)**：看到喜歡的色調？點擊「Try Preset」即可把別人的配方直接帶回您的 Studio，套用到自己的照片上！
- **極速前端快取**：實作了 3 分鐘的前端快取 (Client-side Cache) 機制。在 Studio 與 Explore 之間頻繁切換時能實現「零延遲」秒開，且大幅節省資料庫讀取成本。

### 3. 會員與權限系統
- **Supabase 整合**：完整的註冊、登入與狀態管理，保障資料安全。
- **RLS 安全策略**：透過 Row Level Security (RLS) 保護 `community_posts` 資料表，防範惡意寫入。

### 4. 🕵️ 開發者彩蛋 (Mock RBAC System)
- **彩蛋啟動**：連續點擊左上角「Visionary.」Logo 5 下，即可啟動隱藏的**管理員測試沙盒 (Mock System)**。
- **MSW (Mock Service Worker)**：前端完全攔截 API 請求，無需真實後端即可模擬登入。
- **RBAC (角色存取控制)**：實作路由守衛 (Route Guards)，嚴格隔離 `admin` 與 `user` 的存取權限。無 Token 者會被踢回登入頁，一般用戶無法闖入後台。

---

## 🛠️ 技術棧 (Tech Stack)

*   **前端框架**: Vanilla JavaScript (ES6 Modules)
*   **建置工具**: Vite
*   **樣式與 UI**: Tailwind CSS, 玻璃擬物化設計 (Glassmorphism), RWD 響應式佈局 (包含手機底部導航列)
*   **圖示庫**: Lucide Icons
*   **影像處理**: WebGL, HTML5 Canvas API
*   **後端即服務 (BaaS)**: Supabase (PostgreSQL, Auth, Storage)
*   **測試與 Mocking**: Mock Service Worker (MSW)

---

## 🚀 系統架構演進史 (Architecture Evolutions)

在開發過程中，為了解決效能與體驗問題，我們進行了以下架構升級：
1. **圖片處理優化**：為解決上傳高解析度照片導致的卡頓，在送出前於 Canvas 層級進行 800px 智慧縮圖。
2. **資料庫讀取優化**：移除了耗能的 `SELECT *`，改為精準抓取欄位，並為 `created_at` 建立 Index 以優化排序查詢速度。
3. **前端記憶體快取 (Cache)**：為 Explore 頁面導入快取保溫桶，避免切換分頁時的冗餘 API 呼叫。
4. **狀態管理重構**：修復了 `handleFileUpload` 中覆蓋使用者自訂社群濾鏡的 Bug，確保操作邏輯連貫。
