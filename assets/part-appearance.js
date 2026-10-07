(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlywoodPartAppearance = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  // Values are lightness/saturation adjustments applied to each part's own base hue.
  // No black/white/gray overlays: a red part stays red and a blue part stays blue.
  const profiles = Object.freeze({
    flat: Object.freeze({ stops: Object.freeze([]), border: null }),
    glossy: Object.freeze({
      stops: Object.freeze([
        Object.freeze([0, -24, 0]),
        Object.freeze([0.28, -12, 0]),
        Object.freeze([0.80, 0, 0]),
        Object.freeze([0.90, 8, -2]),
        Object.freeze([1, 16, -5])
      ]),
      border: null
    }),
    metallic: Object.freeze({
      stops: Object.freeze([
        Object.freeze([0, -32, 5]),
        Object.freeze([0.12, -26, 4]),
        Object.freeze([0.24, -20, 3]),
        Object.freeze([0.36, -14, 2]),
        Object.freeze([0.46, -8, 1]),
        Object.freeze([0.56, -2, 0]),
        Object.freeze([0.66, 4, -1]),
        Object.freeze([0.78, 10, -3]),
        Object.freeze([0.90, 16, -6]),
        Object.freeze([1, 22, -10])
      ]),
      border: '#34434b'
    })
  });
  const DEFAULT_STYLE = 'glossy';
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const format = value => String(Number(value.toFixed(2)));

  function normalizeStyle(value) {
    return Object.prototype.hasOwnProperty.call(profiles, value) ? value : DEFAULT_STYLE;
  }

  function rgbToHsl(red, green, blue) {
    const r = red / 255, g = green / 255, b = blue / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let hue = 0, saturation = 0;
    const lightness = (max + min) / 2;
    if (delta) {
      saturation = delta / (1 - Math.abs(2 * lightness - 1));
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
    }
    return {
      hue: (hue + 360) % 360,
      saturation: saturation * 100,
      lightness: lightness * 100
    };
  }

  function parseBaseColor(color) {
    const value = String(color || '').trim();
    const hsl = /^hsla?\(\s*([-+]?(?:\d+\.?\d*|\.\d+))(?:deg)?[ ,]+([-+]?(?:\d+\.?\d*|\.\d+))%[ ,]+([-+]?(?:\d+\.?\d*|\.\d+))%(?:\s*[,/][^)]*)?\s*\)$/i.exec(value);
    if (hsl) {
      return {
        hue: ((Number(hsl[1]) % 360) + 360) % 360,
        saturation: clamp(Number(hsl[2]), 0, 100),
        lightness: clamp(Number(hsl[3]), 0, 100)
      };
    }
    const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);
    if (hex) {
      const digits = hex[1].length === 3 ? [...hex[1]].map(x => x + x).join('') : hex[1];
      return rgbToHsl(...[0, 2, 4].map(i => parseInt(digits.slice(i, i + 2), 16)));
    }
    const number = '([-+]?(?:\\d+\\.?\\d*|\\.\\d+))';
    const rgb = new RegExp(`^rgba?\\(\\s*${number}[ ,]+${number}[ ,]+${number}(?:\\s*[,/][^)]*)?\\s*\\)$`, 'i').exec(value);
    if (rgb) return rgbToHsl(...rgb.slice(1, 4).map(channel => clamp(Number(channel), 0, 255)));
    return null;
  }

  function gradientStops(baseColor, profile) {
    if (!profile.stops.length) return [];
    const base = parseBaseColor(baseColor);
    if (!base) return [];
    return profile.stops.map(([offset, lightnessDelta, saturationDelta]) => {
      const lightness = format(clamp(base.lightness + lightnessDelta, 12, 96));
      const saturation = format(clamp(base.saturation + saturationDelta, 0, 100));
      return [offset, `hsl(${format(base.hue)} ${saturation}% ${lightness}%)`];
    });
  }

  function drawPart(ctx, x, y, width, height, baseColor, style) {
    const normalized = normalizeStyle(style);
    const profile = profiles[normalized];
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 1;
    const stops = gradientStops(baseColor, profile);
    if (!stops.length) return;
    const gradient = ctx.createLinearGradient(x, y + height, x + width, y);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
  }

  function applySwatch(element, baseColor, style) {
    const normalized = normalizeStyle(style);
    const profile = profiles[normalized];
    const stops = gradientStops(baseColor, profile);
    element.style.backgroundColor = baseColor;
    element.style.backgroundImage = stops.length
      ? `linear-gradient(45deg, ${stops.map(([offset, color]) => `${color} ${offset * 100}%`).join(', ')})`
      : 'none';
    element.style.borderColor = profile.border || '';
  }

  function outlineColor(style, fallback) {
    return profiles[normalizeStyle(style)].border || fallback;
  }

  return Object.freeze({
    defaultStyle: DEFAULT_STYLE,
    normalizeStyle,
    drawPart,
    applySwatch,
    outlineColor
  });
});
