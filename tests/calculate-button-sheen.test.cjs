'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('primary calculate button has a slow, periodic left-to-right sheen', () => {
  const sheen = html.match(/#calculateButton::before\{([^}]+)\}/)?.[1];
  assert.ok(sheen, 'the calculate button needs a dedicated sheen overlay');
  assert.match(sheen, /pointer-events:none/, 'the sheen must not intercept taps or clicks');
  assert.match(sheen, /width:28%/, 'the reflection should remain a narrow highlight, not wash out the button');
  assert.match(sheen, /rgba\(255,255,255,\.54\)/, 'the reflection should be a soft highlight');

  const content = html.match(/#calculateButton \.calculate-content\{([^}]+)\}/)?.[1];
  assert.ok(content);
  assert.match(content, /z-index:3/, 'the label and icon stay above the reflection');

  const activeRule = html.match(/#calculateButton:not\(:disabled\)::before\{([^}]+)\}/)?.[1];
  assert.ok(activeRule);
  assert.match(activeRule, /calculateButtonSheen 10s ease-in-out infinite/, 'the sheen should be intermittent, not constant');
  const keyframesStart = html.indexOf('@keyframes calculateButtonSheen{');
  const keyframesEnd = html.indexOf('\n#calculateButton:disabled::before', keyframesStart);
  const keyframes = keyframesEnd > keyframesStart ? html.slice(keyframesStart, keyframesEnd) : '';
  assert.ok(keyframes);
  assert.match(keyframes, /translateX\(-180%\)/);
  assert.match(keyframes, /translateX\(470%\)/, 'the reflection sweeps from the left across to the right');
  assert.match(keyframes, /27%\{opacity:0\}/, 'the sheen fades out and remains absent for most of each cycle');
});

test('calculate button sheen stops when disabled or when reduced motion is preferred', () => {
  assert.match(html, /#calculateButton:disabled::before\{animation:none;opacity:0\}/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)\{#calculateButton::before\{animation:none!important;opacity:0!important\}\}/);
});
