(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlywoodTableSaw = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const EPS = 1e-7;
  const VERSION = 'table-saw-1.0.0';
  const metricsCache = new WeakMap();

  function searchLimit() {
    const error = new RangeError('同闊組合搜尋達到上限，保留貪婪候選；不代表全局最優');
    error.code = 'STRIP_SEARCH_LIMIT';
    return error;
  }

  // 每件用一次；gross = sum(length + kerf)。末邊精確成品不用額外尾刀。
  // 保留實際小數尺寸；9 位小數只用作狀態索引，最終仍由切割樹回放驗證。
  function selectStripParts(choices, availableLength, kerf, options = {}) {
    const maxStates = options.maxStates ?? 20000;
    const maxVisits = options.maxVisits ?? 150000;
    if (!Array.isArray(choices) || !Number.isFinite(availableLength) || availableLength <= 0 ||
        !Number.isFinite(kerf) || kerf <= 0 || !Number.isInteger(maxStates) || maxStates < 1 ||
        !Number.isInteger(maxVisits) || maxVisits < 1) throw new TypeError('長條搜尋輸入無效');
    const ids = new Set();
    let width = null;
    for (const choice of choices) {
      if (!choice?.token?.id || !choice.o || !Number.isFinite(choice.o.width) || choice.o.width <= 0 ||
          !Number.isFinite(choice.o.length) || choice.o.length <= 0 || ids.has(choice.token.id)) {
        throw new TypeError('候選需有不重複 ID 及有效長闊');
      }
      ids.add(choice.token.id);
      if (width == null) width = choice.o.width;
      else if (Math.abs(width - choice.o.width) > EPS) throw new TypeError('組合搜尋只接受同闊部件');
    }
    const key = value => value.toFixed(9);
    const empty = {gross: 0, partLength: 0, count: 0, previous: null, index: -1};
    let states = new Map([[key(0), empty]]), visits = 0;
    for (let index = 0; index < choices.length; index++) {
      const choice = choices[index], next = new Map(states);
      for (const state of states.values()) {
        if (++visits > maxVisits) throw searchLimit();
        const gross = state.gross + choice.o.length + kerf;
        if (gross > availableLength + kerf + EPS) continue;
        const partLength = state.partLength + choice.o.length, count = state.count + 1;
        const stateKey = key(gross), old = next.get(stateKey);
        if (!old || partLength > old.partLength + EPS ||
            (Math.abs(partLength - old.partLength) <= EPS && count < old.count)) {
          next.set(stateKey, {gross, partLength, count, previous: state, index});
          if (next.size > maxStates) throw searchLimit();
        }
      }
      states = next;
    }
    let best = empty;
    for (const state of states.values()) {
      if (!state.count || !(state.gross <= availableLength + EPS ||
          Math.abs(state.gross - availableLength - kerf) <= EPS)) continue;
      // 比成品長度，唔會以額外鋸縫當作有價值嘅填滿。
      if (state.partLength > best.partLength + EPS ||
          (Math.abs(state.partLength - best.partLength) <= EPS && state.count < best.count)) best = state;
    }
    const indices = [];
    for (let node = best; node.previous; node = node.previous) indices.push(node.index);
    indices.reverse();
    const selected = indices.map(index => choices[index]);
    const occupiedLength = selected.length ? best.partLength + (selected.length - 1) * kerf : 0;
    const endCutRequired = selected.length > 0 && availableLength - occupiedLength > EPS;
    return {selected, partLength: best.partLength, occupiedLength, endCutRequired,
      remainingAfterEndCut: selected.length ? availableLength - occupiedLength - (endCutRequired ? kerf : 0) : availableLength,
      stateCount: states.size, visits};
  }

  function cutDatum(step) {
    const source = step?.sourceRect, band = step?.kerfBand;
    if (!source || !band || !['x', 'y'].includes(step.axis)) throw new TypeError('切割刀位資料無效');
    const axis = step.axis;
    const origin = axis === 'x' ? source.x : source.y;
    const bandStart = axis === 'x' ? band.x : band.y;
    const bandSize = axis === 'x' ? band.width : band.length;
    return {origin, globalCenter: bandStart + bandSize / 2,
      localCenter: bandStart + bandSize / 2 - origin,
      localNearEdge: bandStart - origin, localFarEdge: bandStart + bandSize - origin};
  }

  // 換向只是座標工序代理，並非實際翻板次數或鋸枱工時。
  function planMetrics(plan) {
    if (metricsCache.has(plan)) return metricsCache.get(plan);
    let cuts = 0, axisChanges = 0, cutLength = 0;
    for (const board of plan.boards || []) {
      let previousAxis = null;
      for (const step of board.cuts || []) {
        cuts++;
        cutLength += step.axis === 'x' ? step.sourceRect.length : step.sourceRect.width;
        if (step.phase === 'trim') continue;
        if (previousAxis && previousAxis !== step.axis) axisChanges++;
        previousAxis = step.axis;
      }
    }
    const metrics = {cuts, axisChanges, cutLength};
    metricsCache.set(plan, metrics);
    return metrics;
  }

  function comparePlans(a, b, objective = 'saving') {
    const ma = planMetrics(a), mb = planMetrics(b);
    const fields = objective === 'convenience'
      ? [[ma.cuts, mb.cuts], [ma.axisChanges, mb.axisChanges], [ma.cutLength, mb.cutLength],
          [a.summary.usedBoardCount, b.summary.usedBoardCount], [a.summary.boardArea, b.summary.boardArea],
          [a.summary.kerfArea, b.summary.kerfArea]]
      : [[a.summary.usedBoardCount, b.summary.usedBoardCount], [a.summary.boardArea, b.summary.boardArea],
          [a.summary.kerfArea, b.summary.kerfArea], [ma.cuts, mb.cuts],
          [ma.axisChanges, mb.axisChanges], [ma.cutLength, mb.cutLength]];
    for (const [left, right] of fields) {
      const delta = Number(left) - Number(right);
      if (Math.abs(delta) > EPS) return delta;
    }
    return 0;
  }

  return {version: VERSION, selectStripParts, cutDatum, planMetrics, comparePlans};
});
