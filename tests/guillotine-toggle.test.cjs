'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('function readSettings(modeOverride)'));
const section=(a,b)=>js.slice(js.indexOf(a),js.indexOf(b,js.indexOf(a)));

test('independent guillotine switch starts off while original defaults remain untouched',()=>{
  const input=html.match(/<input\b(?=[^>]*\bid="enableGuillotine")([^>]*)>/);
  assert.ok(input);assert.doesNotMatch(input[1],/\bchecked\b/);
  assert.match(input[1],/aria-describedby="guillotineNote"/);
  assert.match(html,/<input\b[^>]*id="enableMaxRects"[^>]*\bchecked\b/);
  assert.match(html,/<option value="auto" selected>/);
  assert.match(html,/並非 OpenCutList 原碼或完整複刻/);
});

test('readSettings accepts only an actual checked boolean and leaves MaxRects independent',()=>{
  const fields={cuttingStrategy:{value:'auto'},sawBladeThickness:{value:'3'},enableGuillotine:{checked:true},enableMaxRects:{checked:true},trialMinSupport:{value:''}};
  for(const side of ['Left','Right','Top','Bottom']){fields['trialTrim'+side]={value:'0'};fields['trialEdge'+side]={checked:true};}
  const ctx={$:id=>fields[id],parseKerf:Number};
  vm.runInNewContext(section('function readSettings(modeOverride){','  function rectText(')+';globalThis.read=readSettings',ctx);
  assert.equal(ctx.read().enableGuillotine,true);
  for(const value of [false,'true',1,undefined]){fields.enableGuillotine.checked=value;assert.equal(ctx.read().enableGuillotine,false);assert.equal(ctx.read().enableMaxRects,true);}
});

test('project loading round-trips strict guillotine settings and older files default off',()=>{
  const fields=new Map();
  const $=id=>{if(!fields.has(id))fields.set(id,{value:'',checked:false,style:{}});return fields.get(id);};
  $('unitSystem').value='metric';
  const calculator={parts:[],boards:[],updatePartsTable(){},updateBoardsTable(){},updateUnitSystem(){}};
  let fileInput;
  class FileReader{readAsText(file){this.result=file;this.onload();}}
  const ctx={$ ,FileReader,window:{calculator},document:{createElement(){return fileInput={setAttribute(){},click(){}};}},setObjective(){},updateObjectiveHelp(){},normalizeUnitSystem:x=>x,readUnitSystemPreference:()=>null,clearCandidatePool(){},clearMessages(){}};
  vm.runInNewContext(section('function loadProject(){','  function resetResults(){')+';globalThis.load=loadProject',ctx);
  for(const value of [true,false,'true',1,undefined]){
    ctx.load();
    const trialConfig={enableMaxRects:true};if(value!==undefined)trialConfig.enableGuillotine=value;
    fileInput.onchange({target:{files:[JSON.stringify({parts:[],boards:[],trialConfig})]}});
    assert.equal($('enableGuillotine').checked,value===true);
    assert.equal($('enableMaxRects').checked,true);
    assert.equal($('cuttingStrategy').value,'auto');
    assert.equal(calculator.trialPlan,null);
  }
});

test('switch change invalidates existing candidates without auto-calculating or changing other switches',()=>{
  const fields={enableGuillotine:{checked:false},enableMaxRects:{checked:true},status:{textContent:''}};
  let handler,reset=0;
  fields.enableGuillotine.addEventListener=(name,fn)=>{assert.equal(name,'change');handler=fn;};
  const line=js.split('\n').find(l=>l.includes("$('enableGuillotine').addEventListener('change'"));
  vm.runInNewContext(line,{$:id=>fields[id],resetResults(){reset++;}});
  handler();assert.equal(reset,1);assert.equal(fields.enableMaxRects.checked,true);assert.match(fields.status.textContent,/原有及 MaxRects 設定不變/);
  fields.enableGuillotine.checked=true;handler();assert.equal(reset,2);assert.match(fields.status.textContent,/已開啟獨立貫通/);
});

test('production and offline shell load the independent module, and both languages explain its scope',()=>{
  assert.match(html,/<script src="assets\/guillotine-candidate\.js\?v=1"><\/script>/);
  assert.match(fs.readFileSync(path.join(root,'sw.js'),'utf8'),/\.\/assets\/guillotine-candidate\.js\?v=1/);
  assert.match(html,/not OpenCutList code or a full replica/);
  assert.match(section('function calculate(){','  function saveProject(){'),/uiSettings\.enableGuillotine===true/);
});

test('bilingual translation preserves the OpenCutList proper name, while standalone Open still translates',()=>{
  const start=html.indexOf('  function translateText(value,lang){'),end=html.indexOf('  const unitLabelZh=',start);
  const ctx={dict:[['開啟','Open']],order:[['開啟','Open']]};
  vm.runInNewContext(html.slice(start,end)+';globalThis.translate=translateText',ctx);
  assert.equal(ctx.translate('OpenCutList 同類方法','zh'),'OpenCutList 同類方法');
  assert.equal(ctx.translate('OpenCutList 同類方法','en'),'OpenCutList 同類方法');
  assert.equal(ctx.translate('Open','zh'),'開啟');
});
