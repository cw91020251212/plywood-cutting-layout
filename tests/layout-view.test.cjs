'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const view=require('../assets/layout-view.js');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'assets/layout-view.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/layout-view.css'),'utf8');
const inch=(n,inputs)=>view.formatLength(n*25.4,{system:'imperial',inputs});

test('entered inches stay inches, including values greater than 8 feet',()=>{
  for(const n of [1,11,24,36.5,48,72,96,105,108])assert.equal(inch(n,{inch:String(n)}),`${n}寸`);
  assert.equal(inch(11.5,{inch:'11',fen:'4'}),'11寸 4分');
});
test('at most 8 feet, including boundary, displays inches; long source-less measurements may use feet',()=>{
  for(const ft of [1,4,6,8])assert.equal(inch(ft*12,{ft:String(ft)}),`${ft*12}寸`);
  assert.equal(inch(54,{ft:'4',inch:'6'}),'54寸');
  assert.equal(inch(108),'9尺');
  assert.equal(inch(109,{ft:'9',inch:'1'}),'9尺 1寸');
});
test('metric source units and compound inputs survive; offcuts use source units rather than fabricated raw sizes',()=>{
  assert.equal(view.formatLength(120,{system:'metric',inputs:{cm:'12'}}),'12cm');
  assert.equal(view.formatLength(1205,{system:'metric',inputs:{m:'1',cm:'20',mm:'5'}}),'1m 20cm 5mm');
  assert.equal(view.formatLength(250,{system:'metric',inputs:{cm:'120',mm:'0'}}),'25cm');
  assert.equal(inch(11.5,{inch:'99'}),'11.5寸');
  assert.equal(inch(12,{inch:'<script>bad</script>'}),'12寸');
});
test('generated dimensions retain small nonzero values and do not quantize geometry to an eighth',()=>{
  assert.equal(view.formatLength(3,{system:'imperial'}),'0.1181寸');
  assert.notEqual(view.formatLength(0.00001,{system:'imperial'}),'0寸');
  assert.equal(view.formatLength(NaN),'—');
  assert.equal(view.formatLength(-1),'—');
  assert.equal(view.formatLength(120,{system:'metric',inputs:{cm:'12'},preserve:false}),'120mm');
  assert.equal(view.formatLength(120,{system:'metric',inputs:{cm:'12'},english:true}),'12cm');
});
test('the actual result formatter receives per-part original width/length input contexts',()=>{
  const start=html.indexOf('  function formatDimension(mm,item,dimension)');
  const end=html.indexOf('\n  function formatArea',start);
  const calculator={autoDisplayUnits:false,currentLanguage:'zh'};
  const context={calculator,window:{PlywoodLayoutView:view},selectedUnit:()=> 'imperial',nfmt:n=>String(n)};
  vm.runInNewContext(`${html.slice(start,end)};globalThis.format=formatDimension;`,context);
  const part={displayUnitSystem:'metric',originalWidthInputs:{m:'2.4'},originalLengthInputs:{cm:'12'}};
  assert.equal(context.format(2400,part,'width'),'2.4m');
  assert.equal(context.format(120,part,'length'),'12cm');
  calculator.autoDisplayUnits=true;
  assert.equal(context.format(120,part,'length'),'4.7244寸');
  assert.match(html,/formatEdgeDimension\(part,edge\)/);
  assert.match(html,/formatEdgeDimension\(projected,edge\)/);
  assert.match(html,/c\._formatTrialDimension\(b\.length\?\?b\.height,b,'length'\)/,'language switching must not revert board length to the old formatter');
});
test('compact preferences reject malformed storage and retain only folded-section state',()=>{
  const bad={getItem:()=>'{broken'};
  assert.deepEqual(view.readPreferences(bad),{expanded:[]});
  const good={getItem:()=>JSON.stringify({remoteOpen:true,position:{x:6,y:-2},expanded:['layoutDisplaySettings',7]})};
  assert.deepEqual(view.readPreferences(good),{expanded:['layoutDisplaySettings']});
});
test('input unit policy migrates auto conversion off once, then remembers explicit user choices',()=>{
  const store=new Map([['plywood-layout-auto-display-units-v1','true']]);
  const context={window:{localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))}}};
  const start=html.indexOf("const UNIT_SYSTEM_STORAGE_KEY = 'plywood-layout-unit-system-v1';"),end=html.indexOf('function readLanguagePreference',start);
  vm.runInNewContext(`${html.slice(start,end)};globalThis.read=readAutoDisplayUnitsPreference;globalThis.save=saveAutoDisplayUnitsPreference;`,context);
  assert.equal(context.read(),false);
  context.save(true);assert.equal(context.read(),true);
  context.save(false);assert.equal(context.read(),false);
});
test('leftover dimension and R-label switches are persistent and do not hide geometric material shapes',()=>{
  const start=html.indexOf('  function drawRemnantLabels'),end=html.indexOf('\n  function drawBoard',start);
  let edges=0,badges=0;
  const context={showRemnantDimensions:false,showRemnantLabels:false,remnantPartForDisplay:r=>r,drawRemnantEdgeDimensions:()=>edges++,drawRemnantBadge:()=>badges++};
  vm.runInNewContext(`${html.slice(start,end)};globalThis.draw=drawRemnantLabels`,context);
  const canvas={width:100,height:100,clientWidth:100,clientHeight:100};
  context.draw({},canvas,[{}],{},null,null,1,1);assert.equal(edges,0);
  context.showRemnantDimensions=true;context.showRemnantLabels=true;context.draw({},canvas,[{}],{},null,null,1,1);assert.equal(edges,1);assert.equal(badges,1);
  assert.match(html,/localStorage.setItem\(REMNANT_DIMENSION_KEY,String\(showRemnantDimensions\)\)/);
  assert.match(html,/const REMNANT_DIMENSION_KEY='plywood-layout-remnant-dimensions-v1',REMNANT_LABEL_KEY='plywood-layout-remnant-labels-v1'/);
  assert.match(html,/function readRemnantLabels\(\)/);
  assert.match(html,/id="showRemnantLabels"/);
  assert.match(html,/localStorage.setItem\(REMNANT_LABEL_KEY,String\(showRemnantLabels\)\)/);
  assert.match(html,/if\(showRemnantDimensions\)drawRemnantEdgeDimensions[\s\S]*?if\(showRemnantLabels\)drawRemnantBadge/);
  assert.match(html,/draw\('top',[\s\S]*?draw\('right'/,'each remnant gets one long-side and one short-side canvas label, not four repeats');
  assert.match(html,/drawRemnantShapes\(ctx,remnants,projection,X,Y,sx,sy\)/);
  assert.match(html,/\[data-remnant-details\].*detail\.hidden=!showRemnantDimensions/);
  assert.match(css,/part-dimension-all-item\[hidden\]\{display:none!important\}/);
});
test('remnant label preference is independent from remnant dimension preference',()=>{
  const start=html.indexOf("const REMNANT_DIMENSION_KEY = 'plywood-layout-remnant-dimensions-v1'")>=0?html.indexOf("const REMNANT_DIMENSION_KEY = 'plywood-layout-remnant-dimensions-v1'"):html.indexOf("const REMNANT_DIMENSION_KEY='plywood-layout-remnant-dimensions-v1'");
  const end=html.indexOf('\n  let selectedDimensionPart',start);
  const store=new Map([['plywood-layout-remnant-dimensions-v1','false'],['plywood-layout-remnant-labels-v1','true']]);
  const context={window:{localStorage:{getItem:key=>store.get(key)??null}}};
  vm.runInNewContext(`${html.slice(start,end)};globalThis.read={dims:readRemnantDimensions,labels:readRemnantLabels};`,context);
  assert.equal(context.read.dims(),false);
  assert.equal(context.read.labels(),true);
  store.set('plywood-layout-remnant-labels-v1','false');assert.equal(context.read.labels(),false);
});
test('a vertical dimension text box cannot spill past the physical edge',()=>{
  const start=html.indexOf('  function drawEdgeMeasure'),end=html.indexOf('\n  function drawPartEdgeDimensions',start);
  const context={};vm.runInNewContext(`${html.slice(start,end)};globalThis.draw=drawEdgeMeasure`,context);
  assert.equal(context.draw({measureText:()=>({width:40})},'a long label',0,0,20,50,Math.PI/2,1),false);
});
test('diagram metadata is folded, the legend stays outside, and the right remote closes without adding a tools block',()=>{
  assert.match(js,/const canvasContainer=\$\('canvasContainer'\);\s*const displaySettings=details\('layoutDisplaySettings','圖面與尺寸設定',canvasContainer\.parentNode\);canvasContainer\.before\(displaySettings\)/,'diagram controls stay immediately before the layout image');
  assert.doesNotMatch(js,/heading\.after\(displaySettings\)/,'diagram controls must not remain at the top of the results section');
  assert.match(js,/displaySettings.append\(d.querySelector\('\.part-appearance-toolbar'\)/);
  assert.match(js,/el!==card&&el!==legend&&el!==extras/);
  assert.match(js,/parking.append\(controls\)/,'hidden native controls survive result rerenders without creating another visible block');
  assert.match(js,/id="remotePreviousVariation"/);
  assert.match(js,/id="remoteNextVariation"/);
  assert.match(js,/id="closeLayoutRemote"/);
  assert.match(js,/remotePrevious.addEventListener\('click',\(\)=>previous.click\(\)\)/);
  assert.match(js,/remoteNext.addEventListener\('click',\(\)=>next.click\(\)\)/);
  assert.match(js,/const close=\(\)=>\{closed=true;sync\(\);\}/,'closing hides the remote without changing a candidate');
  assert.match(js,/c\.calculateCutting=function\(\)\{closed=false;/,'a later calculation reopens the comparison remote');
  assert.match(js,/switchable=ready&&\(!previous.disabled\|\|!next.disabled\)/,'arrows disappear when there is nothing to compare');
  assert.match(js,/simple-result:not\(\.incomplete\)/,'incomplete errors must not be folded');
  assert.match(js,/error.setAttribute\('role','alert'\)/);
  assert.doesNotMatch(js,/layoutRemoteLauncher|layoutPlanTools|remoteBoard|setPointerCapture/,'the remote has no launcher, added tools block, board selector or drag behaviour');
  assert.match(css,/\.layout-remote\{position:fixed;right:/);
  assert.match(css,/--wood-layout-remote-opacity/,'the remote follows the existing adjustable opacity convention');
  assert.match(html,/wood-opacity-target-layout/,'settings expose a dedicated remote opacity target');
  assert.match(html,/wood-layout-remote-opacity/);
  assert.match(html,/const scope=card.closest\('\.board-display-group'\)\|\|card/);
  assert.doesNotMatch(js,/\.plan\(|\.calculateCutting\(/,'view organization must not invoke a new solver');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  for(const asset of ['layout-view.js?v=5','layout-view.css?v=4'])assert.ok(sw.includes(asset)&&html.includes(asset));
});
