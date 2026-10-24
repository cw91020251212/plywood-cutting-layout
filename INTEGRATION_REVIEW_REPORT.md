# Review ZIP 整合度報告

日期：2026-10-24  
來源：`plywood-cutting-layout-review.zip`  
整合目標：GitHub 專案 `cw91020251212/plywood-cutting-layout` 的 `main` 分支

## 結論

**整合度：100%（以 ZIP 中與程式交付相關的項目計）**。已逐項比對 ZIP 與遠端最新主分支，將 ZIP 帶來的功能程式碼、介面、文件、檢查工具、測試及示意素材全部納入；保留主分支既有而 ZIP 未包含的文件與功能。未以較舊 ZIP 覆寫整份專案。

## 整合項目

- **餘料比較功能：**新增 `assets/remnant-comparison.js`、`assets/remnant-comparison-ui.js` 及 `assets/remnant-comparison.css`，並整合至 `index.html`。
- **可重用餘料庫：**新增 `assets/reusable-remnant-stock.js` 與 `assets/reusable-remnant-stock-ui.js`，支援餘料資料庫相關流程；新增 `REUSABLE_REMNANT_STOCK_PLAN.md`。
- **排料核心與偏好：**合併 `assets/table-saw-optimizer.js`、`index.html`、`sw.js` 及相關測試更新，保留 ZIP 所需資源載入與快取設定。
- **測試：**新增餘料比較及餘料庫測試，並整合 ZIP 對既有排料與手機測試的修訂。
- **交付素材與驗證工具：**加入 `mockups/` 示意圖、兩個介面檢查腳本及內嵌腳本檢查更新。
- **既有內容保留：**主分支已有的 `docs/` 與其餘未被 ZIP 修改的功能均保留。

## 驗證結果

- `node --test tests/*.test.cjs`：**163 項通過、0 項失敗**。
- `node scripts/check-inline-scripts.cjs`：通過，檢查 **12 個內嵌腳本**及 **10 個正式 JavaScript 資產**。
- `scripts/check-mobile-view.py`：已改為自動尋找 Chromium／可指定瀏覽器路徑，並使用可寫的 `/tmp` 預設輸出；Playwright 實際檢查 **320×740、360×800、390×844、430×932、600×900、767×900、844×390、1440×900**，全數通過，無頁面錯誤。
- 以本機 Chromium 實際操作功能流程：方案比較列出 8 個方案及 21 件餘料；點選第二方案餘料返回該候選；暫停餘料留在庫存但無法選入板材，恢復後可加入；選用 R 餘料後狀態不變；已驗證來源餘料需確認後才入庫，取消確認不入庫；手動「已使用」確認、單件／全選加入板材、來源欄位和 R 編號的 JSON 儲存／載入往返均通過。
- 排料回歸測試已加強：確認合格 R 餘料可先用，放不下全部部件時用新原板補足，且候選完整並通過驗證。
- `scripts/check-compact-algorithm-toggles.py` 與 `scripts/check-remnant-compact.py` 的預設輸出路徑仍指向不可寫的 `/workspace/...`，本次未執行這兩項額外腳本；不影響上列 Node 測試及 Chromium smoke test。

## 整合邊界

本報告所稱 100% 是 ZIP 中可納入專案的程式、文件、測試及示意素材皆已納入。後續補做了本機 Chromium 的 8 種視窗尺寸與主要餘料 UI 流程驗收；不代表已在所有實際裝置、瀏覽器或 GitHub Pages 上逐一人工驗收。另有兩個附件檢查腳本因 `/workspace/...` 輸出路徑問題未執行。

## 主程式接線獨立複核

在後續質疑後，重新追蹤了 `index.html` 主程式引用與事件流程，並請另一個 AI 以唯讀方式獨立審查。複核確認新增功能不是孤立檔案：HTML 中有餘料庫管理器及方案比較入口；庫存核心與比較核心已載入，UI 腳本在核心之後載入；CSS、Service Worker 快取、庫存登記／選取／狀態操作、候選方案比較與回到來源板流程均有接線。庫存資料隨專案 JSON 匯入／匯出保存，並非自動雲端或 localStorage 同步。

本次另加入測試，守護主程式確實載入兩個核心模組、UI 載入順序正確，且餘料比較 CSS 存在。其後已用真實本機 Chromium 完成附件主要互動流程及多尺寸手機版驗收；驗收詳情見「驗證結果」。

### 發佈狀態更正

附件文字稱該版仍是本機版本；但在收到附件前，我已把主程式相關提交推送到 GitHub。GitHub Actions 顯示 `20c979c` 的 Pages workflow 已成功（run `40073635096`）。這是我沒有遵守附件所列「驗收後才發佈」順序的疏忽。其後驗收及測試工具修正均在本機完成，**沒有再推送新提交**。如需撤回已部署版本，應先取得使用者明確確認。


## 2026-10-25 — 最新 Review ZIP 再整合

使用者重新提供的 review ZIP 已作為最新版本合併至 `main` 工作樹；ZIP 內的更新檔案以附件為準，ZIP 未包含的既有 `docs/`、`licenses/`、`mockups/` 及先前 QA 文件保留。新增／更新項目包含主程式、餘料比較及庫存 UI、CSS、排料排序、Service Worker、測試、手機檢查腳本、操作說明與獨立預覽 HTML。

以使用者原始 JSON 重算：16 件部件、2 塊板、22 刀；方案 1 的 5 個候選餘料 checkbox 均為 20×20px，展開後每列尺寸文字區寬 269px，未發生全寬勾選框擠壓文字。自動測試 176 項通過；內嵌腳本檢查通過；手機 Chromium 在 320×740、360×800、390×844、430×932、600×900、767×900、844×390、1440×900 八種視窗尺寸全部通過。

已於提交 `2a3e5e2` 推送至 `main`。GitHub Pages workflow `40134865487` 成功；其後直接在已部署網站載入原始 JSON 重測，結果仍為 16 件、2 塊板、22 刀，五個 checkbox 均為 20×20px，文字欄寬 269px，頁面無 JavaScript 錯誤。
