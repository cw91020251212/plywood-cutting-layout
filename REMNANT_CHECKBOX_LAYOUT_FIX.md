# 餘料登記候選勾選框版面修正

日期：2026-10-25

## 原因與整合

使用者提供的 JSON 在方案 1 中有 5 件可登記餘料。這些空方框是登記候選的勾選框，不是切割圖多出的木板部件。共用輸入樣式曾令候選清單中的勾選框拉成整行寬，遮擋尺寸文字。

使用者最新提供的 Review ZIP 已修正此問題：透過 `.section .reusable-remnant-offer input.remnant-stock-select` 專屬選擇器，將候選清單 checkbox 固定為 20×20px；原板庫存管理器另有自己的窄框樣式。CSS 與 Service Worker 版本亦已更新，確保更新後不會沿用舊快取。

## 驗收

使用原始附件 `plywood-bottom-board(1).json`，在 390px 手機視窗重新計算：16 件部件、2 塊板、22 刀。展開候選清單後，五個 checkbox 均為 20×20px；每列文字欄寬 269px。

合併後 `node --test tests/*.test.cjs` 為 176 項通過、0 項失敗；內嵌腳本檢查通過；手機 Chromium 8 種視窗尺寸全部通過。

## 發佈狀態

目前已整合在本機主專案，提交及 GitHub Pages 部署尚待完成。
