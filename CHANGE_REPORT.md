# CutNest 變更報告

日期：2026-10-05

## 本次變更

- 將最新的夾板切割排版 HTML 設為 GitHub Pages 首頁。
- **修正：** CutNest 只作 GitHub／上架用英文專案名；軟件畫面、頁面標題及 PWA 顯示名稱保留原本的「木材切割排版｜夾板簡易排料」。
- 新增 CutNest 木板切割圖示，並更新 favicon、Apple touch icon、PWA icons 及社交分享預覽圖。
- 新增手機原生 `navigator.share()` 分享按鈕；不支援原生分享的環境會自動複製連結。
- 新增 PWA `share_target`，安裝 CutNest 後可從其他 App 的分享表接收網址。
- 新增 Open Graph / Twitter metadata，分享連結時顯示 CutNest 名稱、說明及圖示。
- 更新 service worker cache version，確保已安裝的 PWA 取得新版本。

## 驗證

- `node --check`：新增分享腳本通過。
- `manifest.webmanifest`：JSON 格式通過。
- 圖示：SVG 及 192/512px PNG 檔案格式與尺寸通過。
- GitHub Pages：既有部署來源為 `main` branch root，會沿用自動部署。

## 2026-10-05 追加修正

按要求還原軟件原本中文名稱；GitHub repository 名稱及分享功能維持不變。

## 2026-10-05 再次修正

按要求移除箭咀分享掣、分享腳本及 PWA share target，避免改變原本軟件介面。

## 2026-10-05 最終介面調整

將分享功能改放到「設定」面板內的「分享連結」文字按鈕；移除右上角箭咀，保留原本軟件標題。
