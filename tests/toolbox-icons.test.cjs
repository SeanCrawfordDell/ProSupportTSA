const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const C = require('../case-notes-core.js');
const S = require('../case-settings-core.js');
const Icons = require('../case-toolbox-icons.js');
const withAppearance = extra => ({fieldConfig:C.empty().fieldConfig,toolbox:{shortcuts:[],appearance:{order:[],colors:{},...extra}}});

test('toolbox icon list has unique ids, a valid default and no inline styles blocked by the page CSP', () => {
  assert.equal(Icons.list.length, 13);
  assert.equal(new Set(Icons.ids).size, Icons.ids.length);
  assert.ok(Icons.ids.includes(Icons.defaultId));
  for (const icon of Icons.list) {
    assert.match(icon.id, /^[a-z0-9-]{1,32}$/);
    assert.match(icon.svg, /^<svg /);
    assert.doesNotMatch(icon.svg, /style=|<script|on\w+=/i);
  }
  assert.equal(Icons.defaultId, 'clip-twirl');
  assert.equal(Icons.find('missing').id, Icons.defaultId);
  assert.equal(Icons.find('clip-wave').id, 'clip-wave');
});

test('every animation class used by an icon has a stylesheet rule', () => {
  const css = fs.readFileSync(__dirname + '/../case-toolbox-links.css', 'utf8');
  const classes = new Set(Icons.list.flatMap(icon => [...icon.svg.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(' '))));
  for (const name of classes) if (name.startsWith('tbi-')) assert.ok(css.includes('.' + name + '{'), name);
});

test('settings accept launcher icon, size and animation and reject invalid values', () => {
  const ok = S.validate(withAppearance({icon:'clip-wave',size:80,animate:false,iconScale:120,circle:false}), C.fields);
  assert.match(ok.values['dell-support.toolbox-appearance.v1'], /"size":80/);
  assert.doesNotThrow(() => S.validate(withAppearance({}), C.fields));
  for (const bad of [{icon:'Bad Icon'},{icon:7},{size:20},{size:121},{size:'80'},{size:NaN},{animate:'no'},{iconScale:39},{iconScale:141},{iconScale:'90'},{circle:'off'}])
    assert.throws(() => S.validate(withAppearance(bad), C.fields), undefined, JSON.stringify(bad));
});
