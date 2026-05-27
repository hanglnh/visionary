# Visionary 📸

Visionary 是一個現代化的網頁版影像濾鏡與社群分享平台。
專為攝影愛好者設計，讓您能夠輕鬆套用電影級的調色濾鏡、即時預覽效果，並與社群分享您的專屬配方。

## 🌟 最新升級特色 (Latest Features)

### 1. 專業調色室 (Studio) - Workspace-First 全新介面
- **WebGL 3D LUT 渲染引擎**：支援標準的 **HaldCLUT (.png)** 與 **.cube** 色彩對應表，提供專業級的精準色彩映射。
- **支援 RAW 檔解析**：可以直接拖曳或貼上 `CR2`, `NEF`, `ARW`, `DNG` 等單眼相機 RAW 原始檔進行處理。
- **無延遲 Before/After 對比**：透過精心設計的觸控友善滑桿，隨時查看套用濾鏡前後的視覺差異。
- **100% 本地運算**：您的照片**完全不會上傳到任何伺服器**，所有渲染與解析都在您的設備（瀏覽器）本地端瞬間完成，保障絕對隱私。

### 2. 探索大師作品 (Explore Community)
- **動態瀑布流**：探索全球攝影師上傳的專屬調色配方。
- **一鍵試用 (Try Preset)**：看到喜歡的色調，只需點擊「Try Preset」就能把大師的配方直接帶回工作室，完美套用在自己的照片上。
- **極速前端快取機制**：在 Studio 與 Explore 之間頻繁切換時實現「零延遲」秒開，大幅節省網路成本。

### 3. PWA 與行動端深度優化 (Mobile-First)
- **Progressive Web App**：支援安裝到手機桌面，享受全螢幕、無邊框的沉浸式 App 體驗。
- **手勢與震動回饋**：整合了 Haptics 震動回饋與手勢操作，提供真實 App 般的操控手感。
- **智慧排版系統**：針對手機畫面進行高度最佳化，包括底部導航列與獨立的 About 資訊頁。

---

## 🛠️ 技術棧 (Tech Stack)

*   **前端框架**: Vanilla JavaScript (ES6 Modules)
*   **建置工具**: Vite
*   **樣式與 UI**: Tailwind CSS, 玻璃擬物化設計 (Glassmorphism), RWD 響應式佈局
*   **圖示庫**: Lucide Icons
*   **影像處理**: WebGL, HTML5 Canvas API
*   **後端即服務 (BaaS)**: Supabase (PostgreSQL, Auth, Storage)
*   **測試與 Mocking**: Mock Service Worker (MSW)

---

## 🚀 系統架構演進史 (Architecture Evolutions)

在開發過程中，為了解決效能與極致的使用者體驗，我們進行了以下技術攻關：
1. **WebGL 降級容錯機制**：修復了 iOS Safari 某些環境下 WebGL 精度導致的「黑畫面」問題，並實作 CSS Filter 的完美降級方案 (Fallback)。
2. **記憶體管理最佳化**：移除了導致 Safari 當機的 WebWorker 壓縮程序，改採同步的輕量化縮圖策略，徹底解決手機端記憶體爆表問題。
3. **Workspace-First UI 重構**：拋棄了傳統的繁瑣介紹首頁，採用現代 SaaS 常見的「工作區優先」設計，使用者一進入就能立刻開始拖曳修圖。
4. **資料庫讀取優化**：移除了耗能的 `SELECT *`，改為精準抓取欄位，並為 `created_at` 建立 Index 以優化排序查詢速度。
