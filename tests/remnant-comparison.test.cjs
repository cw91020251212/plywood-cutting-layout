'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const compare = require('../assets/remnant-comparison.js');
const overlay = require('../assets/cut-path-overlay.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
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

test('comparison collects only replay-verified final material leaves and keeps exact dimensions/source sheets', () => {
  const planner = engine();
  const first = planner.plan([{width:420,length:310,count:1}], [{width:1000,length:1600}], settings);
  const second = planner.plan([{width:250,length:260,count:2}], [{width:1000,length:1600}], settings);
  assert.equal(overlay.isVerifiedPlan(first), true);
  assert.equal(overlay.isVerifiedPlan(second), true);
  const app = { trialPlan:first, _trialCandidates:[{plan:first,key:'A'},{plan:second,key:'B'}] };
  const candidates = compare.collectCandidates(app, overlay);
  assert.equal(candidates.length, 2);
  for (const [index, plan] of [first, second].entries()) {
    const expected = plan.boards.flatMap(board => overlay.finalMaterialLeaves(board));
    assert.equal(candidates[index].remnants.length, expected.length);
    assert.deepEqual(JSON.parse(JSON.stringify(candidates[index].remnants.map(remnant => [remnant.materialId,remnant.rect.width,remnant.rect.length]))), JSON.parse(JSON.stringify(expected.map(remnant => [remnant.materialId,remnant.rect.width,remnant.rect.length]))));
    assert.ok(candidates[index].remnants.every(remnant => remnant.boardId === undefined || typeof remnant.boardId === 'string'));
  }
  const before = JSON.stringify(app);
  const model = compare.layout(candidates);
  assert.equal(JSON.stringify(app), before);
  assert.ok(model.canvasWidth > 0 && model.canvasHeight > 0);
  assert.equal(model.candidates.length, 2);
  assert.equal(model.candidates[0].canvases.length, model.candidates[1].canvases.length);
  for (const candidate of model.candidates) {
    const placements = candidate.canvases.flat();
    assert.equal(placements.length, candidate.remnants.length);
    for (const item of placements) {
      assert.equal(item.display.width, item.rect.length);
      assert.equal(item.display.height, item.rect.width);
    }
    for (const canvas of candidate.canvases) {
      for (let i=0;i<canvas.length;i++) for (let j=i+1;j<canvas.length;j++) {
        const a=canvas[i].display,b=canvas[j].display;
        assert.ok(a.x+a.width<=b.x+1e-7 || b.x+b.width<=a.x+1e-7 || a.y+a.height<=b.y+1e-7 || b.y+b.height<=a.y+1e-7, 'distinct pieces must not overlap');
      }
    }
  }
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

test('all real remnants remain present even when more than two identical display canvases are required', () => {
  const pieces = Array.from({length:9}, (_,index) => ({candidateIndex:0,boardIndex:0,materialId:`R${index+1}`,rect:{x:0,y:0,width:900,length:900},area:810000}));
  const candidate = {candidateIndex:0,plan:{boards:[{width:1000,length:1000}]},remnants:pieces};
  const model = compare.layout([candidate]);
  assert.equal(model.canvasCount,3);
  assert.equal(model.candidates[0].canvases.flat().length,9);
  assert.deepEqual(model.candidates[0].canvases.flat().map(item=>item.materialId).sort(),Array.from({length:9},(_,index)=>`R${index+1}`));
});

test('HTML and offline cache wire the separate comparison entry and both UI modules', () => {
  assert.match(html,/id="openRemnantComparison"/);
  assert.match(html,/id="remnantComparisonDialog"/);
  assert.match(html,/href="assets\/remnant-comparison\.css\?v=3"/);
  assert.match(html,/assets\/remnant-comparison-ui\.js\?v=2/);
  assert.match(html,/assets\/reusable-remnant-stock-ui\.js\?v=2/);
  for (const file of ['remnant-comparison.js?v=2','remnant-comparison-ui.js?v=2','remnant-comparison.css?v=3','reusable-remnant-stock-ui.js?v=2']) assert.ok(sw.includes(`./assets/${file}`));
});

test('comparison and stock controls resist shared section sizing without changing either table', () => {
  assert.match(componentCss, /#remnantComparisonDialog \.remnant-comparison-heading\s*\{[^}]*display:\s*flex\s*!important/);
  assert.match(componentCss, /#remnantComparisonDialog \.remnant-comparison-close\s*\{[^}]*width:\s*auto\s*!important/);
  assert.match(componentCss, /#remnantComparisonDialog \.remnant-comparison-piece-button\s*\{[^}]*height:\s*auto\s*!important/);
  assert.match(componentCss, /#remnantStockManager input\.remnant-stock-select\s*\{[^}]*width:\s*20px\s*!important[^}]*height:\s*20px\s*!important/);
  assert.match(componentCss, /#remnantStockManager \.remnant-stock-toolbar button\s*\{[^}]*width:\s*auto\s*!important/);
  assert.match(componentCss, /#remnantStockManager \.remnant-stock-actions button\s*\{[^}]*width:\s*auto\s*!important/);
  const selectorsOnly = componentCss.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(selectorsOnly, /\.section\s+button|#partsTable|#boardsTable/);
});
