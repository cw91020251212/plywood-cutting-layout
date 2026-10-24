'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const stockApi = require('../assets/reusable-remnant-stock.js');
const overlay = require('../assets/cut-path-overlay.js');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function loadEngine() {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  const source = scripts.find(script => script.includes('global.PlywoodTrialEngine={version:VERSION,plan,verifyBoard,orientations}'));
  assert.ok(source, 'load the production plywood trial engine');
  const window = { PlywoodRemnantStock: stockApi, calculator: { parts: [] } };
  vm.runInNewContext(source, { window, console }, { filename: 'index.html#PlywoodTrialEngine' });
  return window.PlywoodTrialEngine;
}

const settings = {
  mode: 'partFirstTree', kerf: 3,
  trims: { left: 0, right: 0, top: 0, bottom: 0 },
  edges: { left: true, right: true, top: true, bottom: true },
  minSupportWidth: '', reusableRemnantThreshold: { shortSide: 100, longSide: 100 }
};

test('remnant thresholds default to 100 mm, include their boundary, and compare short/long sides independent of rotation', () => {
  assert.deepEqual(stockApi.normalizeThreshold(), { shortSide: 100, longSide: 100, active: true });
  assert.equal(stockApi.qualifies({ width: 100, length: 250 }, { shortSide: 100, longSide: 250 }), true);
  assert.equal(stockApi.qualifies({ width: 250, length: 100 }, { shortSide: 100, longSide: 250 }), true);
  assert.equal(stockApi.qualifies({ width: 99.9, length: 250 }, { shortSide: 100, longSide: 250 }), false);
  assert.equal(stockApi.qualifies({ width: 100, length: 249.9 }, { shortSide: 100, longSide: 250 }), false);
  assert.equal(stockApi.qualifies({ width: 10, length: 20 }, { shortSide: 0, longSide: 0 }), true);
  assert.throws(() => stockApi.normalizeThreshold({ shortSide: '', longSide: 100 }), error => /不可留空/.test(error.message) && error.field === 'shortSide');
  assert.throws(() => stockApi.normalizeThreshold({ shortSide: -1, longSide: 100 }), RangeError);
  assert.throws(() => stockApi.normalizeThreshold({ shortSide: 100, longSide: 50001 }), RangeError);
});

test('only final material leaves from a complete, verified cut plan are eligible; trim offcuts and incomplete layouts are excluded', () => {
  const engine = loadEngine();
  const parts = [{ width: 300, length: 200, count: 2, orientationPreference: 'auto' }];
  const plan = engine.plan(parts, [{ width: 1000, length: 600 }], {
    ...settings, trims: { left: 10, right: 0, top: 8, bottom: 0 }
  });
  assert.equal(overlay.isVerifiedPlan(plan), true);
  assert.ok(plan.boards[0].cuts.some(cut => cut.phase === 'trim'));
  const eligible = stockApi.qualifyingFinalLeaves(plan, {
    threshold: { shortSide: 0, longSide: 0 }, overlay,
    verifyBoard: (board, kerf) => engine.verifyBoard(board, kerf)
  });
  const project = leaves => leaves.map(({ materialId, rect, area }) => ({ materialId, rect, area }));
  assert.deepEqual(JSON.parse(JSON.stringify(project(eligible))), JSON.parse(JSON.stringify(project(plan.boards.flatMap(board => overlay.finalMaterialLeaves(board))))));
  assert.ok(eligible.length > 0);
  assert.ok(eligible.every(leaf => !leaf.materialId.includes('OFF')));
  const incomplete = { ...plan, status: 'incomplete', unplaced: [{ id: 'missing' }] };
  assert.deepEqual(stockApi.qualifyingFinalLeaves(incomplete, { threshold: {}, overlay }), []);
  const noCut = engine.plan([{ width: 100, length: 100, count: 1 }], [{ width: 100, length: 100 }], settings);
  assert.equal(noCut.boards[0].cuts.length, 0);
  assert.deepEqual(stockApi.qualifyingFinalLeaves(noCut, { threshold: { shortSide: 0, longSide: 0 }, overlay }), []);
});

test('qualified-remnant metrics use validated individual leaves and return zero for incomplete plans', () => {
  const engine = loadEngine();
  const plan = engine.plan([{ width: 200, length: 200, count: 1 }], [{ width: 600, length: 400 }], settings);
  assert.equal(plan.validation.ok, true);
  const all = stockApi.qualifyingMetricsFromFinalRemnants(plan.boards, { shortSide: 0, longSide: 0 }, true);
  assert.equal(all.count, plan.boards[0].validation.finalRemnants.length);
  assert.ok(all.largestArea > 0);
  assert.deepEqual(stockApi.qualifyingMetricsFromFinalRemnants(plan.boards, { shortSide: 10000, longSide: 10000 }, true),
    { largestArea: 0, largestShortSide: 0, count: 0 });
  assert.deepEqual(stockApi.qualifyingMetricsFromFinalRemnants(plan.boards, { shortSide: 0, longSide: 0 }, false),
    { largestArea: 0, largestShortSide: 0, count: 0 });
});

test('saved R stock is searched before fresh stock while original stock indices are preserved', () => {
  const engine = loadEngine();
  const parts = [{ width: 500, length: 500, count: 1, orientationPreference: 'auto' }];
  const boards = [{ width: 1200, length: 1200 }, { width: 600, length: 600, reusableRemnant: true, reusableRemnantId: 'R-1' }];
  for (const stockOrder of ['largestFirst', 'smallestFirst', 'seeded']) {
    const plan = engine.plan(parts, boards, { ...settings, searchProfile: { active:true, stockOrder, seed:17 } });
    assert.equal(plan.status, 'candidate');
    assert.equal(plan.boards[0].stockIndex, 1, `${stockOrder} must still try R first`);
    assert.equal(plan.boards[0].boardId, 'STOCK-02');
    assert.equal(plan.boards[0].reusableRemnant, true);
    assert.equal(plan.summary.savedRemnantBoardsUsed, 1);
  }
});

test('new-sheet estimates use fresh stock dimensions and do not clone a remnant when no fresh sheet is available', () => {
  const engine = loadEngine();
  const parts = [{ width: 600, length: 600, count: 4, orientationPreference: 'fixed_vertical' }];
  const plan = engine.plan(parts, [
    { width: 700, length: 700, reusableRemnant: true },
    { width: 1000, length: 1000 }
  ], settings);
  const added = plan.boards.filter(board => board.added);
  assert.ok(added.length > 0);
  assert.ok(added.every(board => board.width === 1000 && board.length === 1000));
  const remnantOnly = engine.plan(parts, [{ width: 700, length: 700, reusableRemnant: true }], settings);
  assert.equal(remnantOnly.summary.boardsAdded, 0);
  assert.equal(remnantOnly.status, 'incomplete');
});

test('R threshold controls, actual-cut confirmation, JSON fallback, table columns and offline asset are wired', () => {
  assert.match(html, /id="remnantMinShortSide"[^>]*required[^>]*value="100"/);
  assert.match(html, /id="remnantMinLongSide"[^>]*required[^>]*value="100"/);
  const stockUi = fs.readFileSync(path.join(root, 'assets/reusable-remnant-stock-ui.js'), 'utf8');
  assert.match(html, /window\.PlywoodRemnantStockUI\.attachOffer\(root,plan\)/);
  assert.match(stockUi, /實際鋸出、量度、按 R 編號標記並存放/);
  assert.match(html, /window\.confirm\(confirmText\)/);
  assert.match(html, /normalizeThreshold\(c\.reusableRemnantThreshold\)/);
  assert.match(html, /remnantStockVersion:3/);
  assert.match(html, /id="remnantStockManager"/);
  assert.match(html, /<tr><th>寬<\/th><th>長<\/th><th>數量<\/th><th>操作<\/th><\/tr>/);
  assert.ok(sw.includes('./assets/reusable-remnant-stock.js?v=3'));
  assert.ok(sw.includes('./assets/reusable-remnant-stock-ui.js?v=2'));
  assert.ok(sw.includes('./assets/table-saw-optimizer.js?v=3'));
});

test('stock records keep unique R IDs and validate available, held and used statuses', () => {
  const result = stockApi.normalizeStockRecords([
    { id:'R-0001', width:120, length:400, status:'available' },
    { id:'R-0001', width:200, length:500, status:'held' },
    { id:'R-0003', width:300, length:700, status:'used' },
    { id:'R-0004', width:0, length:700, status:'available' },
    { id:'R-0005', width:300, length:700, status:'unknown' }
  ], 2);
  assert.equal(result.records.length, 4);
  assert.deepEqual(result.records.map(record => record.id), ['R-0001','R-0006','R-0003','R-0005']);
  assert.deepEqual(result.records.map(record => record.status), ['available','held','used','available']);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.nextId, 7);
  const allocation = stockApi.allocateStockIds(result.records, 2, result.nextId);
  assert.deepEqual(allocation.ids, ['R-0007','R-0008']);
  assert.equal(allocation.nextId, 9);
});
