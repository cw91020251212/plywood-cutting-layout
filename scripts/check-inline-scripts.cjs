'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let count = 0;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (/\bsrc\s*=/.test(match[1]) || !match[2].trim()) continue;
  new vm.Script(match[2], {filename: `index.html#script-${++count}`});
}
for (const name of ['assets/table-saw-optimizer.js', 'assets/cut-path-overlay.js', 'sw.js']) {
  new vm.Script(fs.readFileSync(path.join(root, name), 'utf8'), {filename: name});
}
console.log(`Checked ${count} inline scripts and 3 production JavaScript assets.`);
