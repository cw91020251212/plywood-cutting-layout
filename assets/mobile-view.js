(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PlywoodMobileView=api;api.install(root,root.document);}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function isEditable(el){
    return !!el&&(el.isContentEditable||el.getAttribute?.('contenteditable')==='plaintext-only'||/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
  }
  function install(w,d){
    if(!d)return;
    const hints=[];
    ['partsTable','boardsTable','resultsTable'].forEach(id=>{
      const table=d.getElementById(id),wrapper=table?.closest('.table-wrapper');if(!wrapper||d.getElementById(id+'-mobile-hint'))return;
      const hint=d.createElement('p');hint.className='mobile-table-hint';hint.id=id+'-mobile-hint';
      wrapper.before(hint);wrapper.setAttribute('tabindex','0');wrapper.setAttribute('role','region');wrapper.setAttribute('aria-describedby',hint.id);
      hints.push({hint,wrapper,id});
    });
    function language(){
      const en=w.calculator?.currentLanguage==='en';
      const labels=en?['Parts','Sheets','Results']:['部件','板材','結果'];
      hints.forEach(({hint,wrapper,id})=>{
        hint.textContent=en?'Swipe the table sideways to see all columns.':'表格可左右滑動，查看完整資料及操作。';
        wrapper.setAttribute('aria-label',labels[id==='partsTable'?0:id==='boardsTable'?1:2]+(en?' table':'清單'));
      });
    }
    function focus(){d.body.classList.toggle('mobile-field-active',isEditable(d.activeElement));}
    d.addEventListener('focusin',focus);d.addEventListener('focusout',()=>w.setTimeout(focus,0));
    const title=d.getElementById('mainTitle');if(title)new w.MutationObserver(language).observe(title,{childList:true,subtree:true,characterData:true});
    language();focus();
  }
  return {isEditable,install};
});
