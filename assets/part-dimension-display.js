(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlywoodPartDimensionDisplay = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  const MODES = Object.freeze(['auto', 'selected', 'all']);

  function normalizeMode(value) {
    return MODES.includes(value) ? value : 'auto';
  }

  function visibleParts(parts, mode, selectedId) {
    const list = Array.isArray(parts) ? parts : [];
    const normalized = normalizeMode(mode);
    if (normalized !== 'selected') return list;
    if (selectedId == null) return [];
    return list.filter(part => part && part.id != null && String(part.id) === String(selectedId));
  }

  function hitTest(parts, x, y) {
    if (!Array.isArray(parts) || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
    const px = Number(x), py = Number(y);
    // Last-painted shapes are visually on top, so hit-test in reverse draw order.
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const part = parts[index];
      if (!part) continue;
      const left = Number(part.x), top = Number(part.y);
      const width = Number(part.width), height = Number(part.length ?? part.height);
      if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
      if (px >= left && px <= left + width && py >= top && py <= top + height) return part;
    }
    return null;
  }

  function ordinal(parts, partId) {
    if (!Array.isArray(parts) || partId == null) return 0;
    const index = parts.findIndex(part => part && part.id != null && String(part.id) === String(partId));
    return index < 0 ? 0 : index + 1;
  }

  return Object.freeze({ MODES, normalizeMode, visibleParts, hitTest, ordinal });
});
