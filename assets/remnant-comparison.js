(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlywoodRemnantComparison = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const EPS = 1e-7;
  const positive = value => Number.isFinite(Number(value)) && Number(value) > EPS;

  function minimumSourceSheetCandidates(candidates) {
    const source = Array.isArray(candidates) ? candidates : [];
    const counts = source.map(candidate => Array.isArray(candidate && candidate.plan && candidate.plan.boards)
      ? candidate.plan.boards.length
      : null).filter(count => Number.isInteger(count) && count >= 0);
    if (!counts.length) return [];
    const minimum = Math.min(...counts);
    return source.filter(candidate => Array.isArray(candidate && candidate.plan && candidate.plan.boards) &&
      candidate.plan.boards.length === minimum);
  }

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

  function boardLength(board) {
    return Number(board && (board.length ?? board.height));
  }

  function boardWidth(board) {
    return Number(board && board.width);
  }

  function remnantBoardIndex(remnant, boards) {
    if (Number.isInteger(remnant.boardIndex) && remnant.boardIndex >= 0 && remnant.boardIndex < boards.length) {
      return remnant.boardIndex;
    }
    const sourceIndex = boards.indexOf(remnant.sourceBoard);
    if (sourceIndex >= 0) return sourceIndex;
    if (remnant.boardId != null) {
      const idIndex = boards.findIndex(board => board && board.boardId === remnant.boardId);
      if (idIndex >= 0) return idIndex;
    }
    if (boards.length === 1) return 0;
    return -1;
  }

  function contains(outer, inner) {
    return outer.x <= inner.x + EPS && outer.y <= inner.y + EPS &&
      outer.x + outer.width >= inner.x + inner.width - EPS &&
      outer.y + outer.height >= inner.y + inner.height - EPS;
  }

  function pruneFreeRects(rects) {
    const kept = [];
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      if (!positive(rect.width) || !positive(rect.height)) continue;
      let contained = false;
      for (let j = 0; j < rects.length; j++) {
        if (i === j) continue;
        if (contains(rects[j], rect) && (!contains(rect, rects[j]) || j < i)) {
          contained = true;
          break;
        }
      }
      if (!contained) kept.push(rect);
    }
    return kept;
  }

  function splitFreeRects(bin, placed) {
    const next = [];
    for (const free of bin.freeRects) {
      const intersects = placed.x < free.x + free.width - EPS &&
        placed.x + placed.width > free.x + EPS &&
        placed.y < free.y + free.height - EPS &&
        placed.y + placed.height > free.y + EPS;
      if (!intersects) {
        next.push(free);
        continue;
      }
      if (placed.x > free.x + EPS) next.push({ x: free.x, y: free.y, width: placed.x - free.x, height: free.height });
      if (placed.x + placed.width < free.x + free.width - EPS) {
        next.push({ x: placed.x + placed.width, y: free.y, width: free.x + free.width - (placed.x + placed.width), height: free.height });
      }
      if (placed.y > free.y + EPS) next.push({ x: free.x, y: free.y, width: free.width, height: placed.y - free.y });
      if (placed.y + placed.height < free.y + free.height - EPS) {
        next.push({ x: free.x, y: placed.y + placed.height, width: free.width, height: free.y + free.height - (placed.y + placed.height) });
      }
    }
    bin.freeRects = pruneFreeRects(next);
  }

  function betterPlacement(candidate, best) {
    if (!best) return true;
    for (let i = 0; i < candidate.score.length; i++) {
      if (candidate.score[i] < best.score[i] - EPS) return true;
      if (candidate.score[i] > best.score[i] + EPS) return false;
    }
    return false;
  }

  function findPlacement(bin, item, boardLength, boardWidth) {
    let best = null;
    const orientations = [{ width: item.width, height: item.height, rotated: false }];
    if (Math.abs(item.width - item.height) > EPS) {
      orientations.push({ width: item.height, height: item.width, rotated: true });
    }
    for (const free of bin.freeRects) {
      for (const orientation of orientations) {
        if (orientation.width > free.width + EPS || orientation.height > free.height + EPS) continue;
        const leftoverWidth = free.width - orientation.width;
        const leftoverHeight = free.height - orientation.height;
        const candidate = {
          x: free.x,
          y: free.y,
          ...orientation,
          score: [Math.min(leftoverWidth, leftoverHeight), Math.max(leftoverWidth, leftoverHeight), free.y, free.x]
        };
        if (betterPlacement(candidate, best)) best = candidate;
      }
    }
    return best;
  }

  // Best-short-side-fit rectangle packing: remnants retain exact dimensions and
  // a shared scale; rotation is only a display placement choice on virtual bins.
  function packRemnants(remnants, boardLength, boardWidth) {
    const ordered = remnants.map((remnant, index) => ({
      remnant,
      width: Number(remnant.rect.length),
      height: Number(remnant.rect.width),
      index
    })).sort((a, b) => (b.width * b.height) - (a.width * a.height) ||
      Math.max(b.width, b.height) - Math.max(a.width, a.height) ||
      b.height - a.height || b.width - a.width || a.index - b.index);
    const bins = [];

    for (const item of ordered) {
      const fitsBoard = (item.width <= boardLength + EPS && item.height <= boardWidth + EPS) ||
        (item.height <= boardLength + EPS && item.width <= boardWidth + EPS);
      if (!positive(item.width) || !positive(item.height) || !fitsBoard) {
        throw new RangeError('餘料尺寸超出虛擬展示板；不會縮小餘料比例。');
      }
      let targetBin = null, placement = null;
      for (const bin of bins) {
        placement = findPlacement(bin, item, boardLength, boardWidth);
        if (placement) {
          targetBin = bin;
          break;
        }
      }
      if (!targetBin) {
        targetBin = { freeRects: [{ x: 0, y: 0, width: boardLength, height: boardWidth }], remnants: [] };
        placement = findPlacement(targetBin, item, boardLength, boardWidth);
        if (!placement) throw new RangeError('餘料無法按真實尺寸放入虛擬展示板；不會縮小餘料比例。');
        bins.push(targetBin);
      }
      const { score, ...shape } = placement;
      targetBin.remnants.push({
        ...item.remnant,
        sourceBoardIndex: item.remnant.sourceBoardIndex,
        display: shape
      });
      splitFreeRects(targetBin, shape);
    }

    return bins.map((bin, displayBoardIndex) => ({
      displayBoardIndex,
      boardLength,
      boardWidth,
      remnants: bin.remnants
    }));
  }

  function portraitRect(shape, boardLength, boardWidth) {
    if (Number(boardLength) <= Number(boardWidth) + EPS) return { ...shape };
    return {
      ...shape,
      x: Number(shape.y),
      y: Number(shape.x),
      width: Number(shape.height),
      height: Number(shape.width)
    };
  }

  function layout(candidates, options = {}) {
    const source = Array.isArray(candidates) ? candidates : [];
    const gap = positive(options.gap) ? Number(options.gap) : 24;
    const padding = positive(options.padding) ? Number(options.padding) : 24;
    let maxLength = 0, maxWidth = 0;

    for (const candidate of source) {
      const boards = candidate.plan && Array.isArray(candidate.plan.boards) ? candidate.plan.boards : [];
      for (const board of boards) {
        const length = boardLength(board), width = boardWidth(board);
        if (positive(length)) maxLength = Math.max(maxLength, length);
        if (positive(width)) maxWidth = Math.max(maxWidth, width);
      }
      for (const remnant of candidate.remnants || []) {
        if (remnant.rect && positive(remnant.rect.length)) maxLength = Math.max(maxLength, Number(remnant.rect.length));
        if (remnant.rect && positive(remnant.rect.width)) maxWidth = Math.max(maxWidth, Number(remnant.rect.width));
      }
    }

    if (source.length && (!positive(maxLength) || !positive(maxWidth))) {
      throw new RangeError('原板尺寸無效；無法按真實比例繪製。');
    }
    const virtualBoardLength = maxLength;
    const virtualBoardWidth = maxWidth;
    const hasVirtualBoardDimensions = positive(virtualBoardLength) && positive(virtualBoardWidth);
    const panelWidth = hasVirtualBoardDimensions ? Math.min(virtualBoardLength, virtualBoardWidth) + 2 * padding : 0;
    const panelHeight = hasVirtualBoardDimensions ? Math.max(virtualBoardLength, virtualBoardWidth) + 2 * padding : 0;
    const planned = source.map(candidate => {
      const boards = candidate.plan && Array.isArray(candidate.plan.boards) ? candidate.plan.boards : [];
      if (boards.some(board => !positive(boardLength(board)) || !positive(boardWidth(board)))) {
        throw new RangeError('原板尺寸無效；無法按真實比例繪製。');
      }
      const remnants = (candidate.remnants || []).map((remnant, remnantIndex) => {
        const sourceBoardIndex = remnantBoardIndex(remnant, boards);
        if (sourceBoardIndex < 0) throw new RangeError('無法確認餘料所屬原板；不會遺失餘料。');
        return { ...remnant, displayId: `R${remnantIndex + 1}`, sourceBoardIndex };
      });
      const panels = packRemnants(remnants, virtualBoardLength, virtualBoardWidth);
      if (!panels.length) panels.push({ displayBoardIndex: 0, boardLength: virtualBoardLength, boardWidth: virtualBoardWidth, remnants: [] });
      return {
        ...candidate,
        remnants,
        sourceBoardCount: boards.length,
        displayBoardCount: panels.length,
        panels
      };
    });

    return {
      panelWidth,
      panelHeight,
      maxBoardLength: maxLength,
      maxBoardWidth: maxWidth,
      virtualBoardLength,
      virtualBoardWidth,
      gap,
      padding,
      candidates: planned
    };
  }

  return { collectCandidates, minimumSourceSheetCandidates, layout, packRemnants, portraitRect };
});
