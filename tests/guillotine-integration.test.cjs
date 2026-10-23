'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const guillotine=require('../assets/guillotine-candidate.js');
const maxrects=require('../assets/maxrects-candidate.js');
const saw=require('../assets/table-saw-optimizer.js');
const overlay=require('../assets/cut-path-overlay.js');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1])
 .find(s=>s.includes('global.PlywoodTrialEngine={version:VERSION,plan,verifyBoard,orientations}'));
assert.ok(source,'production engine inline source was found');
const base={mode:'ripThenCrosscut',kerf:3,trims:{},edges:{},minSupportWidth:''};
function load(parts,boards,gapi=guillotine){
 const context={console,window:{PlywoodTableSaw:saw,PlywoodMaxRects:maxrects,PlywoodGuillotine:gapi,calculator:{parts,boards}}};
 vm.runInNewContext(source,context);
 const start=html.indexOf('  function totalCutCount(plan)');
 const end=html.indexOf('  function updateVariationControls()',start);
 vm.runInNewContext(`const selectedObjective=()=> 'saving';
 const getParts=()=>window.calculator.parts.map(p=>({...p}));
 const getBoards=()=>window.calculator.boards.map(b=>({...b}));
 const safeForDisplay=p=>p.validation.boardIssues.length===0&&p.validation.countIssues.length===0&&p.boards.every(b=>b.validation.ok);
 ${html.slice(start,end)}
 globalThis.poolApi={buildCandidatePool,strictlyValidCandidate,candidateSignature};`,context);
 return {engine:context.window.PlywoodTrialEngine,pool:context.poolApi};
}
function check(engine,plan,count,sourceName='independent-guillotine'){
 assert.equal(plan.status,'candidate');assert.ok(plan.validation.ok,JSON.stringify(plan.validation));
 assert.equal(plan.summary.placedParts,count);assert.equal(plan.unplaced.length,0);
 assert.equal(new Set(plan.boards.flatMap(b=>b.results.map(p=>p.id))).size,count);
 for(const b of plan.boards){assert.ok(engine.verifyBoard(b,plan.kerf).ok);assert.equal(b.packingSource,sourceName);
  const leaves=overlay.finalMaterialLeaves(b);
  assert.ok(Math.abs(leaves.reduce((n,r)=>n+r.area,0)-b.validation.finalRemnants.reduce((n,r)=>n+r.area,0))<0.01);
  assert.ok(Math.abs(b.validation.accountedArea-b.width*b.length)<0.01);
  if(plan.mode==='ripThenCrosscut'){let crossed=false;for(const c of b.cuts){if(c.phase==='trim')continue;if(c.phase==='crosscut')crossed=true;if(crossed)assert.notEqual(c.phase,'rip');}}
 }
}
const profile=guillotine.profiles()[0];

test('production engine guillotine completes both modes with decimal kerf, trims, disabled/added stock and direction override',()=>{
 const parts=[{width:300.25,length:440.5,count:3,orientationPreference:'auto'}];
 const boards=[{width:700,length:700,disabled:true},{width:700,length:700}];const snapshot=JSON.stringify({parts,boards});
 const {engine}=load(parts,boards);
 for(const mode of ['ripThenCrosscut','partFirstTree']){const p=engine.plan(parts,boards,{...base,mode,kerf:3.2,packingStrategy:'guillotine',minSupportWidth:100,trims:{left:10,right:10,top:10,bottom:10},fixedOrientationOverrides:{P001:'fixed_horizontal'},guillotineProfile:profile});
 check(engine,p,3);assert.ok(p.boards.some(b=>b.added));assert.equal(p.boards[0].stockIndex,1);assert.equal(p.boards.flatMap(b=>b.results).find(x=>x.id==='P001').rotated,true);assert.ok(p.boards.every(b=>b.core.x===10&&b.core.y===10));}
 assert.equal(JSON.stringify({parts,boards}),snapshot);
});

test('exact sheet fit produces no cut; oversize remains explicitly incomplete',()=>{
 let parts=[{width:1220,length:2440,count:1,orientationPreference:'fixed_vertical'}],boards=[{width:1220,length:2440}];let {engine}=load(parts,boards);
 const exact=engine.plan(parts,boards,{...base,packingStrategy:'guillotine',guillotineProfile:profile});check(engine,exact,1);assert.equal(exact.boards[0].cuts.length,0);assert.equal(exact.summary.largestRemnantArea,0);
 parts=[{width:3000,length:3000,count:1,orientationPreference:'auto'}];({engine}=load(parts,boards));const over=engine.plan(parts,boards,{...base,packingStrategy:'guillotine',guillotineProfile:profile});assert.equal(over.status,'incomplete');assert.equal(over.summary.placedParts,0);assert.equal(over.unplaced.length,1);assert.equal(over.validation.ok,false);
});

test('pool toggle is strict boolean, preserves original and MaxRects signatures, and admits only valid Guillotine candidates',()=>{
 const parts=[{width:300,length:440,count:2,orientationPreference:'fixed_vertical'},{width:300,length:250,count:2,orientationPreference:'fixed_horizontal'}],boards=[{width:1000,length:1200}];
 const integrated=load(parts,boards),legacy=load(parts,boards,null);
 const originalPlan=legacy.engine.plan(parts,boards,base), maxPlan=integrated.engine.plan(parts,boards,{...base,packingStrategy:'maxrects'});
 const initial=integrated.engine.plan(parts,boards,base), settings={...base,enableGuillotine:true};
 const baseline=integrated.pool.buildCandidatePool(initial,base,['ripThenCrosscut','partFirstTree'],x=>x,'saving',[]);
 const old=legacy.pool.buildCandidatePool(originalPlan,base,['ripThenCrosscut','partFirstTree'],x=>x,'saving',[]);
 const maxCandidate=integrated.pool.buildCandidatePool(maxPlan,{...base,enableMaxRects:true},['ripThenCrosscut','partFirstTree'],x=>x,'saving',[]);
 const oldSigs=new Set([...baseline,...old,...maxCandidate].map(x=>x.signature));assert.ok(oldSigs.size>0);
 const fullSettings={...settings,enableMaxRects:true};
 const n=Date.now(), candidates=integrated.pool.buildCandidatePool(initial,fullSettings,['ripThenCrosscut','partFirstTree'],x=>x,'saving',[profile]);
 assert.ok(Date.now()-n<15000,'one representative two-mode profile should stay bounded');
 assert.ok(candidates.length>0);assert.ok(candidates.every(x=>integrated.pool.strictlyValidCandidate(x.plan,{})));
 assert.ok([...baseline,...old,...maxCandidate].every(x=>candidates.some(y=>y.signature===x.signature)),'all baseline and MaxRects signatures retained');
 for(const flag of [false,undefined,1,'true']){const opt={...base};if(flag!==undefined)opt.enableGuillotine=flag;const before=integrated.pool.buildCandidatePool(initial,opt,['ripThenCrosscut','partFirstTree'],x=>x,'saving',[]);assert.ok(before.some(x=>x.signature===integrated.pool.candidateSignature(initial).signature));}
});

test('unavailable Guillotine module cannot remove baseline or emit invalid candidates',()=>{
 const parts=[{width:300,length:400,count:1,orientationPreference:'auto'}],boards=[{width:1000,length:1000}],{engine,pool}=load(parts,boards,null),settings={...base,enableGuillotine:true};
 const initial=engine.plan(parts,boards,settings),candidates=pool.buildCandidatePool(initial,settings,['ripThenCrosscut','partFirstTree'],x=>x,'saving',[profile]);
 assert.ok(candidates.length>0);assert.ok(candidates.every(x=>pool.strictlyValidCandidate(x.plan,{})));
 assert.throws(()=>engine.plan(parts,boards,{...base,packingStrategy:'guillotine'}),e=>e.code==='GUILLOTINE_UNAVAILABLE');
});

test('fixed-direction cabinet retains the baseline 1473 x 637 physical offcut',()=>{
 const parts=[[2000,600,2],[966,600,2],[966,580,1],[964,580,4],[1994,496,2],[1000,100,1],[583,100,2]].map(([length,width,count])=>({length,width,count,orientationPreference:'fixed_vertical'}));
 const boards=[{width:1220,length:2440}],{engine,pool}=load(parts,boards),settings={...base,mode:'partFirstTree',enableGuillotine:true};
 const initial=engine.plan(parts,boards,settings),baseline=pool.buildCandidatePool(initial,settings,['partFirstTree'],x=>x,'saving',[]);
 const maxPlan=engine.plan(parts,boards,{...base,mode:'partFirstTree',packingStrategy:'maxrects'});
 const maxCandidate=pool.buildCandidatePool(maxPlan,{...settings,enableMaxRects:true},['partFirstTree'],x=>x,'saving',[]);
 assert.ok(baseline.length&&maxCandidate.length);assert.ok(maxCandidate.some(x=>x.plan.summary.largestRemnantArea===1473*637));
 const result=pool.buildCandidatePool(initial,{...settings,enableGuillotine:true},['partFirstTree'],x=>x,'saving',[profile],[...baseline,...maxCandidate]);
 assert.ok([...baseline,...maxCandidate].every(x=>result.some(y=>y.signature===x.signature)));
 assert.ok(result.some(x=>x.plan.summary.largestRemnantArea>=1473*637));
 assert.ok(result.every(x=>pool.strictlyValidCandidate(x.plan,{})));
});

test('deterministic random complete guillotine trees pass full production replay',()=>{
 let seed=20261023,accepted=0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<12;i++){const parts=Array.from({length:3},()=>({width:100+Math.floor(random()*180),length:160+Math.floor(random()*300),count:1,orientationPreference:i%3?'auto':'fixed_vertical'})),boards=[{width:1000,length:1500}],{engine}=load(parts,boards);
  const p=engine.plan(parts,boards,{...base,mode:i%2?'partFirstTree':'ripThenCrosscut',packingStrategy:'guillotine',kerf:i%2?3.2:3,trims:i%2?{left:10,right:10,top:10,bottom:10}:{},guillotineProfile:guillotine.profiles()[i%18]});check(engine,p,3);accepted++;}
 assert.equal(accepted,12);
});

test('production pool really calls all new profiles only when enabled and has independently labelled physical remnants',()=>{
 const parts=[{width:300,length:440,count:4,orientationPreference:'fixed_vertical'}],boards=[{width:1000,length:1000}];
 let calls=0;
 const wrapped={...guillotine,pack(...args){calls++;return guillotine.pack(...args);}};
 const {engine,pool}=load(parts,boards,wrapped),initial=engine.plan(parts,boards,base);
 for(const flag of [undefined,false,1,'true']){
  const settings={...base,enableMaxRects:true,enableGuillotine:flag};
  pool.buildCandidatePool(initial,settings,['partFirstTree'],x=>x,'saving',[]);assert.equal(calls,0);
 }
 const candidates=pool.buildCandidatePool(initial,{...base,enableMaxRects:true,enableGuillotine:true},['ripThenCrosscut','partFirstTree'],x=>x,'saving',[]);
 assert.ok(calls>=36,'18 profiles for both processes must invoke the real new module');
 const newItems=candidates.filter(x=>x.plan.packingStrategy==='guillotine');assert.ok(newItems.length>0);
 const comparison=require('../assets/scheme-comparison.js');
 const text=comparison.build({trialPlan:newItems[0].plan,_trialCandidates:candidates}).full;
 assert.match(text,/貫通多策略（獨立實作）/);
 for(const item of newItems){
  const leaves=item.plan.boards.flatMap(b=>overlay.finalMaterialLeaves(b));
  assert.equal(item.plan.summary.largestRemnantArea,Math.max(0,...leaves.map(r=>r.area)));
  assert.equal(item.plan.boards.length,1,'a simple four-piece case must reuse the same stock, not silently add sheets');
 }
});

test('broken profile listing or packing cannot discard the existing verified baseline',()=>{
 const parts=[{width:300,length:400,count:2,orientationPreference:'auto'}],boards=[{width:1000,length:1000}];
 const brokenApis=[{}, {...guillotine,profiles(){throw Error('bad listing');}}, {...guillotine,pack(){throw Error('bad packing');}},
  {...guillotine,pack(tokens,stock){return {placements:[],remainingIds:tokens.map(t=>t.id),tree:{kind:'empty',rect:stock},diagnostics:{}};}}];
 for(const api of brokenApis){const {engine,pool}=load(parts,boards,api),initial=engine.plan(parts,boards,base);
  const before=pool.buildCandidatePool(initial,{...base,enableMaxRects:true},['partFirstTree'],x=>x,'saving',[]);
  const after=pool.buildCandidatePool(initial,{...base,enableMaxRects:true,enableGuillotine:true},['partFirstTree'],x=>x,'saving',[]);
  assert.ok(before.every(x=>after.some(y=>y.signature===x.signature)));
  assert.ok(after.every(x=>pool.strictlyValidCandidate(x.plan,{})));
 }
});
