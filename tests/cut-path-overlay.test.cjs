'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const overlay = require('../assets/cut-path-overlay.js');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(repoRoot, 'sw.js'), 'utf8');

function loadEngine() {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  const source = scripts.find(script => script.includes('global.PlywoodTrialEngine={version:VERSION,plan,verifyBoard,orientations}'));
  assert.ok(source, 'extract the current repo’s real inline PlywoodTrialEngine');
  const context = { window: {}, console };
  vm.runInNewContext(source, context, { filename: 'index.html#PlywoodTrialEngine' });
  return context.window.PlywoodTrialEngine;
}

function makePlan() {
  const engine = loadEngine();
  const plan = engine.plan(
    [{ width: 300, length: 200, count: 2, orientationPreference: 'auto' }],
    [{ width: 1000, length: 600 }],
    {
      mode: 'partFirstTree', kerf: 3,
      trims: { left: 10, right: 0, top: 8, bottom: 0 },
      edges: { left: true, right: true, top: true, bottom: true },
      minSupportWidth: ''
    }
  );
  assert.equal(plan.status, 'candidate', 'regression fixture must be a complete verified candidate');
  assert.equal(plan.validation.ok, true);
  assert.ok(plan.boards.length > 0);
  assert.ok(plan.boards[0].cuts.some(cut => cut.phase === 'trim'), 'fixture includes real trim cuts');
  return plan;
}

test('overlay segments are exactly the verified cuts[] paths and retain per-board execution order', () => {
  const plan = makePlan();
  const originalPlan = JSON.stringify(plan);
  const board = plan.boards[0];
  assert.equal(overlay.isVerifiedPlan(plan), true);
  const paths = overlay.cutSegments(board);
  assert.equal(paths.length, board.cuts.length);
  assert.deepEqual(paths.map(path => path.number), board.cuts.map((_, index) => index + 1));
  for (let index = 0; index < board.cuts.length; index++) {
    const cut = board.cuts[index], line = paths[index];
    assert.equal(cut.number, index + 1, 'each board starts at 1 and increments without gaps');
    assert.equal(line.cut, cut, 'the guide is derived from the exact cut record, not a geometric position scan');
    assert.equal(line.sourceMaterialId, cut.sourceMaterialId);
    if (cut.axis === 'x') {
      assert.equal(line.axis, 'x');
      assert.equal(line.x1, cut.distanceFromDatum);
      assert.equal(line.x2, cut.distanceFromDatum);
      assert.equal(line.y1, cut.sourceRect.y);
      assert.equal(line.y2, cut.sourceRect.y + cut.sourceRect.length);
    } else {
      assert.equal(line.axis, 'y');
      assert.equal(line.y1, cut.distanceFromDatum);
      assert.equal(line.y2, cut.distanceFromDatum);
      assert.equal(line.x1, cut.sourceRect.x);
      assert.equal(line.x2, cut.sourceRect.x + cut.sourceRect.width);
    }
  }
  const replay = overlay.cutSegments(board, 2);
  assert.deepEqual(replay.map(path => path.cut), board.cuts.slice(0, 2));
  const transposed = overlay.cutSegments(board, board.cuts.length, true);
  assert.deepEqual(transposed.map(path => path.axis), paths.map(path => path.axis === 'x' ? 'y' : 'x'));
  assert.equal(JSON.stringify(plan), originalPlan, 'overlay calculations never mutate the candidate plan');
});

test('each board restarts cut numbering at 1; rip and crosscut order follows its real cuts[] sequence', () => {
  const engine = loadEngine();
  const boards = [{ width: 400, length: 300 }, { width: 400, length: 300 }];
  const multiBoardPlan = engine.plan(
    [{ width: 300, length: 200, count: 2, orientationPreference: 'auto' }], boards,
    { mode: 'partFirstTree', kerf: 3, trims: { left: 10, right: 0, top: 8, bottom: 0 },
      edges: { left: true, right: true, top: true, bottom: true }, minSupportWidth: '' }
  );
  assert.equal(multiBoardPlan.status, 'candidate');
  assert.equal(multiBoardPlan.boards.length, 2);
  for (const board of multiBoardPlan.boards) {
    assert.deepEqual(board.cuts.map(cut => cut.number), board.cuts.map((_, index) => index + 1));
    assert.equal(overlay.cutSegments(board).length, board.cuts.length);
  }

  const ripPlan = engine.plan(
    [{ width: 300, length: 200, count: 2, orientationPreference: 'auto' }],
    [{ width: 1000, length: 600 }],
    { mode: 'ripThenCrosscut', kerf: 3, trims: { left: 10, right: 0, top: 8, bottom: 0 },
      edges: { left: true, right: true, top: true, bottom: true }, minSupportWidth: '' }
  );
  assert.equal(ripPlan.status, 'candidate');
  const ripBoard = ripPlan.boards[0];
  assert.ok(ripBoard.cuts.some(cut => cut.phase === 'rip'));
  assert.ok(ripBoard.cuts.some(cut => cut.phase === 'crosscut'));
  assert.deepEqual(overlay.cutSegments(ripBoard).map(line => line.cut), ripBoard.cuts);
  assert.deepEqual(ripBoard.cuts.map(cut => cut.number), ripBoard.cuts.map((_, index) => index + 1));
});

test('unverified, incomplete, or misnumbered plans never expose cut paths', () => {
  const complete = makePlan();
  const incomplete = { ...complete, status: 'incomplete', unplaced: [{ id: 'missing' }] };
  assert.equal(overlay.isVerifiedPlan(incomplete), false);
  assert.deepEqual(overlay.cutSegments({ ...complete.boards[0], validation: { ok: false } }), []);
  const badBoard = { ...complete.boards[0], cuts: complete.boards[0].cuts.map(cut => ({ ...cut })) };
  badBoard.cuts[1].number = 7;
  assert.equal(overlay.isVerifiedBoard(badBoard), false);
  assert.deepEqual(overlay.cutSegments(badBoard), []);
});

test('remnants are only the final unused material outputs, not kerf bands or trim offcuts', () => {
  const plan = makePlan();
  const board = plan.boards[0];
  const remnants = overlay.finalMaterialLeaves(board);
  const materialOutputs = new Map();
  const consumedMaterialIds = new Set(board.cuts.map(cut => cut.sourceMaterialId));
  for (const cut of board.cuts) {
    for (const output of cut.outputs) {
      if (output.kind === 'material') materialOutputs.set(output.materialId, output);
    }
  }
  const expectedIds = [...materialOutputs.keys()].filter(id => !consumedMaterialIds.has(id)).sort();
  assert.deepEqual(remnants.map(item => item.materialId).sort(), expectedIds);
  assert.ok(remnants.length > 0, 'the sample board should leave at least one actual material leaf');
  assert.ok(remnants.every(item => item.area > 0 && item.rect.width > 0 && item.rect.length > 0));
  assert.ok(remnants.every(item => !item.materialId.includes('-OFF')));
  assert.ok(board.cuts.some(cut => cut.outputs.some(output => output.kind === 'offcut')), 'fixture has edge-trim waste to exclude');
  assert.ok(board.kerfBands.length > 0, 'fixture has kerf bands to exclude');
  assert.ok(remnants.every(item => !board.kerfBands.some(band =>
    band.x === item.rect.x && band.y === item.rect.y && band.width === item.rect.width && band.length === item.rect.length)));
});

test('geometric fit honors input orientation; dimensions and area format through the active unit formatter', () => {
  const remnant = { rect: { x: 0, y: 0, width: 350, length: 220 } };
  assert.equal(overlay.fitsPartSpec(remnant, { width: 300, length: 200, orientationPreference: 'auto' }), true);
  assert.equal(overlay.fitsPartSpec(remnant, { width: 300, length: 200, orientationPreference: 'fixed_vertical' }), false);
  const metric = overlay.formatRemnantMeasurements({ rect: { x: 0, y: 0, width: 350, length: 220 } }, value => `${value} mm`, value => `${value} mm²`);
  assert.deepEqual(metric, { length: '220 mm', width: '350 mm', area: '77000 mm²' });
  const imperial = overlay.formatRemnantMeasurements({ rect: { x: 0, y: 0, width: 350, length: 220 } }, value => `${(value / 25.4).toFixed(2)} in`, value => `${(value / 645.16).toFixed(2)} sq in`);
  assert.deepEqual(imperial, { length: '8.66 in', width: '13.78 in', area: '119.35 sq in' });
});

test('new user-facing copy exists in both languages and the phone toggle has compact responsive CSS', () => {
  assert.equal(overlay.copy('showPaths', 'zh'), '顯示逐刀切線');
  assert.equal(overlay.copy('showPaths', 'en'), 'Show cut-path overlay');
  assert.match(overlay.copy('pathHint', 'en'), /including edge-trim cuts/);
  assert.equal(overlay.copy('remnantSize', 'zh'), '長 × 闊');
  assert.equal(overlay.copy('remnantSize', 'en'), 'length × width');
  assert.match(overlay.copy('fitsCurrent', 'en'), /^Geometrically fits/);
  assert.match(overlay.copy('remnantCaveat', 'zh'), /不保證未來用途或安全認證/);
  assert.match(html, /cutOverlay\.formatRemnantMeasurements\([^\n]*fmtDim[^\n]*fmtArea\)/);
  assert.match(html, /<\/strong>&nbsp;（\$\{esc\(cutCopy\('remnantSize'\)\)\}）/);
  assert.match(html, /<script src="assets\/cut-path-overlay\.js\?v=2"><\/script>/);
  assert.ok(serviceWorker.includes("'./assets/cut-path-overlay.js?v=2'"));
  assert.match(html, /cut-path-toggle-row/);
  assert.match(html, /@media\s*\(max-width:\s*600px\)[\s\S]{0,700}cut-path-toggle/);
});


function loadUnitFormatters(unitSystem) {
  const dimension = html.match(/function formatDimension\(mm\) \{([\s\S]*?)\n  \}\n  function formatArea/);
  const area = html.match(/function formatArea\(mm2\) \{([\s\S]*?)\n  \}\n\n  function refreshPartTable/);
  assert.ok(dimension, 'extract the current repo display dimension formatter');
  assert.ok(area, 'extract the current repo display area formatter');
  const context = {};
  vm.runInNewContext(`
    const nfmt = n => Number(n).toLocaleString('zh-TW', { maximumFractionDigits: 2 });
    const selectedUnit = () => ${JSON.stringify(unitSystem)};
    function formatDimension(mm) {${dimension[1]}\n    }
    function formatArea(mm2) {${area[1]}\n    }
    globalThis.formatters = { formatDimension, formatArea };
  `, context, { filename: `index.html#formatters-${unitSystem}` });
  return context.formatters;
}

test('candidate board caption renders a 72×48 in sheet in the selected unit; metric output remains mm', () => {
  const captionLine = html.split('\n').find(line => line.includes('原板實際尺寸：'));
  assert.ok(captionLine, 'find the real candidate board caption in the current renderer');
  assert.ok(captionLine.includes('${fmtDim(b.width)} × ${fmtDim(b.length)}'), 'caption must format actual width and length through fmtDim');
  assert.doesNotMatch(captionLine, /toLocaleString|\}\s*mm/, 'caption must not append a hard-coded mm suffix');

  const widthMm = 72 * 25.4, lengthMm = 48 * 25.4;
  const imperial = loadUnitFormatters('imperial');
  assert.equal(`${imperial.formatDimension(widthMm)} × ${imperial.formatDimension(lengthMm)}`, '6尺 × 4尺');
  assert.equal(imperial.formatArea(widthMm * lengthMm), '3,456 吋²');

  const metric = loadUnitFormatters('metric');
  assert.equal(`${metric.formatDimension(widthMm)} × ${metric.formatDimension(lengthMm)}`, '1,828.8 mm × 1,219.2 mm');
  assert.equal(metric.formatArea(widthMm * lengthMm), `${Number(widthMm * lengthMm).toLocaleString('zh-TW', { maximumFractionDigits: 2 })} mm²`);
});

test('saving Imperial restores it after reopening through the same origin localStorage preference', () => {
  const start = html.indexOf("const UNIT_SYSTEM_STORAGE_KEY = 'plywood-layout-unit-system-v1';");
  const end = html.indexOf('function readLanguagePreference', start);
  assert.ok(start >= 0 && end > start, 'extract the actual app unit preference helpers');
  const preferenceSource = html.slice(start, end);
  const backingStore = new Map();
  function loadPreferences() {
    const localStorage = {
      getItem(key) { return backingStore.has(key) ? backingStore.get(key) : null; },
      setItem(key, value) { backingStore.set(key, String(value)); }
    };
    const context = { window: { localStorage } };
    vm.runInNewContext(`${preferenceSource}\nglobalThis.unitPreferences = { key: UNIT_SYSTEM_STORAGE_KEY, read: readUnitSystemPreference, save: saveUnitSystemPreference };`, context, { filename: 'index.html#unit-preference' });
    return context.unitPreferences;
  }
  const firstLoad = loadPreferences();
  assert.equal(firstLoad.key, 'plywood-layout-unit-system-v1', 'reuse the established unit setting key');
  assert.equal(firstLoad.save('imperial'), true);
  const reopenedApp = loadPreferences();
  assert.equal(reopenedApp.read(), 'imperial');
  assert.match(html, /saveUnitSystemPreference\(unitSystem\)/, 'unit changes are persisted');
  assert.match(html, /const restoredUnitSystem = readUnitSystemPreference\(\) \|\| 'metric';\s*unitSystemSelect\.value = restoredUnitSystem;/, 'app init restores the saved preference into the existing selector');
});

test('kerf, edge trim, cut rectangles and remnant dimensions all use current-unit result formatters', () => {
  assert.ok(html.includes('fmtDim(plan.kerf)'), 'kerf output is formatted through the selected-unit formatter');
  assert.ok(html.includes('fmtDim(trim.left)') && html.includes('fmtDim(trim.right)') && html.includes('fmtDim(trim.top)') && html.includes('fmtDim(trim.bottom)'), 'all four trim outputs share that formatter');
  assert.ok(html.includes('rectText(step.kerfBand)') && html.includes('rectText(step.sourceRect)') && html.includes('outputsText(step)'), 'cut details pass actual cut rectangles and outputs through rectText');
  assert.ok(html.includes('cutOverlay.formatRemnantMeasurements(remnant,fmtDim,fmtArea)'), 'remnant dimensions and area use the same active dimension/area formatters');
  assert.match(html, /const oldUpdateUnitSystem = calculator\.updateUnitSystem\.bind\(calculator\);[\s\S]*?if \(this\.trialPlan\)\s*\{[\s\S]*?PlywoodTrialUI\.render\(this\.trialPlan/, 'changing units rerenders the existing plan without recomputing cut data');
});
