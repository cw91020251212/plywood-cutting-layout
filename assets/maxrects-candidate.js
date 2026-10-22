/*
 * Adapted MaxRects BSSF core from RajwanYair/WoodworkingShop.
 * Source: https://github.com/RajwanYair/WoodworkingShop/blob/8ff6bcc04c99b2d87193557e3d10b834f347a9e4/src/engine/optimizer/cut-optimizer.ts
 * Copyright (c) 2026 Ryair; MIT License. See ../licenses/WoodworkingShop-MIT.txt.
 * Axes: x=width, y=length. Standalone UMD module.
 * Local extension: bounded slicing-tree search ranks physical empty leaves,
 * not overlapping MaxRects search rectangles, before minimizing saw kerf.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlywoodMaxRects = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EPS = 1e-7;
  const positive = n => Number.isFinite(n) && n > EPS;
  const rectValid = r => r && Number.isFinite(r.x) && Number.isFinite(r.y) && positive(r.width) && positive(r.length);
  const inside = (a,b) => b.x >= a.x-EPS && b.y >= a.y-EPS && b.x+b.width <= a.x+a.width+EPS && b.y+b.length <= a.y+a.length+EPS;
  function overlaps(a,b) { return a.x < b.x+b.width-EPS && a.x+a.width > b.x+EPS && a.y < b.y+b.length-EPS && a.y+a.length > b.y+EPS; }
  function clearance(x,y,w,h,placed,k) { return placed.every(p => Math.max(x-(p.x+p.width),p.x-(x+w)) >= k-EPS || Math.max(y-(p.y+p.length),p.y-(y+h)) >= k-EPS); }
  function split(free, used) {
    for(let i=free.length-1;i>=0;i--) { const f=free[i]; if(!overlaps(f,used)) continue; free.splice(i,1);
      const candidates=[{x:f.x,y:f.y,width:used.x-f.x,length:f.length},{x:used.x+used.width,y:f.y,width:f.x+f.width-used.x-used.width,length:f.length},{x:f.x,y:f.y,width:f.width,length:used.y-f.y},{x:f.x,y:used.y+used.length,width:f.width,length:f.y+f.length-used.y-used.length}];
      for(const r of candidates) if(positive(r.width)&&positive(r.length)) free.push(r);
    }
  }
  function prune(free) { for(let i=free.length-1;i>=0;i--) for(let j=0;j<free.length;j++) if(i!==j&&inside(free[j],free[i])) {free.splice(i,1);break;} }
  function pack(tokens, stockRect, kerf, options={}) {
    if(!Array.isArray(tokens)||!rectValid(stockRect)||!Number.isFinite(kerf)||kerf<=0) throw new TypeError('tokens, positive stock dimensions, and kerf > 0 are required');
    const seen=new Set();
    for(const t of tokens){if(!t||typeof t.id!=='string'||!t.id.trim()||seen.has(t.id))throw new TypeError('token ids must be unique and nonempty');seen.add(t.id);if(!positive(t.width)||!positive(t.length)||!Array.isArray(t.orientations)||!t.orientations.length)throw new TypeError('token dimensions and orientations must be positive');for(const o of t.orientations){if(!o||!positive(o.width)||!positive(o.length)||typeof o.rotated!=='boolean'||(o.rotated?Math.abs(o.width-t.length)>EPS||Math.abs(o.length-t.width)>EPS:Math.abs(o.width-t.width)>EPS||Math.abs(o.length-t.length)>EPS))throw new TypeError('orientation does not match token dimensions');}}
    const free=[{...stockRect}], placements=[], remainingIds=[];
    const queue=tokens.map((t,i)=>({t,i})).sort((a,b)=>Math.max(b.t.width,b.t.length)-Math.max(a.t.width,a.t.length)||b.t.width*b.t.length-a.t.width*a.t.length||a.i-b.i);
    for(const {t} of queue) {
      let best=null;const os=t.orientations;
      for(let fi=0;fi<free.length;fi++) {const f=free[fi]; for(let oi=0;oi<os.length;oi++) {const o=os[oi]; if(o.width>f.width+EPS||o.length>f.length+EPS||!clearance(f.x,f.y,o.width,o.length,placements,kerf)) continue;
        const lx=Math.max(0,f.width-o.width),ly=Math.max(0,f.length-o.length),score=Math.min(lx,ly)*1e6+Math.max(lx,ly);
        if(!best||score<best.score-EPS) best={x:f.x,y:f.y,width:o.width,length:o.length,rotated:o.rotated,score};
      }}
      if(!best){remainingIds.push(t.id);continue;}
      const p={id:t.id,x:best.x,y:best.y,width:best.width,length:best.length,rotated:best.rotated}; placements.push(p);
      split(free,{x:p.x,y:p.y,width:Math.min(p.width+kerf,stockRect.x+stockRect.width-p.x),length:Math.min(p.length+kerf,stockRect.y+stockRect.length-p.y)}); prune(free);
    }
    return {placements,remainingIds,diagnostics:{algorithm:'MaxRects BSSF',inputCount:tokens.length,placedCount:placements.length,remainingCount:remainingIds.length,kerf,freeRectCount:free.length}};
  }
  function toCutTree(placements, stockRect, kerf, options={}) {
    const mode=options.mode||'partFirstTree', minSupport=options.minSupport==null?null:options.minSupport, limit=Number.isFinite(options.maxVisits)?Math.max(1,Math.floor(options.maxVisits)):12000;
    if(!Array.isArray(placements)||!rectValid(stockRect)||!Number.isFinite(kerf)||kerf<=0||(minSupport!==null&&(!Number.isFinite(minSupport)||minSupport<0))) return {ok:false,tree:null,reason:'invalid dimensions/options',visits:0};
    if(!['partFirstTree','ripThenCrosscut'].includes(mode)) return {ok:false,tree:null,reason:'invalid mode',visits:0};
    const unique=new Set();for(const p of placements){if(!p||typeof p.id!=='string'||!p.id.trim()||unique.has(p.id)||!rectValid(p))return {ok:false,tree:null,reason:'invalid or duplicate placement',visits:0};unique.add(p.id);}
    const parts=placements.map(p=>({id:p.id,x:p.x,y:p.y,width:p.width,length:p.length}));
    let visits=0, exhausted=false;
    const memo=new Map(), eq=(a,b)=>Math.abs(a-b)<=EPS;
    const empty=r=>({tree:{kind:'empty',rect:{...r}},largest:r.width*r.length,
      shortSide:Math.min(r.width,r.length),kerfArea:0,cuts:0});
    const better=(a,b)=>!b || a.largest>b.largest+EPS ||
      (eq(a.largest,b.largest)&&(a.shortSide>b.shortSide+EPS ||
        (eq(a.shortSide,b.shortSide)&&(a.kerfArea<b.kerfArea-EPS ||
          (eq(a.kerfArea,b.kerfArea)&&a.cuts<b.cuts)))));
    function recurse(r, ids, phase) {
      const key=phase+'|'+ids.join(',')+'|'+[r.x,r.y,r.width,r.length].map(v=>Number(v.toFixed(7))).join(',');
      if(memo.has(key))return memo.get(key);
      if(visits>=limit){exhausted=true;return null;} visits++;
      if(ids.length===0)return empty(r);
      if(ids.length===1){const p=parts[ids[0]];if(eq(r.x,p.x)&&eq(r.y,p.y)&&eq(r.width,p.width)&&eq(r.length,p.length))return {tree:{kind:'part',rect:{...r},partId:p.id},largest:0,shortSide:0,kerfArea:0,cuts:0};}
      const choices=[],seenCuts=new Set();
      for(const id of ids){const p=parts[id];const axes=mode==='ripThenCrosscut'?(phase===0?['x','y']:['y']):['x','y'];for(const axis of axes){
        const lo=axis==='x'?r.x:r.y, hi=lo+(axis==='x'?r.width:r.length), start=axis==='x'?p.x:p.y, finish=start+(axis==='x'?p.width:p.length);
        for(const c of [start-kerf,finish]){if(c<lo-EPS||c>hi+EPS)continue;const end=c+kerf;if(end>hi+EPS)continue;
          const cutKey=axis+':'+c.toFixed(7);if(seenCuts.has(cutKey))continue;seenCuts.add(cutKey);
          const band=axis==='x'?{x:c,y:r.y,width:kerf,length:r.length}:{x:r.x,y:c,width:r.width,length:kerf};
          if(ids.some(j=>overlaps(band,parts[j])))continue;if(minSupport!==null&&r.width+EPS<minSupport)continue;
          const left=ids.filter(j=>{const q=parts[j];return axis==='x'?q.x+q.width<=c+EPS:q.y+q.length<=c+EPS;}),right=ids.filter(j=>{const q=parts[j];return axis==='x'?q.x>=end-EPS:q.y>=end-EPS;});
          if(left.length+right.length!==ids.length)continue;
          choices.push({axis,c,end,band,left,right,phase:axis==='y'?1:phase});
        }
      }}
      let best=null;
      for(const ch of choices){const a=ch.axis==='x'?{...r,width:Math.max(0,ch.c-r.x)}:{...r,length:Math.max(0,ch.c-r.y)},b=ch.axis==='x'?{x:ch.end,y:r.y,width:Math.max(0,r.x+r.width-ch.end),length:r.length}:{x:r.x,y:ch.end,width:r.width,length:Math.max(0,r.y+r.length-ch.end)};
        const validA=positive(a.width)&&positive(a.length),validB=positive(b.width)&&positive(b.length);
        const ca=validA?recurse(a,ch.left,ch.phase):null, cb=validB?recurse(b,ch.right,ch.phase):null;
        if((validA?!!ca:true)&&(validB?!!cb:true)){
          const children=[...(validA?[ca]:[]),...(validB?[cb]:[])];
          const largest=Math.max(0,...children.map(v=>v.largest));
          const shortSide=Math.max(0,...children.filter(v=>eq(v.largest,largest)).map(v=>v.shortSide));
          const candidate={tree:{kind:'cut',rect:{...r},axis:ch.axis,band:ch.band,children:children.map(v=>v.tree)},
            largest,shortSide,kerfArea:ch.band.width*ch.band.length+children.reduce((n,v)=>n+v.kerfArea,0),
            cuts:1+children.reduce((n,v)=>n+v.cuts,0)};
          if(better(candidate,best))best=candidate;
        }
        // Keep a complete feasible result found before the budget was reached.
        if(exhausted)break;
      }
      memo.set(key,best);return best;
    }
    if(parts.some(p=>!inside(stockRect,p))) return {ok:false,tree:null,reason:'placement outside stock or invalid',visits};
    for(let i=0;i<parts.length;i++)for(let j=0;j<i;j++)if(overlaps(parts[i],parts[j]))return {ok:false,tree:null,reason:'overlapping placements',visits};
    const result=recurse({...stockRect},parts.map((_,i)=>i),0);
    return result?{ok:true,tree:result.tree,reason:exhausted?'bounded search; complete feasible tree retained':'',visits,
      limited:exhausted,largestRemnantArea:result.largest}:
      {ok:false,tree:null,reason:exhausted?'visit limit exceeded':'placements are not guillotine-slicing',visits,limited:exhausted};
  }
  return {pack,toCutTree};
});
