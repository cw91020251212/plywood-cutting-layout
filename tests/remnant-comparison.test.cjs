'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const standalone = fs.readFileSync(path.join(__dirname, '../plywood-cutting-layout-standalone.html'), 'utf8');
const compare = require('../assets/remnant-comparison.js');
const overlay = require('../assets/cut-path-overlay.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '../assets/remnant-comparison-ui.js'), 'utf8');
const modelSource = fs.readFileSync(path.join(__dirname, '../assets/remnant-comparison.js'), 'utf8');
const componentCss = fs.readFileSync(path.join(__dirname, '../assets/remnant-comparison.css'), 'utf8');

function engine() {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  const source = scripts.find(script => script.includes('global.PlywoodTrialEngine={version:VERSION,plan,verifyBoard,orientations}'));
  assert.ok(source);
  const window = { PlywoodTableSaw: require('../assets/table-saw-optimizer.js'), PlywoodRemnantStock: require('../assets/reusable-remnant-stock.js') };
  vm.runInNewContext(source, { window, console });
  return window.PlywoodTrialEngine;
}

const settings = { mode:'partFirstTree', kerf:3, trims:{left:0,right:0,top:0,bottom:0}, edges:{left:true,right:true,top:true,bottom:true}, minSupportWidth:'', reusableRemnantThreshold:{shortSide:0,longSide:0} };

function fixtureCandidate(candidateIndex, boardCount, remnantCountPerBoard = 1) {
  const boards = Array.from({ length: boardCount }, (_, boardIndex) => ({
    boardId: `S${candidateIndex}-${boardIndex + 1}`,
    width: 1000 + boardIndex * 100,
    length: 2000 + boardIndex * 100
  }));
  const remnants = [];
  boards.forEach((board, boardIndex) => {
    for (let pieceIndex = 0; pieceIndex < remnantCountPerBoard; pieceIndex++) {
      const width = 100 + pieceIndex * 10;
      const length = 150 + pieceIndex * 20;
      remnants.push({
        candidateIndex,
        boardIndex,
        boardId: board.boardId,
        sourceBoard: board,
        materialId: `${board.boardId}-R${pieceIndex + 1}`,
        rect: { x: 20 + pieceIndex * 50, y: 30 + pieceIndex * 80, width, length },
        area: width * length
      });
    }
  });
  return { candidateIndex, plan: { boards }, remnants };
}

function allPlaced(candidate) {
  return candidate.panels.flatMap(panel => panel.remnants);
}

function assertPanelPacking(panel) {
  for (let i = 0; i < panel.remnants.length; i++) {
    const current = panel.remnants[i].display;
    assert.ok(current.x >= 0 && current.y >= 0);
    assert.ok(current.x + current.width <= panel.boardLength + 1e-7);
    assert.ok(current.y + current.height <= panel.boardWidth + 1e-7);
    for (let j = i + 1; j < panel.remnants.length; j++) {
      const other = panel.remnants[j].display;
      const overlaps = current.x < other.x + other.width - 1e-7 && current.x + current.width > other.x + 1e-7 &&
        current.y < other.y + other.height - 1e-7 && current.y + current.height > other.y + 1e-7;
      assert.equal(overlaps, false, `virtual display board ${panel.displayBoardIndex + 1} has overlapping remnants`);
    }
  }
}

test('comparison collects only verified final material leaves and keeps their original sheet identity', () => {
  const planner = engine();
  const first = planner.plan([{width:420,length:310,count:1}], [{width:1000,length:1600}], settings);
  const second = planner.plan([{width:250,length:260,count:2}], [{width:1000,length:1600}], settings);
  assert.equal(overlay.isVerifiedPlan(first), true);
  assert.equal(overlay.isVerifiedPlan(second), true);
  const app = { trialPlan:first, _trialCandidates:[{plan:first,key:'A'},{plan:second,key:'B'}] };
  const candidates = compare.collectCandidates(app, overlay);
  assert.equal(candidates.length, 2);
  for (const [index, plan] of [first, second].entries()) {
    const expected = plan.boards.flatMap((board, boardIndex) => overlay.finalMaterialLeaves(board).map(remnant => ({ ...remnant, boardIndex })));
    assert.equal(candidates[index].remnants.length, expected.length);
    assert.deepEqual(JSON.parse(JSON.stringify(candidates[index].remnants.map(remnant => [remnant.materialId,remnant.boardIndex,remnant.rect.width,remnant.rect.length]))), JSON.parse(JSON.stringify(expected.map(remnant => [remnant.materialId,remnant.boardIndex,remnant.rect.width,remnant.rect.length]))));
    assert.ok(candidates[index].remnants.every(remnant => remnant.sourceBoard === plan.boards[remnant.boardIndex]));
  }
  const before = JSON.stringify(app);
  const model = compare.layout(candidates);
  assert.equal(JSON.stringify(app), before);
  assert.ok(model.panelWidth > 0 && model.panelHeight > 0);
  assert.equal(model.candidates.length, 2);
  for (const candidate of model.candidates) {
    assert.equal(candidate.sourceBoardCount, candidate.plan.boards.length);
    assert.equal(candidate.displayBoardCount, candidate.panels.length);
    assert.equal(allPlaced(candidate).length, candidate.remnants.length);
    for (const panel of candidate.panels) {
      assert.equal(panel.boardLength, model.virtualBoardLength);
      assert.equal(panel.boardWidth, model.virtualBoardWidth);
      assertPanelPacking(panel);
      for (const remnant of panel.remnants) {
        assert.equal(remnant.sourceBoard, candidate.plan.boards[remnant.sourceBoardIndex]);
        assert.equal(remnant.boardIndex, remnant.sourceBoardIndex);
        if (remnant.display.rotated) {
          assert.equal(remnant.display.width, remnant.rect.width);
          assert.equal(remnant.display.height, remnant.rect.length);
        } else {
          assert.equal(remnant.display.width, remnant.rect.length);
          assert.equal(remnant.display.height, remnant.rect.width);
        }
      }
    }
  }
});

test('comparison R labels are unique per scheme and survive virtual-board repacking', () => {
  const source = fixtureCandidate(12, 3, 2);
  const candidate = compare.layout([source]).candidates[0];
  const expected = Array.from({ length: 6 }, (_, index) => `R${index + 1}`);
  assert.deepEqual(candidate.remnants.map(remnant => remnant.displayId), expected);
  const displayed = allPlaced(candidate).map(remnant => remnant.displayId);
  assert.equal(new Set(displayed).size, expected.length);
  assert.deepEqual([...displayed].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), expected);
});

test('comparison keeps every candidate tied at the dynamically derived minimum sheet count', () => {
  const fourMinimum = Array.from({ length: 4 }, (_, index) => fixtureCandidate(index, 2));
  const higherCount = Array.from({ length: 10 }, (_, index) => fixtureCandidate(index + 4, 3 + index % 2));
  const firstRun = [...fourMinimum, ...higherCount];
  const selectedFirstRun = compare.minimumSourceSheetCandidates(firstRun);
  assert.equal(selectedFirstRun.length, 4);
  assert.deepEqual(selectedFirstRun.map(candidate => candidate.plan.boards.length), [2, 2, 2, 2]);
  assert.ok(selectedFirstRun.every(candidate => fourMinimum.includes(candidate)));

  const secondRun = [fixtureCandidate(20, 4), fixtureCandidate(21, 3), fixtureCandidate(22, 4)];
  const selectedSecondRun = compare.minimumSourceSheetCandidates(secondRun);
  assert.equal(selectedSecondRun.length, 1);
  assert.equal(selectedSecondRun[0], secondRun[1]);
  assert.deepEqual(compare.minimumSourceSheetCandidates([{ plan: { boards: [] } }, {}]).map(candidate => candidate.plan.boards.length), [0]);
  assert.deepEqual(compare.minimumSourceSheetCandidates([{}]), []);
});

test('one-, two-, and three-sheet schemes combine remnants onto shared-size virtual boards at one scale', () => {
  const candidates = [fixtureCandidate(0, 1), fixtureCandidate(1, 2), fixtureCandidate(2, 3)];
  const model = compare.layout(candidates, { gap: 24, padding: 20 });
  assert.deepEqual(model.candidates.map(candidate => candidate.sourceBoardCount), [1, 2, 3]);
  assert.deepEqual(model.candidates.map(candidate => candidate.panels.length), [1, 1, 1]);
  assert.deepEqual(model.candidates.map(candidate => allPlaced(candidate).length), [1, 2, 3]);
  assert.equal(model.panelWidth, 1200 + 40);
  assert.equal(model.panelHeight, 2200 + 40);
  assert.equal(model.virtualBoardLength, 2200);
  assert.equal(model.virtualBoardWidth, 1200);
  for (const candidate of model.candidates) {
    const panel = candidate.panels[0];
    assert.deepEqual([...new Set(panel.remnants.map(remnant => remnant.sourceBoardIndex))].sort(),
      candidate.plan.boards.map((_, index) => index));
    assertPanelPacking(panel);
  }
});

test('portrait display mapping keeps the short side horizontal for either source dimension order', () => {
  const landscape = compare.portraitRect({ x: 120, y: 40, width: 800, height: 300, rotated: false }, 2200, 1200);
  assert.deepEqual(landscape, { x: 40, y: 120, width: 300, height: 800, rotated: false });
  const alreadyPortrait = compare.portraitRect({ x: 40, y: 120, width: 300, height: 800, rotated: true }, 1200, 2200);
  assert.deepEqual(alreadyPortrait, { x: 40, y: 120, width: 300, height: 800, rotated: true });
  const model = compare.layout([fixtureCandidate(0, 1)], { padding: 20 });
  assert.equal(model.panelWidth, 1000 + 40);
  assert.equal(model.panelHeight, 2000 + 40);
});

test('dense multi-sheet layouts retain every true-size remnant without overlap or per-scheme autoscaling', () => {
  const candidate = fixtureCandidate(0, 3, 12);
  const model = compare.layout([candidate], { padding: 30 });
  const planned = model.candidates[0];
  assert.equal(planned.sourceBoardCount, 3);
  assert.equal(allPlaced(planned).length, 36);
  assert.equal(planned.remnants.length, 36);
  for (const panel of planned.panels) {
    assertPanelPacking(panel);
    assert.ok(panel.remnants.every(remnant => {
      const { width, height, rotated } = remnant.display;
      return rotated
        ? width === remnant.rect.width && height === remnant.rect.length
        : width === remnant.rect.length && height === remnant.rect.width;
    }));
  }
  assert.match(modelSource, /function packRemnants/);
  assert.doesNotMatch(modelSource, /autoscal|scaleRemnant|shrinkRemnant/i);
});

test('a second virtual board is created only after the first is filled with true-size pieces', () => {
  const boards = [{ boardId:'S1', width:1000, length:1000 }, { boardId:'S2', width:1000, length:1000 }];
  const remnants = Array.from({ length:5 }, (_, index) => ({
    candidateIndex:0,
    boardIndex:index % 2,
    boardId:boards[index % 2].boardId,
    sourceBoard:boards[index % 2],
    materialId:`square-${index + 1}`,
    rect:{ x:0, y:0, width:500, length:500 },
    area:250000
  }));
  const candidate = { candidateIndex:0, plan:{ boards }, remnants };
  const planned = compare.layout([candidate]).candidates[0];
  assert.equal(planned.sourceBoardCount, 2);
  assert.equal(planned.panels.length, 2);
  assert.deepEqual(planned.panels.map(panel => panel.remnants.length), [4, 1]);
  assert.equal(allPlaced(planned).length, remnants.length);
  for (const panel of planned.panels) assertPanelPacking(panel);
});

test('a remnant that cannot be mapped to a source sheet is rejected rather than moved or dropped', () => {
  const candidate = fixtureCandidate(0, 2);
  candidate.remnants[0].boardIndex = 99;
  candidate.remnants[0].sourceBoard = null;
  candidate.remnants[0].boardId = 'missing-board';
  assert.throws(() => compare.layout([candidate]), /無法確認餘料所屬原板/);
});

test('invalid candidates are excluded and detached current plans do not inherit a stale pool', () => {
  const planner = engine();
  const good = planner.plan([{width:400,length:300,count:1}], [{width:1000,length:1400}], settings);
  const bad = planner.plan([{width:400,length:300,count:1}], [{width:1000,length:1400}], settings);
  bad.validation.ok = false;
  assert.equal(compare.collectCandidates({trialPlan:good,_trialCandidates:[{plan:good},{plan:bad}]},overlay).length,1);
  const detached = planner.plan([{width:180,length:150,count:1}], [{width:850,length:1250}], settings);
  const output = compare.collectCandidates({trialPlan:detached,_trialCandidates:[{plan:good}]},overlay);
  assert.equal(output.length,1);
  assert.equal(output[0].plan,detached);
  assert.deepEqual(compare.collectCandidates({trialPlan:null,_trialCandidates:[]},overlay),[]);
});

test('the whole scheme drawing returns to its candidate and individual remnants are not click targets', () => {
  assert.equal((ui.match(/doc\.createElement\('button'\)/g) || []).length,1,'only the scheme card button is created');
  assert.match(ui,/schemeButton\.appendChild\(graphic\);\s*schemeButton\.addEventListener\('click',\s*\(\)\s*=>\s*returnToCandidate\(candidate\)\)/);
  assert.match(ui,/function returnToCandidate\(candidate\)/);
  assert.match(ui,/ui\.commitCandidate\(index\)/);
  assert.match(ui,/graphic\.dataset\.sourceBoardCount = String\(candidate\.sourceBoardCount\)/);
  assert.match(ui,/graphic\.dataset\.displayBoardCount = String\(candidate\.displayBoardCount\)/);
  assert.match(ui,/panelElement\.append\(title, createDisplayBoardGraphic\(candidate, candidateNumber, panel, model\)\)/);
  assert.match(ui,/viewBox: `0 0 \$\{model\.panelWidth\} \$\{model\.panelHeight\}`/);
  assert.match(ui,/data-original-source-board-index/);
  assert.match(ui,/實際用 \$\{candidate\.sourceBoardCount\} 張原板/);
  assert.doesNotMatch(ui,/remnant-comparison-piece-list|remnant-comparison-piece-button|tabindex|role:\s*['"]button['"]|addEventListener\(['"]keydown/);
  assert.doesNotMatch(ui,/dimensionCross|remnant-comparison-dimension-line|remnant-comparison-dimension-tick/);
  assert.doesNotMatch(componentCss,/remnant-comparison-piece-list|remnant-comparison-piece-button/);
  assert.match(html,/id="partsTable"/);
  assert.match(html,/id="boardsTable"/);
  assert.match(html,/id="remnantStockManager"/);
});

test('comparison graphic uses a fixed two-column grid and a single global SVG panel viewBox', () => {
  assert.match(componentCss,/\.remnant-comparison-graphic\s*\{[^}]*display:\s*grid/);
  assert.match(componentCss,/\.remnant-comparison-graphic\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(ui,/viewBox: `0 0 \$\{model\.panelWidth\} \$\{model\.panelHeight\}`/);
  assert.match(ui,/function formatRemnantDimensions\(candidate, remnant\)/);
  assert.match(ui,/\$\{piece\.remnant\.displayId \|\| ''\} · \$\{formatRemnantDimensions\(candidate, piece\.remnant\)\}/);
  assert.match(ui,/['"]data-remnant-label['"]:\s*remnant\.displayId \|\| ''/);
  assert.match(ui,/each remnant is numbered and dimensioned width by length/);
  assert.match(ui,/const format = app && app\._formatTrialDimension/);
  assert.match(ui,/const selector = \$\('unitSystem'\)/);
  assert.match(ui,/portraitRect\(shape, panel\.boardLength, panel\.boardWidth\)/);
  assert.match(ui,/const boardWidth = Math\.min\(panel\.boardLength, panel\.boardWidth\)/);
  assert.match(ui,/const boardHeight = Math\.max\(panel\.boardLength, panel\.boardWidth\)/);
  assert.match(ui,/displayUnitSystem: unitSystem, unitSystem/);
  assert.match(ui,/const width = formatDimension\(value\.width, source\), length = formatDimension\(value\.length, source\)/);
  assert.match(ui,/return `\$\{width\} × \$\{length\}`/);
  assert.doesNotMatch(ui,/width\.slice\(0, -suffix\.length\)/);
  assert.match(ui,/fontPx = Math\.max\(6\.4/);
  assert.match(ui,/remnant-comparison-display-board-panel/);
  assert.doesNotMatch(ui,/remnant-comparison-source-board-panel|panel\.boardIndex/);
  assert.match(ui,/窄條尺寸以引線標明|Dimension/);
  assert.match(componentCss,/\.remnant-comparison-board\s*\{[^}]*stroke-width:\s*0\.9px/);
  assert.match(componentCss,/\.remnant-comparison-piece\s*\{[^}]*stroke-width:\s*0\.65px/);
  assert.match(componentCss,/\.remnant-comparison-board\s*\{[^}]*fill:\s*#edf1ee/);
  assert.match(componentCss,/\.remnant-comparison-piece\s*\{[^}]*fill:\s*#eadfc9/);
  assert.doesNotMatch(componentCss,/remnant-comparison-dimension-line|remnant-comparison-dimension-tick/);
  assert.match(componentCss,/\.remnant-comparison-dimension-leader\s*\{/);
  assert.doesNotMatch(componentCss,/\.remnant-comparison-board\s*\{[^}]*stroke-width:\s*(?:[2-9]|[1-9]\d)(?:px)?/);
  assert.doesNotMatch(componentCss,/\.remnant-comparison-piece\s*\{[^}]*stroke-width:\s*(?:[2-9]|[1-9]\d)(?:px)?/);
});

test('HTML and offline cache wire the updated comparison assets', () => {
  assert.match(html,/id="openRemnantComparison"/);
  assert.match(html,/id="remnantComparisonDialog"/);
  const introMarkup = html.match(/<p id="remnantComparisonIntro"[^>]*>[\s\S]*?<\/p>/)?.[0];
  assert.ok(introMarkup && standalone.includes(introMarkup), 'standalone shell shares the initial two-line comparison intro');
  assert.match(html,/id="remnantComparisonAction" class="remnant-comparison-action" hidden/);
  assert.match(html,/id="remnantComparisonAvailability"/);
  assert.match(html,/href="assets\/remnant-comparison\.css\?v=14"/);
  assert.match(html,/assets\/remnant-comparison-ui\.js\?v=15/);
  assert.match(html,/assets\/remnant-comparison\.js\?v=8/);
  assert.match(html,/id="partsTable"/);
  assert.match(ui,/action\.hidden = count === 0/);
  const actionMarkup = html.match(/<div id="remnantComparisonAction"[^>]*>[\s\S]*?<\/div>/)?.[0];
  const dialogMarkup = html.match(/<dialog id="remnantComparisonDialog"[^>]*>[\s\S]*?<\/dialog>/)?.[0];
  assert.ok(actionMarkup && standalone.includes(actionMarkup), 'standalone action starts hidden like the source page');
  assert.ok(dialogMarkup && standalone.includes(dialogMarkup), 'standalone dialog has the same compact, right-aligned close header');
  assert.ok(dialogMarkup.indexOf('remnant-comparison-header-copy') < dialogMarkup.indexOf('id="closeRemnantComparison"'));
  for (const file of ['remnant-comparison.js?v=8','remnant-comparison-ui.js?v=15','remnant-comparison.css?v=14','reusable-remnant-stock-ui.js?v=6']) assert.ok(sw.includes(`./assets/${file}`));
  assert.match(sw,/2026-10-25-remnant-compare-triangle-1/);
  assert.match(html,/remnant-comparison-header-copy/);
  assert.match(componentCss,/\.remnant-comparison-header\s*\{[^}]*padding:\s*0 10px/);
  assert.match(componentCss,/\.remnant-comparison-intro\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(html,/<button id="openRemnantComparison"[^>]*>比較所有方案餘料圖<\/button>/);
  assert.match(ui,/比較所有方案餘料圖/);
  assert.match(ui,/載入 JSON 後按「計算」，再按此鈕比較餘料圖。/);
  assert.match(ui,/Compare fewest-sheet remnants/);
  assert.match(ui,/按比例排餘料；只比最少用板，點圖看切割圖。/);
  assert.match(ui,/Pack to scale; fewest-sheet schemes only\./);
  assert.match(ui,/const DISPLAY_GAP = 48/);
  assert.match(ui,/const DISPLAY_PADDING = 68/);
  assert.match(ui,/minimumSourceSheetCandidates\(allCandidates\)/);
  assert.match(ui,/虛擬展示板/);
  assert.match(ui,/appendOverallDimensionTag/);
  assert.match(ui,/['"]data-overall-dimension['"]:\s*axis/);
  assert.match(ui,/`闊 \$\{overallWidth\}`/);
  assert.match(ui,/`高 \$\{overallHeight\}`/);
  assert.match(ui,/formatDimension\(boardWidth, sourceBoard\)/);
  assert.match(ui,/formatDimension\(boardHeight, sourceBoard\)/);
  assert.match(ui,/const unitSystem = \(selector && selector\.value\) \|\| \(app && app\.unitSystem\)/);
  assert.doesNotMatch(ui,/所有通過驗證的方案同時列出|All validated schemes are shown together/);
  assert.match(ui,/原板/);
});

test('comparison and stock controls preserve scoped styling and compact checkboxes', () => {
  assert.match(componentCss,/\.remnant-comparison-header\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/);
  assert.match(componentCss,/\.remnant-comparison-header-copy\s*\{[^}]*display:\s*flex/);
  assert.match(componentCss,/\.remnant-comparison-intro\s*\{[^}]*flex:\s*1 1 auto/);
  assert.match(componentCss,/^#remnantComparisonAction\[hidden\]\s*\{[^}]*display:\s*none !important/m);
  assert.match(componentCss, /#remnantComparisonDialog \.remnant-comparison-heading\s*\{[^}]*display:\s*block\s*!important/);
  assert.match(componentCss, /\.reusable-remnant-offer:not\(\[open\]\) > :not\(summary\)\s*\{[^}]*display:\s*none\s*!important/);
  const offerArrow = componentCss.match(/\.reusable-remnant-offer > summary::before\s*\{([^}]*)\}/)?.[1] || '';
  const offerArrowOpen = componentCss.match(/\.reusable-remnant-offer\[open\] > summary::before\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(offerArrow,/content:\s*"▶"/);
  assert.match(offerArrowOpen,/transform:\s*rotate\(90deg\)/);
  assert.doesNotMatch(offerArrow,/content:\s*["']＋["']/);
  assert.match(componentCss, /#remnantComparisonDialog \.remnant-comparison-close\s*\{[^}]*width:\s*auto\s*!important/);
  assert.match(componentCss, /#remnantComparisonDialog \.remnant-comparison-scheme-button\s*\{[^}]*height:\s*auto\s*!important/);
  assert.match(componentCss, /#openRemnantComparison\s*\{[^}]*text-shadow:\s*none\s*!important/);
  assert.match(componentCss, /\.remnant-stock-toolbar button\s*\{[^}]*text-shadow:\s*none\s*!important/);
  assert.match(componentCss, /#remnantStockManager input\.remnant-stock-select\s*\{[^}]*width:\s*20px\s*!important[^}]*height:\s*20px\s*!important/);
  assert.match(componentCss, /\.section \.reusable-remnant-offer input\.remnant-stock-select\s*\{[^}]*width:\s*20px\s*!important[^}]*height:\s*20px\s*!important/);
  assert.match(componentCss, /#remnantStockManager \.remnant-stock-toolbar button\s*\{[^}]*width:\s*auto\s*!important/);
  assert.match(componentCss, /#remnantStockManager \.remnant-stock-actions button\s*\{[^}]*width:\s*auto\s*!important/);
  const selectorsOnly = componentCss.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(selectorsOnly, /\.section\s+button|#partsTable|#boardsTable/);
});
