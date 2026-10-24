(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlywoodRemnantStock = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const EPS = 1e-7;
  const DEFAULT_THRESHOLD = Object.freeze({ shortSide: 100, longSide: 100 });
  const STATUSES = Object.freeze(['available', 'held', 'used']);
  const positiveRect = rect => !!rect && Number.isFinite(Number(rect.width)) &&
    Number.isFinite(Number(rect.length)) && Number(rect.width) > EPS && Number(rect.length) > EPS;

  function normalizeThreshold(value) {
    const source = value && typeof value === 'object' ? value : {};
    const side = (name) => {
      const raw = source[name] == null ? DEFAULT_THRESHOLD[name] : source[name];
      if (raw === '') {
        const error = new RangeError(`${name} 門檻不可留空；如不設下限請輸入 0 mm`);
        error.field = name;
        throw error;
      }
      const number = Number(raw);
      if (!Number.isFinite(number) || number < 0 || number > 50000) {
        const error = new RangeError(`${name} 門檻須為 0 至 50000 mm`);
        error.field = name;
        throw error;
      }
      return number;
    };
    const shortSide = side('shortSide'), longSide = side('longSide');
    return { shortSide, longSide, active: shortSide > 0 || longSide > 0 };
  }

  function qualifies(rect, threshold) {
    if (!positiveRect(rect)) return false;
    const t = normalizeThreshold(threshold);
    const short = Math.min(Number(rect.width), Number(rect.length));
    const long = Math.max(Number(rect.width), Number(rect.length));
    return short + EPS >= t.shortSide && long + EPS >= t.longSide;
  }

  function qualifyingFinalLeaves(plan, options = {}) {
    const overlay = options.overlay;
    const verifyBoard = options.verifyBoard;
    const threshold = normalizeThreshold(options.threshold);
    if (!overlay || typeof overlay.isVerifiedPlan !== 'function' ||
        !overlay.isVerifiedPlan(plan) || typeof overlay.finalMaterialLeaves !== 'function') return [];
    if (typeof verifyBoard === 'function' && !plan.boards.every(board => {
      const result = verifyBoard(board, plan.kerf);
      return !!result && result.ok === true;
    })) return [];
    const output = [];
    plan.boards.forEach((board, boardIndex) => {
      for (const leaf of overlay.finalMaterialLeaves(board)) {
        if (qualifies(leaf.rect, threshold)) output.push({ ...leaf, boardIndex });
      }
    });
    return output;
  }

  function qualifyingMetricsFromFinalRemnants(boards, threshold, complete = true) {
    const t = normalizeThreshold(threshold);
    const empty = { largestArea: 0, largestShortSide: 0, count: 0 };
    if (!complete || !Array.isArray(boards)) return empty;
    let largestArea = 0, largestShortSide = 0, count = 0;
    for (const board of boards) {
      if (!board || !board.validation || board.validation.ok !== true ||
          !Array.isArray(board.validation.finalRemnants)) return empty;
      for (const remnant of board.validation.finalRemnants) {
        if (!remnant || !positiveRect(remnant.rect)) return empty;
        if (!qualifies(remnant.rect, t)) continue;
        const width = Number(remnant.rect.width), length = Number(remnant.rect.length);
        const area = width * length, shortSide = Math.min(width, length);
        count++;
        if (area > largestArea + EPS || (Math.abs(area - largestArea) <= EPS && shortSide > largestShortSide)) {
          largestArea = area;
          largestShortSide = shortSide;
        }
      }
    }
    return { largestArea, largestShortSide, count };
  }

  function savedRemnantBoardCount(plan) {
    return Array.isArray(plan && plan.boards)
      ? plan.boards.filter(board => board && board.reusableRemnant === true && board.added !== true).length
      : 0;
  }

  function stockIdNumber(value) {
    const match = String(value || '').trim().match(/^R-?(\d+)$/i);
    if (!match) return null;
    const number = Number(match[1]);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }

  function formatStockId(number) {
    return `R-${String(number).padStart(4, '0')}`;
  }

  function allocateUniqueIds(items, nextId, include) {
    const used = new Set(), pending = [], changes = [];
    for (const item of items) {
      if (!item || !include(item)) continue;
      const previous = typeof item.reusableRemnantId === 'string' ? item.reusableRemnantId : '';
      const number = stockIdNumber(previous), canonical = number == null ? null : formatStockId(number);
      if (canonical && !used.has(canonical)) {
        item.reusableRemnantId = canonical;
        used.add(canonical);
        if (previous !== canonical) changes.push({ previous, current: canonical });
      } else pending.push({ item, previous });
    }
    const largest = [...used].reduce((max, id) => Math.max(max, stockIdNumber(id) || 0), 0);
    let serial = Math.max(largest + 1, Number.isSafeInteger(Number(nextId)) && Number(nextId) > 0 ? Number(nextId) : 1);
    for (const entry of pending) {
      while (used.has(formatStockId(serial))) serial++;
      const current = formatStockId(serial++);
      entry.item.reusableRemnantId = current;
      used.add(current);
      changes.push({ previous: entry.previous, current });
    }
    return { nextId: serial, changes };
  }

  function ensureRemnantIds(boards, nextId = 1) {
    const stock = Array.isArray(boards) ? boards : [];
    const normalized = allocateUniqueIds(stock, nextId, board => board.reusableRemnant === true);
    return { boards: stock, nextId: normalized.nextId, changes: normalized.changes };
  }

  function allocateRemnantIds(boards, count, nextId = 1) {
    const normalized = ensureRemnantIds(boards, nextId);
    const amount = Math.max(0, Math.floor(Number(count) || 0));
    const ids = [];
    let serial = normalized.nextId;
    for (let index = 0; index < amount; index++) ids.push(formatStockId(serial++));
    return { ids, nextId: serial };
  }

  function normalizeStockRecords(records, nextId = 1) {
    const valid = [], rejected = [];
    for (const raw of Array.isArray(records) ? records : []) {
      if (!raw || !positiveRect(raw)) { rejected.push(raw); continue; }
      const record = {
        id: typeof raw.id === 'string' ? raw.id : (typeof raw.reusableRemnantId === 'string' ? raw.reusableRemnantId : ''),
        reusableRemnantId: typeof raw.id === 'string' ? raw.id : (typeof raw.reusableRemnantId === 'string' ? raw.reusableRemnantId : ''),
        width: Number(raw.width), length: Number(raw.length),
        status: STATUSES.includes(raw.status) ? raw.status : 'available',
        sourceKey: typeof raw.sourceKey === 'string' ? raw.sourceKey : '',
        sourceScheme: typeof raw.sourceScheme === 'string' ? raw.sourceScheme : '',
        sourceBoardId: typeof raw.sourceBoardId === 'string' ? raw.sourceBoardId : '',
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : ''
      };
      valid.push(record);
    }
    const normalized = ensureStockRecordIds(valid, nextId);
    return { records: valid, nextId: normalized.nextId, changes: normalized.changes, rejected };
  }

  function ensureStockRecordIds(records, nextId = 1) {
    const stock = Array.isArray(records) ? records : [];
    const normalized = allocateUniqueIds(stock, nextId, () => true);
    for (const record of stock) record.id = record.reusableRemnantId;
    return { records: stock, nextId: normalized.nextId, changes: normalized.changes };
  }

  function allocateStockIds(records, count, nextId = 1) {
    const normalized = ensureStockRecordIds(records, nextId);
    const amount = Math.max(0, Math.floor(Number(count) || 0));
    const ids = [];
    let serial = normalized.nextId;
    for (let index = 0; index < amount; index++) ids.push(formatStockId(serial++));
    return { ids, nextId: serial };
  }

  function normalizeStatus(value) {
    return STATUSES.includes(value) ? value : 'available';
  }

  return { version: 'reusable-remnant-stock-3.0.0', DEFAULT_THRESHOLD, STATUSES,
    normalizeThreshold, qualifies, qualifyingFinalLeaves,
    qualifyingMetricsFromFinalRemnants, savedRemnantBoardCount,
    ensureRemnantIds, allocateRemnantIds, normalizeStockRecords,
    ensureStockRecordIds, allocateStockIds, normalizeStatus, stockIdNumber, formatStockId };
});
