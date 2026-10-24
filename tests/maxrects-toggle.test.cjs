'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).find(x=>x.includes('function readSettings(modeOverride)'))||'';

function section(startMarker,endMarker){
  const a=js.indexOf(startMarker),b=js.indexOf(endMarker,a);
  assert.notEqual(a,-1,`missing ${startMarker}`);assert.notEqual(b,-1,`missing ${endMarker}`);
  return js.slice(a,b);
}

test('MaxRects checkbox exists and defaults checked',()=>{
  const match=html.match(/<input\b(?=[^>]*\bid=["']enableMaxRects["'])([^>]*)>/i);
  assert.ok(match,'enableMaxRects checkbox is present');
  assert.match(match[1],/\bchecked\b/i);
});

test('cutting process defaults exclusively to auto comparison',()=>{
  const select=html.match(/<select\b[^>]*\bid=["']cuttingStrategy["'][^>]*>([\s\S]*?)<\/select>/i);
  assert.ok(select,'cuttingStrategy select is present');
  const selected=[...select[1].matchAll(/<option\b([^>]*)>/gi)].filter(x=>/\bselected\b/i.test(x[1]));
  assert.equal(selected.length,1,'only one cutting process may be selected by default');
  assert.match(selected[0][1],/\bvalue=["']auto["']/i);
});

test('readSettings normalizes the toggle to a strict boolean',()=>{
  const read=section('function readSettings(modeOverride){','  function rectText(');
  const fields={cuttingStrategy:{value:'ripThenCrosscut'},sawBladeThickness:{value:'3'},
    trialTrimLeft:{value:'0'},trialTrimRight:{value:'0'},trialTrimTop:{value:'0'},trialTrimBottom:{value:'0'},
    trialEdgeLeft:{checked:false},trialEdgeRight:{checked:false},trialEdgeTop:{checked:false},trialEdgeBottom:{checked:false},
    trialMinSupport:{value:''},enableMaxRects:{checked:true},remnantMinShortSide:{value:'100',addEventListener:()=>{}},remnantMinLongSide:{value:'100',addEventListener:()=>{}}};
  const context={$:id=>fields[id],parseKerf:value=>Number(value),window:{PlywoodRemnantStock:require('../assets/reusable-remnant-stock.js')}};
  vm.runInNewContext(`${read};globalThis.readSettings=readSettings`,context);
  assert.equal(context.readSettings().enableMaxRects,true);
  fields.enableMaxRects.checked='true';
  assert.equal(context.readSettings().enableMaxRects,false);
  fields.enableMaxRects.checked=false;
  assert.equal(context.readSettings().enableMaxRects,false);
});

test('project preferences use the shared loader and toggle changes invalidate candidates',()=>{
  assert.match(js,/function loadCuttingPreferences\(config,legacyMode\)/,
    'project settings are applied by the shared preferences loader');
  assert.match(js,/enableMaxRects[^\n]*(?:change|_trialCandidates|clearCandidatePool)|(?:change|_trialCandidates|clearCandidatePool)[^\n]*enableMaxRects/i,
    'toggle change must clear or invalidate candidate state');
});

test('calculate MaxRects fallback is explicitly guarded by strict true',()=>{
  const calculate=section('function calculate(){','  function saveProject(){');
  assert.match(calculate,/uiSettings\.enableMaxRects\s*===\s*true[^\n]*window\.PlywoodMaxRects|uiSettings\.enableMaxRects\s*===\s*true[\s\S]{0,160}window\.PlywoodMaxRects/,
    'calculate fallback must require enableMaxRects === true as well as module availability');
});
