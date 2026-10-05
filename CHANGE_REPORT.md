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

## 2026-10-05 Icon redesign

Replaced the placeholder brown square and diagonal bar with a polished plywood layout icon showing real sheet sections, cut lines and a circular saw blade. The independent repository now uses the redesigned icon for favicon, browser launch icon and PWA icons.

## 2026-10-05 — 大標題左對齊

- 將首頁大標題由置中改為靠左對齊。
- 保留原有標題底色、黃色邊框、圖示及文字樣式。
- 移除標題水平位移，避免左對齊時仍受 `translateX` 影響。

## 2026-10-05 — 大標題白字陰影

為大標題白色文字加入柔和黑色陰影及輕微外暈，提升麻布背景上的閱讀清晰度；保留左對齊及原本標題框外觀。

## 2026-10-05 — 浮動按鈕幼線輪廓

將右上角四個浮動按鈕統一為 1px 深色實線輪廓，取消額外粗外框效果；保留按鈕位置、色彩及內部立體陰影。

## 2026-10-05 — 完整深色模式對比修正

全面檢查並修正深色模式下的頁面區塊、表格、結果表、支援設定、搜尋提示、排法控制、畫布標籤、列印／說明彈窗及表單輸入。深色模式統一使用深底淺字；輸入框保留淺底深字，避免黑底黑字或白底白字。

## 2026-10-05 — 深色模式第二輪對比掃描

根據實際深色模式 DOM 對比掃描，再修正切割圖例、字體狀態、列印按鈕、彈窗內選單及橙色對齊按鈕，清理剩餘白底淺字與低對比組合。

## 2026-10-05 — 深色模式第二次實際 DOM 審核

重新以祖先背景合成方式檢查公開頁面，修正之前漏掉的 `.unit-label`（米／厘米／毫米）、板材進階設定粗體標題及結果區操作摘要文字。亦確認舊檢查器對 CSS 漸層按鈕存在誤判，今次改用實際 DOM 色彩與祖先背景合成核對，避免再把漸層按鈕誤報成深色底深色字。
