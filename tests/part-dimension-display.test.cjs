'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const display = require('../assets/part-dimension-display.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const parts = [
  { id: 'P001', x: 0, y: 0, width: 300, length: 500 },
  { id: 'P002', x: 300, y: 0, width: 302, height: 500 },
  { id: 'P003', x: 0, y: 500, width: 400, length: 600 }
];

test('dimension display modes normalize safely and isolate the clicked part', () => {
  assert.deepEqual(display.MODES, ['auto', 'selected', 'all']);
  assert.equal(display.normalizeMode('all'), 'all');
  assert.equal(display.normalizeMode('unknown'), 'auto');
  assert.deepEqual(display.visibleParts(parts, 'auto').map(part => part.id), ['P001', 'P002', 'P003']);
  assert.deepEqual(display.visibleParts(parts, 'all').map(part => part.id), ['P001', 'P002', 'P003']);
  assert.deepEqual(display.visibleParts(parts, 'selected', 'P002').map(part => part.id), ['P002']);
  assert.deepEqual(display.visibleParts(parts, 'selected', null), []);
});

test('canvas hit testing respects piece boundaries and returns the topmost drawn piece', () => {
  const overlap = [
    { id: 'under', x: 0, y: 0, width: 100, length: 100 },
    { id: 'over', x: 40, y: 40, width: 100, length: 100 }
  ];
  assert.equal(display.hitTest(overlap, 60, 60).id, 'over');
  assert.equal(display.hitTest(parts, 450, 250).id, 'P002');
  assert.equal(display.hitTest(parts, 900, 900), null);
  assert.equal(display.hitTest(parts, NaN, 20), null);
});

test('part numbers remain tied to the full board order when replay shows only some parts', () => {
  const replayParts = [parts[2], parts[0]];
  assert.equal(display.ordinal(parts, replayParts[0].id), 3);
  assert.equal(display.ordinal(parts, replayParts[1].id), 1);
  assert.equal(display.ordinal(parts, 'missing'), 0);
});

test('edge dimensions label each of four sides and keep length/width identity after rotation', () => {
  const upright = { width: 300, length: 500, originalWidth: 300, originalLength: 500 };
  assert.deepEqual(display.edgeDimensions(upright), [
    { side: 'top', dimension: 'width', mm: 300 },
    { side: 'right', dimension: 'length', mm: 500 },
    { side: 'bottom', dimension: 'width', mm: 300 },
    { side: 'left', dimension: 'length', mm: 500 }
  ]);
  const rotated = { width: 500, length: 300, originalWidth: 300, originalLength: 500, rotated: true };
  assert.deepEqual(display.edgeDimensions(rotated).map(edge => [edge.side, edge.dimension, edge.mm]), [
    ['top', 'length', 500], ['right', 'width', 300], ['bottom', 'length', 500], ['left', 'width', 300]
  ]);
  assert.deepEqual(display.edgeDimensions({ width: 0, length: 500 }), []);
});

test('dimension controls are bilingual, accessible, and connected to the canvas and all-part list', () => {
  assert.match(html, /<script src="assets\/part-dimension-display\.js\?v=2"><\/script>/);
  assert.match(html, /<label id="partDimensionLabel" for="partDimensionMode">部件尺寸標示<\/label>/);
  assert.match(html, /<option value="auto" selected>自動（適合時顯示）<\/option>/);
  assert.match(html, /<option value="selected">點選單件顯示尺寸<\/option>/);
  assert.match(html, /<option value="all">全部部件顯示尺寸<\/option>/);
  assert.match(html, /\['部件尺寸標示','Part dimension labels'\]/);
  assert.match(html, /\['點選單件顯示尺寸','Click one part to show its dimensions'\]/);
  assert.match(html, /\['全部部件顯示尺寸','Show dimensions for all parts'\]/);
  assert.match(html, /handleDimensionCanvasClick/);
  assert.match(html, /part-dimension-all-list/);
  assert.match(html, /dimensionDisplay\.visibleParts/);
  assert.match(html, /dimensionDisplay\.edgeDimensions\(part\)/);
  assert.match(html, /Selected\/all modes label all four edges/);
  assert.match(html, /上邊|Top/);
});

test('selected and all modes draw a measurement beside each of the four edges and list side names', () => {
  const start = html.indexOf('function drawPartEdgeDimensions');
  const end = html.indexOf('\n  function drawPartLabels', start);
  const source = html.slice(start, end);
  assert.ok(start >= 0 && end > start, 'four-edge canvas renderer exists');
  for (const side of ['top', 'right', 'bottom', 'left']) assert.match(source, new RegExp(`draw\\('${side}'`));
  assert.match(html, /sideName=\{top:english\?'Top':'上邊',right:english\?'Right':'右邊',bottom:english\?'Bottom':'下邊',left:english\?'Left':'左邊'\}/);
  assert.match(html, /partDimensionLabel\(board,selected,english\)/);
  assert.match(html, /partDimensionLabel\(board,part,english\)/);
});

test('changing dimension mode is display-only and preserves the current replay position', () => {
  const start = html.indexOf("dimensionModeSelect.addEventListener('change'");
  const end = html.indexOf('\n  }', start);
  const handler = html.slice(start, end);
  assert.ok(start >= 0 && end > start, 'dimension-mode change handler exists');
  assert.match(handler, /savePartDimensionMode\(partDimensionMode\)/);
  assert.match(handler, /rerenderCurrentTrial\(\)/);
  assert.doesNotMatch(handler, /\.calculate\s*\(/, 'a visual mode change must not rerun layout search');
  const redraw = html.slice(html.indexOf('function rerenderCurrentTrial()'), html.indexOf("const appearanceSelect=$('partAppearanceStyle')"));
  assert.match(redraw, /const replay=\[\]/);
  assert.match(redraw, /window\.PlywoodTrialUI\.render\(plan,label\)/);
  assert.match(redraw, /window\.PlywoodTrialUI\.redrawBoard/);
  assert.match(html, /drawPartIndexBadge/);
  assert.match(html, /drawSelectedPartOutline/);
});
