'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'i').exec(styles);
  assert.ok(match, `expected a CSS rule scoped to ${selector}`);
  return match[1];
}

test('remnant display controls are compact, grouped in two columns, and remain accessible', () => {
  const wrapperMatches = [...html.matchAll(/<div\b(?=[^>]*\bclass="[^"]*\bremnant-display-options\b[^"]*")[^>]*>([\s\S]*?)<\/div>/gi)];
  assert.equal(wrapperMatches.length, 1, 'there is exactly one remnant display options wrapper');
  const inner = wrapperMatches[0][1];
  const labelMatches = [...inner.matchAll(/<label\b[^>]*class="[^"]*\bpart-appearance-control\b[^"]*"[^>]*>[\s\S]*?<\/label>/gi)];
  assert.equal(labelMatches.length, 2, 'wrapper contains exactly two part appearance labels');
  assert.equal(inner.replace(/<label\b[^>]*>[\s\S]*?<\/label>/gi, '').trim(), '', 'wrapper contains only the two labels and whitespace');

  assert.match(inner, /<label class="part-appearance-control" for="showRemnantDimensions"><span>餘料尺寸<\/span><input id="showRemnantDimensions" type="checkbox" checked><\/label>/);
  assert.match(inner, /<label class="part-appearance-control" for="showRemnantLabels"><span>餘料編號<\/span><input id="showRemnantLabels" type="checkbox" checked><\/label>/);
  assert.doesNotMatch(inner, /長、闊各一次|R 編號/);
  for (const id of ['showRemnantDimensions', 'showRemnantLabels']) {
    const label = labelMatches.find(match => new RegExp(`\\bfor="${id}"`).test(match[0]));
    assert.ok(label, `${id} has a wrapping label association`);
    assert.match(label[0], new RegExp(`<input\\s+id="${id}"\\s+type="checkbox"\\s+checked(?:\\s|>)`), `${id} checkbox defaults to checked`);
  }

  const wrapperRule = cssRule('.remnant-display-options');
  assert.match(wrapperRule, /(?:^|;)\s*display\s*:\s*grid\s*(?:;|$)/i);
  assert.match(wrapperRule, /(?:^|;)\s*grid-template-columns\s*:\s*repeat\(\s*2\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)\s*(?:;|$)/i);

  const checkboxRule = cssRule('.remnant-display-options input[type="checkbox"]');
  assert.match(checkboxRule, /(?:^|;)\s*width\s*:\s*20px\s*!important\s*(?:;|$)/i);
  assert.match(checkboxRule, /(?:^|;)\s*height\s*:\s*20px\s*!important\s*(?:;|$)/i);
  const labelRule = cssRule('.remnant-display-options>label.part-appearance-control');
  assert.match(labelRule, /(?:^|;)\s*min-height\s*:\s*44px\s*(?:;|$)/i);
});
