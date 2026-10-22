/* Read-only scheme explanations. Never score reusable material from leftover area. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PlywoodSchemeComparison=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const EPS=1e-6;
  const positive=n=>Number.isFinite(n)&&n>0;
  const fmt=n=>Number(n.toFixed(2)).toLocaleString('en-US',{maximumFractionDigits:2});
  function metrics(plan){
    if(!plan||plan.status!=='candidate'||!plan.validation||plan.validation.ok!==true||
      !Array.isArray(plan.unplaced)||plan.unplaced.length||!Array.isArray(plan.boards)||!plan.boards.length)return null;
    const remnants=[];
    let cuts=0,boardArea=0;
    for(const b of plan.boards){
      if(!b.validation||b.validation.ok!==true||!Array.isArray(b.validation.finalRemnants)||
        !Array.isArray(b.cuts)||!positive(b.width)||!positive(b.length))return null;
      cuts+=b.cuts.length;boardArea+=b.width*b.length;
      // Only physical terminal material from full cut replay; never b.offcuts or summary.wasteArea.
      for(const r of b.validation.finalRemnants){
        if(!r.rect||!positive(r.rect.width)||!positive(r.rect.length))return null;
        remnants.push({boardId:b.boardId,width:r.rect.width,length:r.rect.length,
          short:Math.min(r.rect.width,r.rect.length),long:Math.max(r.rect.width,r.rect.length),
          area:r.rect.width*r.rect.length});
      }
    }
    remnants.sort((a,b)=>b.area-a.area||b.short-a.short);
    const widest=remnants.slice().sort((a,b)=>b.short-a.short||b.long-a.long)[0]||null;
    return {boards:plan.boards.length,cuts,boardArea,remnants,largest:remnants[0]||null,widest};
  }
  function build(app,english=false){
    const t=(zh,en)=>english?en:zh,current=app&&app.trialPlan,m=metrics(current);
    if(!m)return null;
    const raw=Array.isArray(app._trialCandidates)?app._trialCandidates:[];
    // A detached/rotated plan must not be compared with a previous candidate pool.
    const inPool=raw.some(item=>item.plan===current);
    const items=(inPool?raw:[{plan:current,label:app._trialCandidateLabel}]).map((item,i)=>
      ({...item,number:i+1,m:metrics(item.plan)})).filter(item=>item.m);
    const selected=items.find(item=>item.plan===current);
    const name=item=>t(`方案 ${item.number}`,`Scheme ${item.number}`);
    const dims=r=>`${fmt(r.length)} × ${fmt(r.width)} mm`;
    const shape=r=>`${dims(r)}${t('（短邊 ',' (short side ')}${fmt(r.short)} mm${t('）',')')}`;
    const ids=list=>list.map(name).join(t('、',', '));
    const minBoards=Math.min(...items.map(x=>x.m.boards));
    const minArea=Math.min(...items.map(x=>x.m.boardArea));
    const minCuts=Math.min(...items.map(x=>x.m.cuts));
    const maxShort=Math.max(...items.map(x=>x.m.widest?x.m.widest.short:0));
    const leastBoards=items.filter(x=>x.m.boards===minBoards);
    const leastArea=items.filter(x=>Math.abs(x.m.boardArea-minArea)<EPS);
    const fewestCuts=items.filter(x=>x.m.cuts===minCuts);
    const broadest=items.filter(x=>x.m.widest&&Math.abs(x.m.widest.short-maxShort)<EPS);
    const allEqual=leastBoards.length===items.length&&leastArea.length===items.length&&fewestCuts.length===items.length&&
      items.every(x=>JSON.stringify(x.m.remnants.map(r=>[r.short,r.long]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]))===
        JSON.stringify(m.remnants.map(r=>[r.short,r.long]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])));
    const tags=item=>{
      const labels=[];
      const tied=(label,list)=>label+(list.length>1?t('（並列）',' (tied)'):'');
      if(items.length>1){
        if(item.m.boards===minBoards&&leastBoards.length<items.length)labels.push(tied(t('用板最少','Fewest sheets'),leastBoards));
        if(Math.abs(item.m.boardArea-minArea)<EPS&&leastArea.length<items.length)labels.push(tied(t('開料原板總面積最少','Least stock area used'),leastArea));
        if(item.m.cuts===minCuts&&fewestCuts.length<items.length)labels.push(tied(t('切刀最少','Fewest cuts'),fewestCuts));
        if(item.m.widest&&Math.abs(item.m.widest.short-maxShort)<EPS&&broadest.length<items.length)labels.push(tied(t('完整餘板短邊最闊','Widest remnant short side'),broadest));
      }
      return labels.join(t('；','; '));
    };
    let comparison;
    if(items.length===1)comparison=t('目前只有一個通過驗證的方案，未能比較。','Only one validated scheme is available; no comparison yet.');
    else if(allEqual)comparison=t('用板、刀數及完整餘板尺寸相同，這些指標未分高下；可核對排位、來源板及刀序。','Sheet usage, cut count and remnant sizes match, so these metrics do not distinguish a winner; review placement, stock source and cut sequence.');
    else{
      const differences=[];
      if(leastBoards.length===items.length&&leastArea.length===items.length&&fewestCuts.length===items.length)
        differences.push(t('各方案用板／刀數相同，餘板尺寸不同','Sheet usage/cuts match; remnant sizes differ'));
      if(tags(selected))differences.push(tags(selected));
      if(m.boards>minBoards)differences.push(t(`比最少用板多 ${m.boards-minBoards} 塊`,`${m.boards-minBoards} more sheets than the minimum`));
      if(m.cuts>minCuts)differences.push(t(`比最少刀數多 ${m.cuts-minCuts} 刀`,`${m.cuts-minCuts} more cuts than the minimum`));
      if(broadest.length&&(!m.widest||m.widest.short<maxShort-EPS))
        differences.push(t(`${name(broadest[0])} 留板短邊較闊（${fmt(maxShort)} mm）`,`${name(broadest[0])} has a wider remnant short side (${fmt(maxShort)} mm)`));
      comparison=differences.join(t('；','; '))||t('餘板形狀及用板各有取捨，點按看比較。','Remnant shape and sheet usage involve trade-offs; tap to compare.');
    }
    const compact=`${name(selected)}/${inPool?raw.length:1} ｜ ${t(`${m.boards} 塊板・${m.cuts} 刀`,`${m.boards} sheets · ${m.cuts} cuts`)} ｜ `+
      (m.largest?t('最大完整餘板：','Largest intact remnant: ')+shape(m.largest):t('沒有完整餘板','No intact remnants'))+
      ' ｜ '+comparison+' ｜ '+t('點按看所有方案及省料取捨','Tap for all schemes and material trade-offs');
    const lines=[t('方案比較（只計完整通過幾何及逐刀驗證的候選）','Scheme comparison (complete, geometry- and cut-replay-validated candidates only)'),
      t(`目前：${name(selected)}；可比較 ${items.length} 個已驗證方案。`,`Current: ${name(selected)}; ${items.length} validated schemes available.`),comparison];
    if(items.length>1){
      const winners=(list)=>list.length===items.length?t('全部相同','All tied'):ids(list);
      lines.push(t(`用板最少：${winners(leastBoards)}（${minBoards} 塊）；開料原板總面積最少：${winners(leastArea)}（${fmt(minArea/1e6)} m²）。`,
        `Fewest sheets: ${winners(leastBoards)} (${minBoards}); least stock area used: ${winners(leastArea)} (${fmt(minArea/1e6)} m²).`));
      lines.push(t(`切刀最少：${winners(fewestCuts)}（${minCuts} 刀）；只比較刀數，不等同最快或最安全。`,
        `Fewest cuts: ${winners(fewestCuts)} (${minCuts}); cut count alone does not establish speed or safety.`));
      if(broadest.length)lines.push(t(`完整餘板短邊最闊：${winners(broadest)}（${fmt(maxShort)} mm）；請同時核對長邊及下次所需尺寸。`,
        `Widest intact-remnant short side: ${winners(broadest)} (${fmt(maxShort)} mm); also check its long side against the next job.`));
    }
    lines.push(t('如何看省料：少開原板與保留可重用的大塊餘板是兩回事；不同原板尺寸須同時看開料總面積。狹長條、碎料不當作省料，不能只憑剩餘面積、利用率或餘料塊數判定。未提供下次所需尺寸，暫不宣稱哪個方案「最省料」或餘板一定可用。',
      'Material saving: using less stock and retaining useful intact boards are different goals; compare stock area as well when sheet sizes differ. Narrow strips and fragments are not material savings. Leftover area, yield or remnant count alone cannot decide. Without dimensions for the next job, no scheme is declared “most material-saving” and reuse is not guaranteed.'));
    for(const item of items){
      const v=item.m,rem=v.remnants;
      const process=item.plan.mode==='ripThenCrosscut'?t('先分條再截件','Rip then crosscut'):t('按成品安排','Part-first cutting tree');
      const source=item.plan.boards.some(b=>b.packingSource==='maxrects-bssf')?'MaxRects BSSF':t('原有排版算法','Original layout algorithm');
      lines.push(`${name(item)}${item===selected?t('（目前）',' (current)'):''} — ${process} · ${source}\n`+
        t(`用板 ${v.boards} 塊；開料總面積 ${fmt(v.boardArea/1e6)} m²；${v.cuts} 刀。`,
          `${v.boards} sheets; ${fmt(v.boardArea/1e6)} m² stock area used; ${v.cuts} cuts.`)+
        (tags(item)?'\n'+tags(item):'')+'\n'+
        (rem.length?t('完整餘板（按單塊面積列出，非可用性排名）：','Intact remnants (listed by individual area, not usefulness): ')+
          rem.slice(0,3).map(r=>`${shape(r)}${t('，來源板 ', ', sheet ')}${r.boardId}`).join(t('；','; '))+
          (rem.length>3?t(`；另有 ${rem.length-3} 塊，見逐刀詳情。`,`; ${rem.length-3} more; see cut details.`):''):
          t('沒有完整餘板。','No intact remnants.'))+
        (v.widest&&v.widest!==v.largest?'\n'+t('另有短邊更闊的完整餘板：','Another intact remnant has a wider short side: ')+shape(v.widest)+t('，來源板 ', ', sheet ')+v.widest.boardId:''));
    }
    lines.push(t('以上只用切序完成後的獨立矩形餘板；排除修邊廢料及鋸縫，不拼接相鄰碎料。只比較目前找到的方案，不保證全局最優；實際用途、機台及夾持安全仍須師傅核對。',
      'Only separate rectangular remnants after completed cut replay are included; trim waste and kerf are excluded, and adjacent scraps are not merged. This compares found candidates, not a global optimum. A person must check reuse, machine and clamping safety.'));
    return {compact,full:lines.join('\n\n')};
  }
  return {metrics,build};
});
