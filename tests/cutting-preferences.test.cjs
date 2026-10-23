'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
const js=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('const CUTTING_PREFERENCES_KEY='));
assert.ok(js,'main preference script found');
const prefs=js.slice(js.indexOf('  const CUTTING_PREFERENCES_KEY='),js.indexOf('  function readSettings(modeOverride){'));
function boot(saved,opts={}){
  const fields={cuttingStrategy:{value:'ripThenCrosscut'},enableMaxRects:{checked:false},enableGuillotine:{checked:true}};
  const handlers={},listeners={};
  const store={}; if(saved!==undefined)store['plywood-layout-cutting-preferences-v1']=saved;
  const storage=opts.unavailable?{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}:{getItem:k=>store[k],setItem:(k,v)=>{store[k]=v}};
  const ctx={$:id=>fields[id],window:{localStorage:storage,addEventListener:(n,fn)=>listeners[n]=fn},showModeDescription(){}};
  for(const id of Object.keys(fields)) fields[id].addEventListener=(event,fn)=>{assert.equal(event,'change');handlers[id]=fn;};
  vm.runInNewContext(prefs+';globalThis.loadPrefs=loadCuttingPreferences',ctx);
  return {fields,handlers,listeners,store,ctx};
}
const read=s=>({mode:s.fields.cuttingStrategy.value,max:s.fields.enableMaxRects.checked,gui:s.fields.enableGuillotine.checked});
test('fresh initialization overwrites deliberately wrong DOM values with auto / true / false',()=>{
 const s=boot();assert.deepEqual(read(s),{mode:'auto',max:true,gui:false});
});
test('saved valid values initialize exactly and malformed/unavailable/invalid strict bool data safely fall back',()=>{
 for(const [saved,opts,want] of [
  ['not-json',{}, {mode:'auto',max:true,gui:false}],
  ['{}',{}, {mode:'auto',max:true,gui:false}],
  [JSON.stringify({mode:'ripThenCrosscut',enableMaxRects:'true',enableGuillotine:1}),{}, {mode:'ripThenCrosscut',max:true,gui:false}],
  [undefined,{unavailable:true},{mode:'auto',max:true,gui:false}],
  [JSON.stringify({mode:'partFirstTree',enableMaxRects:false,enableGuillotine:true}),{}, {mode:'partFirstTree',max:false,gui:true}]
 ]) assert.deepEqual(read(boot(saved,opts)),want);
});
test('all 3 mode x 4 checkbox combinations persist changes and survive reload',()=>{
 for(const mode of ['auto','ripThenCrosscut','partFirstTree'])for(const max of [false,true])for(const gui of [false,true]){
  const s=boot();s.fields.cuttingStrategy.value=mode;s.fields.enableMaxRects.checked=max;s.fields.enableGuillotine.checked=gui;
  for(const id of Object.keys(s.fields))s.handlers[id]();
  const reloaded=boot(s.store['plywood-layout-cutting-preferences-v1']);assert.deepEqual(read(reloaded),{mode,max,gui});
 }
});
test('pageshow reapplies saved native form values after DOM edits',()=>{
 const s=boot(JSON.stringify({mode:'partFirstTree',enableMaxRects:false,enableGuillotine:true}));
 s.fields.cuttingStrategy.value='auto';s.fields.enableMaxRects.checked=true;s.fields.enableGuillotine.checked=false;s.listeners.pageshow();
 assert.deepEqual(read(s),{mode:'partFirstTree',max:false,gui:true});
});
test('project preference load preserves missing/invalid fields, honors explicit false/true/new mode, then legacy mode',()=>{
 const s=boot(JSON.stringify({mode:'partFirstTree',enableMaxRects:false,enableGuillotine:true}));
 s.ctx.loadPrefs({enableMaxRects:'no'},'bogus');assert.deepEqual(read(s),{mode:'partFirstTree',max:false,gui:true});
 s.ctx.loadPrefs({mode:'ripThenCrosscut',enableMaxRects:false,enableGuillotine:false});assert.deepEqual(read(s),{mode:'ripThenCrosscut',max:false,gui:false});
 s.ctx.loadPrefs({mode:'auto',enableMaxRects:true,enableGuillotine:true});assert.deepEqual(read(s),{mode:'auto',max:true,gui:true});
 s.ctx.loadPrefs({},'partFirstTree');assert.deepEqual(read(s),{mode:'partFirstTree',max:true,gui:true});
});
