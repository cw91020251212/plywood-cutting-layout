'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pack, profiles } = require('../assets/guillotine-candidate.js');
const stock = { x: 0, y: 0, width: 100, length: 80 };
const token = (id, width, length, rotate = false) => ({ id, width, length,
  orientations: [{ width, length, rotated: false }, ...(rotate ? [{ width: length, length: width, rotated: true }] : [])] });

function inspect(result, kerf) {
  const parts = [], empties = [], cuts = [];
  function walk(node, ancestors = []) {
    assert.ok(node.rect.width > 0 && node.rect.length > 0);
    if (node.kind === 'part') { parts.push(node); return; }
    if (node.kind === 'empty') { empties.push(node); return; }
    assert.equal(node.kind, 'cut'); cuts.push(node);
    const x = node.axis === 'x';
    assert.ok(x || node.axis === 'y');
    assert.equal(node.band[x ? 'width' : 'length'], kerf);
    assert.equal(node.band[x ? 'length' : 'width'], node.rect[x ? 'length' : 'width']);
    assert.ok(node.band.x >= node.rect.x - 1e-7 && node.band.y >= node.rect.y - 1e-7);
    assert.ok(node.band.x + node.band.width <= node.rect.x + node.rect.width + 1e-7);
    assert.ok(node.band.y + node.band.length <= node.rect.y + node.rect.length + 1e-7);
    const childArea = node.children.reduce((sum, child) => sum + child.rect.width * child.rect.length, 0);
    const bandArea = node.band.width * node.band.length;
    assert.ok(Math.abs(node.rect.width * node.rect.length - childArea - bandArea) < 1e-6, 'cut source area must equal kerf band + children');
    if (result.diagnostics.mode === 'ripThenCrosscut' && ancestors.includes('y')) assert.notEqual(node.axis, 'x', 'rip mode forbids x below y');
    for (const child of node.children) {
      if (x) {
        assert.ok(child.rect.y >= node.rect.y - 1e-7 && child.rect.y + child.rect.length <= node.rect.y + node.rect.length + 1e-7);
        assert.ok(child.rect.x >= node.rect.x - 1e-7);
      } else {
        assert.ok(child.rect.x >= node.rect.x - 1e-7 && child.rect.x + child.rect.width <= node.rect.x + node.rect.width + 1e-7);
        assert.ok(child.rect.y >= node.rect.y - 1e-7);
      }
      walk(child, [...ancestors, node.axis]);
    }
  }
  walk(result.tree);
  assert.equal(parts.length, result.placements.length);
  for (const p of result.placements) {
    const matches = parts.filter(n => n.partId === p.id);
    assert.equal(matches.length, 1, 'every placement has exactly one leaf');
    assert.deepEqual(matches[0].rect, { x: p.x, y: p.y, width: p.width, length: p.length });
  }
  return { parts, empties, cuts };
}

test('profiles preserve 18 unique combinations', () => {
  assert.equal(profiles().length, 18);
  assert.equal(new Set(profiles().map(p => `${p.order}/${p.fit}/${p.split}`)).size, 18);
});
test('each cut conserves area, full kerf span, and exact partition', () => {
  const ts = [token('a', 40, 30), token('b', 35, 30), token('c', 20, 20, true), token('d', 9, 8)];
  const r = pack(ts, stock, 2), inspected = inspect(r, 2);
  assert.equal(r.placements.length + r.remainingIds.length, ts.length);
  assert.deepEqual(inspected.parts.map(p => p.partId).sort(), r.placements.map(p => p.id).sort());
  assert.ok(Math.abs(inspected.parts.reduce((s, p) => s + p.rect.width * p.rect.length, 0) + inspected.empties.reduce((s, e) => s + e.rect.width * e.rect.length, 0) + inspected.cuts.reduce((s, c) => s + c.band.width * c.band.length, 0) - stock.width * stock.length) < 1e-6);
});
test('exact fit and listed rotation do not invent cuts', () => {
  const r = pack([token('rot', 80, 20, true)], { x: 0, y: 0, width: 20, length: 80 }, 2);
  assert.equal(r.placements[0].rotated, true); assert.equal(r.tree.kind, 'part');
});
test('a second cut exactly one kerf wide is emitted with only the part child', () => {
  const r = pack([token('a', 40, 28)], { x: 0, y: 0, width: 42, length: 30 }, 2, { profile: profiles().findIndex(p => p.split === 'x-first') });
  const n = r.tree.children[0]; assert.equal(r.tree.kind, 'cut'); assert.equal(n.kind, 'cut');
  assert.equal(n.axis, 'y'); assert.equal(n.children.length, 1); assert.equal(n.children[0].kind, 'part'); inspect(r, 2);
});
test('clearance smaller than kerf is rejected, including a second-axis delta', () => {
  const r = pack([token('bad', 40, 30)], { x: 0, y: 0, width: 41, length: 30.5 }, 2, { profile: profiles().findIndex(p => p.split === 'x-first') });
  assert.deepEqual(r.placements, []); assert.deepEqual(r.remainingIds, ['bad']);
});
test('minSupport applies to second-cut source strip', () => {
  const r = pack([token('a', 20, 30)], { x: 0, y: 0, width: 22, length: 30 }, 2, { minSupport: 30, profile: profiles().findIndex(p => p.split === 'x-first') });
  assert.equal(r.placements.length, 0);
});
test('infeasible preferred orientation/leaf does not hide a feasible alternative', () => {
  const ts = [{ id: 'choice', width: 40, length: 30, orientations: [{ width: 40, length: 30, rotated: false }, { width: 30, length: 40, rotated: true }] }];
  const r = pack(ts, { x: 0, y: 0, width: 42, length: 40 }, 2, { profile: profiles().findIndex(p => p.split === 'x-first') });
  assert.equal(r.placements.length, 1); assert.equal(r.placements[0].rotated, true); inspect(r, 2);
});
test('ripThenCrosscut prohibits x after y and accepts only full-width y-cut parts', () => {
  const full = pack([token('a', 100, 30), token('b', 100, 20)], stock, 2, { mode: 'ripThenCrosscut' });
  inspect(full, 2); assert.equal(full.placements.length, 2);
  const partial = pack([token('p', 40, 30)], stock, 2, { mode: 'ripThenCrosscut', profile: profiles().findIndex(p => p.split === 'y-first') });
  assert.equal(partial.placements.length, 1, 'fall back to a legal x-first split when y-first is forbidden'); inspect(partial, 2);
});
test('deterministic seeded layouts preserve strict tree accounting', () => {
  let seed = 349; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let n = 1; n <= 25; n++) {
    const ts = Array.from({ length: n }, (_, i) => token(`p${i}`, 3 + Math.floor(rand() * 20), 3 + Math.floor(rand() * 18), true));
    const opts = { profile: n % 18 }, a = pack(ts, stock, 1, opts), b = pack(ts, stock, 1, opts);
    assert.deepEqual(a, b); assert.equal(a.placements.length + a.remainingIds.length, n); inspect(a, 1);
  }
});
test('invalid inputs are rejected and input token order is unchanged', () => {
  const input = [token('z', 2, 2), token('a', 3, 3)], before = structuredClone(input);
  pack(input, stock, 1); assert.deepEqual(input, before);
  assert.throws(() => pack([token('x', 2, 2), token('x', 3, 3)], stock, 1));
  assert.throws(() => pack([{ ...token('x', 2, 3), orientations: [{ width: 3, length: 2, rotated: false }] }], stock, 1));
  assert.throws(() => pack([], stock, 1, { mode: 'other' }));
});

test('physical empty leaves remain available and pack a four-part grid on one sheet',()=>{
  for(const mode of ['partFirstTree','ripThenCrosscut'])for(const profile of profiles()){
    const r=pack(['a','b','c','d'].map(id=>token(id,40,30)),{x:0,y:0,width:82,length:62},2,{mode,profile});
    assert.equal(r.placements.length,4,JSON.stringify({mode,profile}));
    assert.deepEqual(r.remainingIds,[]);assert.equal(r.diagnostics.freeLeafCount,0);
    inspect(r,2);
  }
});

test('second-cut support is checked, while a legal alternative and a zero-cut part remain possible',()=>{
  const inputs=[token('narrow',20,30)],sheet={x:0,y:0,width:100,length:80};
  const rip=pack(inputs,sheet,2,{mode:'ripThenCrosscut',minSupport:30});
  assert.equal(rip.placements.length,0,'rip mode cannot cut the narrow strip safely');
  const tree=pack(inputs,sheet,2,{mode:'partFirstTree',minSupport:30});
  assert.equal(tree.placements.length,1,'a y-first tree can keep the second source 100 mm wide');
  const checked=inspect(tree,2);assert.ok(checked.cuts.every(n=>n.rect.width>=30));
  const exact=pack(inputs,{x:0,y:0,width:20,length:30},2,{minSupport:30});
  assert.equal(exact.tree.kind,'part');assert.equal(exact.placements.length,1);
});

test('rip empty material below a crosscut cannot be narrowed with a later rip',()=>{
  const result=pack([token('a',100,30),token('b',40,20)],stock,2,{mode:'ripThenCrosscut'});
  assert.equal(result.placements.length,1);assert.deepEqual(result.remainingIds,['b']);inspect(result,2);
  const general=pack([token('a',100,30),token('b',40,20)],stock,2,{mode:'partFirstTree'});
  assert.equal(general.placements.length,2);inspect(general,2);
});

test('shape and area split profiles maximize their actual individual empty rectangles rather than minimize them',()=>{
  const shapes=pack([token('a',40,30)],stock,2,{profile:profiles().find(p=>p.split==='short-side')});
  const areas=pack([token('a',40,30)],stock,2,{profile:profiles().find(p=>p.split==='area')});
  assert.equal(shapes.tree.axis,'x','58 x 80 has broader short side than 100 x 48');
  assert.equal(areas.tree.axis,'y','100 x 48 has larger single area than 58 x 80');
  inspect(shapes,2);inspect(areas,2);
});

test('nonzero stock origin and decimal kerf remain exact during multi-leaf reuse',()=>{
  const input=['a','b','c','d'].map(id=>token(id,40.25,30.5));
  const r=pack(input,{x:7.2,y:11.7,width:83.7,length:64.2},3.2,{mode:'ripThenCrosscut'});
  assert.equal(r.placements.length,4);inspect(r,3.2);
  assert.ok(r.placements.every(p=>p.x>=7.2&&p.y>=11.7));
});
