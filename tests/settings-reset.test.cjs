const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = html.match(/<script id="wood-reference-tools-script">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'settings tools script exists');

class FakeStyle {
  constructor() { this.values = new Map(); this.fontSize = ''; }
  setProperty(key, value) { this.values.set(key, String(value)); if (key === 'font-size') this.fontSize = String(value); }
  getPropertyValue(key) { return key === 'font-size' ? (this.values.get(key) || this.fontSize) : (this.values.get(key) || ''); }
  getPropertyPriority() { return ''; }
  removeProperty(key) { const old = this.getPropertyValue(key); this.values.delete(key); if (key === 'font-size') this.fontSize = ''; return old; }
}
class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const next = force === undefined ? !this.values.has(value) : !!force;
    if (next) this.values.add(value); else this.values.delete(value);
    return next;
  }
}
class FakeElement {
  constructor(id = '') {
    this.id = id; this.style = new FakeStyle(); this.classList = new FakeClassList();
    this.dataset = {}; this.attributes = {}; this.listeners = {}; this.textContent = '';
    this.value = ''; this.scrollY = 0;
  }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  querySelectorAll() { return []; }
  getClientRects() { return []; }
  click(type = 'click') { for (const callback of this.listeners[type] || []) callback({ target: this, stopPropagation() {}, preventDefault() {} }); }
}

function makeHarness({ confirmResult = true } = {}) {
  const values = new Map([
    ['plywood-layout-language-v1', 'en'],
    ['wood-font-size', '22'],
    ['wood-theme', 'dark'],
    ['wood-scroll-opacity', '1'],
    ['wood-floating-opacity', '2'],
    ['wood-layout-remote-opacity', '5'],
    ['plywood-layout-project-data', '{"parts":["keep"]}']
  ]);
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  };
  const levels = [1, 2, 3, 4, 5].map(n => { const e = element(`wood-opacity-level-${n}`); e.dataset.opacityLevel = String(n); return e; });
  const targets = ['scroll', 'floating', 'layout'].map(name => { const e = element(`wood-opacity-target-${name}`); e.dataset.opacityTarget = name; return e; });
  const body = element('body');
  const documentElement = element('documentElement');
  const document = {
    body, documentElement, readyState: 'complete',
    getElementById: element,
    querySelectorAll(selector) {
      if (selector === '.wood-opacity-level') return levels;
      if (selector === '.wood-opacity-target') return targets;
      return [];
    },
    querySelector(selector) { return selector === 'head title' ? element('pageTitle') : null; },
    addEventListener() {}
  };
  const parts = [{ id: 'part-1' }], boards = [{ id: 'board-1' }], trialPlan = { id: 'preserve-result' };
  const calculator = {
    currentLanguage: 'en', parts, boards, trialPlan,
    _translatePageTo(language) { this.currentLanguage = language; }
  };
  const window = {
    document, localStorage: storage, calculator, scrollY: 0,
    confirm: () => confirmResult,
    addEventListener() {}
  };
  class MutationObserver { observe() {} }
  const context = {
    window, document, calculator, MutationObserver,
    getComputedStyle(node) { return { fontSize: node.style.fontSize || '18px', display: node.style.display || 'block' }; },
    setTimeout() { return 1; }, clearTimeout() {}
  };
  vm.runInNewContext(script, context, { filename: 'index.html#wood-reference-tools-script' });
  return { values, elements, levels, targets, body, documentElement, calculator, parts, boards, trialPlan };
}

test('restore defaults resets settings-panel preferences and keeps project data and layout', () => {
  const h = makeHarness();
  assert.equal(h.body.style.fontSize, '22px');
  assert.equal(h.body.classList.contains('wood-dark-mode'), true);
  h.elements.get('wood-settings-reset').click();

  for (const key of ['plywood-layout-language-v1', 'wood-font-size', 'wood-theme', 'wood-scroll-opacity', 'wood-floating-opacity', 'wood-layout-remote-opacity']) {
    assert.equal(h.values.has(key), false, `${key} is cleared so the default is used on the next visit`);
  }
  assert.equal(h.values.get('plywood-layout-project-data'), '{"parts":["keep"]}');
  assert.equal(h.body.style.fontSize, '');
  assert.equal(h.body.classList.contains('wood-dark-mode'), false);
  assert.equal(h.documentElement.style.getPropertyValue('--wood-scroll-opacity'), '0.56');
  assert.equal(h.documentElement.style.getPropertyValue('--wood-floating-opacity'), '0.56');
  assert.equal(h.documentElement.style.getPropertyValue('--wood-layout-remote-opacity'), '0.56');
  assert.equal(h.levels[2].attributes['aria-pressed'], 'true');
  assert.equal(h.targets[0].attributes['aria-pressed'], 'true');
  assert.equal(h.calculator.currentLanguage, 'zh');
  assert.equal(h.parts[0].id, 'part-1');
  assert.equal(h.boards[0].id, 'board-1');
  assert.equal(h.calculator.trialPlan, h.trialPlan);
  assert.match(h.elements.get('wood-settings-reset-status').textContent, /已恢復預設設定/);
});

test('canceling restore leaves existing settings unchanged', () => {
  const h = makeHarness({ confirmResult: false });
  h.elements.get('wood-settings-reset').click();
  assert.equal(h.values.get('wood-font-size'), '22');
  assert.equal(h.values.get('wood-theme'), 'dark');
  assert.equal(h.values.get('plywood-layout-language-v1'), 'en');
  assert.equal(h.body.style.fontSize, '22px');
  assert.equal(h.body.classList.contains('wood-dark-mode'), true);
  assert.equal(h.calculator.currentLanguage, 'en');
});

test('settings copy explains scope and explicitly preserves project data', () => {
  assert.match(html, /id="wood-settings-reset"[^>]*>還原預設設定<\/button>/);
  assert.match(html, /id="wood-settings-reset-note"[^>]*>重設語言、字級、主題及工具透明度；不會清除工程資料或排料結果。/);
  assert.match(script, /部件、板材、餘料和排料結果會保留/);
  assert.doesNotMatch(script, /localStorage\.clear\(/);
});
