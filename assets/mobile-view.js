(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PlywoodMobileView=api;api.install(root,root.document);}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const steps=['section-unit','section-parts','section-boards','section-results'];
  function activeStep(tops,line){
    let active=0;
    tops.forEach((top,index)=>{if(Number.isFinite(top)&&top<=line)active=index;});
    return active;
  }
  function isEditable(el){
    return !!el&&(el.isContentEditable||el.getAttribute?.('contenteditable')==='plaintext-only'||/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
  }
  function install(w,d){
    if(!d||d.getElementById('mobile-step-nav'))return;
    const sections=steps.map(id=>d.getElementById(id));
    if(sections.some(el=>!el))return;
    const nav=d.createElement('nav');nav.id='mobile-step-nav';nav.className='no-print';
    const links=sections.map((section,index)=>{
      const link=d.createElement('a');link.href='#'+section.id;
      const number=d.createElement('span');number.textContent=String(index+1).padStart(2,'0');number.setAttribute('aria-hidden','true');
      const label=d.createElement('strong');link.append(number,label);nav.appendChild(link);
      link.addEventListener('click',event=>{
        event.preventDefault();
        if(isEditable(d.activeElement))d.activeElement.blur();
        // Native links remain a no-JS fallback; focus gives screen-reader users context.
        section.setAttribute('tabindex','-1');section.focus({preventScroll:true});
        section.scrollIntoView({block:'start',behavior:'auto'});update();
      });
      return link;
    });
    d.body.appendChild(nav);
    const hints=[];
    ['partsTable','boardsTable','resultsTable'].forEach(id=>{
      const table=d.getElementById(id),wrapper=table?.closest('.table-wrapper');if(!wrapper)return;
      const hint=d.createElement('p');hint.className='mobile-table-hint';hint.id=id+'-mobile-hint';
      wrapper.before(hint);wrapper.setAttribute('tabindex','0');wrapper.setAttribute('role','region');wrapper.setAttribute('aria-describedby',hint.id);
      hints.push({hint,wrapper,id});
    });
    function language(){
      const en=w.calculator?.currentLanguage==='en';
      nav.setAttribute('aria-label',en?'Cutting layout steps':'排料步驟');
      const labels=en?['Units','Parts','Sheets','Results']:['單位','部件','板材','結果'];
      links.forEach((link,index)=>{link.querySelector('strong').textContent=labels[index];});
      hints.forEach(({hint,wrapper,id})=>{
        hint.textContent=en?'Swipe the table sideways to see all columns.':'表格可左右滑動，查看完整資料及操作。';
        wrapper.setAttribute('aria-label',labels[id==='partsTable'?1:id==='boardsTable'?2:3]+(en?' table':'清單'));
      });
    }
    let frame=0;
    function update(){
      frame=0;
      const current=activeStep(sections.map(section=>section.getBoundingClientRect().top),Math.min(180,w.innerHeight*.3));
      links.forEach((link,index)=>{if(index===current)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');});
    }
    function schedule(){if(!frame)frame=w.requestAnimationFrame(update);}
    function focus(){d.body.classList.toggle('mobile-field-active',isEditable(d.activeElement));}
    d.addEventListener('focusin',focus);d.addEventListener('focusout',()=>w.setTimeout(focus,0));
    w.addEventListener('scroll',schedule,{passive:true});w.addEventListener('resize',schedule,{passive:true});
    const title=d.getElementById('mainTitle');if(title)new w.MutationObserver(language).observe(title,{childList:true,subtree:true,characterData:true});
    language();update();focus();
  }
  return {activeStep,isEditable,install};
});
