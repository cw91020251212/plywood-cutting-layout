'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const appearance = require('../assets/part-appearance.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function readHsl(color) {
  const match = /^hsl\(([-+\d.]+) ([-+\d.]+)% ([-+\d.]+)%\)$/.exec(color);
  assert.ok(match, `expected a hue-preserving HSL stop, received ${color}`);
  return { hue: Number(match[1]), saturation: Number(match[2]), lightness: Number(match[3]) };
}

function assertSameHueGradient(stops, expectedHue) {
  const colors = stops.map(([, color]) => readHsl(color));
  assert.ok(colors.every(color => Math.abs(color.hue - expectedHue) < 1e-6), 'all stops retain the part hue');
  assert.ok(colors.every(color => color.saturation >= 50), 'stops retain vivid color instead of fading to gray');
  assert.ok(colors.every((color, index) => index === 0 || color.lightness >= colors[index - 1].lightness), 'lightness increases toward the upper-right');
  assert.ok(colors.at(0).lightness < colors.at(-1).lightness, 'the lower-left is darker than the upper-right');
  return colors;
}

test('glossy and metallic styles shade from dark lower-left to light upper-right without changing geometry', () => {
  assert.equal(appearance.defaultStyle, 'glossy');
  assert.equal(appearance.normalizeStyle('metallic'), 'metallic');
  assert.equal(appearance.normalizeStyle('unknown'), 'glossy');

  const paint = style => {
    const fills = [], gradients = [];
    let activeGradient = null;
    const ctx = {
      globalAlpha: 1,
      fillStyle: '#000',
      fillRect(...args) { fills.push({ alpha: this.globalAlpha, fillStyle: this.fillStyle, args }); },
      createLinearGradient(...args) {
        activeGradient = { args, stops: [], addColorStop(offset, color) { this.stops.push([offset, color]); } };
        gradients.push(activeGradient);
        return activeGradient;
      }
    };
    appearance.drawPart(ctx, 10, 20, 60, 100, 'hsl(210 70% 65%)', style);
    assert.equal(ctx.globalAlpha, 1, 'canvas alpha must be restored after each part');
    assert.equal(fills[0].fillStyle, 'hsl(210 70% 65%)', 'all styles must retain the assigned size color');
    assert.equal(fills[0].alpha, 0.78, 'preserve the existing translucent color fill');
    assert.deepEqual(fills[0].args, [10, 20, 60, 100], 'style must not change part geometry');
    return { fills, gradients, outline: appearance.outlineColor(style, '#245c42') };
  };

  const flat = paint('flat');
  const glossy = paint('glossy');
  const metal = paint('metallic');
  assert.equal(flat.fills.length, 1);
  assert.equal(flat.gradients.length, 0);
  assert.equal(glossy.fills.length, 2);
  assert.equal(glossy.gradients[0].stops.length, 5);
  assert.deepEqual(glossy.gradients[0].args, [10, 120, 70, 20], 'Canvas gradient runs from the lower-left corner to the upper-right corner');
  assert.deepEqual(glossy.gradients[0].stops[0], [0, 'hsl(210 70% 41%)'], 'the lower-left endpoint is a darker shade of the part color');
  assert.deepEqual(glossy.gradients[0].stops.at(-1), [1, 'hsl(210 65% 81%)'], 'the upper-right endpoint is a lighter shade of the same hue');
  assertSameHueGradient(glossy.gradients[0].stops, 210);
  assert.equal(metal.fills.length, 2);
  assert.equal(metal.gradients[0].stops.length, 10);
  assert.deepEqual(metal.gradients[0].args, [10, 120, 70, 20]);
  assert.deepEqual(metal.gradients[0].stops[0], [0, 'hsl(210 75% 33%)']);
  assert.deepEqual(metal.gradients[0].stops.at(-1), [1, 'hsl(210 60% 87%)']);
  assertSameHueGradient(metal.gradients[0].stops, 210);
  assert.notEqual(metal.outline, '#245c42', 'metallic parts use a neutral outline');
});

test('red and blue HSL, hex and RGB base colors keep their hue in every gradient stop', () => {
  for (const baseColor of ['hsl(0 72% 60%)', '#e02020', 'rgb(32,128,220)']) {
    let gradient;
    const ctx = {
      globalAlpha: 1,
      fillStyle: '',
      fillRect() {},
      createLinearGradient() {
        gradient = { stops: [], addColorStop(offset, color) { this.stops.push([offset, color]); } };
        return gradient;
      }
    };
    appearance.drawPart(ctx, 0, 0, 60, 100, baseColor, 'glossy');
    const firstHue = readHsl(gradient.stops[0][1]).hue;
    assertSameHueGradient(gradient.stops, firstHue);
  }
});

test('style selector is bilingual, defaults to 3D, and renders the current plan without recalculating it', () => {
  assert.match(html, /<script src="assets\/part-appearance\.js\?v=3"><\/script>/);
  assert.match(html, /<select id="partAppearanceStyle"/);
  assert.match(html, /<option value="glossy" selected>立體漸層<\/option>/);
  assert.match(html, /<option value="metallic">金屬光澤<\/option>/);
  assert.match(html, /<option value="flat">原色平面<\/option>/);
  assert.match(html, /\['立體漸層','3D gradient'\]/);
  assert.match(html, /\['金屬光澤','Metallic sheen'\]/);
  assert.match(html, /window\.PlywoodTrialUI\.render\(plan,label\)/);
  assert.match(html, /plywood-layout-part-appearance-v1/);
  assert.match(html, /保留各尺寸的識別色；只改排版圖外觀，不會改切割方案。/);
});

test('size legend swatches receive the selected finish as well as the part canvases', () => {
  const styles = [];
  const swatch = { style: {} };
  appearance.applySwatch(swatch, 'hsl(80 65% 70%)', 'glossy');
  styles.push({ ...swatch.style });
  appearance.applySwatch(swatch, 'hsl(80 65% 70%)', 'metallic');
  styles.push({ ...swatch.style });
  appearance.applySwatch(swatch, 'hsl(80 65% 70%)', 'flat');
  styles.push({ ...swatch.style });
  assert.ok(styles[0].backgroundImage.startsWith('linear-gradient(45deg,'), 'legend swatch follows the same lower-left to upper-right diagonal');
  assert.ok(styles[0].backgroundImage.includes('hsl(80 65% 46%)'));
  assert.ok(styles[1].backgroundImage.includes('hsl(80 70% 38%)'));
  assert.ok(styles.slice(0, 2).every(style => !style.backgroundImage.includes('rgba(')), 'color finish must not use gray/white overlays');
  assert.equal(styles[2].backgroundImage, 'none');
  assert.equal(styles[2].borderColor, '', 'flat appearance restores the stylesheet border after metallic mode');
  assert.ok(styles.every(style => style.backgroundColor === 'hsl(80 65% 70%)'));
});
