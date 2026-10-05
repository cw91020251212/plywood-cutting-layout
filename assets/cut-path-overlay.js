(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlywoodCutOverlay = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const EPS = 1e-7;
  const isFiniteNumber = value => Number.isFinite(Number(value));
  const validRect = rect => !!rect &&
    [rect.x, rect.y, rect.width, rect.length].every(isFiniteNumber) &&
    Number(rect.width) > EPS && Number(rect.length) > EPS;
  const close = (a, b) => Math.abs(Number(a) - Number(b)) <= EPS;

  function validCut(step, index, board) {
    if (!step || step.number !== index + 1 || step.boardId !== board.boardId ||
        !step.sourceMaterialId || !validRect(step.sourceRect) ||
        !validRect(step.kerfBand) || !Array.isArray(step.outputs) ||
        !step.outputs.length || !['x', 'y'].includes(step.axis) ||
        !isFiniteNumber(step.distanceFromDatum)) return false;
    const source = step.sourceRect, band = step.kerfBand;
    if (step.axis === 'x') {
      if (!close(band.y, source.y) || !close(band.length, source.length) ||
          band.x < source.x - EPS || band.x + band.width > source.x + source.width + EPS ||
          !close(step.distanceFromDatum, band.x + band.width / 2)) return false;
    } else if (!close(band.x, source.x) || !close(band.width, source.width) ||
        band.y < source.y - EPS || band.y + band.length > source.y + source.length + EPS ||
        !close(step.distanceFromDatum, band.y + band.length / 2)) return false;
    return step.outputs.every(output => output &&
      ['material', 'part', 'offcut'].includes(output.kind) &&
      !!output.materialId && validRect(output.rect));
  }

  function isVerifiedBoard(board) {
    return !!board && board.validation && board.validation.ok === true &&
      typeof board.boardId === 'string' && board.boardId.length > 0 &&
      isFiniteNumber(board.width) && Number(board.width) > EPS &&
      isFiniteNumber(board.length) && Number(board.length) > EPS &&
      Array.isArray(board.cuts) && board.cuts.every((step, index) => validCut(step, index, board));
  }

  function isVerifiedPlan(plan) {
    return !!plan && plan.status === 'candidate' &&
      plan.validation && plan.validation.ok === true &&
      Array.isArray(plan.validation.boardIssues) && plan.validation.boardIssues.length === 0 &&
      Array.isArray(plan.validation.countIssues) && plan.validation.countIssues.length === 0 &&
      Array.isArray(plan.unplaced) && plan.unplaced.length === 0 &&
      Array.isArray(plan.boards) && plan.boards.length > 0 &&
      plan.boards.every(isVerifiedBoard);
  }

  // Segments retain cuts[] order; numbering is the verified array position, never a geometric scan.
  function cutSegments(board, count, transpose) {
    if (!isVerifiedBoard(board)) return [];
    const limit = count == null ? board.cuts.length : Math.max(0, Math.min(board.cuts.length, Math.floor(Number(count) || 0)));
    const swap = transpose === true;
    return board.cuts.slice(0, limit).map((step, index) => {
      const source = step.sourceRect;
      const vertical = (step.axis === 'x') !== swap;
      const projectedSource = swap
        ? { x: source.y, y: source.x, width: source.length, length: source.width }
        : source;
      const position = Number(step.distanceFromDatum);
      return vertical
        ? { number: index + 1, boardId: step.boardId, sourceMaterialId: step.sourceMaterialId,
            cut: step, axis: 'x', x1: position, y1: projectedSource.y,
            x2: position, y2: projectedSource.y + projectedSource.length }
        : { number: index + 1, boardId: step.boardId, sourceMaterialId: step.sourceMaterialId,
            cut: step, axis: 'y', x1: projectedSource.x, y1: position,
            x2: projectedSource.x + projectedSource.width, y2: position };
    });
  }

  // Replay only material outputs. Parts, kerf bands and trim/waste outputs are never retained as remnants.
  function finalMaterialLeaves(board) {
    if (!isVerifiedBoard(board) || board.cuts.length === 0) return [];
    const firstSource = board.cuts[0].sourceMaterialId;
    const leaves = new Map([[firstSource, { x: 0, y: 0, width: Number(board.width), length: Number(board.length) }]]);
    for (const step of board.cuts) {
      if (!leaves.has(step.sourceMaterialId)) return [];
      leaves.delete(step.sourceMaterialId);
      for (const output of step.outputs) {
        if (output.kind === 'material') leaves.set(output.materialId, { ...output.rect });
      }
    }
    return [...leaves.entries()]
      .filter(([, rect]) => validRect(rect))
      .map(([materialId, rect]) => ({ materialId, boardId: board.boardId, rect: { ...rect }, area: rect.width * rect.length }));
  }

  function fitsPartSpec(remnant, spec) {
    if (!remnant || !validRect(remnant.rect || remnant) || !spec || spec.disabled === true) return false;
    const rect = remnant.rect || remnant;
    const width = Number(spec.width), length = Number(spec.length);
    if (!(Number.isFinite(width) && Number.isFinite(length) && width > EPS && length > EPS)) return false;
    const preference = spec.orientationPreference || 'auto';
    if (preference === 'fixed_horizontal') {
      const wide = Math.max(width, length), narrow = Math.min(width, length);
      return wide <= rect.width + EPS && narrow <= rect.length + EPS;
    }
    if (preference === 'fixed_vertical') {
      const narrow = Math.min(width, length), tall = Math.max(width, length);
      return narrow <= rect.width + EPS && tall <= rect.length + EPS;
    }
    return (width <= rect.width + EPS && length <= rect.length + EPS) ||
      (length <= rect.width + EPS && width <= rect.length + EPS);
  }

  function formatRemnantMeasurements(remnant, formatDimension, formatArea) {
    if (!remnant || !validRect(remnant.rect || remnant) ||
        typeof formatDimension !== 'function' || typeof formatArea !== 'function') return null;
    const rect = remnant.rect || remnant;
    return {
      length: formatDimension(rect.length),
      width: formatDimension(rect.width),
      area: formatArea(rect.width * rect.length)
    };
  }

  const COPY = {
    showPaths: ['顯示逐刀切線', 'Show cut-path overlay'],
    pathHint: [
      '藍色虛線與刀號依每板 cuts 順序；序號包含修邊刀。僅供參考，不是機械導引。',
      'Blue dashed lines and numbers follow each sheet’s cuts order, including edge-trim cuts. Reference only—not machine guidance.'
    ],
    remnantHeading: ['可保存餘料（切割樹未用材料）', 'Saveable remnants (unused cut-tree material)'],
    remnantIntro: [
      '只列切割樹最後仍未再切的 material 輸出；已排除鋸縫帶、修邊廢料與零尺寸。',
      'Only final, uncut material outputs from the cut tree are listed; kerf bands, trim waste, and zero-size pieces are excluded.'
    ],
    sourceBoard: ['來源板', 'Source sheet'],
    remnantSize: ['尺寸（長 × 闊）', 'Size (length × width)'],
    fitsCurrent: ['可容納本次輸入規格', 'Fits a part spec entered this time'],
    noCurrentFit: ['未找到幾何上可容納本次輸入部件規格的尺寸。', 'No current input part specification fits geometrically.'],
    noSpecs: ['沒有可供比對的本次輸入部件規格；只列尺寸與面積，不判斷用途。', 'No current part specifications are available to compare; dimensions and area only, no use estimate.'],
    remnantCaveat: [
      '比對只涵蓋本次輸入尺寸，不保證未來用途或安全認證；可能仍需再修邊。',
      'This only compares dimensions entered this time; it is not a future-use guarantee or safety approval. Further trimming may still be needed.'
    ],
    noRemnants: ['沒有未被後續切割使用的非成品材料輸出。', 'No non-part material outputs remain unused by later cuts.']
  };
  function copy(key, language) {
    const pair = COPY[key];
    if (!pair) return '';
    return pair[language === 'en' ? 1 : 0];
  }

  return { isVerifiedBoard, isVerifiedPlan, cutSegments, finalMaterialLeaves,
    fitsPartSpec, formatRemnantMeasurements, copy };
});
