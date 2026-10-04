const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../case-backup-core.js');
const C = require('../case-notes-core.js');
const HOUR = 3600000, DAY = 86400000;
test('snapshot names use readable local time and round-trip through the parser', () => {
  const at = new Date(2026, 9, 3, 14, 22, 5).getTime();
  assert.equal(B.fileName('history', 'auto', at), 'case-history-2026-10-03_142205.json');
  assert.equal(B.fileName('history', 'manual', at), 'case-history-manual-2026-10-03_142205.json');
  assert.equal(B.fileName('history', 'safety', at, 'field-removal'), 'case-history-before-field-removal-2026-10-03_142205.json');
  assert.equal(B.fileName('settings', 'auto', at), 'customer-config-2026-10-03_142205.json');
  assert.equal(B.fileName('history', 'latest'), 'case-history.json');
  assert.equal(B.fileName('settings', 'latest'), 'customer-config.json');
  for (const [name, expected] of [
    ['case-history-2026-10-03_142205.json', { type: 'history', kind: 'auto', reason: null }],
    ['case-history-manual-2026-10-03_142205.json', { type: 'history', kind: 'manual', reason: null }],
    ['case-history-before-restore-2026-10-03_142205.json', { type: 'history', kind: 'safety', reason: 'restore' }],
    ['customer-config-2026-10-03_142205.json', { type: 'settings', kind: 'auto', reason: null }]]) {
    const info = B.parseFileName(name);
    assert.equal(info.type, expected.type); assert.equal(info.kind, expected.kind); assert.equal(info.reason, expected.reason); assert.equal(info.time, at);
  }
  assert.deepEqual(B.parseFileName('case-history.json'), { type: 'history', kind: 'latest', reason: null, time: null, legacy: false });
  assert.throws(() => B.fileName('history', 'safety', at, 'Bad Reason'));
});
test('legacy UTC file names from earlier versions are recognized so they can be cleaned up', () => {
  const info = B.parseFileName('case-history-2026-10-03T18-22-05-123Z.json');
  assert.equal(info.kind, 'auto'); assert.equal(info.legacy, true); assert.equal(info.time, Date.UTC(2026, 9, 3, 18, 22, 5, 123));
  assert.equal(B.parseFileName('customer-config-2026-10-03T18-22-05-123Z.json').type, 'settings');
  for (const name of ['notes.txt', 'case-history-backup.json', 'images', 'case-history-2026-13-45_990000.json', 'customer-config.json.bak']) assert.equal(B.parseFileName(name), null, name);
});
test('retention keeps everything recent, thins older automatic snapshots, and never touches protected files', () => {
  const now = new Date(2026, 9, 3, 12, 0, 0).getTime();
  const files = [];
  // 48 hourly snapshots: 24 within the last day must all stay, the previous day thins to one.
  for (let h = 0; h < 48; h++) files.push({ name: B.fileName('history', 'auto', now - h * HOUR - 1000), size: 1000 });
  // Daily snapshots back 100 days.
  for (let d = 2; d < 100; d++) files.push({ name: B.fileName('history', 'auto', now - d * DAY), size: 1000 });
  const protectedNames = ['case-history.json', 'customer-config.json', 'README.txt', B.fileName('history', 'manual', now - 400 * DAY), B.fileName('history', 'safety', now - 400 * DAY, 'restore')];
  protectedNames.forEach(name => files.push({ name, size: 5 }));
  const plan = B.retentionPlan(files, { now, days: 90 });
  for (const name of protectedNames) { assert.ok(plan.keep.includes(name), name); assert.ok(!plan.remove.some(f => f.name === name)); }
  const keptAuto = plan.keep.map(B.parseFileName).filter(i => i && i.kind === 'auto' && i.type === 'history');
  assert.equal(keptAuto.filter(i => now - i.time < DAY).length, 24);
  assert.equal(keptAuto.filter(i => now - i.time >= DAY && now - i.time < 2 * DAY).length, 1);
  // Two days ago shares a calendar day with the oldest hourly files, so the daily tier covers days 3..29.
  const daily = keptAuto.filter(i => now - i.time >= 2 * DAY && now - i.time < 30 * DAY).length;
  assert.equal(daily, 27);
  const weekly = keptAuto.filter(i => now - i.time >= 30 * DAY && now - i.time < 90 * DAY).length;
  assert.ok(weekly >= 8 && weekly <= 10, 'weekly tier kept ' + weekly);
  assert.equal(keptAuto.filter(i => now - i.time >= 90 * DAY).length, 0);
  assert.equal(plan.remove.length + plan.keep.length, files.length);
  assert.equal(plan.removedBytes, plan.remove.length * 1000);
});
test('retention never removes the newest snapshot, honors Never, and trims by size oldest first', () => {
  const now = Date.now();
  const old = [{ name: B.fileName('history', 'auto', now - 400 * DAY), size: 10 }];
  assert.deepEqual(B.retentionPlan(old, { now, days: 7 }).remove, []);
  assert.deepEqual(B.retentionPlan([...old, { name: B.fileName('history', 'auto', now - 401 * DAY), size: 10 }], { now, days: null }).remove, []);
  const legacy = Array.from({ length: 300 }, (_, i) => ({ name: `case-history-2026-09-${String(1 + (i % 28)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}-00-00-000Z.json`, size: 5 * 1048576 }));
  const plan = B.retentionPlan(legacy, { now: Date.UTC(2026, 9, 3, 12), days: 30 });
  assert.ok(plan.remove.length > 250, 'legacy sprawl is thinned to one per day');
  assert.ok(plan.keep.length >= 25 && plan.keep.length <= 30);
  const sized = Array.from({ length: 10 }, (_, i) => ({ name: B.fileName('history', 'auto', now - i * HOUR), size: 100 }));
  const capped = B.retentionPlan(sized, { now, days: 30, maxBytes: 350 });
  assert.equal(capped.keep.length, 3); assert.ok(capped.keep.includes(sized[0].name));
  assert.deepEqual(capped.remove.map(f => f.name).sort(), sized.slice(3).map(f => f.name).sort());
  assert.equal(B.retentionDays('never'), null); assert.equal(B.retentionDays('7'), 7); assert.equal(B.retentionDays('bogus'), 30); assert.equal(B.retentionDays(null), 30);
});
test('summary counts snapshots and bytes for the status line', () => {
  const now = Date.now();
  const files = [{ name: 'case-history.json', size: 100 }, { name: B.fileName('history', 'auto', now - HOUR), size: 1000 }, { name: B.fileName('history', 'manual', now - DAY), size: 2000 }, { name: 'case-history-2026-09-01T10-00-00-000Z.json', size: 4000 }, { name: 'customer-config.json', size: 50 }, { name: 'unrelated.txt', size: 999999 }];
  const summary = B.summarize(files, now);
  assert.equal(summary.snapshots, 3); assert.equal(summary.bytes, 7150); assert.equal(summary.legacy, 1);
  assert.ok(Math.abs(summary.latest - (now - HOUR)) < 1000);
  assert.equal(B.formatBytes(512), '1 KB'); assert.equal(B.formatBytes(38 * 1048576), '38 MB'); assert.equal(B.formatBytes(1.25 * 1048576), '1.3 MB'); assert.equal(B.formatBytes(2 * 1073741824), '2.00 GB');
});
test('screenshots move to content-addressed image files and restore byte for byte', async () => {
  const state = C.empty(); const note = C.create(state, 'shots', 1000);
  const data = 'data:image/png;base64,aGVsbG8=';
  note.images = { one: { name: 'First', data }, two: { name: 'Duplicate', data }, three: { name: 'Other', data: 'data:image/jpeg;base64,d29ybGQ=' } };
  const previous = structuredClone(state); note.notes = 'changed'; C.checkpoint(state, previous, 2000);
  C.create(state, 'later', 3000); C.move(state, 'later', 'cases', 'trash', 4000);
  state.trash[0].images = { t: { name: 'Trash', data } };
  const { state: external, files } = await B.externalizeImages(JSON.parse(C.backup(state, 5000)));
  assert.equal(files.size, 2, 'identical screenshots are stored once');
  for (const path of files.keys()) assert.ok(B.isImagePath(path), path);
  const image = external.cases.find(n => n.id === 'shots').images.one;
  assert.equal(image.data, undefined); assert.ok(image.file.startsWith('images/')); assert.ok(image.file.endsWith('.png'));
  assert.ok(external.cases.find(n => n.id === 'shots').images.three.file.endsWith('.jpg'));
  assert.equal(external.revisions.shots[0].note.images.one.file, image.file);
  assert.equal(external.trash[0].images.t.file, image.file);
  assert.ok(B.hasExternalImages(external)); assert.ok(!B.hasExternalImages(state));
  assert.deepEqual([...B.imageReferences(external)].sort(), [...files.keys()].sort());
  assert.throws(() => C.parse(JSON.stringify(external)), /Invalid screenshots/);
  const disk = new Map([...files].map(([path, url]) => [path, B.dataUrlToBytes(url)]));
  const restored = await B.inlineImages(external, async path => B.bytesToDataUrl(disk.get(path), path));
  const parsed = C.parse(JSON.stringify(restored));
  assert.deepEqual(parsed.cases.find(n => n.id === 'shots').images, note.images);
  assert.equal(parsed.trash[0].images.t.data, data);
  assert.equal(parsed.revisions.shots[0].note.images.one.data, data);
  await assert.rejects(B.inlineImages(external, async () => null), /missing from the backup folder/);
  await assert.rejects(B.inlineImages({ cases: [{ images: { x: { name: 'x', file: '../../etc/passwd' } } }] }, async () => data), /Invalid screenshot reference/);
  assert.equal(B.bytesToDataUrl(new Uint8Array(70000).fill(65), 'images/' + 'a'.repeat(64) + '.webp').slice(0, 23), 'data:image/webp;base64,');
});
