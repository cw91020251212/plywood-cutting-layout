'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const saw = require('../assets/table-saw-optimizer.js');
const overlay = require('../assets/cut-path-overlay.js');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const engineSource = scripts.find(s => s.includes('global.PlywoodTrialEngine={version:VERSION,plan,verifyBoard,orientations}'));
assert.ok(engineSource, 'test the actual production engine, not a duplicate');
const parts = [{width:300,length:440,count:2,orientationPreference:'fixed_vertical'},
  {width:300,length:250,count:4,orientationPreference:'fixed_horizontal'}];
const boards = [{width:603,length:1000}];
const settings = {mode:'ripThenCrosscut',kerf:3,trims:{},edges:{},minSupportWidth:''};
function loadEngine(helper = saw) {
  const context = {window:{PlywoodTableSaw:helper},console};
  vm.runInNewContext(engineSource, context);
  return {engine:context.window.PlywoodTrialEngine, context};
}
function loadPool(demand, stock) {
  const {engine,context} = loadEngine();
  context.window.calculator = {parts:demand,boards:stock};
  const start = html.indexOf('  function totalCutCount(plan)');
  const end = html.indexOf('  function updateVariationControls()', start);
  assert.ok(start>=0&&end>start);
  vm.runInNewContext(`
    const selectedObjective=()=> 'saving';
    const getParts=()=>window.calculator.parts.map(p=>({...p}));
    const getBoards=()=>window.calculator.boards.map(b=>({...b}));
    const safeForDisplay=p=>p.validation.boardIssues.length===0&&p.validation.countIssues.length===0&&p.boards.every(b=>b.validation.ok);
    ${html.slice(start,end)}
    globalThis.poolApi={buildCandidatePool,rankPlan,searchProfiles,strictlyValidCandidate};
  `,context);
  return {engine,api:context.poolApi};
}
function choice(length,id='a',width=300){return {token:{id},o:{width,length,rotated:false}};}

test('production equal-width combinations solve the six-part fixture with one sheet and seven through cuts',()=>{
  const {engine}=loadEngine();
  const plan=engine.plan(parts,boards,settings);
  assert.equal(plan.status,'candidate');
  assert.equal(plan.summary.usedBoardCount,1);
  assert.equal(plan.summary.boardsAdded,0);
  assert.equal(plan.summary.placedParts,6);
  assert.equal(plan.boards[0].cuts.length,7);
  assert.equal(plan.summary.kerfArea,8400);
  assert.equal(plan.summary.wasteArea,30600);
  assert.ok(engine.verifyBoard(plan.boards[0],3).ok);
  assert.equal(plan.boards[0].cuts[0].phase,'rip');
  assert.ok(plan.boards[0].cuts.slice(1).every(c=>c.phase==='crosscut'));
  for(const cut of plan.boards[0].cuts){
    assert.equal(cut.axis==='x'?cut.kerfBand.length:cut.kerfBand.width,
      cut.axis==='x'?cut.sourceRect.length:cut.sourceRect.width);
  }
});

test('the real candidate pool retains the greedy baseline and ranks the verified one-sheet plan first',()=>{
  const {engine,api}=loadPool(parts,boards);
  const initial=engine.plan(parts,boards,settings);
  const pool=api.buildCandidatePool(initial,settings,['ripThenCrosscut','partFirstTree'],x=>x,'saving');
  assert.ok(pool.length>1);
  assert.equal(pool[0].plan.summary.usedBoardCount,1);
  assert.equal(pool[0].plan.boards[0].cuts.length,7);
  assert.ok(pool.some(item=>item.plan.summary.usedBoardCount===2),'old two-sheet baseline is still searched');
  assert.ok(pool.every(item=>api.strictlyValidCandidate(item.plan,{})));
  assert.equal(new Set(pool.map(item=>item.signature)).size,pool.length);
});

test('saving no longer rewards more kerf just because fewer offcuts remain',()=>{
  const demand=[{width:300,length:200,count:2,orientationPreference:'auto'}], stock=[{width:1000,length:600}];
  const {engine,api}=loadPool(demand,stock);
  const initial=engine.plan(demand,stock,settings);
  const pool=api.buildCandidatePool(initial,settings,['ripThenCrosscut','partFirstTree'],x=>x,'saving');
  assert.equal(pool[0].plan.summary.kerfArea,3600);
  assert.equal(saw.planMetrics(pool[0].plan).cuts,3);
  assert.ok(pool.some(item=>item.plan.summary.kerfArea===4800));
  const expensive=pool.find(item=>item.plan.summary.kerfArea===4800).plan;
  assert.ok(api.rankPlan(pool[0].plan,expensive,'saving')<0);
});

test('same-cut convenience ties use axis changes before path length; metrics do not mutate cuts',()=>{
  const make=axes=>({summary:{usedBoardCount:1,boardArea:100,kerfArea:10},boards:[{cuts:axes.map(axis=>({axis,phase:'part-tree',sourceRect:{width:10,length:10}}))}]});
  const grouped=make(['x','x','y','y']),alternating=make(['x','y','x','y']);
  const original=JSON.stringify(grouped);
  assert.equal(saw.planMetrics(grouped).axisChanges,1);
  assert.equal(saw.planMetrics(alternating).axisChanges,3);
  assert.ok(saw.comparePlans(grouped,alternating,'convenience')<0);
  assert.equal(JSON.stringify(grouped),original);
});

test('the real pool searches stock order while preserving original inventory indices',()=>{
  const demand=[{width:500,length:500,count:2,orientationPreference:'auto'}];
  const stock=[{width:600,length:600},{width:1100,length:1100}];
  const {engine,api}=loadPool(demand,stock);
  const initial=engine.plan(demand,stock,settings);
  const pool=api.buildCandidatePool(initial,settings,['ripThenCrosscut','partFirstTree'],x=>x,'saving');
  assert.equal(initial.summary.usedBoardCount,2);
  assert.equal(pool[0].plan.summary.usedBoardCount,1);
  assert.equal(pool[0].plan.boards[0].stockIndex,1);
  assert.equal(pool[0].plan.boards[0].boardId,'STOCK-02');
  assert.ok(pool[0].plan.validation.ok);
});

test('uncut terminal parts are not remnants, including two full-length strips and a whole-sheet fit',()=>{
  const {engine}=loadEngine();
  for(const fixture of [
    {p:[{width:300,length:600,count:1,orientationPreference:'fixed_vertical'}],b:[{width:1000,length:600}],expected:1},
    {p:[{width:300,length:1000,count:2,orientationPreference:'fixed_vertical'}],b:boards,expected:0},
    {p:[{width:603,length:1000,count:1,orientationPreference:'fixed_vertical'}],b:boards,expected:0}
  ]){
    const plan=engine.plan(fixture.p,fixture.b,settings);
    assert.equal(plan.status,'candidate');
    const board=plan.boards[0],remnants=overlay.finalMaterialLeaves(board);
    assert.equal(remnants.length,fixture.expected);
    const completed=new Set(board.results.map(p=>p.sourceMaterialId));
    assert.ok(remnants.every(r=>!completed.has(r.materialId)));
    if(fixture.expected)assert.equal(remnants[0].rect.width,697);
  }
});

test('cut datums distinguish the current workpiece from original-sheet coordinates without moving cuts',()=>{
  const {engine}=loadEngine();
  const board=engine.plan(parts,boards,{...settings,stripSelection:'greedy'}).boards[0];
  const cut=board.cuts.find(c=>c.axis==='y'&&c.sourceRect.y===443);
  const original=JSON.stringify(cut),datum=saw.cutDatum(cut);
  assert.equal(datum.globalCenter,884.5);
  assert.equal(datum.localCenter,441.5);
  assert.equal(datum.localNearEdge,440);
  assert.equal(datum.localFarEdge,443);
  assert.equal(JSON.stringify(cut),original);
  assert.ok(html.includes('相對工件')&&html.includes('原板全局中心'));
  assert.ok(html.includes('刀位是幾何資料，不是靠山設定值'));
});

test('subset boundaries cover exact end edge, a final tail cut, decimal kerf and invalid IDs',()=>{
  const exact=saw.selectStripParts([choice(400,'a'),choice(597,'b')],1000,3);
  assert.equal(exact.selected.length,2);
  assert.equal(exact.endCutRequired,false);
  assert.equal(exact.remainingAfterEndCut,0);
  assert.equal(saw.selectStripParts([choice(998)],1000,3).selected.length,0);
  const decimal=saw.selectStripParts([choice(440.2,'a'),choice(250.1,'b'),choice(250.1,'c')],1000,3.2);
  assert.equal(decimal.selected.length,3);
  assert.ok(decimal.remainingAfterEndCut>0);
  assert.throws(()=>saw.selectStripParts([choice(100,'a'),choice(100,'a')],1000,3),TypeError);
  assert.throws(()=>saw.selectStripParts([choice(100,'a',300),choice(100,'b',400)],1000,3),TypeError);
  assert.throws(()=>saw.selectStripParts([],1000,0),TypeError);
});

test('state/work limits are explicit and production falls back without bypassing cut validation',()=>{
  for(const options of [{maxStates:1},{maxVisits:1}]){
    assert.throws(()=>saw.selectStripParts([choice(100,'a'),choice(200,'b')],1000,3,options),e=>e.code==='STRIP_SEARCH_LIMIT');
  }
  const capped={...saw,selectStripParts:(c,l,k)=>saw.selectStripParts(c,l,k,{maxStates:1})};
  const {engine}=loadEngine(capped),plan=engine.plan(parts,boards,settings);
  assert.equal(plan.status,'candidate');
  assert.equal(plan.summary.usedBoardCount,2);
  assert.ok(plan.stripSearch.limited>0);
  assert.ok(plan.boards.every(b=>engine.verifyBoard(b,3).ok));
});

test('missing optimizer asset preserves a checked greedy layout and reports the fallback',()=>{
  const {engine}=loadEngine(undefined);
  // default function parameter uses saw; delete it explicitly for this negative case.
  const missingContext={window:{},console};vm.runInNewContext(engineSource,missingContext);
  const plan=missingContext.window.PlywoodTrialEngine.plan(parts,boards,settings);
  assert.equal(plan.status,'candidate');
  assert.ok(plan.stripSearch.unavailable>0);
  assert.equal(plan.summary.usedBoardCount,2);
});

test('fixed orientations, trim, exact-fit pieces and decimal dimensions retain correct material balance',()=>{
  const {engine}=loadEngine();let seed=9102025;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<64;i++){
    const width=150+i%4*50;
    const demand=Array.from({length:3},()=>({width,length:100+Math.floor(random()*500)+(i%2?0.25:0),count:1+Math.floor(random()*3),orientationPreference:i%3?'auto':'fixed_vertical'}));
    const kerf=i%2?3.2:3;
    const opts={...settings,kerf,trims:i%2?{left:10,right:10,top:10,bottom:10}:{}};
    const plan=engine.plan(demand,[{width:1100,length:1500}],opts);
    assert.equal(plan.status,'candidate');
    assert.equal(plan.summary.placedParts,demand.reduce((n,p)=>n+p.count,0));
    for(const board of plan.boards){
      assert.ok(engine.verifyBoard(board,kerf).ok);
      for(const result of board.results){
        const spec=demand[result.sourceRow-1];
        assert.ok(engine.orientations(spec).some(o=>Math.abs(o.width-result.width)<1e-7&&Math.abs(o.length-result.length)<1e-7));
      }
    }
  }
});

test('non-finite counts fail before expansion; PWA loads versioned production assets and table-saw default',()=>{
  const {engine}=loadEngine();
  assert.throws(()=>engine.plan([{width:10,length:10,count:Infinity}],boards,settings),/數量無效/);
  assert.match(html,/<option value="ripThenCrosscut" selected>/);
  assert.match(html,/<script src="assets\/table-saw-optimizer\.js\?v=1"><\/script>/);
  assert.match(html,/<script src="assets\/part-appearance\.js\?v=3"><\/script>/);
  assert.match(html,/<script src="assets\/part-dimension-display\.js\?v=1"><\/script>/);
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.ok(sw.includes('2026-10-07-part-dimensions-2'));
  assert.ok(sw.includes('./assets/table-saw-optimizer.js?v=1'));
  assert.ok(sw.includes('./assets/cut-path-overlay.js?v=3'));
  assert.ok(sw.includes('./assets/part-appearance.js?v=3'));
  assert.ok(sw.includes('./assets/part-dimension-display.js?v=1'));
});

test('disabled stock sheets never renumber the remaining inventory or enter the plan',()=>{
  const demand=[{width:500,length:500,count:2,orientationPreference:'auto'}];
  const stock=[{width:600,length:600,disabled:true},{width:700,length:700},{width:1100,length:1100}];
  const {engine,api}=loadPool(demand,stock);
  const initial=engine.plan(demand,stock,settings);
  assert.equal(initial.boards[0].stockIndex,1);
  assert.equal(initial.boards[0].boardId,'STOCK-02');
  const pool=api.buildCandidatePool(initial,settings,['ripThenCrosscut','partFirstTree'],x=>x,'saving');
  assert.equal(pool[0].plan.summary.usedBoardCount,1);
  assert.equal(pool[0].plan.boards[0].stockIndex,2);
  assert.equal(pool[0].plan.boards[0].boardId,'STOCK-03');
  for(const {plan} of pool)for(const board of plan.boards){
    if(board.added)continue;
    assert.ok(board.stockIndex>0);
    assert.equal(board.width,stock[board.stockIndex].width);
    assert.equal(board.length,stock[board.stockIndex].length);
  }
  assert.ok(pool.every(item=>item.plan.validation.ok));
});

test('each PWA core asset exists in the deployed repository',()=>{
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const list=sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/)[1];
  for(const match of list.matchAll(/'([^']+)'/g)){
    const asset=match[1].split('?')[0];
    assert.ok(fs.existsSync(path.join(root,asset)),asset+' must exist');
  }
});

test('table-saw guidance is bilingual, exposes the actual process and preserves customary feet-inch-fen inputs',()=>{
  assert.match(html,/id="tableSawWorkflowHint"[^>]*>鋸枱提示：預設/);
  assert.match(html,/Table-saw note: defaults to rip, then crosscut/);
  assert.match(html,/['"]今次採用工序：['"],['"]Process used:['"]/);
  assert.match(html,/查看逐刀刀序與餘料/);
  assert.match(html,/Review cut order and offcuts/);
  assert.match(html,/detailButton\.setAttribute\('aria-controls','cutDetails'\)/);
  assert.match(html,/target\.open=true/);
  const expected=['partLengthFt','partLengthInch','partLengthFen','partWidthFt','partWidthInch','partWidthFen',
    'boardLengthFt','boardLengthInch','boardLengthFen','boardWidthFt','boardWidthInch','boardWidthFen'];
  for(const id of expected){
    const field=new RegExp('<input\\b(?=[^>]*\\bid="'+id+'")[^>]*>\\s*<span class="unit-label">(尺|寸|分)<\\/span>');
    assert.match(html,field,id+' must retain its traditional imperial field and unit label');
  }
  for(const id of ['partLengthFen','partWidthFen','boardLengthFen','boardWidthFen']){
    const start=html.indexOf('id="'+id+'"');
    assert.ok(start>=0&&html.slice(start-100,start+180).includes('max="7"')&&html.slice(start-100,start+180).includes('step="1"'),id+' still accepts eighth-inch fractions');
  }
});

test('dark-mode imperial unit-label shadow is scoped away from metric and light-mode labels',()=>{
  assert.match(html,/body\.wood-dark-mode \.dimension-unit-row\.imperial \.unit-label\s*\{\s*text-shadow:[^}]*rgba\(0,0,0,/);
  assert.match(html,/body\.wood-dark-mode \.unit-label\{color:#dbe5ec!important\}/);
  assert.doesNotMatch(html,/body\.wood-dark-mode \.unit-label\{[^}]*text-shadow:/);
  assert.doesNotMatch(html,/body\.wood-dark-mode \.dimension-unit-row\.metric \.unit-label\s*\{[^}]*text-shadow:/);
});
