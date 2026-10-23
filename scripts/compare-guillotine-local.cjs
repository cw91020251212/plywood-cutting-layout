'use strict';
// Local-only comparison: no network, writes, deployment, or GPL dependencies.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('global.PlywoodTrialEngine={version:VERSION,plan,verifyBoard,orientations}'));
const saw=require('../assets/table-saw-optimizer.js');
const maxrects=require('../assets/maxrects-candidate.js');
const guillotine=require('../assets/guillotine-candidate.js');
const fixtureParts=rows=>rows.map(([length,width,count])=>({length,width,count,orientationPreference:'fixed_vertical'}));
const fixtures=[
  {name:'四件同板',parts:fixtureParts([[440,300,4]]),boards:[{width:1000,length:1000}]},
  {name:'固定方向櫃體',parts:fixtureParts([[2000,600,2],[966,600,2],[966,580,1],[964,580,4],[1994,496,2],[1000,100,1],[583,100,2]]),boards:[{width:1220,length:2440}]}
];
for(const fixture of fixtures){
  const win={PlywoodTableSaw:saw,PlywoodMaxRects:maxrects,PlywoodGuillotine:guillotine,calculator:{parts:fixture.parts,boards:fixture.boards}};
  const context={window:win,console};vm.runInNewContext(source,context);
  const start=html.indexOf('  function totalCutCount(plan)'),end=html.indexOf('  function updateVariationControls()',start);
  assert.ok(start>=0&&end>start);
  vm.runInNewContext(`const selectedObjective=()=> 'saving';
    const getParts=()=>window.calculator.parts.map(p=>({...p}));
    const getBoards=()=>window.calculator.boards.map(b=>({...b}));
    const safeForDisplay=p=>p.validation.boardIssues.length===0&&p.validation.countIssues.length===0&&p.boards.every(b=>b.validation.ok);
    ${html.slice(start,end)}
    globalThis.poolApi={buildCandidatePool,strictlyValidCandidate};`,context);
  let before;
  for(const enabled of [false,true]){
    const settings={kerf:3,trims:{},edges:{},minSupportWidth:'',enableMaxRects:true,enableGuillotine:enabled};
    const initial=win.PlywoodTrialEngine.plan(fixture.parts,fixture.boards,{...settings,mode:'partFirstTree'});
    const then=performance.now();
    const pool=context.poolApi.buildCandidatePool(initial,settings,['ripThenCrosscut','partFirstTree'],mode=>mode,'saving');
    assert.ok(pool.length>0&&pool.every(p=>context.poolApi.strictlyValidCandidate(p.plan,{})));
    const best=pool[0].plan;
    if(!enabled)before=pool;
    else{
      assert.ok(before.every(p=>pool.some(q=>q.signature===p.signature)),'the enabled pool must retain every pre-existing physical scheme');
      assert.ok(saw.comparePlans(best,before[0].plan,'saving')<=0,'additional candidates cannot worsen the selected existing ranking');
    }
    const r=best.summary.largestRemnant;
    console.log(JSON.stringify({fixture:fixture.name,enabled,elapsedMs:Math.round(performance.now()-then),candidates:pool.length,
      independentCandidates:pool.filter(p=>p.plan.packingStrategy==='guillotine').length,bestSource:best.packingStrategy,
      parts:best.summary.placedParts,boards:best.summary.usedBoardCount,cuts:saw.planMetrics(best).cuts,
      largestIntactRemnant:r?{length:r.rect.length,width:r.rect.width}:null}));
  }
}
