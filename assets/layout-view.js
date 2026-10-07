(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PlywoodLayoutView = api; const start = () => root.setTimeout(() => api.install(root), 0); if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, {once:true}); else start(); }
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const KEY = 'plywood-layout-compact-view-v1';
  const factors = {m:1000, cm:10, mm:1, ft:304.8, inch:25.4, fen:3.175};
  const aliases = {'尺':'ft','呎':'ft','寸':'inch','吋':'inch',in:'inch',inch:'inch',ft:'ft',m:'m',cm:'cm',mm:'mm','分':'fen'};
  const number = n => { const v=Number(n),rounded=Number(v.toFixed(4));return rounded===0&&v!==0?Number(v.toPrecision(6)).toString():rounded.toString(); };
  function inputSegments(inputs, system) {
    const keys = system === 'imperial' ? ['ft','inch','fen'] : ['m','cm','mm'];
    const segments = [];
    for (const key of keys) {
      const raw = String(inputs?.[key] ?? '').trim(); if (!raw) continue;
      const match = raw.match(/^(\d+(?:\.\d+)?|\d*\.?\d+\s*\/\s*\d+)\s*(mm|cm|m|inch|in|ft|尺|呎|寸|吋|分)?$/i);
      if (!match) return [];
      const values = match[1].split('/').map(Number), value = values.length === 2 ? values[0]/values[1] : values[0];
      if (!Number.isFinite(value) || value < 0) return [];
      if (value) segments.push({unit:aliases[(match[2]||key).toLowerCase()]||key, value, raw:match[1].replace(/\s/g,'')});
    }
    return segments;
  }
  function formatLength(mm, options = {}) {
    const value = Number(mm); if (!Number.isFinite(value) || value < 0) return '—';
    const system = options.system === 'imperial' ? 'imperial' : 'metric', english = !!options.english;
    const labels = {m:'m',cm:'cm',mm:'mm',ft:english?'ft':'尺',inch:english?'in':'寸',fen:english?'eighths':'分'};
    const segments = options.preserve === false ? [] : inputSegments(options.inputs, system);
    const total = segments.reduce((n,s)=>n+s.value*factors[s.unit],0), same = segments.length && Math.abs(total-value)<=Math.max(1e-6,value*1e-8);
    const inches = value/25.4;
    const feetWithinEight = system==='imperial' && inches<=96+1e-8 && segments.some(s=>s.unit==='ft');
    if (same && !feetWithinEight) return segments.map(s=>`${s.raw}${labels[s.unit]}`).join(' ');
    if (system==='metric') { const unit=segments.at(-1)?.unit; const safe=['m','cm','mm'].includes(unit)?unit:'mm'; return `${number(value/factors[safe])}${labels[safe]}`; }
    // Preserve the entered inch/fen unit even above 8 ft; only source-less long dimensions use feet.
    if (segments.length && !segments.some(s=>s.unit==='ft')) { const unit=segments.at(-1).unit; return `${number(value/factors[unit])}${labels[unit]}`; }
    if (inches<=96+1e-8) return `${number(inches)}${labels.inch}`;
    const feet=Math.floor(inches/12), rest=inches-feet*12;
    return `${feet}${labels.ft}${Math.abs(rest)>1e-8?` ${number(rest)}${labels.inch}`:''}`;
  }
  function readPreferences(storage) {
    try { const p=JSON.parse(storage.getItem(KEY)||'{}'); return {remoteOpen:p.remoteOpen===true,position:p.position&&Number.isFinite(p.position.x)&&Number.isFinite(p.position.y)?{x:Math.min(1,Math.max(0,p.position.x)),y:Math.min(1,Math.max(0,p.position.y))}:null,expanded:Array.isArray(p.expanded)?p.expanded.filter(x=>typeof x==='string').slice(0,50):[]}; }
    catch (_) { return {remoteOpen:false,position:null,expanded:[]}; }
  }
  function clampPosition(x,y,width,height,vw,vh) { return {x:Math.max(8,Math.min(Number.isFinite(x)?x:8,Math.max(8,vw-width-8))),y:Math.max(8,Math.min(Number.isFinite(y)?y:8,Math.max(8,vh-height-8)))}; }
  function install(w) {
    const d=w.document, $=id=>d.getElementById(id), c=w.calculator, ui=w.PlywoodTrialUI;
    if (!c || !ui || $('layoutRemote')) return;
    let storage; try { storage=w.localStorage; } catch (_) { storage={getItem:()=>null,setItem:()=>{}}; }
    const prefs=readPreferences(storage), save=()=>{try{storage.setItem(KEY,JSON.stringify(prefs));}catch(_){}};
    const details=(id,title,parent)=>{ let el=$(id); if(el)return el; el=d.createElement('details');el.id=id;el.className='compact-details';const summary=d.createElement('summary');summary.textContent=title;el.appendChild(summary);el.open=prefs.expanded.includes(id);el.addEventListener('toggle',()=>{prefs.expanded=prefs.expanded.filter(x=>x!==id);if(el.open)prefs.expanded.push(id);save();});parent.appendChild(el);return el; };
    const settings=$('optimizationObjectiveGroup'), settingsParent=settings.parentNode;
    const inputSettings=details('layoutInputSettings','排料設定（慳料／方便、工序）',settingsParent);settingsParent.insertBefore(inputSettings,settings);inputSettings.append(settings,$('moreCutSettings'));
    const heading=d.querySelector('.output-heading');
    const displaySettings=details('layoutDisplaySettings','圖面與尺寸設定',heading.parentNode);heading.after(displaySettings);
    displaySettings.append(d.querySelector('.part-appearance-toolbar'),d.querySelector('.search-help'));
    const unitSetting=d.querySelector('.display-unit-setting');if(unitSetting)displaySettings.append(unitSetting);
    const messages=details('layoutDiagnostics','診斷訊息',heading.parentNode);$('cutDetails').after(messages);
    ['suggestionMessage','progressMessage','status'].forEach(id=>messages.appendChild($(id)));
    const error=$('errorMessage');heading.before(error);error.setAttribute('role','alert');
    const launch=d.createElement('button');launch.id='layoutRemoteLauncher';launch.type='button';launch.className='layout-remote-launcher no-print';launch.textContent='方案遙控器';launch.setAttribute('aria-controls','layoutRemote');heading.appendChild(launch);
    const remote=d.createElement('section');remote.id='layoutRemote';remote.className='layout-remote no-print';remote.hidden=true;remote.setAttribute('role','region');remote.setAttribute('aria-labelledby','layoutRemoteTitle');
    remote.innerHTML='<header class="layout-remote-handle"><strong id="layoutRemoteTitle">方案遙控器</strong><button type="button" id="closeLayoutRemote" aria-label="關閉方案遙控器">關閉</button></header><p class="remote-hint">拖動標題可移位；只選方案，不改尺寸。</p><div class="remote-board-row"><label for="remoteBoard">查看原板</label><select id="remoteBoard"></select></div>';
    d.body.appendChild(remote);const controls=$('variationControls');remote.appendChild(controls);
    let activeBoard=0, boardNames='',drag=null;
    const place=()=>{if(remote.hidden)return;const r=remote.getBoundingClientRect(),position=prefs.position;const p=clampPosition(position?position.x*w.innerWidth:w.innerWidth-r.width-16,position?position.y*w.innerHeight:w.innerHeight-r.height-24,r.width,r.height,w.innerWidth,w.innerHeight);remote.style.left=`${p.x}px`;remote.style.top=`${p.y}px`;};
    const sync=()=>{const host=c.portraitDisplayMode?($('portraitDisplayControls')||heading):heading;if(launch.parentNode!==host)host.appendChild(launch);const ready=!controls.hidden;launch.hidden=!ready;remote.hidden=!ready||!prefs.remoteOpen;launch.setAttribute('aria-expanded',String(!remote.hidden));place();};
    launch.addEventListener('click',()=>{prefs.remoteOpen=true;save();sync();$('closeLayoutRemote').focus({preventScroll:true});});
    const close=()=>{prefs.remoteOpen=false;save();sync();launch.focus({preventScroll:true});};$('closeLayoutRemote').addEventListener('click',close);
    remote.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
    $('remoteBoard').addEventListener('change',()=>{activeBoard=Number($('remoteBoard').value);d.querySelector(`.board-display-group[data-board-group-index="${activeBoard}"]`)?.scrollIntoView({block:'nearest',behavior:'auto'});});
    const handle=remote.querySelector('header');
    handle.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;const r=remote.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};handle.setPointerCapture(e.pointerId);e.preventDefault();});
    handle.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const r=remote.getBoundingClientRect(),p=clampPosition(drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y,r.width,r.height,w.innerWidth,w.innerHeight);remote.style.left=`${p.x}px`;remote.style.top=`${p.y}px`;});
    const endDrag=()=>{if(!drag)return;drag=null;const r=remote.getBoundingClientRect();prefs.position={x:r.left/Math.max(1,w.innerWidth),y:r.top/Math.max(1,w.innerHeight)};save();};handle.addEventListener('pointerup',endDrag);handle.addEventListener('pointercancel',endDrag);w.addEventListener('resize',place);
    function compact() {
      const root=$('trialResults');
      if(root.querySelector('.simple-result:not(.incomplete)')) {
        let info=$('layoutResultInfo');if(!info)info=details('layoutResultInfo','方案資訊與驗證',root);
        Array.from(root.children).filter(el=>!el.classList.contains('simple-result')&&el!==info&&el.className!=='compact-safety').forEach(el=>info.appendChild(el));
        const path=info.querySelector('.cut-path-toggle-row');if(path){displaySettings.querySelectorAll('.cut-path-toggle-row').forEach(old=>{if(old!==path)old.remove();});displaySettings.appendChild(path);}
        if(!root.querySelector('.compact-safety')) { const note=d.createElement('p');note.className='compact-safety';note.textContent='候選排法；開料前請師傅核對。';root.querySelector('.simple-result').after(note); }
      }
      const groups=Array.from(d.querySelectorAll('#canvasContainer .board-display-group'));
      groups.forEach((group,index)=>{
        let extras=$(`boardExtras-${index}`);if(!extras)extras=details(`boardExtras-${index}`,'板材資料與工具',group);
        const card=group.querySelector('.canvas-container'),legend=group.querySelector('.board-size-legend');
        if(card)Array.from(card.children).filter(el=>!el.classList.contains('portrait-canvas-stage')).forEach(el=>extras.appendChild(el));
        Array.from(group.children).filter(el=>el!==card&&el!==legend&&el!==extras).forEach(el=>extras.appendChild(el));
        const replay=d.querySelector(`#cutDetails [data-replay-index="${index}"]`)?.closest('.trial-replay-panel');if(replay)extras.appendChild(replay);
      });
      activeBoard=Math.min(activeBoard,Math.max(0,groups.length-1));
      const names=(c.trialPlan?.boards||[]).map((b,i)=>`${i+1}: ${b.boardId}`).join('|');
      if(names!==boardNames){boardNames=names;const fragment=d.createDocumentFragment();groups.forEach((_,i)=>{const option=d.createElement('option');option.value=String(i);option.textContent=`${c.currentLanguage==='en'?'Sheet':'板'} ${i+1}`;fragment.appendChild(option);});$('remoteBoard').replaceChildren(fragment);$('remoteBoard').value=String(activeBoard);}
      if(!c.trialPlan)displaySettings.querySelectorAll('.cut-path-toggle-row').forEach(el=>el.remove());
      sync();
    }
    new w.MutationObserver(compact).observe($('canvasContainer'),{childList:true,subtree:true});
    new w.MutationObserver(compact).observe($('trialResults'),{childList:true});
    new w.MutationObserver(sync).observe(controls,{attributes:true,attributeFilter:['hidden']});
    new w.MutationObserver(sync).observe(d.body,{attributes:true,attributeFilter:['class']});
    if(w.ResizeObserver)new w.ResizeObserver(place).observe(remote);
    let lastPlan=c.trialPlan;
    const render=ui.render;
    ui.render=function(plan,label){
      const previousPlan=lastPlan;
      const views=Array.from(d.querySelectorAll('#canvasContainer canvas.canvas')).map(canvas=>({angle:Number(canvas.dataset.rotation)||0,count:canvas.dataset.replayCount===''?null:Number(canvas.dataset.replayCount)}));
      const result=render.call(this,plan,label);lastPlan=plan;
      views.forEach((view,index)=>{const before=previousPlan?.boards[index],after=plan.boards[index],canvas=d.querySelector(`#canvasContainer canvas.canvas[data-board-index="${index}"]`);if(!canvas||!before||!after||before.width!==after.width||before.length!==after.length)return;canvas.dataset.rotation=String(view.angle);canvas.style.transform=`rotate(${view.angle}deg)`;if(previousPlan===plan&&view.count!==null)canvas.dataset.replayCount=String(view.count);ui.redrawBoard(index);});
      compact();if(c.portraitDisplayMode&&c.handlePortraitDisplayResize)c.handlePortraitDisplayResize();return result;
    };
    compact();
    w.PlywoodCompactUI={compact,sync,preferences:prefs};
  }
  return {formatLength,inputSegments,readPreferences,clampPosition,install,storageKey:KEY};
});
