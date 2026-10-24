(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlywoodRemnantComparison = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const EPS = 1e-7;
  const positive = value => Number.isFinite(Number(value)) && Number(value) > EPS;

  function collectCandidates(app, overlay) {
    if (!app || !overlay || typeof overlay.isVerifiedPlan !== 'function' ||
        typeof overlay.finalMaterialLeaves !== 'function') return [];
    const raw = Array.isArray(app._trialCandidates) ? app._trialCandidates : [];
    const current = app.trialPlan;
    const inPool = raw.some(item => item && item.plan === current);
    const source = inPool ? raw : (current ? [{ plan: current, key: null, label: '' }] : []);
    return source.map((item, candidateIndex) => {
      const plan = item && item.plan;
      if (!overlay.isVerifiedPlan(plan)) return null;
      const remnants = [];
      plan.boards.forEach((board, boardIndex) => {
        for (const leaf of overlay.finalMaterialLeaves(board)) {
          if (!leaf || !leaf.rect || !positive(leaf.rect.width) || !positive(leaf.rect.length)) continue;
          remnants.push({
            candidateIndex,
            candidateKey: item.key == null ? null : item.key,
            boardIndex,
            boardId: board.boardId,
            materialId: leaf.materialId,
            rect: { x: Number(leaf.rect.x), y: Number(leaf.rect.y), width: Number(leaf.rect.width), length: Number(leaf.rect.length) },
            area: Number(leaf.rect.width) * Number(leaf.rect.length),
            sourceBoard: board,
            plan
          });
        }
      });
      return { candidateIndex, candidateKey: item.key == null ? null : item.key, plan, label: item.label || '', remnants };
    }).filter(Boolean);
  }

  function intersects(a, b) {
    return a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS &&
      a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
  }

  function contains(a, b) {
    return a.x <= b.x + EPS && a.y <= b.y + EPS &&
      a.x + a.w >= b.x + b.w - EPS && a.y + a.h >= b.y + b.h - EPS;
  }

  function pruneFreeRects(rectangles) {
    const keep = [];
    for (let i = 0; i < rectangles.length; i++) {
      if (!positive(rectangles[i].w) || !positive(rectangles[i].h)) continue;
      let contained = false;
      for (let j = 0; j < rectangles.length; j++) {
        if (i !== j && contains(rectangles[j], rectangles[i])) { contained = true; break; }
      }
      if (!contained) keep.push(rectangles[i]);
    }
    return keep;
  }

  function splitFreeRects(freeRects, used) {
    const output = [];
    for (const free of freeRects) {
      if (!intersects(free, used)) { output.push(free); continue; }
      if (used.x > free.x + EPS) output.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
      if (used.x + used.w < free.x + free.w - EPS) output.push({ x: used.x + used.w, y: free.y, w: free.x + free.w - used.x - used.w, h: free.h });
      if (used.y > free.y + EPS) output.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
      if (used.y + used.h < free.y + free.h - EPS) output.push({ x: free.x, y: used.y + used.h, w: free.w, h: free.y + free.h - used.y - used.h });
    }
    return pruneFreeRects(output);
  }

  function placeInBin(bin, item, gap) {
    const width = Number(item.rect.length) + gap;
    const height = Number(item.rect.width) + gap;
    let best = null;
    for (let index = 0; index < bin.free.length; index++) {
      const free = bin.free[index];
      if (width > free.w + EPS || height > free.h + EPS) continue;
      const leftoverW = free.w - width, leftoverH = free.h - height;
      const shortFit = Math.min(leftoverW, leftoverH), longFit = Math.max(leftoverW, leftoverH);
      const areaFit = free.w * free.h - width * height;
      const score = [shortFit, longFit, areaFit, free.y, free.x, index];
      if (!best || score.some((value, i) => value < best.score[i] - EPS && score.slice(0, i).every((n, j) => Math.abs(n - best.score[j]) <= EPS))) {
        best = { free, index, score };
      }
    }
    if (!best) return false;
    const occupied = { x: best.free.x, y: best.free.y, w: width, h: height };
    bin.items.push({ item, x: occupied.x, y: occupied.y, width: Number(item.rect.length), height: Number(item.rect.width) });
    bin.free = splitFreeRects(bin.free, occupied);
    return true;
  }

  function packCandidate(remnants, canvasWidth, canvasHeight, padding, gap) {
    const inner = { x: padding, y: padding, w: canvasWidth - 2 * padding, h: canvasHeight - 2 * padding };
    const sorted = remnants.slice().sort((a, b) =>
      Math.max(b.rect.length, b.rect.width) - Math.max(a.rect.length, a.rect.width) ||
      b.area - a.area || b.rect.length - a.rect.length || b.rect.width - a.rect.width ||
      a.boardIndex - b.boardIndex || String(a.materialId).localeCompare(String(b.materialId)));
    const bins = [];
    for (const item of sorted) {
      const needW = Number(item.rect.length) + gap, needH = Number(item.rect.width) + gap;
      if (!(needW <= inner.w + EPS && needH <= inner.h + EPS)) {
        throw new RangeError('真實餘板尺寸超過比較畫布；不可縮放或省略。');
      }
      let placed = false;
      for (const bin of bins) if (placeInBin(bin, item, gap)) { placed = true; break; }
      if (!placed) {
        const bin = { free: [{ ...inner }], items: [] };
        if (!placeInBin(bin, item, gap)) throw new RangeError('餘板無法放入比較畫布；不可縮放或省略。');
        bins.push(bin);
      }
    }
    return bins.map(bin => bin.items.map(entry => ({
      ...entry.item,
      display: { x: padding + entry.x, y: padding + entry.y, width: entry.width, height: entry.height }
    })));
  }

  function layout(candidates, options = {}) {
    const source = Array.isArray(candidates) ? candidates : [];
    const gap = positive(options.gap) ? Number(options.gap) : 24;
    const padding = positive(options.padding) ? Number(options.padding) : 24;
    let maxLength = 0, maxWidth = 0;
    for (const candidate of source) {
      for (const board of candidate.plan && Array.isArray(candidate.plan.boards) ? candidate.plan.boards : []) {
        if (positive(board.length)) maxLength = Math.max(maxLength, Number(board.length));
        if (positive(board.width)) maxWidth = Math.max(maxWidth, Number(board.width));
      }
      for (const item of candidate.remnants || []) {
        if (item.rect && positive(item.rect.length)) maxLength = Math.max(maxLength, Number(item.rect.length));
        if (item.rect && positive(item.rect.width)) maxWidth = Math.max(maxWidth, Number(item.rect.width));
      }
    }
    if (!maxLength || !maxWidth) return { canvasWidth: 0, canvasHeight: 0, canvasCount: 0, gap, padding, candidates: source.map(candidate => ({ ...candidate, canvases: [] })) };
    // Use a neutral two-board footprint for every candidate. Real millimetres are never individually rescaled.
    const canvasWidth = maxLength * 2 + 2 * padding + gap;
    const canvasHeight = maxWidth * 2 + 2 * padding + gap;
    const planned = source.map(candidate => ({ ...candidate, canvases: packCandidate(candidate.remnants || [], canvasWidth, canvasHeight, padding, gap) }));
    const canvasCount = planned.reduce((maximum, candidate) => Math.max(maximum, candidate.canvases.length), 0);
    for (const candidate of planned) while (candidate.canvases.length < canvasCount) candidate.canvases.push([]);
    return { canvasWidth, canvasHeight, canvasCount, gap, padding, candidates: planned };
  }

  return { collectCandidates, layout };
});
