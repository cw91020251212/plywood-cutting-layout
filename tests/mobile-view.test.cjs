'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const mobile=require('../assets/mobile-view.js');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/mobile-view.css'),'utf8');
const js=fs.readFileSync(path.join(root,'assets/mobile-view.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
test('parts and stock tables retain their original presentation',()=>{
  const touched=[];
  const table={closest:()=>{touched.push('table wrapper');throw Error('Input tables must not be modified');}};
  const document={
    getElementById:id=>['partsTable','boardsTable'].includes(id)?table:null,
    createElement:()=>{throw Error('Unexpected hint');},
    addEventListener:()=>{},body:{classList:{toggle:()=>{}}}
  };
  mobile.install({},document);
  assert.deepEqual(touched,[]);
  assert.doesNotMatch(css,/#(?:parts|boards)Table\s*\{/);
  assert.doesNotMatch(css,/#(?:parts|boards)Table\s+(?:th|td)\b/);
  assert.match(css,/button:not\(#partsTable button\):not\(#boardsTable button\)/);
  assert.match(css,/input\[type=checkbox\]:not\(#partsTable input\):not\(#boardsTable input\)/);
  assert.match(css,/input:not\(#partsTable input\):not\(#boardsTable input\)/);
  assert.match(css,/\.table-wrapper:not\(#section-parts \.table-wrapper\):not\(#section-boards \.table-wrapper\)/);
});
test('phone resources load last and are included in versioned offline cache',()=>{
  for(const file of ['mobile-view.css','mobile-view.js']){
    assert.ok(html.includes(`assets/${file}?v=2`));
    assert.ok(sw.includes(`./assets/${file}?v=2`));
  }
  assert.ok(html.indexOf('assets/mobile-view.css')>html.indexOf('wood-opacity-outline-style'));
  assert.ok(sw.includes('2026-10-25-remnant-compare-mobile-1'));
  new vm.Script(js);
});
test('four-step bottom navigation and its reserved space are removed',()=>{
  assert.doesNotMatch(js,/mobile-step-nav|createElement\('nav'\)|aria-current/);
  assert.doesNotMatch(css,/mobile-step-nav|88px|86px|65px/);
  const created=[];
  const document={getElementById:()=>null,createElement:tag=>{created.push(tag);throw Error('Unexpected element');},addEventListener:()=>{},body:{classList:{toggle:()=>{}}}};
  mobile.install({},document);
  assert.deepEqual(created,[]);
  assert.match(css,/#wood-info-bar\{bottom:0/);
});
test('keyboard avoidance handles native and existing contenteditable editors',()=>{
  assert.equal(mobile.isEditable(null),false);
  for(const tagName of ['INPUT','SELECT','TEXTAREA'])assert.equal(mobile.isEditable({tagName}),true);
  assert.equal(mobile.isEditable({tagName:'DIV',isContentEditable:true}),true);
  assert.equal(mobile.isEditable({tagName:'DIV',getAttribute:()=> 'plaintext-only'}),true);
  assert.equal(mobile.isEditable({tagName:'BUTTON'}),false);
});
test('phone sizing, safe areas, table hints, print and unrestricted zoom stay available',()=>{
  assert.match(css,/@media screen and \(max-width:767px\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/body\.mobile-field-active #wood-scroll-nav/);
  assert.match(css,/@media print\{\.mobile-table-hint/);
  assert.match(css,/body\.wood-dark-mode \.mobile-table-hint/);
  assert.doesNotMatch(css,/touch-action\s*:\s*none/);
  assert.match(html,/user-scalable=yes/);
});
