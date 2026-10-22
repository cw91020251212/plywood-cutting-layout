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

test('MaxRects checkbox exists and defaults unchecked',()=>{
  const match=html.match(/<input\b(?=[^>]*\bid=["']enableMaxRects["'])([^>]*)>/i);
  assert.ok(match,'enableMaxRects checkbox is present');
  assert.doesNotMatch(match[1],/\bchecked\b/i);
});

test('readSettings normalizes the toggle to a strict boolean',()=>{
  const read=section('function readSettings(modeOverride){','  function rectText(');
  const fields={cuttingStrategy:{value:'ripThenCrosscut'},sawBladeThickness:{value:'3'},
    trialTrimLeft:{value:'0'},trialTrimRight:{value:'0'},trialTrimTop:{value:'0'},trialTrimBottom:{value:'0'},
    trialEdgeLeft:{checked:false},trialEdgeRight:{checked:false},trialEdgeTop:{checked:false},trialEdgeBottom:{checked:false},
    trialMinSupport:{value:''},enableMaxRects:{checked:true}};
  const context={$:id=>fields[id],parseKerf:value=>Number(value)};
  vm.runInNewContext(`${read};globalThis.readSettings=readSettings`,context);
  assert.equal(context.readSettings().enableMaxRects,true);
  fields.enableMaxRects.checked='true';
  assert.equal(context.readSettings().enableMaxRects,false);
  fields.enableMaxRects.checked=false;
  assert.equal(context.readSettings().enableMaxRects,false);
});

test('legacy project config loads with strict false and toggle changes invalidate candidates',()=>{
  assert.match(js,/enableMaxRects\s*:\s*[^,}]*\?\?\s*false|enableMaxRects\s*:\s*[^,}]*===\s*true/,
    'loadProject must normalize absent/legacy values to false and reject truthy non-booleans');
  assert.match(js,/enableMaxRects[^\n]*(?:change|_trialCandidates|clearCandidatePool)|(?:change|_trialCandidates|clearCandidatePool)[^\n]*enableMaxRects/i,
    'toggle change must clear or invalidate candidate state');
});

test('calculate MaxRects fallback is explicitly guarded by strict true',()=>{
  const calculate=section('function calculate(){','  function saveProject(){');
  assert.match(calculate,/uiSettings\.enableMaxRects\s*===\s*true[^\n]*window\.PlywoodMaxRects|uiSettings\.enableMaxRects\s*===\s*true[\s\S]{0,160}window\.PlywoodMaxRects/,
    'calculate fallback must require enableMaxRects === true as well as module availability');
});
