'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const maxrects = require('../assets/maxrects-candidate.js');
const saw = require('../assets/table-saw-optimizer.js');
const overlay = require('../assets/cut-path-overlay.js');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1])
  .find(s=>s.includes('global.PlywoodTrialEngine={version:VERSION,plan,verifyBoard,orientations}'));
const base = {mode:'ripThenCrosscut',kerf:3,trims:{},edges:{},minSupportWidth:''};
function load(parts, boards, api = maxrects) {
  const context = {console,window:{PlywoodTableSaw:saw,PlywoodMaxRects:api,calculator:{parts,boards}}};
  vm.runInNewContext(source, context);
  const start = html.indexOf('  function totalCutCount(plan)');
  const end = html.indexOf('  function updateVariationControls()', start);
  vm.runInNewContext(`
    const selectedObjective=()=> 'saving';
    const getParts=()=>window.calculator.parts.map(p=>({...p}));
    const getBoards=()=>window.calculator.boards.map(b=>({...b}));
    const safeForDisplay=p=>p.validation.boardIssues.length===0&&p.validation.countIssues.length===0&&p.boards.every(b=>b.validation.ok);
    ${html.slice(start,end)}
    globalThis.poolApi={buildCandidatePool,strictlyValidCandidate,candidateSignature};
  `,context);
  return {engine:context.window.PlywoodTrialEngine,pool:context.poolApi};
}
function check(engine, plan, expectedCount) {
  assert.equal(plan.status,'candidate');
  assert.ok(plan.validation.ok, JSON.stringify(plan.validation));
  assert.equal(plan.summary.placedParts,expectedCount);
  assert.equal(plan.unplaced.length,0);
  assert.equal(new Set(plan.boards.flatMap(b=>b.results.map(p=>p.id))).size,expectedCount);
  for(const board of plan.boards) {
    assert.ok(engine.verifyBoard(board,plan.kerf).ok);
    assert.equal(board.packingSource,'maxrects-bssf');
    assert.equal(board.maxrectsFallback,undefined);
    const physical = overlay.finalMaterialLeaves(board);
    assert.equal(physical.reduce((n,r)=>n+r.area,0),board.validation.finalRemnants.reduce((n,r)=>n+r.area,0));
    assert.ok(Math.abs(board.validation.accountedArea-board.width*board.length)<0.01);
    if(plan.mode==='ripThenCrosscut') {
      let crossed = false;
      for(const cut of board.cuts) {
        if(cut.phase==='trim') continue;
        if(cut.phase==='crosscut') crossed=true;
        if(crossed) assert.notEqual(cut.phase,'rip');
      }
    }
  }
  const real = plan.boards.flatMap(b=>overlay.finalMaterialLeaves(b));
  assert.equal(plan.summary.largestRemnantArea,Math.max(0,...real.map(r=>r.area)));
}

test('production engine uses the extracted core and reconstructs verified cuts in both modes',()=>{
  const parts=[{width:300,length:440,count:2,orientationPreference:'fixed_vertical'}];
  const boards=[{width:1220,length:2440}];
  const snapshot=JSON.stringify({parts,boards});
  const {engine}=load(parts,boards);
  for(const mode of ['ripThenCrosscut','partFirstTree']) {
    const plan=engine.plan(parts,boards,{...base,mode,packingStrategy:'maxrects'});
    check(engine,plan,2);
    assert.ok(plan.boards[0].cuts.length>0);
    assert.ok(plan.boards[0].results.every(p=>!p.rotated));
    assert.ok(plan.summary.largestRemnantArea>0);
  }
  assert.equal(JSON.stringify({parts,boards}),snapshot);
});

test('whole-sheet fit requires no cut and cannot be scored as a leftover',()=>{
  const parts=[{width:1220,length:2440,count:1,orientationPreference:'fixed_vertical'}];
  const boards=[{width:1220,length:2440}],{engine}=load(parts,boards);
  const plan=engine.plan(parts,boards,{...base,packingStrategy:'maxrects'});
  check(engine,plan,1);
  assert.equal(plan.boards[0].cuts.length,0);
  assert.equal(plan.summary.largestRemnantArea,0);
});

test('trims, decimal kerf, disabled stock, added sheets and per-instance direction overrides survive integration',()=>{
  const parts=[{width:300.25,length:440.5,count:3,orientationPreference:'auto'}];
  const boards=[{width:700,length:700,disabled:true},{width:700,length:700}];
  const {engine}=load(parts,boards);
  for(const mode of ['ripThenCrosscut','partFirstTree']) {
    const plan=engine.plan(parts,boards,{...base,mode,kerf:3.2,packingStrategy:'maxrects',minSupportWidth:100,
      trims:{left:10,right:10,top:10,bottom:10},fixedOrientationOverrides:{P001:'fixed_horizontal'}});
    check(engine,plan,3);
    assert.ok(plan.boards.some(b=>b.added));
    assert.equal(plan.boards[0].stockIndex,1);
    assert.equal(plan.boards.flatMap(b=>b.results).find(p=>p.id==='P001').rotated,true);
    assert.ok(plan.boards.every(b=>b.core.x===10&&b.core.y===10));
  }
});

test('the actual candidate pool calls MaxRects, preserves legacy baselines and never ranks a worse plan first',()=>{
  const parts=[{width:300,length:440,count:2,orientationPreference:'fixed_vertical'},
    {width:300,length:250,count:4,orientationPreference:'fixed_horizontal'}];
  const boards=[{width:603,length:1000}];
  let calls=0;
  const wrapped={...maxrects,pack(...args){calls++;return maxrects.pack(...args);}};
  const integrated=load(parts,boards,wrapped),original=load(parts,boards,null);
  const enabled={...base,enableMaxRects:true};
  const first=integrated.engine.plan(parts,boards,enabled);
  const profiles=[{active:true,fit:0,priority:0}];
  const before=original.pool.buildCandidatePool(original.engine.plan(parts,boards,enabled),enabled,['ripThenCrosscut','partFirstTree'],x=>x,'saving',profiles);
  const disabledBase=integrated.engine.plan(parts,boards,base);
  for(const opt of [undefined,false,1,'true']) {
    const settings={...base}; if(opt!==undefined) settings.enableMaxRects=opt;
    const n=calls;
    const disabled=integrated.pool.buildCandidatePool(disabledBase,settings,['ripThenCrosscut','partFirstTree'],x=>x,'saving',profiles);
    assert.equal(calls,n,`toggle ${String(opt)} must not invoke MaxRects`);
    const oldOnly=original.pool.buildCandidatePool(original.engine.plan(parts,boards,base),base,['ripThenCrosscut','partFirstTree'],x=>x,'saving',profiles);
    assert.ok(disabled.length>0);
    assert.equal(disabled[0].signature,integrated.pool.candidateSignature(disabledBase).signature);
    assert.ok(oldOnly.length>0);
  }
  const after=integrated.pool.buildCandidatePool(first,enabled,['ripThenCrosscut','partFirstTree'],x=>x,'saving',profiles);
  assert.ok(calls>=2,'the module must actually be called by the production pool');
  assert.ok(after.every(x=>integrated.pool.strictlyValidCandidate(x.plan,{})));
  assert.ok(before.every(x=>after.some(y=>y.signature===x.signature)));
  assert.ok(saw.comparePlans(after[0].plan,before[0].plan,'saving')<=0);
});

test('unavailable MaxRects stays explicit; a rejected cut tree falls back per board',()=>{
  const parts=[{width:300,length:400,count:1,orientationPreference:'auto'}],boards=[{width:1000,length:1000}];
  const enabled={...base,enableMaxRects:true};
  const missing=load(parts,boards,null);
  const missingPool=missing.pool.buildCandidatePool(missing.engine.plan(parts,boards,enabled),enabled,['ripThenCrosscut','partFirstTree'],x=>x,'saving',[]);
  assert.ok(missingPool.length>0);
  assert.ok(missingPool.every(x=>missing.pool.strictlyValidCandidate(x.plan,{})));
  assert.throws(()=>missing.engine.plan(parts,boards,{...base,packingStrategy:'maxrects'}),e=>e.code==='MAXRECTS_UNAVAILABLE');

  const rejected=load(parts,boards,{...maxrects,toCutTree:()=>({ok:false,tree:null,reason:'test rejection',visits:1})});
  const fallback=rejected.engine.plan(parts,boards,{...base,packingStrategy:'maxrects'});
  assert.equal(fallback.status,'candidate');
  assert.equal(fallback.summary.placedParts,1);
  assert.equal(fallback.unplaced.length,0);
  assert.ok(fallback.boards.every(board=>rejected.engine.verifyBoard(board,fallback.kerf).ok&&board.maxrectsFallback&&board.maxrectsFallback.via==='legacy-rip'));
  const kept=rejected.pool.buildCandidatePool(rejected.engine.plan(parts,boards,enabled),enabled,['ripThenCrosscut','partFirstTree'],x=>x,'saving',[]);
  assert.ok(kept.length>0);
  assert.ok(kept.every(x=>rejected.pool.strictlyValidCandidate(x.plan,{})));
});

test('oversize demand remains incomplete instead of disappearing',()=>{
  const parts=[{width:3000,length:3000,count:1,orientationPreference:'auto'}],boards=[{width:1220,length:2440}];
  const {engine}=load(parts,boards),plan=engine.plan(parts,boards,{...base,packingStrategy:'maxrects'});
  assert.equal(plan.status,'incomplete');
  assert.equal(plan.summary.placedParts,0);
  assert.equal(plan.unplaced.length,1);
  assert.equal(plan.validation.ok,false);
});

test('browser and offline shell both load the core and ship its MIT notice',()=>{
  assert.match(html,/<script src="assets\/maxrects-candidate\.js\?v=1"><\/script>/);
  assert.ok(fs.readFileSync(path.join(root,'sw.js'),'utf8').includes('./assets/maxrects-candidate.js?v=1'));
  assert.match(fs.readFileSync(path.join(root,'licenses/WoodworkingShop-MIT.txt'),'utf8'),/Copyright \(c\) 2026 Ryair/);
});

test('fixed-direction cabinet preserves the 1473 x 637 physical leaf without extra sheets or missing parts',()=>{
  const parts=[[2000,600,2],[966,600,2],[966,580,1],[964,580,4],[1994,496,2],[1000,100,1],[583,100,2]]
    .map(([length,width,count])=>({length,width,count,orientationPreference:'fixed_vertical'}));
  const boards=[{width:1220,length:2440}];
  const {engine,pool}=load(parts,boards);
  const settings={...base,mode:'partFirstTree',enableMaxRects:true};
  const original=load(parts,boards,null);
  const before=original.pool.buildCandidatePool(original.engine.plan(parts,boards,settings),settings,['partFirstTree'],x=>x,'saving');
  assert.equal(before[0].plan.summary.largestRemnantArea,1471*600);
  const candidates=pool.buildCandidatePool(engine.plan(parts,boards,settings),settings,['partFirstTree'],x=>x,'saving');
  const best=candidates[0].plan;
  check(engine,best,14);
  assert.equal(best.summary.usedBoardCount,4);
  assert.equal(best.summary.largestRemnant.rect.length,1473);
  assert.equal(best.summary.largestRemnant.rect.width,637);
  assert.equal(best.summary.largestRemnantArea,1473*637);
  assert.equal(saw.planMetrics(best).cuts,23);
  assert.ok(candidates.every(x=>pool.strictlyValidCandidate(x.plan,{})));
  const r=best.summary.largestRemnant;
  const board=best.boards.find(b=>b.boardId===r.boardId);
  assert.ok(overlay.finalMaterialLeaves(board).some(leaf=>leaf.materialId===r.materialId&&leaf.area===938301));
});

test('respecting rip-before-crosscut remains mandatory even when a tree layout has a larger remnant',()=>{
  const placements=[{id:'a',x:0,y:0,width:580,length:964},
    {id:'b',x:583,y:0,width:580,length:964},{id:'c',x:0,y:967,width:580,length:964}];
  const stock={x:0,y:0,width:1220,length:2440};
  const tree=maxrects.toCutTree(placements,stock,3,{mode:'partFirstTree'});
  assert.ok(tree.ok);
  function empties(n){return n.kind==='empty'?[n.rect]:n.kind==='cut'?n.children.flatMap(empties):[];}
  assert.equal(Math.max(...empties(tree.tree).map(r=>r.width*r.length)),1473*637);
  const rip=maxrects.toCutTree(placements,stock,3,{mode:'ripThenCrosscut'});
  assert.ok(rip.ok);
  assert.ok(Math.max(...empties(rip.tree).map(r=>r.width*r.length))<1473*637,
    'the larger leaf requires crosscutting before an X split, so it must not be claimed in rip mode');
});

test('deterministic randomized MaxRects candidates retain count, geometry, direction and full cut replay',()=>{
  let seed=20261023,pure=0,fallback=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<40;i++) {
    const parts=Array.from({length:4},()=>({width:100+Math.floor(random()*250),length:200+Math.floor(random()*400),count:1+Math.floor(random()*2),orientationPreference:i%3?'auto':'fixed_vertical'}));
    const boards=[{width:1000,length:1500}],{engine}=load(parts,boards);
    const settings={...base,mode:i%2?'partFirstTree':'ripThenCrosscut',packingStrategy:'maxrects',
      kerf:i%2?3.2:3,trims:i%2?{left:10,right:10,top:10,bottom:10}:{}};
    const plan=engine.plan(parts,boards,settings);
    const expected=parts.reduce((n,p)=>n+p.count,0);
    assert.equal(plan.status,'candidate');
    assert.equal(plan.summary.placedParts,expected);
    assert.equal(plan.unplaced.length,0);
    for(const board of plan.boards) {
      assert.ok(engine.verifyBoard(board,plan.kerf).ok);
      if(plan.mode==='ripThenCrosscut') {
        let crossed=false;
        for(const cut of board.cuts) {
          if(cut.phase==='trim') continue;
          if(cut.phase==='crosscut') crossed=true;
          if(crossed) assert.notEqual(cut.phase,'rip');
        }
      }
    }
    if(plan.boards.every(board=>board.packingSource==='maxrects-bssf'&&!board.maxrectsFallback)) pure++;
    else fallback++;
  }
  assert.ok(pure>=10,'enough randomized full MaxRects replays must actually succeed');
  assert.equal(pure+fallback,40);
});

test('a board whose MaxRects coordinates are not sawable does not drop the rest of the plan',()=>{
  const parts=[{width:200,length:300,count:20,orientationPreference:'auto'},{width:300,length:450,count:20,orientationPreference:'auto'}];
  const boards=[{width:1220,length:2440}];
  const {engine}=load(parts,boards);
  for(const mode of ['ripThenCrosscut','partFirstTree']) {
    const plan=engine.plan(parts,boards,{...base,mode,packingStrategy:'maxrects'});
    assert.equal(plan.status,'candidate',mode);
    assert.equal(plan.summary.placedParts,40);
    assert.equal(plan.unplaced.length,0);
    assert.ok(plan.boards.length>=2);
    for(const board of plan.boards) assert.ok(engine.verifyBoard(board,plan.kerf).ok,JSON.stringify(board.validation&&board.validation.errors));
  }
});
