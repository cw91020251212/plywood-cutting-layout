'use strict';
// Local comparison only: no GitHub/API/network, push or deployment.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1])
  .find(s=>s.includes('global.PlywoodTrialEngine={version:VERSION,plan,verifyBoard,orientations}'));
const saw=require('../assets/table-saw-optimizer.js'),maxrects=require('../assets/maxrects-candidate.js');
const cabinet=[[2000,600,2],[966,600,2],[966,580,1],[964,580,4],[1994,496,2],[1000,100,1],[583,100,2]];
function compare(rows,fixed,mode,stock=[{width:1220,length:2440}]) {
  const parts=rows.map(([length,width,count])=>({length,width,count,orientationPreference:fixed?'fixed_vertical':'auto'}));
  function run(enabled) {
    let attempts=0,rejections=0;
    const api={...maxrects,pack(...a){attempts++;return maxrects.pack(...a);},toCutTree(...a){const r=maxrects.toCutTree(...a);if(!r.ok)rejections++;return r;}};
    const context={window:{PlywoodTableSaw:saw,PlywoodMaxRects:enabled?api:null,calculator:{parts,boards:stock}},console};
    vm.runInNewContext(source,context);
    const start=html.indexOf('  function totalCutCount(plan)'),end=html.indexOf('  function updateVariationControls()',start);
    vm.runInNewContext(`const selectedObjective=()=> 'saving';const getParts=()=>window.calculator.parts.map(p=>({...p}));const getBoards=()=>window.calculator.boards.map(b=>({...b}));const safeForDisplay=p=>p.validation.boardIssues.length===0&&p.validation.countIssues.length===0&&p.boards.every(b=>b.validation.ok);${html.slice(start,end)};globalThis.build=buildCandidatePool;`,context);
    const settings={mode,kerf:3,trims:{},edges:{},minSupportWidth:'',enableMaxRects:enabled};
    const engine=context.window.PlywoodTrialEngine;
    const startTime=performance.now();
    const pool=context.build(engine.plan(parts,stock,settings),settings,[mode],x=>x,'saving');
    if(!pool.length)throw new Error('No verified layout');
    const best=pool[0].plan,r=best.summary.largestRemnant;
    return {verified:best.validation.ok&&best.boards.every(b=>engine.verifyBoard(b,3).ok),
      sheetCount:best.summary.usedBoardCount,parts:best.summary.placedParts,
      largestRemnant:r?{length:r.rect.length,width:r.rect.width,area:r.area}:null,
      cuts:best.boards.reduce((n,b)=>n+b.cuts.length,0),candidates:pool.length,
      maxRectsCandidates:pool.filter(x=>x.plan.boards.some(b=>b.packingSource==='maxrects-bssf')).length,
      maxRectsAttempts:attempts,maxRectsRejections:rejections,
      elapsedMs:Math.round(performance.now()-startTime),plan:best};
  }
  const before=run(false),after=run(true);
  if(saw.comparePlans(after.plan,before.plan,'saving')>0)throw new Error('Integrated best regressed');
  delete before.plan;delete after.plan;
  return {fixedOrientation:fixed,mode,before,after};
}
const results={cabinet:[],simple:null};
for(const fixed of [true,false])for(const mode of ['ripThenCrosscut','partFirstTree'])results.cabinet.push(compare(cabinet,fixed,mode));
results.simple=compare([[440,300,2],[250,300,4]],true,'ripThenCrosscut',[{width:603,length:1000}]);
const target=process.argv[2];
const text=JSON.stringify(results,null,2)+'\n';
if(target)fs.writeFileSync(path.resolve(target),text);
console.log(text);
