'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const overlay = require('../assets/cut-path-overlay.js');
const comparison = require('../assets/scheme-comparison.js');
const disclaimers = /不保[證证]|[免免责責]{2}聲明|[僅仅只]供參考|仍須師傅|不構成安全|不是安全認證|不代表.{0,20}(?:安全|最優)|guarantee|disclaimer|warrant(?:y|ies)|liability|reference only|safety (?:approval|certification)|woodworker.*(?:check|verify)|practical verification/i;

test('interface sources and both translation languages contain no disclaimer wording', () => {
  const files = ['index.html', ...fs.readdirSync(path.join(root, 'assets')).filter(f => f.endsWith('.js')).map(f => `assets/${f}`)];
  for (const file of files) {
    // License and attribution comments are source notices, not interface copy.
    const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[^]*?-->/g, '');
    assert.equal(disclaimers.test(source), false, `${file} contains disclaimer wording`);
  }
});

test('updated dynamic result and support-width strings translate in both directions', () => {
  const start = html.indexOf('  const dict=[');
  const end = html.indexOf('  const unitLabelZh=', start);
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.runInNewContext(`${html.slice(start, end)};globalThis.translate=translateText;`, context);
  for (const [zh, en] of [
    ['排版已通過幾何與逐刀驗證。', 'Layout passed geometry and cut-by-cut checks.'],
    ['幾何與逐刀回放已通過程式驗證。', 'Geometry and cut-by-cut replay checks passed.'],
    ['支撐寬度未設定', 'Support width not set'],
    ['塊（不含修邊料）。', 'pieces (edge-trim offcuts excluded).'],
    ['同闊組合搜尋達到上限，部分條料已保留貪婪候選。', 'Strip search reached its limit; some strips retain greedy candidates.']
  ]) {
    assert.equal(context.translate(zh, 'en'), en);
    assert.equal(context.translate(en, 'zh'), zh);
  }
});

test('runtime comparison and cut-path copy retain factual dimensions without caveats', () => {
  const plan = {status:'candidate', validation:{ok:true}, unplaced:[], mode:'ripThenCrosscut', boards:[
    {boardId:'B1', width:1220, length:2440, cuts:[{}], validation:{ok:true, finalRemnants:[{rect:{width:200,length:300}}]}}
  ]};
  for (const english of [false, true]) {
    const result = comparison.build({trialPlan:plan}, english);
    assert.equal(disclaimers.test(result.full + result.compact), false);
    assert.match(result.full, /300 × 200 mm/);
    for (const key of ['pathHint','remnantCaveat','remnantIntro','noCurrentFit','noSpecs']) {
      assert.equal(disclaimers.test(overlay.copy(key, english ? 'en' : 'zh')), false);
    }
  }
});

test('copyright and license notices remain available', () => {
  assert.match(html, /© 2026 木材切割排版/);
  assert.match(fs.readFileSync(path.join(root, 'LICENSE'), 'utf8'), /Apache License/);
  assert.match(fs.readFileSync(path.join(root, 'licenses/WoodworkingShop-MIT.txt'), 'utf8'), /Copyright \(c\) 2026 Ryair/);
  assert.match(fs.readFileSync(path.join(root, 'assets/maxrects-candidate.js'), 'utf8'), /MIT License/);
});
