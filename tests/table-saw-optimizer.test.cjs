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
function loadPool(demand, stock, helper = saw) {
  const {engine,context} = loadEngine(helper);
  context.setTimeout=setTimeout;
  context.window.calculator = {parts:demand,boards:stock};
  const start = html.indexOf('  function totalCutCount(plan)');
  const end = html.indexOf('  function updateVariationControls()', start);
  const moreStart=html.indexOf('  async function searchMoreCandidates()');
  const moreEnd=html.indexOf('  function calculate(){',moreStart);
  const clearStart=html.indexOf('  function clearCandidatePool()');
  const clearEnd=html.indexOf('  function commitCandidate(index){',clearStart);
  assert.ok(start>=0&&end>start);
  vm.runInNewContext(`
    const selectedObjective=()=> 'saving';
    const getParts=()=>window.calculator.parts.map(p=>({...p}));
    const getBoards=()=>window.calculator.boards.map(b=>({...b}));
    const safeForDisplay=p=>p.validation.boardIssues.length===0&&p.validation.countIssues.length===0&&p.boards.every(b=>b.validation.ok);
    ${html.slice(start,end)}
    const $=()=>null;
    function updateVariationControls(){if(window.onVariationUpdate)window.onVariationUpdate();}
    ${html.slice(clearStart,clearEnd)}
    ${html.slice(moreStart,moreEnd)}
    globalThis.poolApi={buildCandidatePool,rankPlan,searchProfiles,diversityProfiles,candidateSignature,strictlyValidCandidate,searchMoreCandidates,clearCandidatePool};
  `,context);
  return {engine,api:context.poolApi,context};
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
  assert.match(html,/<script src="assets\/table-saw-optimizer\.js\?v=2"><\/script>/);
  assert.match(html,/<script src="assets\/part-appearance\.js\?v=3"><\/script>/);
  assert.match(html,/<script src="assets\/part-dimension-display\.js\?v=2"><\/script>/);
  assert.match(html,/@keyframes calculateButtonSheen/);
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.ok(sw.includes('2026-10-08-compact-layout-2'));
  assert.ok(sw.includes('./assets/table-saw-optimizer.js?v=2'));
  assert.ok(sw.includes('./assets/cut-path-overlay.js?v=5'));
  assert.ok(sw.includes('./assets/part-appearance.js?v=3'));
  assert.ok(sw.includes('./assets/part-dimension-display.js?v=2'));
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


test('real saving pool retains a larger intact remnant before minimizing kerf at equal sheet use',()=>{
  const demand=[{width:300,length:150,count:2,orientationPreference:'auto'},{width:100,length:450,count:1,orientationPreference:'auto'}];
  const stock=[{width:1000,length:1000}];
  const {engine,api}=loadPool(demand,stock);
  const pool=api.buildCandidatePool(engine.plan(demand,stock,settings),settings,['ripThenCrosscut','partFirstTree'],x=>x,'saving');
  const chosen=pool[0].plan;
  assert.equal(chosen.summary.usedBoardCount,1);
  assert.equal(chosen.summary.boardArea,1000000);
  assert.equal(chosen.summary.largestRemnantArea,744000);
  assert.equal(chosen.summary.largestRemnant.rect.width,744);
  assert.equal(chosen.summary.largestRemnant.rect.length,1000);
  assert.equal(chosen.summary.kerfArea,7200);
  assert.equal(saw.planMetrics(chosen).cuts,5);
  const oldBest=pool.find(x=>x.plan.summary.largestRemnantArea===697000&&x.plan.summary.kerfArea===7182);
  assert.ok(oldBest,'previous lower-kerf candidate remains in the pool');
  assert.ok(api.rankPlan(chosen,oldBest.plan,'saving')<0);
  assert.ok(pool.every(x=>api.strictlyValidCandidate(x.plan,{})));
  assert.ok(pool.every(x=>api.rankPlan(chosen,x.plan,'saving')<=0));
});

test('saving keeps sheet count/area first, then intact rectangle; kerf precedes fragmentation and convenience is unchanged',()=>{
  const make=(overrides={},cuts=3)=>({summary:{usedBoardCount:1,boardArea:1000000,kerfArea:8000,largestRemnantArea:600000,largestRemnantShortSide:600,retainedRemnantCount:2,...overrides},boards:[{cuts:Array.from({length:cuts},()=>({axis:'x',phase:'rip',sourceRect:{width:1000,length:1000}}))}]});
  const base=make(),snapshot=JSON.stringify(base);
  assert.ok(saw.comparePlans(base,make({usedBoardCount:2,largestRemnantArea:900000}),'saving')<0);
  assert.ok(saw.comparePlans(base,make({boardArea:2000000,largestRemnantArea:900000}),'saving')<0);
  assert.ok(saw.comparePlans(base,make({largestRemnantArea:500000,kerfArea:7000}),'saving')<0);
  assert.ok(saw.comparePlans(base,make({largestRemnantShortSide:100}),'saving')<0);
  assert.ok(saw.comparePlans(base,make({kerfArea:9000,retainedRemnantCount:1}),'saving')<0,'do not saw away a tail merely to reduce count');
  assert.ok(saw.comparePlans(make({retainedRemnantCount:1}),base,'saving')<0);
  assert.ok(saw.comparePlans(make({largestRemnantArea:100000},2),base,'convenience')<0);
  assert.equal(JSON.stringify(base),snapshot);
});

test('integrity summary uses individual final leaves, not L-shaped unions, trims, kerf or exact-fit parts',()=>{
  const {engine}=loadEngine();
  const fixtures=[
    {p:[{width:300,length:440,count:1,orientationPreference:'fixed_vertical'}],b:boards,s:{...settings,trims:{left:10,right:10,top:10,bottom:10}}},
    {p:parts,b:boards,s:settings},
    {p:[{width:603,length:1000,count:1,orientationPreference:'fixed_vertical'}],b:boards,s:settings}
  ];
  for(const {p,b,s} of fixtures)for(const mode of ['ripThenCrosscut','partFirstTree']){
    const plan=engine.plan(p,b,{...s,mode});
    assert.ok(plan.validation.ok);
    const real=plan.boards.flatMap(board=>overlay.finalMaterialLeaves(board));
    assert.equal(plan.summary.retainedRemnantCount,real.length);
    assert.equal(plan.summary.largestRemnantArea,Math.max(0,...real.map(r=>r.area)));
    for(const board of plan.boards){
      assert.deepEqual(JSON.parse(JSON.stringify(board.validation.finalRemnants)),overlay.finalMaterialLeaves(board).map(({materialId,rect,area})=>({materialId,rect,area})));
    }
    const largest=plan.summary.largestRemnant;
    if(largest)assert.ok(real.some(r=>r.boardId===largest.boardId&&r.materialId===largest.materialId&&r.area===largest.area));
    else assert.equal(real.length,0);
  }
  const trimmed=engine.plan(fixtures[0].p,boards,fixtures[0].s);
  assert.equal(trimmed.summary.retainedRemnantCount,2);
  const leaves=trimmed.boards[0].validation.finalRemnants;
  assert.ok(trimmed.summary.largestRemnantArea<leaves.reduce((n,r)=>n+r.area,0),'adjacent remaining regions are not added into one piece');
  assert.ok(overlay.leftoverPieces(trimmed.boards[0]).length>leaves.length,'trim offcuts remain displayed but are not integrity targets');
});

test('missing helper still computes physical remnant metrics and saving fallback ranks them first at equal sheet use',()=>{
  const demand=[{width:300,length:150,count:2,orientationPreference:'auto'},{width:100,length:450,count:1,orientationPreference:'auto'}];
  const stock=[{width:1000,length:1000}],{engine,api}=loadPool(demand,stock,null);
  const plan=engine.plan(demand,stock,settings);
  assert.ok(plan.stripSearch.unavailable>0);
  const pool=api.buildCandidatePool(plan,settings,['ripThenCrosscut','partFirstTree'],x=>x,'saving');
  assert.equal(pool[0].plan.summary.largestRemnantArea,744000);
  assert.ok(pool.every(x=>api.rankPlan(pool[0].plan,x.plan,'saving')<=0));
  assert.ok(pool.every(x=>x.plan.validation.ok));
});

test('intact-remnant guidance, displayed length/width and provenance are bilingual and versioned',()=>{
  assert.equal(saw.version,'table-saw-1.1.0');
  assert.equal(loadEngine().engine.version,'plywood-trial-1.3.0');
  assert.ok(html.includes('同等用料優先保留最大完整長方形餘料'));
  assert.equal(html.split('先少用板，同等用料下保留最大完整長方形餘料，再比較鋸縫及刀數。').length-1,2,'card and translation source stay synchronized');
  assert.ok(!html.includes('先比較用板數、原板總面積，再比較鋸縫及刀數；不以減少餘料獎勵更多鋸耗。'));
  assert.ok(html.includes('L-shaped blanks are never merged'));
  assert.ok(html.includes("integrityLine.id='remnantIntegritySummary'"));
  assert.ok(html.includes('fmtDim(r.rect.length,boardInputFor(')&&html.includes('fmtDim(r.rect.width,boardInputFor(')&&html.includes('esc(r.boardId)'));
  assert.ok(html.includes('Largest intact remnant:')&&html.includes('Separate remnants:'));
  assert.ok(html.includes('edge-trim offcuts excluded; geometry only, no reuse guarantee'));
});


function prepareMorePool(){
  const loaded=loadPool(parts,boards),{engine,api,context}=loaded;
  const pool=api.buildCandidatePool(engine.plan(parts,boards,settings),settings,['ripThenCrosscut'],x=>x,'saving');
  const c=context.window.calculator;
  Object.assign(c,{_trialCandidates:pool,trialPlan:pool[pool.length-1].plan,_trialCandidateIndex:pool.length-1,
    trialConfig:{...settings},trialMode:'ripThenCrosscut',_trialObjective:'saving',_trialNextSeed:13,_trialFixedOrientationOverrides:{}});
  return {...loaded,c};
}

test('diverse initial search increases the actual two-layout fixture and retains worse verified layouts',()=>{
  const {engine,api}=loadPool(parts,boards),initial=engine.plan(parts,boards,settings);
  const old=api.buildCandidatePool(initial,settings,['ripThenCrosscut'],x=>x,'saving',api.searchProfiles().filter(p=>!p.seed));
  const pool=api.buildCandidatePool(initial,settings,['ripThenCrosscut'],x=>x,'saving');
  assert.equal(old.length,2);
  assert.ok(pool.length>old.length&&pool.length>=5);
  assert.ok(old.every(item=>pool.some(x=>x.signature===item.signature)),'all old physical baselines remain');
  assert.equal(pool[0].plan.summary.usedBoardCount,1);
  assert.ok(pool.some(x=>x.plan.summary.usedBoardCount===2),'poorer material scores remain selectable');
  assert.ok(pool.every(x=>api.strictlyValidCandidate(x.plan,{})));
  assert.equal(new Set(pool.map(x=>x.signature)).size,pool.length);
  assert.equal(new Set(pool.map(x=>x.key)).size,pool.length);
});

test('physical signatures ignore renamed part/material IDs but detect a geometry change',()=>{
  const {engine,api}=loadPool(parts,boards),plan=engine.plan(parts,boards,settings);
  const renamed=JSON.parse(JSON.stringify(plan));
  for(const b of renamed.boards){
    for(const p of b.results){p.id='renamed-'+p.id;p.sourceMaterialId='renamed-'+p.sourceMaterialId;}
    for(const cut of b.cuts){cut.sourceMaterialId='renamed-'+cut.sourceMaterialId;cut.partId='renamed-'+cut.partId;
      for(const o of cut.outputs){o.materialId='renamed-'+o.materialId;o.partId='renamed-'+o.partId;}}
  }
  assert.equal(api.candidateSignature(plan).signature,api.candidateSignature(renamed).signature);
  renamed.boards[0].results[0].x+=3;
  assert.notEqual(api.candidateSignature(plan).signature,api.candidateSignature(renamed).signature);
});

test('seeded decisions are deterministic, do not mutate input and respect bounds',()=>{
  const {engine,api}=loadPool(parts,boards),profile=api.diversityProfiles(7,1)[0];
  const snapshot=JSON.stringify({parts,boards,settings,profile});
  const a=engine.plan(parts,boards,{...settings,searchProfile:profile,stripSelection:'greedy'});
  const b=engine.plan(parts,boards,{...settings,searchProfile:profile,stripSelection:'greedy'});
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.equal(a.searchProfile.seed,7);
  assert.equal(a.stripSelection,'greedy');
  assert.equal(JSON.stringify({parts,boards,settings,profile}),snapshot);
  assert.equal(api.searchProfiles().filter(p=>p.seed).length,12);
  assert.equal(api.diversityProfiles(13,24).length,24);
  assert.throws(()=>api.diversityProfiles(0,24),/範圍無效/);
  assert.throws(()=>api.diversityProfiles(13,25),/範圍無效/);
});

test('diverse layouts still obey disabled inventory, trims, support setting and per-part direction override',()=>{
  const stock=[{width:603,length:1000,disabled:true},{width:603,length:1000}];
  const overrides={P001:'fixed_horizontal'},opts={...settings,minSupportWidth:100,trims:{left:3,right:3,top:3,bottom:3},fixedOrientationOverrides:overrides};
  const {engine,api}=loadPool(parts,stock),initial=engine.plan(parts,stock,opts);
  const pool=api.buildCandidatePool(initial,opts,['ripThenCrosscut','partFirstTree'],x=>x,'saving');
  assert.ok(pool.length>1);
  for(const {plan} of pool){
    assert.ok(api.strictlyValidCandidate(plan,overrides));
    assert.equal(plan.boards.flatMap(b=>b.results).find(p=>p.id==='P001').rotated,true);
    for(const b of plan.boards){assert.ok(engine.verifyBoard(b,3).ok);if(!b.added)assert.equal(b.stockIndex,1);}
  }
});

test('additional search yields, retains all prior layouts and preserves a user selection changed during search',async()=>{
  const {api,c,context}=prepareMorePool(),old=c._trialCandidates.slice();
  let updates=0,chosen=c.trialPlan;
  context.window.onVariationUpdate=()=>{if(++updates===2){chosen=c._trialCandidates[1].plan;c.trialPlan=chosen;c._trialCandidateIndex=1;}};
  const result=await api.searchMoreCandidates();
  assert.ok(result.added>0);
  assert.equal(c._trialNextSeed,37);
  assert.ok(updates>=26,'one UI yield/update per seed and final cleanup');
  assert.equal(c.trialPlan,chosen);
  assert.equal(c._trialCandidates[c._trialCandidateIndex].plan,chosen);
  assert.ok(old.every(item=>c._trialCandidates.some(x=>x.signature===item.signature)));
  assert.ok(old.every(item=>c._trialCandidates.find(x=>x.signature===item.signature).key===item.key));
  assert.equal(new Set(c._trialCandidates.map(x=>x.signature)).size,c._trialCandidates.length);
  assert.ok(c._trialCandidates.every(x=>api.strictlyValidCandidate(x.plan,{})));
});

test('stopping or changing demand cancels pending search without discarding found layouts or restoring stale ones',async()=>{
  const first=prepareMorePool(),before=first.c._trialCandidates;
  const pending=first.api.searchMoreCandidates();
  const stop=await first.api.searchMoreCandidates();
  assert.equal(stop.cancelled,true);
  assert.equal((await pending).cancelled,true);
  assert.equal(first.c._trialCandidates,before);
  assert.equal(first.c._trialNextSeed,13);
  const second=prepareMorePool(),stale=second.api.searchMoreCandidates();
  second.api.clearCandidatePool();second.c.parts=[];second.c.trialPlan=null;
  assert.equal((await stale).cancelled,true);
  assert.equal(second.c._trialCandidates.length,0);
  assert.equal(second.c.parts.length,0);
});

test('direct chooser and incremental search expose scores, bilingual copy and rotation cancellation without rerendering selection',()=>{
  assert.ok(html.includes('id="candidateChooser"')&&html.includes('id="moreLayoutsButton"'));
  assert.ok(html.includes('Choose a layout directly')&&html.includes('Search more layouts')&&html.includes('Stop additional search'));
  assert.ok(html.includes("controls.setAttribute('aria-busy'"));
  assert.ok(html.includes('String(item.key)===event.target.value'));
  assert.equal(html.split('系統會比較大件優先及不同部件次序的候選；這不代表第一刀一定切大件。每個可選排法都會逐刀回放驗證。').length-1,2);
  assert.ok(html.includes('A round may find no new layout.'));
  assert.ok(html.includes('window.PlywoodTrialUI.clearCandidatePool();'));
  assert.ok(html.includes('calculator._trialCandidates.findIndex(item=>item.plan===candidate)'));
  const start=html.indexOf('  async function searchMoreCandidates()'),end=html.indexOf('  function calculate(){',start),source=html.slice(start,end);
  assert.ok(source.includes('setTimeout(resolve,0)')&&source.includes('candidateSearchEpoch!==state.epoch'));
  assert.ok(source.includes('round<24')&&source.includes('pool.findIndex(item=>item.plan===current)'));
  assert.ok(!source.includes('.render(')&&!source.includes('commitCandidate('),'new results must not reset the selected diagram/replay');
});

test('identical physical cuts across process labels and terminal/output classifications count only once',()=>{
  const demand=[{width:100,length:600,count:1,orientationPreference:'fixed_vertical'}],stock=[{width:400,length:600}];
  const {engine,api}=loadPool(demand,stock),rip=engine.plan(demand,stock,settings),tree=engine.plan(demand,stock,{...settings,mode:'partFirstTree'});
  assert.notEqual(rip.mode,tree.mode);
  assert.notEqual(rip.boards[0].cuts[0].outputs[0].kind,tree.boards[0].cuts[0].outputs[0].kind);
  assert.equal(api.candidateSignature(rip).signature,api.candidateSignature(tree).signature);
  const pool=api.buildCandidatePool(rip,settings,['ripThenCrosscut','partFirstTree'],x=>x,'saving');
  assert.equal(pool.length,1,'same rectangles and cut sequence are not extra options');
  assert.ok(api.strictlyValidCandidate(pool[0].plan,{}));
});
