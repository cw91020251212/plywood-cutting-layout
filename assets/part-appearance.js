(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlywoodPartAppearance = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  const profiles = Object.freeze({
    flat: Object.freeze({ stops: Object.freeze([]), border: null }),
    glossy: Object.freeze({
      stops: Object.freeze([
        Object.freeze([0, 'rgba(0,0,0,.25)']),
        Object.freeze([0.28, 'rgba(0,0,0,0)']),
        Object.freeze([0.80, 'rgba(255,255,255,0)']),
        Object.freeze([0.90, 'rgba(255,255,255,.22)']),
        Object.freeze([1, 'rgba(255,255,255,.58)'])
      ]),
      border: null
    }),
    metallic: Object.freeze({
      stops: Object.freeze([
        Object.freeze([0, 'rgba(15,25,30,.40)']),
        Object.freeze([0.12, 'rgba(15,25,30,.30)']),
        Object.freeze([0.24, 'rgba(15,25,30,.20)']),
        Object.freeze([0.36, 'rgba(15,25,30,.10)']),
        Object.freeze([0.46, 'rgba(255,255,255,.04)']),
        Object.freeze([0.56, 'rgba(255,255,255,.14)']),
        Object.freeze([0.66, 'rgba(255,255,255,.24)']),
        Object.freeze([0.78, 'rgba(255,255,255,.36)']),
        Object.freeze([0.90, 'rgba(255,255,255,.54)']),
        Object.freeze([1, 'rgba(255,255,255,.72)'])
      ]),
      border: '#34434b'
    })
  });
  const DEFAULT_STYLE = 'glossy';

  function normalizeStyle(value) {
    return Object.prototype.hasOwnProperty.call(profiles, value) ? value : DEFAULT_STYLE;
  }

  function drawPart(ctx, x, y, width, height, baseColor, style) {
    const normalized = normalizeStyle(style);
    const profile = profiles[normalized];
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 1;
    if (!profile.stops.length) return;
    const gradient = ctx.createLinearGradient(x, y + height, x + width, y);
    profile.stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
  }

  function applySwatch(element, baseColor, style) {
    const normalized = normalizeStyle(style);
    const profile = profiles[normalized];
    element.style.backgroundColor = baseColor;
    element.style.backgroundImage = profile.stops.length
      ? `linear-gradient(45deg, ${profile.stops.map(([offset, color]) => `${color} ${offset * 100}%`).join(', ')})`
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
