# AI 接手報告：木材／夾板排料與傳統鋸枱切序

> **用途：** 將來接手本專案嘅 AI，先讀呢份文件、`README.md`、`TABLE_SAW_RELEASE.md` 同本文最後列出嘅程式位置，再改程式。此文件記錄產品用途、演算法、已修事項、證據、限制、安全界線同回歸規則；未有寫入本文嘅假設一律要先查實，唔好當成產品能力。

| 項目 | 資料 |
| --- | --- |
| 最後核對日期 | 2026-10-07（香港時間） |
| 產品名稱 | 木材切割排版｜夾板簡易排料 |
| GitHub 專案英文名稱 | `plywood-cutting-layout`；CutNest 只係過往 GitHub／PWA 技術名稱，**畫面產品名稱仍係原本中文名**。 |
| 正式網站 | <https://cw91020251212.github.io/plywood-cutting-layout/> |
| 儲存庫 | <https://github.com/cw91020251212/plywood-cutting-layout> |
| 預設分支 | `main`，GitHub Pages 由 GitHub Actions 部署。 |
| 已發布程式基準 | `9374b56`，引擎 `plywood-trial-1.1.0`，鋸枱模組 `table-saw-1.0.0`，外觀 `part-appearance.js?v=3`，尺寸互動 `part-dimension-display.js?v=1`；PWA 快取 `2026-10-07-part-dimensions-2`。 |
| 已驗證正式部署 | GitHub Actions [37609241945](https://github.com/cw91020251212/plywood-cutting-layout/actions/runs/37609241945) 成功；公開 HTML、排料模組、刀路／餘料模組及 service worker 與指定 commit 相符；部件尺寸模組 SHA-256 亦與本機檔案一致。 |

---

## 1. 使用者真正需要咩

使用者以香港粵語描述傳統木工鋸枱；主要唔係想要「排版圖最密」，而係要一個 **師傅實際做得到、切刀行到尾、盡量唔浪費板材** 嘅切割方案。

- 使用傳統木鋸枱，唔係雷射床、CNC 或可喺大板任意下刀嘅自由排版機。
- 需要每一刀都可以**完整切穿當時手上嘅矩形工件**，唔可以要求鋸片喺尚未分離嘅完整板材中間停落嚟、轉彎或挖孔。
- 操作上偏好先將大板分成同闊長條，再逐條截成部件；減少工序交錯、反覆搬板同重設靠山會有幫助。
- 要尊重部件固定橫直方向；**木紋方向、鋸枱安全、靠山實際設定並非現有資料已充分建模嘅條件**。
- 「慳料」要計算用板數、鋸縫、修邊及可能留下嘅可用餘料，唔係單純追求圖上少剩一啲碎料。

**重要用語區分：** guillotine／貫穿切割係每刀橫過**當前來源工件**。第二刀可以發生喺第一刀已分離出嚟嘅長條上；佢唔需要橫過原先完整大板。判斷一個方案可唔可以鋸，應檢查逐刀來源材料同執行順序，而唔係只望最後一張矩形排列圖。

## 2. 現時程式有咩、用乜嘢技術

專案係一個**靜態 GitHub Pages 前端應用**，冇建置 bundler／後端資料庫等先決條件。正式頁面本體以單一 `index.html` 為主，引擎係內嵌 JavaScript；另載入四個輕量輔助 JS 資產（切割排序、刀路、色彩外觀、部件尺寸互動）。同一核心裁切引擎可由瀏覽器及 Node.js 回歸測試執行。

使用者現有功能包括：

- 公制及英制多欄位尺寸輸入；計算核心統一以 **mm** 處理尺寸。
- 部件闊、長、數量及橫直／容許旋轉偏好；展開為有獨立 ID 嘅個別部件。
- 原板闊、長、數量；略過停用板並保留原庫存索引。
- 鋸縫（kerf）、原板四邊修邊及邊緣能否保留為成品邊。
- 「先分條再截件」、按成品展開切割樹，以及自動比較工序；**預設先分條再截件**。
- 「慳料優先」及「開料方便優先」兩種**候選排序方式**；排序唔代表全局最優或精確用時。
- 候選排版、原板張數、成品利用率、餘料、逐刀回放、材料平衡、排版畫布、三種部件尺寸顯示（自動／點選單件／全部件號與清單）、儲存／載入 JSON、列印、PWA 離線資產。
- 單件旋轉會重新排料並重驗證；**不能依賴跨板手動拖曳作試排**。

使用者未輸入板價／不同板種價格，所以「慳料」係幾何代理排序，**唔等於成本計算或實際節省金額**。支撐寬度可以留空；留空只會產生候選草排，輸入數值亦只作幾何篩選，唔係機台安全認證。

## 3. 程式地圖：先睇邊度、邊個先係生效版本

| 檔案／程式區域 | 用途 |
| --- | --- |
| `index.html` 約 7128 行起 | 生效嘅 trial 引擎；`VERSION = 'plywood-trial-1.1.0'`、`PlywoodTrialEngine`、排料候選計算及切樹驗證。 |
| `index.html` 約 7132–7147 | 尺寸方向及旋轉偏好 `orientations()`。改固定橫直前先確認命名與 `rotated` 意義。 |
| `index.html` 約 7149–7187 | 展開部件、設定正規化、原板物件及 `stockIndex`／板 ID。 |
| `index.html` 約 7191 起 | 切刀記錄 `makeStep()`、直接成品終端 `emitPart()`、修邊。每刀記來源材料、座標、鋸縫矩形、輸出及刀序。 |
| `index.html` 約 75xx | 切樹／逐刀 replay、成品 ID 完整度、鋸縫及原板面積帳。改演算法必須通過現有 `verifyBoard()`，唔好繞過。 |
| `index.html` 約 7596–7666 | `PlywoodTrialEngine.plan()`：庫存板次序、補板模板、候選計畫、方向核對、摘要。 |
| `assets/table-saw-optimizer.js` | Node／瀏覽器共用嘅子集搜尋、刀位換算及候選排名輔助模組。唔取代主切樹及驗證器。 |
| `assets/part-dimension-display.js` | 純函數尺寸模式、可見部件篩選、穩定件號及 Canvas 幾何命中測試；不涉及排料計算。 |
| `assets/part-appearance.js` | 同色相圖面漸層／平面外觀；視覺限定。 |
| `index.html` 約 7756 | `replayState()`：預覽逐刀後嘅材料葉；**免刀 terminal 成品亦要消耗**。 |
| `assets/cut-path-overlay.js` | 顯示經驗證刀路與 `finalMaterialLeaves()` 最終未用材料。唔係獨立排料器。 |
| `index.html` 約 7995–8071 | UI 的 `getParts()`／`getBoards()`、候選比較、有限 profiles、完整度／方向驗證及 `calculate()`。 |
| `index.html` 約 8073 起 | JSON 匯入／匯出與舊 schema 相容處理；變更欄位之前須加匯入回歸測試。 |
| `sw.js` | 離線靜態資產 cache version；目前新增尺寸 UI 使用 `2026-10-07-part-dimensions-2`。新增／改版 JS 或 HTML 必須同步核心資產、URL 版本及測試。 |
| `.github/workflows/pages.yml` | `main` push 部署 Pages；Node.js 22 先跑 inline JS 語法與全部 tests。 |
| `tests/cut-path-overlay.test.cjs` | UI／刀路／單位／餘料顯示測試。 |
| `tests/part-dimension-display.test.cjs` | 顯示模式、點選命中、穩定件號、雙語、只重繪及回放位置回歸。 |
| `tests/table-saw-optimizer.test.cjs` | 演算法、切序、候選池、回退、安全邊界及 PWA 測試。 |
| `scripts/check-inline-scripts.cjs` | Node `vm.Script` 語法檢查 `index.html` 內嵌 JavaScript 及 4 個正式資產。 |
| `README.md` | 快速功能清單、重要限制及測試指令。 |
| `TABLE_SAW_RELEASE.md` | 本輪發版摘要、數值反例、限制及回歸結果。 |

### 避免改錯過時嘅程式

`index.html` 內仍有舊版／相容用途嘅切割 classes 及舊策略名稱（例如 legacy `guillotine`、`cuttingTree` 等）。唔好淨係 `grep guillotine`，或只改最先見到嘅 class，就假設嗰段係公開網站正在使用嘅引擎。真實入口已確認係 `global.PlywoodTrialEngine={version:VERSION,plan,verifyBoard,orientations}`，UI 由 `PlywoodTrialUI` 呼叫。改動前重新定位上述實際賦值與正式載入次序，再用瀏覽器及 tests 驗證。

## 4. 每刀驗證原理：不可削弱嘅正確性底線

引擎使用矩形／切割樹，而唔只係儲存部件最後嘅 `(x,y,width,length)`：

1. 原板由來源 material ID `${boardId}-ROOT` 開始；修邊建立實際 cut 與剩餘可用 core。
2. 一刀必須指向**仍存在**嘅來源 material ID 及來源矩形。
3. 鋸縫矩形（`kerfBand`）要完整橫跨該來源矩形；按方向切開來源後，輸出部分唔得互相重疊、走出來源矩形或縮短到不合理尺寸。
4. 成品、尚待再鋸物料、修邊 offcut、kerf 帶與直接成品 terminal 分開記帳。
5. 每件需求有獨立 token／part ID；要求件數必須全數一次、亦只可一次產出，尺寸與允許方向必須相符。
6. 主引擎驗證各板 `parts + kerf + offcut/final remaining material = source board area`（在既定數值容差內），核對新增／現有原板來源及候選完整度。
7. UI 只將完整並通過每板 replay 嘅候選放入方案池；切割圖同時消費 terminal parts，唔可以把已完成零刀成品當餘料。

**新最佳化器只可以提出「先切邊啲」嘅候選；真正決定每刀幾何嘅仍然係切樹／引擎。** 不要讓子集合搜尋結果直接跳過 `packRipBoard()` 後續建樹及逐刀驗證，也唔好以「候選有排滿」代替 `validation.ok`。

## 5. 過去問題、實測證據及已修內容

### 5.1 同闊長條逐件貪婪會多買／開一塊板

再現輸入（全部 mm、無修邊、kerf 3 mm、固定方向）：

| 物件 | 闊 × 長 | 數量 |
| --- | ---: | ---: |
| 原板 | 603 × 1000 | 1 |
| 部件 A，固定縱向 | 300 × 440 | 2 |
| 部件 B，固定橫向 | 300 × 250 | 4 |

舊方法每條 300 闊長料先放兩件 440，再三件 250，餘一件 250 落唔入，就追加原板。現場上合法嘅組合係**每條 300 × 1000 分別放 440、250、250**；兩條共六件，一刀分條、每條三刀截件，總共 **1 板 7 刀**。

| 實測 | 舊貪婪 | 已發布組合搜尋 |
| --- | ---: | ---: |
| 使用／新增板 | 2／1 | **1／0** |
| 刀數 | 8 | **7** |
| 成品用料率 | 46.77% | **93.53%** |
| 鋸縫損耗 | 11,400 mm² | **8,400 mm²** |
| 逐刀回放 | 通過 | **通過** |

這證明呢個**特定失敗模式**已修；唔代表任意訂單都提升到 93.53%，唔可以說一律慳一半，也唔代表全局最優。

### 5.2 原先「餘料少」排名會獎勵額外鋸耗

舊慳料同板數候選以 `wasteArea` 小為勝，但 `wasteArea` 唔包含鋸縫；因此鋸多料、令幾何餘料少一點，反而可能排前。已修排名將 kerf 拆出，慳料目標依序比較：

**有效候選 → 使用原板數 → 使用原板總面積 → kerf 面積 → 刀數 → 工序軸向切換 → 刀路總長。**

「方便」目標依序比較：

**刀數 → 非 trim 工序軸向切換數 → 刀路總長 → 原板數 → 使用原板總面積 → kerf 面積。**

兩組都係有限候選嘅**字典序代理**，冇輸入單價／殘料用途價值，唔等於真正成本或工作分鐘。

### 5.3 按輸入順序食錯細庫存板

已重現兩件 500 × 500，庫存先 600 × 600、後 1100 × 1100：舊輸入次序可先開細板再浪費另一板。現候選至少搜尋原輸入順序、面積大到細、面積細到大；實際結果排序仍以目標函式為準。過往程式亦用最大面積原板作**新增板模板**；此功能依然只係估算補板，唔係指定板種或價格最佳化器。

### 5.4 免刀 terminal 成品誤列做餘料

如果成品本身即係切完後嘅矩形材料，佢可能存在 `board.terminals`、無對應額外刀。若只 replay 有刀嘅 `outputs`，會把已完成成品留在最終 leaves；現 `replayState()` 及 `PlywoodCutOverlay.finalMaterialLeaves()` 均會移除成品 material ID。測試涵蓋先分條一刀後嘅 300 × 600 直接成品、同闊全長條及完整原板單件案例。

### 5.5 停用原板造成來源編號錯位

板表過濾停用原板後，過往以 filtered-array index 建板 ID，會將原板第二行說成 `STOCK-01`。現排序先以來源清單原始 index 建 references，再略去停用板；任何候選仍需引用原生位置並重驗尺寸，回歸測試覆蓋「第一塊停用」場景。

### 5.6 原板全局座標容易被誤當靠山數值

`distanceFromDatum` 為原板基準刀位；部件日後於已分離長條鋸第二刀時，原板全局座標同相對工件座標有偏移。現 `table-saw-optimizer.js` 的 `cutDatum(step)` 區分來源工件起點、global/local 鋸縫中心及 kerf 邊界，表格亦標「相對工件」同「原板全局中心」。這係**資訊／幾何顯示**；唔係鋸片切削側、名義成品尺寸、靠山讀數或現場調校指令。

### 5.7 無窮大件數可令 expand 無界

現 `expandParts()` 要求 count 係安全整數（擴展前檢查），有回歸測試拒絕 `Infinity`。如果日後加入更大件數或可由 API 匯入大量零件，須再加入產品級明確件數／記憶體限制，而唔好依賴 browser memory。

## 6. 本輪新增同闊子集合搜尋：點工作、保證啲乜

`assets/table-saw-optimizer.js` 採有限 **0/1 subset-sum / knapsack 狀態搜尋**，唔係連續尺寸 cut solver 或全局二維整板 solver。

- 每個 `choice` 帶獨一無二 token ID 及引擎已合法旋轉嘅 `{width,length}` 方向；一輪只組合**同闊**部件。
- 每件只考慮一次（0/1），搜尋候選件嘅長度及 kerf 增量；狀態用 9 位小數 key 合併近似同一總長。
- 選擇比較先求較多**成品實際長度**，同長度先偏向件數少；唔會把「虛構再鋸一道」當成成品用料。
- 明確處理末件可用末邊時毋須新增尾刀、要分出餘料時要留 kerf，以及小數 kerf。
- 結果仍然經主引擎建切割樹及驗證。候選池保留舊無 profile 貪婪方案；local improvement 壞咗時唔會丟棄原方案。
- 每次搜尋上限係 **20,000 個狀態，150,000 次狀態訪問**；達上限只捕捉 `STRIP_SEARCH_LIMIT`，使用原有貪婪 `selected`，有 `plan.stripSearch.limited` 統計並顯示有限／回退提示。其他程式錯誤會再拋出，唔好擴大 try/catch 到吞掉驗證錯誤。
- 輔助 asset 未載入時，主引擎仍用貪婪布局、逐刀驗證；`stripSearch.unavailable` 使 UI 提示 module fallback。缺 asset 唔應靜默冒充用到子集合優化。
- 排序僅係先後次序；相同板數及面積可能仍由 kerf、刀數、軸換向勝出。現時**未有完整 tree-search、全局 multi-strip allocation、worker／cancel、wall-clock optimality proof**。

`planMetrics.axisChanges` 對每板按實際非 trim cuts 的 `axis` 次序計相鄰變更；忽略 trim。佢只係方向代理，唔計換刀、轉板、重設靠山、師傅時間、夾持安全或搬運。`cutLength` 累加對應來源工件長／闊，亦只係簡單幾何代理。

## 7. PWA、Pages 與來源管理

- `sw.js` `CORE_ASSETS` 要只包含存在檔案；每次加、移除、改名 asset 時同步清單及 regression assertion，避免 offline shell 指向 404。
- script URL、overlay query version 同 `APP_VERSION` 必須同步更新；現有 `table-saw-optimizer.js?v=1`、`cut-path-overlay.js?v=3`、`part-appearance.js?v=3`、`part-dimension-display.js?v=1`，PWA app shell 為 `2026-10-07-part-dimensions-2`。
- Pages actions 每次 `main` push 都會先跑：

  ```sh
  node scripts/check-inline-scripts.cjs
  node --test tests/*.test.cjs
  ```

  冇測試過唔好推；失敗應修正並重跑，唔好移除步驟逃過部署閘。
- 本輪程式碼 release commit `9374b56` 已上線；Pages Actions `37609241945` 成功。往後以 Git diff、`gh run`／Actions、公開 HTML 及部署資產核對確實版本；文件後續更新可有獨立文件 commit。
- 交接文件同 source 喺同一 repo `main`，令下一個 Agent 唔使靠本次對話歷史；更新報告基準版本時，同步記 commit hash、測試數、deployment run。

## 8. 當前自動及人工驗證

截至程式碼 release commit `9374b56`：

- `node scripts/check-inline-scripts.cjs` 通過 **12 段 inline scripts + 4 個正式 JS 資產**語法檢查。
- `node --test tests/*.test.cjs`：**35/35 pass，0 fail**：刀路／UI／單位 10 項、部件外觀 4 項、尺寸互動 5 項、排料／庫存／排序／PWA 16 項。
- GitHub Pages Actions [37609241945](https://github.com/cw91020251212/plywood-cutting-layout/actions/runs/37609241945) successful；公開尺寸模組 SHA-256 與本機一致，HTML 指向 `?v=1`，公開 service worker 使用 `2026-10-07-part-dimensions-2`。
- 本機瀏覽器以兩件相近尺寸 `250 × 400 mm`、`252 × 400 mm` 實測全部尺寸清單及點選單件；點選第一件顯示 `#1 · 250 mm × 400 mm ↻`。切換前後 `calculator.trialPlan` 同一物件、每板 cuts JSON 相同，證明顯示切換無重算／改刀。
- 瀏覽器互動測試只用臨時本機資料，完成後清除模式偏好並重載空白頁；正式站只讀確認選單，不寫入其使用者資料。
- 相同反例舊候選 2 板／8 刀，新候選 1 板／7 刀，已另有 `TABLE_SAW_RELEASE.md` 數值紀錄。

注意：測試係程式驗證，不代表真鋸測、木紋認證或正式 workshop health-and-safety sign-off。

## 9. 未解決問題與建議順序

### P1：改善長單求解質量／效能

目前每個長條 DP 只取局部最佳一組。下一階段可評估保留 top-K Pareto alternatives（以長度、件數、axis／change等多目標記錄），外層 beam search 同時探索長條分派同原板；設計明確限額、progress、取消／worker，再按高頻 fixtures 測試**候選質量及最差時延**。新 solver 仍將結果轉為現有 cut tree，逐步驗證；唔好企圖由虛構自由 nesting 取代 guillotine。

### P1：讓「方便」更貼近靠山與搬料

與實際用家／木工先確認單一鋸枱嘅基準邊、先分條方向、可否 90° 轉板、短料／窄料支撐尺寸、stop-block 重設定義，再把其中明確輸入映射至目標函數。未量度嘅項目只能標 heuristic。可列切割工序單、條料 ID、當前寬闊、靠邊名義 cut dimension 和 piece/offcut 指認，繼續標清唔係 machine setup。

### P1：木紋（如果使用者確認「順住」係順紋）

先問清原板木紋沿輸入闊或長邊；加 panel grain axis、part grain rule 及可旋轉選項；建立木紋方向回歸測試。**不要把固定橫直當成木紋已正確。**

### P2：真正餘料庫存與板價

明確定義可回用餘料最小闊／長、板種／厚度、成本，分開 kerf、trim、不可用 offcut 及保留料；否則慳料仍只係幾何排序。補板模板改為使用者明確容許嘅板種清單，並把「現有庫存」同「估算需新增」分開顯示。

### P2：供使用者檢視及不變式

加入可匯入／匯出 fixtures、自動 permutation/property tests、單件 exact-fit／square orientation variants／極小數值容差、fixtures跨瀏覽器測試、service worker update測試。之後考慮增加約定擴充測試數與數值誤差政策，再改 rounding。禁止默默加大 epsilon 使尺寸疊過 kerf。

**建議暫不做：** 直接從 C++ 將 PackingSolver 整個移入 browser、改用外部 SaaS、unrestricted 2D nesting、宣稱最佳解／節省金額、對大量資料 main-thread 永久跑 loop、或整個重寫視覺/UI。以上有較大部署、授權、資料、效能或物理限制問題，先以可重現 benchmark 比較及用戶實際確認再決定。

## 10. 確認需求／測試、改 code 嘅工作準則

對本專案做新變更時，依序：

1. 讀本 handoff、`README.md`、`TABLE_SAW_RELEASE.md`、`git status` 和最新 `main`；先確認 working tree／版本及活躍部署環境。
2. 對實際引擎和加入功能需要列出尺寸單位、鋸縫、方向、修邊、可使用原板邊、disabled inventory、部件完成度、來源材料、物理限制；唔要只按畫面圖形猜切序。
3. 編寫最少一個能重現真實失敗嘅測試及預期物料帳；每新搜尋分枝須保留比較舊貪婪基線及方向 overrides。
4. 改程式、assets/PWA cache／URLs/tests/docs 一起處理。保持直接 script 無 build deps，除非有明確且已確認嘅理由引入。
5. 跑語法及全部 tests，核對 `git diff --check`；另跑主要小單、full-size／夾板尺寸、若干件數、disabled sheets、追加板及 fallback 情境。
6. 若改到切刀：逐刀 `verifyBoard()`、`sourceMaterialId` 一致，所有需求只出現一次，所有非 terminal leaves/parts 標記正確；安全未知照顯示未知。
7. 使用者要求 GitHub 更新時，提交到原 repo `main`，絕不 force-push；監察該 commit 嘅 Pages Action 和公開實檔 SHA。若外部權限錯、CI fail 或 remote 變更先停止調查，唔好覆蓋用戶新 commit。
8. 更新本文件或 release notes，附 commit、CI run、可再跑 commands、結果、風險及尚未實作項目，畀下一個 AI 能重跑。

**絕對唔好聲稱：** 已保證最優、所有單都節省 50%、零浪費、工作一定順手、安全認證、靠山刻度指令正確、遵守木紋、或每部鋸枱都能切。可準確聲稱係：「找到一個通過軟件幾何與逐刀回放驗證嘅候選方案；已在指定 fixture 減至 1 板 7 刀」。

## 11. 外部參考：補充閱讀

以下來源用作 guillotine／切割工序、成本目標及高階解算器思路參考；唔代表本專案使用 OpenCutList 或 PackingSolver 程式碼。

1. OpenCutList，<https://docs.opencutlist.org/features/parts/parts-list/cutting-diagrams>：guillotine cut 必須穿越來源 panel／offcut；非限制性 nesting 有唔同機器適用邊界。
2. OpenCutList packing，<https://docs.opencutlist.org/features/parts/parts-list/packing>：區分裁切工序及 nesting／packing 模型。
3. OpenCutList GitHub Issue #447，<https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension/issues/447>：tool-oriented optimisation、多目標及方向／換向思考。
4. OpenCutList GitHub Issue #727，<https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension/issues/727>：最佳化有 heuristic 限制，設定及微小變化會影響搜尋結果。
5. PackingSolver，<https://github.com/fontanf/packingsolver>：`rectangleguillotine`、multi-stage、方向限制、切縫、trim 及多種板型目標之進階參考。C++／授權／瀏覽器部署邊界要先評估，唔係現前端加一個 script 即能直接替代。

如未來需要更新研究，優先閱讀上述官方文件、repo 最新 implementation／issues，再用本專案 fixtures 驗證，不要只根據搜尋摘要或 marketing 指標。

---

## 12. 新接手 AI 的最短起步清單

```sh
git status --short
git log -5 --oneline
node scripts/check-inline-scripts.cjs
node --test tests/*.test.cjs
```

上述檢查 PASS 後再讀 `tests/table-saw-optimizer.test.cjs`，檢視失敗 fixture 對應嘅引擎函數，再做小步修改。現有 UI／輸入流程屬使用者原工具，不要未經要求就改名、改色或減功能。

## 13. 2026-10-07 使用流程介面補充

因新切割流程雖已是預設，但工序選單仍在收合的「更多設定」，而結果摘要先前只列板數及刀數，使用者未必即時睇到今次採用邊種工序。現已在結果區加入中英雙語鋸枱提示，結果卡明示計畫實際採用的工序，並提供可聚焦／展開「切割詳情」的按鈕，方便查看逐刀刀序及餘料；尊重減少動畫設定。

**既有量尺輸入為不可改的使用者習慣需求：** 公制／英制欄位布局不更換；部件及原板長闊共 12 個「尺／寸／分」欄位（其中「分」為 1/8 吋增量）保留原有 ID、單位標籤、限制及輸入方式。本次 UI 回歸測試須固定覆蓋這些欄位，勿因重排版面、合併成單一文字框或自動換算而移除。

本次新增介面回歸測試，檢查中英雙語提示、實際工序結果標籤、展開切割詳情的無障礙按鈕、12 個尺／寸／分輸入欄及深色模式英制標籤陰影範圍；修改前後另以程式簽章比較，確認每個英制輸入欄的 HTML 標籤完全未改。今次部署前全套 **26/26 測試通過**。

使用者回報深色模式下英制尺寸單位標籤在灰底上不夠清楚。已實測原有 `.unit-label` 淺字為 `rgb(219, 229, 236)` 且 `text-shadow` 為 `none`，只為 `.dimension-unit-row.imperial .unit-label` 增加 1 px 深色輪廓與柔和陰影；不改標籤本身的文字顏色、欄位背景、尺寸值或輸入行為。公制標籤及淺色模式不受影響，回歸測試檢查陰影 selector 限定英制深色模式。


## 14. 2026-10-07 排版圖部件色彩外觀

### 使用者需求與設計決定

使用者希望排版圖上每個部件能用漸層增加立體感，並可切換不同質感。控制器放在「排版結果／搜尋方法小提示」附近，選項為：

- **立體漸層**：預設，依每件原本的 HSL 色相生成同色系深淺，沿對角線由左下深色過渡到右上淺色；例如深紅至淺紅、深藍至淺藍。
- **金屬光澤**：仍保留各件原色相，只微調飽和度並提高明度；不是疊加黑、白或灰色，邊框另用中性深色。
- **原色平面**：不加漸層，作為清晰、輕量的傳統視圖。

控制只改排版圖和每板尺寸圖例的視覺外觀，不改部件位置、尺寸、方向、排料排名、用板數、鋸縫、切刀或逐刀切割樹。切換時用目前已排方案重新繪圖，**不重新執行排料搜尋**；盡可能保留當前逐刀回放步數及詳情展開狀態。外觀偏好存在本機 `localStorage`（`plywood-layout-part-appearance-v1`），預設 `glossy`，不寫入使用者的方案 JSON。

### 實作位置

- `assets/part-appearance.js`：無第三方依賴的 UMD Canvas 色彩模組；輸出 `window.PlywoodPartAppearance`，同時可由 Node 測試載入。由部件自己的 HSL／RGB／HEX 底色算出同色相色階；不支援的色名安全退回原色平塗，不疊中性灰。
- `index.html`：以 `#partAppearanceStyle` 提供繁體中文／英文選單；`drawStyledPart()` 共用於完整方案和逐刀回放，`stylePartSwatch()` 同步圖例；外觀切換 listener 儲存偏好、呼叫現有 renderer 並還原回放步數。
- `sw.js`：核心快取新增 `./assets/part-appearance.js?v=3`，版本改為 `2026-10-07-board-appearance-3`。改名或改 script URL 時必須同步更新 HTML、service worker 和資產測試。
- `tests/part-appearance.test.cjs`：測每個 stop 保持原 hue、明度沿左下至右上單調增加、紅／藍 HSL/HEX/RGB 色碼均不灰化、Canvas alpha 還原及幾何不變；`tests/cut-path-overlay.test.cjs` 對部件外框的 2 px 寬度斷言已調整為容許金屬模式改色。

顏色仍依原有 `nominalSizeKey` 分配：**同尺寸部件有相同識別色**以便按尺寸查圖例；每個部件矩形個別繪製漸層。不要為了外觀重複實作或改寫尺寸色盤／排料資料。

### 測試與瀏覽器煙霧測試

- 發佈前：`node scripts/check-inline-scripts.cjs` 通過 **12 個 inline scripts + 3 個 production JavaScript assets**；`node --test tests/*.test.cjs` **30/30 pass**；`git diff --check` 通過。
- 本機預覽以 1800 × 2400 mm 原板、5 件三種尺寸部件試跑，得到 1 板、8 刀、完整度驗證成功；三種 Canvas 成圖互不相同，抽樣部件像素有變化，但 `JSON.stringify(trialPlan)` 完全一致，切刀數仍為 8。
- 先逐刀回放至第 7 刀，再切換外觀，仍回到同一第 7 刀；圖例跟隨漸層。英文名稱／說明切換和深色面板／選單對比亦已實測。

### 色相保留與漸層方向修正（2026-10-07）

先前 v2 雖然把畫布改成左下至右上的幾何方向，卻用半透明黑／白疊在原色上；使用者指出這會把紅、藍等識別色混成灰感，並不是深紅→淺紅、深藍→淺藍的漸層。此回饋正確，**不可把 v2 的灰階疊色當成合格方案**。

v3 改由每件部件自己的 HSL / RGB / HEX 色碼算出 `hsl(hue saturation lightness)` 色階：整條漸層保持 hue 不變，只令 lightness 從左下向右上逐步增加；金屬模式僅小幅調整飽和度，仍保持鮮明同色相。Canvas 向量使用 `(x, y + height)` 到 `(x + width, y)`，圖例 CSS 用同方向 `45deg`。漸層區不得使用中性黑／白／灰 overlay；非可解析色碼就退回原色平塗。

資產及 PWA 快取版本升為 `assets/part-appearance.js?v=3` / `2026-10-07-board-appearance-3`。回歸測試檢查 stops 的 hue 完全一致、明度單調增加和最低飽和度；加入紅、藍 HSL/HEX/RGB 輸入，禁止重新引入灰化疊色。金屬外框的中性描邊是輪廓色，不屬於部件色階。

### 限制與維護

「金屬」只係同色相的明暗／飽和度視覺風格，不是真正金屬材質；沒有木紋貼圖，也不代表板材表面／顏色或能據此判斷實際板料。暫不加隨機木紋：它會增加視覺干擾，令細件尺寸及色彩圖例較難看清。如要新增樣式，先在 `profiles` 新增明確的 HSL 調整量，再測紅／藍／綠、低／高亮底色、短窄件、逐刀回放、列印及深色模式；確保 hue 不變、明度方向正確，且方案／刀數 snapshot 不變。


v3 本機 Canvas 實測使用獨立畫布，於 (15,85) 左下內側及 (85,15) 右上內側取樣並轉回 HSL：紅色 hue 0°，立體 L **42.4 → 63.9**、金屬 L **35.5 → 73.5**；藍色 hue 210°，立體 L **47.5 → 69.0**、金屬 L **40.4 → 78.4**；綠色 hue 120°，立體 L **50.4 → 72.0**、金屬 L **43.5 → 81.6**。三種平面色兩點相同。這證明同色系明度方向，不是材料色度測量；測試只用隔離 Canvas，沒有改網站輸入、localStorage 或排料方案。


## 15. 2026-10-07 排版圖部件尺寸標示

### 需求與使用方式

使用者發現闊度／長度相近的部件在排版圖上難以分辨，要求能選單件看尺寸，亦要可選擇所有部件顯示尺寸。結果工具列提供三個模式：

- `auto`（預設）：保持目前自動嘗試在矩形內顯示尺寸的方式。
- `selected`：點選排版圖內目前可見的成品；該件會顯示 `#件號 · 名義尺寸`，並以白色外框及橙色內框加強標示。再次點背景或未切出的區域會清除選擇。
- `all`：在可用空間容納時於每件部件中顯示件號和尺寸；細窄件改畫件號徽章，並在圖下列出本板完整的件號、尺寸及識別色，避免文字互相遮住。

清單中的件號以原板 `board.results` 完整順序編定；逐刀回放只顯示已完成的部件，件號仍對應整板清單，不會因未完成的其他部件而重新編號。切到另一刀或重新計算會清除目前單件選取，避免畫面標示與當前可見材料不符。尺寸走原有 `nominalSizeText()`／目前單位 formatter；方向標記 `↻` 仍照原有旋轉資訊顯示。

### 原理及重要不變條件

`assets/part-dimension-display.js` 是無依賴 UMD 純函數模組（`window.PlywoodPartDimensionDisplay`），提供模式正規化、所顯示的部件篩選、同一塊板的穩定件號及矩形 hit-test。`index.html` 將瀏覽器點擊從 viewport 經 Canvas bounds、DOMMatrix 反算到局部畫布，再用本板目前投影／回放狀態做幾何命中測試；不能以肉眼抽樣或字標位置當作尺寸真值。

顏色／尺寸模式都只重繪現成候選。切換尺寸模式 **不能呼叫 `calculate()`、重建候選池或更改方案資料**；目前方案物件、部件位置、方向、原板來源、刀樹、鋸縫及材料帳必須保持不變。切換時保存並恢復逐刀回放步數及詳情展開狀態；只把視覺狀態存在本機 `localStorage` key `plywood-layout-part-dimension-mode-v1`，不存入匯出 JSON，也不覆寫部件需求。

旋轉顯示時要保留 hit-test 座標反算（`normalizedCanvasPoint()`），滿版直向畫布亦要把可見尺寸面板計入可用高度；若之後變更 rotation 或 projection，必須用瀏覽器重新驗證點選區。`all` 模式在印刷時保留尺寸清單；使用者切換顯示選項本身不應改成排料輸入，也不能擋住已存在的旋轉或回放控制。不得因為尺寸太細就縮改排料幾何或聲稱尺寸已符合現場量測。

### 程式地圖與版本

- `assets/part-dimension-display.js`：`MODES`、`normalizeMode()`、`visibleParts()`、`ordinal()`、`hitTest()`；幾何函式以 mm／板內座標工作，不依賴 DOM。
- `index.html`：`PART_DIMENSION_MODE_STORAGE_KEY`、`drawPartLabels()`、`drawPartIndexBadge()`、`drawSelectedPartOutline()`、`boardDisplayParts()`、`normalizedCanvasPoint()`、`handleDimensionCanvasClick()`、`updateDimensionPanels()`、`rerenderCurrentTrial()` 及工具列事件。
- `tests/part-dimension-display.test.cjs`：模式篩選、最上層命中、件號穩定、雙語/無障礙 markup，以及模式切換只重繪而不重算的回歸測試。
- `scripts/check-inline-scripts.cjs`：12 個 inline scripts + 4 個正式 JavaScript assets。
- `sw.js`：PWA app-shell cache version `2026-10-07-part-dimensions-2`；尺寸模組資產 URL `assets/part-dimension-display.js?v=1`。更新 HTML/UI 時提高 cache version，更新模組本身時再一併提升其 URL query 並更新 PWA／測試斷言。

### 本輪驗證結果

- `node scripts/check-inline-scripts.cjs` 通過；`node --test tests/*.test.cjs` **35/35 通過**。程式碼已部署 commit `9374b56`，Actions `37609241945` 成功。
- 本機瀏覽器以 603 × 1000 mm 板、250 × 400 mm 與 252 × 400 mm 兩件近尺寸部件實際測試。`all` 模式顯示兩件各自編號和尺寸；切換 `selected` 並點第一件後，狀態提示顯示 `#1 · 250 mm × 400 mm ↻`、畫布 cursor 變為 crosshair。結果同時確認 `calculator.trialPlan` 物件仍為同一參照，所有 board cuts JSON 完全一致，證明只改顯示而沒有重新排料。
- 瀏覽器測試只寫入本機臨時 `calculator.parts`／`calculator.boards`，完成後刪除模式偏好並重新載入空白頁；正式網站、專案 JSON 與使用者訂單資料沒有被修改。

### 尚未承諾的能力

本功能不是圖面尺寸線、標尺或工件打印標籤；它係將原有部件需求尺寸顯示在排版圖上。Canvas 空間不足時仍須靠件號清單查閱，不能保證每塊極細小或極密排的部件都能在矩形內顯示完整字串。件號只在本次顯示的原板方案中有效，不是刻入木件的實體標籤、庫存 ID 或跨方案永久 ID。若日後要輸出標籤／尺寸線圖，先確認是否需列印、匯出圖片、跨板唯一編號及回放中如何表示未完成部件，再分開規劃。
