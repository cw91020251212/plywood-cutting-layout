'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const compare=require('../assets/scheme-comparison.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function plan(rects=[],cuts=3,width=1220,length=2440){
  return {status:'candidate',mode:'ripThenCrosscut',validation:{ok:true},unplaced:[],
    boards:[{boardId:'B1',width,length,cuts:Array.from({length:cuts},()=>({})),
      offcuts:[{rect:{width:1000,length:1000}}],validation:{ok:true,
        finalRemnants:rects.map(([width,length])=>({rect:{width,length},area:-999}))}}],
    summary:{largestRemnantArea:999999999,wasteArea:999999999,usedBoardCount:900}};
}
function app(plans,index=0){return {trialPlan:plans[index],_trialCandidates:plans.map((p,i)=>({plan:p,key:i}))};}
test('counts only real final remnants, actual sheets and cuts, ignoring summaries and trim waste',()=>{
  const p=plan([[400,500],[30,2000]]),m=compare.metrics(p);
  assert.equal(m.boards,1);assert.equal(m.cuts,3);
  assert.equal(m.remnants.length,2);assert.equal(m.largest.width,400);assert.equal(m.widest.width,400);
  assert.equal(m.largest.area,200000);assert.equal(m.boardArea,1220*2440);
  assert.equal(compare.metrics(plan()).remnants.length,0);
});
test('equal area narrow strip is not declared more reusable or most material-saving',()=>{
  const strip=plan([[20,2000]]),broad=plan([[200,200]]);
  const result=compare.build(app([strip,broad]));
  assert.match(result.full,/完整餘板短邊最闊：方案 2（200 mm）/);
  assert.match(result.full,/2,000 × 20 mm（短邊 20 mm）/);
  assert.match(result.full,/200 × 200 mm（短邊 200 mm）/);
  assert.match(result.full,/狹長條、碎料不當作省料/);
  assert.match(result.full,/暫不宣稱哪個方案「最省料」/);
  assert.doesNotMatch(result.compact,/最省料|更省料/);
});
test('largest-by-area strip does not hide another broader intact rectangle',()=>{
  const result=compare.build(app([plan([[20,20000],[400,400]])]));
  assert.match(result.full,/另有短邊更闊的完整餘板：400 × 400 mm/);
});
test('invalid, incomplete and missing replay-result candidates never enter comparison',()=>{
  const good=plan([[200,300]]),bad=plan([[900,900]]);bad.validation.ok=false;
  let a=app([good,bad]);let result=compare.build(a);
  assert.match(result.full,/可比較 1 個已驗證方案/);assert.doesNotMatch(result.full,/900 × 900/);
  for(const mutate of [p=>p.status='incomplete',p=>p.unplaced.push({}),p=>p.boards[0].validation.ok=false,
    p=>delete p.boards[0].validation.finalRemnants,p=>p.boards[0].validation.finalRemnants.push({rect:{width:NaN,length:50}})]){
    const p=plan();mutate(p);assert.equal(compare.build(app([p])),null);
  }
});
test('all ties, no remnants and single-candidate case have honest descriptions',()=>{
  assert.match(compare.build(app([plan(),plan()])).full,/用板、刀數及完整餘板尺寸相同/);
  assert.match(compare.build(app([plan()])).compact,/目前只有一個通過驗證的方案/);
  assert.match(compare.build(app([plan()])).full,/沒有完整餘板/);
});
test('mixed sheet sizes separate fewest sheets, stock area and cut-count trade-offs',()=>{
  const big=plan([[500,500]],5,2000,2000),small=plan([[100,100]],2,1000,1000);
  small.boards.push({...small.boards[0],boardId:'B2'});
  const result=compare.build(app([big,small]));
  assert.match(result.full,/用板最少：方案 1（1 塊）；開料原板總面積最少：方案 2（2 m²）/);
  assert.match(result.full,/切刀最少：方案 2（4 刀）/);
  assert.match(result.full,/不等同最快或最安全/);
});
test('current index follows actual plan identity after pool resort; detached plan ignores stale pool',()=>{
  const one=plan([[200,200]]),two=plan([[400,400]]),a=app([two,one],1);
  a._trialCandidateIndex=0;assert.match(compare.build(a).compact,/^方案 2\/2/);
  a.trialPlan=plan([[500,600]]);assert.match(compare.build(a).compact,/^方案 1\/1/);
  assert.doesNotMatch(compare.build(a).full,/400 × 400/);
});
test('display labels never depend on arbitrary candidate-label HTML; English and decimal mm work',()=>{
  const a=app([plan([[100.125,300.456]])]);a._trialCandidates[0].label='<script>alert(1)</script>';
  const result=compare.build(a,true);
  assert.match(result.compact,/Scheme 1\/1/);assert.match(result.full,/300.46 × 100.13 mm/);
  assert.doesNotMatch(result.full,/<script>|最省料/);
});
test('comparison is read-only and rotation-invariant for remnant dimensions',()=>{
  const a=app([plan([[100,300],[200,400]]),plan([[400,200],[300,100]])]);
  const before=JSON.stringify(a);const result=compare.build(a);
  assert.equal(JSON.stringify(a),before);assert.match(result.full,/尺寸相同/);
});
test('browser wiring keeps details fresh during switching, searching and language changes',()=>{
  assert.match(html,/assets\/scheme-comparison\.js\?v=1/);
  assert.match(fs.readFileSync(require('node:path').join(__dirname,'../sw.js'),'utf8'),/assets\/scheme-comparison\.js\?v=1/);
  assert.match(html,/'trialResults','variationStatus'/);
  assert.match(html,/if\(\$\('wood-info-overlay'\)\.dataset\.open==='true'\)\$\('wood-info-full'\)\.textContent=buildFullInfo\(\)/);
  assert.match(html,/max-height:calc\(100dvh[^;]+;overflow-y:auto/);
});
test('real engine final cut replay matches comparison measurements for original and MaxRects schemes',()=>{
  const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1])
    .find(s=>s.includes('global.PlywoodTrialEngine={version:VERSION,plan,verifyBoard,orientations}'));
  const window={PlywoodTableSaw:require('../assets/table-saw-optimizer.js'),PlywoodMaxRects:require('../assets/maxrects-candidate.js')};
  vm.runInNewContext(source,{window,console});
  const engine=window.PlywoodTrialEngine;
  for(const strategy of ['original','maxrects'])for(const mode of ['ripThenCrosscut','partFirstTree']){
    const p=engine.plan([{width:300,length:440,count:2,orientationPreference:'fixed_vertical'}],
      [{width:1220,length:2440}],{mode,kerf:3,trims:{left:10,right:10,top:10,bottom:10},edges:{},packingStrategy:strategy});
    assert.ok(p.validation.ok);const m=compare.metrics(p);assert.ok(m);
    assert.equal(m.remnants.length,p.summary.retainedRemnantCount);
    assert.equal(m.largest.area,p.summary.largestRemnantArea);
    assert.ok(p.boards.every(b=>engine.verifyBoard(b,3).ok));
    assert.match(compare.build(app([p])).full,strategy==='maxrects'?/MaxRects BSSF/:/原有排版算法/);
  }
});
