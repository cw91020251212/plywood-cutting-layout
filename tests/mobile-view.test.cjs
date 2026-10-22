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
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
test('phone resources load last and are included in local cache',()=>{
  for(const file of ['mobile-view.css','mobile-view.js']){
    assert.ok(html.includes(`assets/${file}?v=1`));
    assert.ok(sw.includes(`./assets/${file}?v=1`));
  }
  assert.ok(html.indexOf('assets/mobile-view.css')>html.indexOf('wood-opacity-outline-style'));
  new vm.Script(fs.readFileSync(path.join(root,'assets/mobile-view.js'),'utf8'));
});
test('active navigation follows the last section above the reading line',()=>{
  assert.equal(mobile.activeStep([20,700,1400,2100],180),0);
  assert.equal(mobile.activeStep([-700,20,700,1400],180),1);
  assert.equal(mobile.activeStep([-1400,-700,20,700],180),2);
  assert.equal(mobile.activeStep([-2100,-1400,-700,20],180),3);
  assert.equal(mobile.activeStep([NaN,20,700,1400],180),1);
});
test('keyboard avoidance handles native and existing contenteditable editors',()=>{
  assert.equal(mobile.isEditable(null),false);
  for(const tagName of ['INPUT','SELECT','TEXTAREA'])assert.equal(mobile.isEditable({tagName}),true);
  assert.equal(mobile.isEditable({tagName:'DIV',isContentEditable:true}),true);
  assert.equal(mobile.isEditable({tagName:'DIV',getAttribute:()=> 'plaintext-only'}),true);
  assert.equal(mobile.isEditable({tagName:'BUTTON'}),false);
});
test('phone chrome respects safe areas, print, full-screen diagram and keyboard',()=>{
  assert.match(css,/@media screen and \(max-width:767px\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/body\.mobile-field-active #mobile-step-nav/);
  assert.match(css,/body\.portrait-display-active #mobile-step-nav/);
  assert.match(css,/@media print\{#mobile-step-nav/);
  assert.match(css,/body\.wood-dark-mode #mobile-step-nav/);
  assert.doesNotMatch(css,/touch-action\s*:\s*none/);
  assert.match(html,/user-scalable=yes/);
});
