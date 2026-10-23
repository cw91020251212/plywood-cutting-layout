/*
 * Independent deterministic guillotine packer, original to this project.
 * Governed by the repository LICENSE (Apache-2.0); no OpenCutList source is
 * copied, translated, bundled or executed. This is a method-family option,
 * not an OpenCutList port or a promise of equivalent results.
 * General method reference: https://docs.opencutlist.org/features/parts/parts-list/cutting-diagrams
 * Axes: x=width, y=length. All free leaves are disjoint physical material.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlywoodGuillotine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EPS = 1e-8;
  const positive = n => Number.isFinite(n) && n > EPS;
  const validRect = r => r && Number.isFinite(r.x) && Number.isFinite(r.y) && positive(r.width) && positive(r.length);

  function profiles() {
    const orders = ['width', 'length', 'area', 'longest', 'shortest', 'perimeter'];
    const fits = ['area', 'short', 'long'];
    const splits = ['x-first', 'y-first', 'short-side', 'area'];
    return orders.flatMap((order, oi) => fits.map((fit, fi) => ({order, fit, split:splits[(oi + fi) % splits.length]})));
  }
  function compare(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > EPS) return a[i] < b[i] ? -1 : 1;
    }
    return 0;
  }
  function pack(tokens, stockRect, kerf, options = {}) {
    if (!Array.isArray(tokens) || !validRect(stockRect) || !Number.isFinite(kerf) || kerf <= 0) throw TypeError('tokens, positive stock, and kerf > 0 required');
    const mode = options.mode || 'partFirstTree';
    const all = profiles();
    const requested = typeof options.profile === 'number' ? all[options.profile] : options.profile || all[0];
    const profile = requested && all.find(p=>p.order===requested.order&&p.fit===requested.fit&&p.split===requested.split);
    if (!['partFirstTree','ripThenCrosscut'].includes(mode)) throw TypeError('invalid mode');
    if (!profile) throw TypeError('invalid profile');
    const minSupport = options.minSupport == null ? null : options.minSupport;
    if (minSupport !== null && (!Number.isFinite(minSupport) || minSupport < 0)) throw TypeError('invalid minSupport');
    const ids = new Set();
    for (const t of tokens) {
      if (!t || typeof t.id !== 'string' || !t.id.trim() || ids.has(t.id)) throw TypeError('token ids must be unique nonempty strings');
      ids.add(t.id);
      if (!positive(t.width) || !positive(t.length) || !Array.isArray(t.orientations) || !t.orientations.length) throw TypeError('invalid token/orientations');
      for (const o of t.orientations) {
        if (!o || !positive(o.width) || !positive(o.length) || typeof o.rotated !== 'boolean' ||
          (o.rotated ? Math.abs(o.width-t.length)>EPS || Math.abs(o.length-t.width)>EPS : Math.abs(o.width-t.width)>EPS || Math.abs(o.length-t.length)>EPS)) throw TypeError('invalid orientation');
      }
    }
    const value = t => ({width:t.width,length:t.length,area:t.width*t.length,longest:Math.max(t.width,t.length),shortest:Math.min(t.width,t.length),perimeter:2*(t.width+t.length)})[profile.order];
    // Input index is a locale-independent deterministic tie-break.
    const queue = tokens.map((t,i)=>({t,i})).sort((a,b)=>value(b.t)-value(a.t)||a.i-b.i);
    const root = {kind:'empty',rect:{...stockRect},phase:0};
    const leaves = [root], placements = [], remainingIds = [];
    const empty = (r,phase) => positive(r.width) && positive(r.length) ? {kind:'empty',rect:r,phase} : null;
    const supported = width => minSupport === null || width + EPS >= minSupport;

    function choices(leaf, o) {
      const r=leaf.rect, dx=r.width-o.width, dy=r.length-o.length;
      if (dx < -EPS || dy < -EPS) return [];
      const cutX=dx>EPS, cutY=dy>EPS;
      if ((cutX && dx<kerf-EPS) || (cutY && dy<kerf-EPS)) return [];
      // Zero-cut whole-material fit does not need a cutting support check.
      if (!cutX && !cutY) return [{axis:null,score:[0,0,0,0,0]}];
      if (!supported(r.width)) return [];
      if (mode==='ripThenCrosscut' && leaf.phase===1 && cutX) return [];
      const axes = cutX && cutY ? ['x','y'] : [cutX?'x':'y'];
      const out=[];
      for (const axis of axes) {
        if (mode==='ripThenCrosscut' && axis==='y' && cutX) continue;
        if (axis==='x' && cutY && !supported(o.width)) continue;
        const residuals = axis==='x'
          ? [{width:Math.max(0,dx-kerf),length:r.length},{width:o.width,length:cutY?Math.max(0,dy-kerf):0}]
          : [{width:r.width,length:Math.max(0,dy-kerf)},{width:cutX?Math.max(0,dx-kerf):0,length:o.length}];
        const physical=residuals.filter(q=>positive(q.width)&&positive(q.length));
        const broad=physical.slice().sort((a,b)=>Math.min(b.width,b.length)-Math.min(a.width,a.length)||Math.max(b.width,b.length)-Math.max(a.width,a.length))[0];
        const area=Math.max(0,...physical.map(q=>q.width*q.length));
        const fit=profile.fit==='area'?[r.width*r.length-o.width*o.length,Math.min(dx,dy),Math.max(dx,dy)]:
          profile.fit==='short'?[Math.min(dx,dy),Math.max(dx,dy),r.width*r.length-o.width*o.length]:
          [Math.max(dx,dy),Math.min(dx,dy),r.width*r.length-o.width*o.length];
        const quality=profile.split==='short-side'?[-(broad?Math.min(broad.width,broad.length):0),-(broad?Math.max(broad.width,broad.length):0)]:
          profile.split==='area'?[-area,0]:[axis===(profile.split==='x-first'?'x':'y')?0:1,0];
        out.push({axis,score:[...fit,...quality]});
      }
      return out;
    }

    function construct(leaf, token, o, axis) {
      const r=leaf.rect, dx=r.width-o.width, dy=r.length-o.length;
      const part={kind:'part',rect:{x:r.x,y:r.y,width:o.width,length:o.length},partId:token.id};
      if (axis===null) { Object.assign(leaf,part); return; }
      const afterY=mode==='ripThenCrosscut'?1:leaf.phase;
      const newEmpty=(rect,phase)=>{const n=empty(rect,phase);if(n)leaves.push(n);return n;};
      if (axis==='x') {
        let corner=part;
        if (dy>EPS) {
          const rest=newEmpty({x:r.x,y:r.y+o.length+kerf,width:o.width,length:Math.max(0,dy-kerf)},afterY);
          corner={kind:'cut',rect:{x:r.x,y:r.y,width:o.width,length:r.length},axis:'y',
            band:{x:r.x,y:r.y+o.length,width:o.width,length:kerf},children:[part,...(rest?[rest]:[])]};
        }
        const outer=newEmpty({x:r.x+o.width+kerf,y:r.y,width:Math.max(0,dx-kerf),length:r.length},leaf.phase);
        Object.assign(leaf,{kind:'cut',axis:'x',band:{x:r.x+o.width,y:r.y,width:kerf,length:r.length},children:[corner,...(outer?[outer]:[])]});
      } else {
        let corner=part;
        if (dx>EPS) {
          const rest=newEmpty({x:r.x+o.width+kerf,y:r.y,width:Math.max(0,dx-kerf),length:o.length},afterY);
          corner={kind:'cut',rect:{x:r.x,y:r.y,width:r.width,length:o.length},axis:'x',
            band:{x:r.x+o.width,y:r.y,width:kerf,length:o.length},children:[part,...(rest?[rest]:[])]};
        }
        const outer=newEmpty({x:r.x,y:r.y+o.length+kerf,width:r.width,length:Math.max(0,dy-kerf)},afterY);
        Object.assign(leaf,{kind:'cut',axis:'y',band:{x:r.x,y:r.y+o.length,width:r.width,length:kerf},children:[corner,...(outer?[outer]:[])]});
      }
    }
    for (const {t} of queue) {
      let best=null;
      for (let li=0;li<leaves.length;li++) {
        for (const o of t.orientations) {
          for (const choice of choices(leaves[li],o)) {
            if (!best || compare(choice.score,best.score)<0) best={li,leaf:leaves[li],o,...choice};
          }
        }
      }
      if (!best) {remainingIds.push(t.id);continue;}
      leaves.splice(best.li,1);
      construct(best.leaf,t,best.o,best.axis);
      placements.push({id:t.id,x:best.leaf.rect.x,y:best.leaf.rect.y,width:best.o.width,length:best.o.length,rotated:best.o.rotated});
    }
    // Phase is an internal construction constraint, never a claimed material.
    const clean=node=>node.kind==='cut'?{kind:'cut',rect:{...node.rect},axis:node.axis,band:{...node.band},children:node.children.map(clean)}:
      node.kind==='part'?{kind:'part',rect:{...node.rect},partId:node.partId}:{kind:'empty',rect:{...node.rect}};
    return {placements,remainingIds,tree:clean(root),diagnostics:{algorithm:'independent-guillotine',independent:true,
      notOpenCutListSourceOrExactReplica:true,mode,profile:{...profile},inputCount:tokens.length,placedCount:placements.length,
      remainingCount:remainingIds.length,kerf,freeLeafCount:leaves.length}};
  }
  return {pack,profiles};
});
