const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/case-sync-core.js');
const B = require('../js/case-backup-core.js');
const C = require('../js/case-notes-core.js');
const { fakeDir } = require('./fixtures/fake-dir.cjs');
const HOUR = 3600000, DAY = 86400000;
const T0 = new Date(2026, 9, 5, 12, 0, 0).getTime();
const png = 'data:image/png;base64,aGVsbG8=';
function stateWith(title, image) {
  const state = C.empty(); const note = C.create(state, title, 1000);
  if (image) note.images = { one: { name: 'Shot', data: image } };
  return state;
}
const names = async root => (await S.listSnapshots(root)).map(f => f.name).sort();

test('the app creates ProSupportToolsBackup inside the chosen folder, but reuses an existing one or a legacy folder', async () => {
  const chosen = fakeDir('Documents');
  const root = await S.resolveRoot(chosen);
  assert.equal(root.name, 'ProSupportToolsBackup'); assert.ok(chosen._dirs.has('ProSupportToolsBackup'));
  assert.equal(await S.resolveRoot(fakeDir('ProSupportToolsBackup')).then(r => r.name), 'ProSupportToolsBackup');
  const legacy = fakeDir('OneDrive'); await (await legacy.getFileHandle('case-history.json', { create: true })).createWritable().then(async w => { await w.write('{}'); await w.close(); });
  assert.equal(await S.resolveRoot(legacy), legacy);
});

test('backup writes the latest files plus one automatic snapshot per hour, and screenshots once', async () => {
  const root = fakeDir(); const state = stateWith('a', png);
  const first = await S.backup(root, { state, settingsJson: '{"fieldConfig":1}', now: T0 });
  assert.equal(first.snapshot, 'case-history-2026-10-05_120000.json');
  assert.equal(first.settingsSnapshot, 'customer-config-2026-10-05_120000.json');
  const again = await S.backup(root, { state, settingsJson: '{"fieldConfig":1}', now: T0 + 10 * 60000 });
  assert.equal(again.snapshot, null, 'no second snapshot inside the hour'); assert.equal(again.settingsSnapshot, null, 'unchanged settings are not copied');
  const later = await S.backup(root, { state, settingsJson: '{"fieldConfig":2}', now: T0 + HOUR });
  assert.equal(later.snapshot, 'case-history-2026-10-05_130000.json'); assert.ok(later.settingsSnapshot);
  assert.equal(root._dirs.get('images')._files.size, 1, 'identical screenshots are stored once');
  const latest = JSON.parse(await S.loadHistoryText(root, 'case-history.json'));
  assert.equal(latest.cases[0].images.one.data, png, 'screenshots come back inline');
});

test('manual backups are written immediately and never removed by cleanup', async () => {
  const root = fakeDir(); const state = stateWith('m');
  await S.backup(root, { state, now: T0 - 400 * DAY, manual: true });
  await S.backup(root, { state, now: T0 - 300 * DAY });
  const result = await S.backup(root, { state, now: T0, retention: '7' });
  assert.ok(result.cleaned);
  const left = await names(root);
  assert.ok(left.includes(B.fileName('history', 'manual', T0 - 400 * DAY)));
  assert.ok(!left.includes(B.fileName('history', 'auto', T0 - 300 * DAY)), 'old automatic snapshot is cleaned');
  assert.ok(left.includes(B.fileName('history', 'auto', T0)));
});

test('automatic cleanup follows the retention setting and "never" keeps everything', async () => {
  const state = stateWith('r');
  for (const [retention, expectOld] of [['7', false], ['never', true]]) {
    const root = fakeDir();
    await S.backup(root, { state, now: T0 - 50 * DAY, retention: 'never' });
    await S.backup(root, { state, now: T0, retention });
    assert.equal((await names(root)).includes(B.fileName('history', 'auto', T0 - 50 * DAY)), expectOld, retention);
  }
});

test('a bad retention value falls back to the default instead of deleting or keeping everything', async () => {
  const root = fakeDir(); const state = stateWith('d');
  await S.backup(root, { state, now: T0 - 50 * DAY, retention: 'never' });
  await S.backup(root, { state, now: T0, retention: 'bogus' });
  assert.ok(!(await names(root)).includes(B.fileName('history', 'auto', T0 - 50 * DAY)), '50 days is past the 30-day default');
});

test('cleanup removes screenshots only when no remaining backup uses them', async () => {
  const root = fakeDir();
  await S.backup(root, { state: stateWith('old', png), now: T0 - 60 * DAY, retention: 'never' });
  await S.backup(root, { state: stateWith('new', 'data:image/jpeg;base64,d29ybGQ='), now: T0, retention: '30' });
  const images = [...root._dirs.get('images')._files.keys()];
  assert.equal(images.length, 1); assert.ok(images[0].endsWith('.jpg'));
});

test('deleting one snapshot removes it and its now-unused screenshots; others stay restorable', async () => {
  const root = fakeDir();
  await S.backup(root, { state: stateWith('x', png), now: T0 - 2 * HOUR, manual: true });
  await S.backup(root, { state: stateWith('y', 'data:image/jpeg;base64,d29ybGQ='), now: T0, manual: true });
  const gone = B.fileName('history', 'manual', T0 - 2 * HOUR);
  const out = await S.deleteSnapshot(root, gone);
  assert.equal(out.removed, 1);
  assert.ok(!(await names(root)).includes(gone));
  assert.equal(root._dirs.get('images')._files.size, 1, 'latest file still references the jpg only');
  const restored = JSON.parse(await S.loadHistoryText(root, B.fileName('history', 'manual', T0)));
  assert.ok(restored.cases[0].images.one.data.startsWith('data:image/jpeg'));
  await assert.rejects(S.deleteSnapshot(root, 'notes.txt'), /not a backup created by this app/);
  await assert.rejects(S.deleteSnapshot(root, '../case-history.json'), /not a backup/);
});

test('delete all removes every backup file and screenshots but leaves the user\'s own files', async () => {
  const root = fakeDir();
  await S.backup(root, { state: stateWith('z', png), settingsJson: '{"fieldConfig":1}', now: T0, manual: true });
  await (await root.getFileHandle('my-notes.txt', { create: true })).createWritable().then(async w => { await w.write('keep'); await w.close(); });
  const out = await S.deleteAll(root);
  assert.ok(out.removed >= 4 && out.images === 1);
  assert.deepEqual([...root._files.keys()], ['my-notes.txt']);
  assert.ok(!root._dirs.has('images'));
  const summary = await S.summary(root);
  assert.equal(summary.hasBackups, false);
  await S.backup(root, { state: stateWith('fresh'), now: T0 + DAY });
  assert.equal((await S.summary(root)).hasBackups, true, 'backing up again after a wipe works');
});

test('safety copies are kept by cleanup and listed with their reason', async () => {
  const root = fakeDir();
  const name = await S.safetyCopy(root, { state: stateWith('s', png), settingsJson: '{}', reason: 'restore', now: T0 - 200 * DAY });
  await S.backup(root, { state: stateWith('t'), now: T0, retention: '7' });
  const list = await S.listSnapshots(root);
  const safety = list.find(f => f.name === name);
  assert.equal(safety.kind, 'safety'); assert.equal(safety.reason, 'restore');
  await assert.rejects(S.safetyCopy(root, { state: stateWith('u'), reason: 'Bad Reason' }), /reason/);
});

test('a failed write reports the error and leaves earlier backups intact', async () => {
  const root = fakeDir();
  await S.backup(root, { state: stateWith('ok'), now: T0 });
  const before = await names(root);
  root.failWrites = true;
  await assert.rejects(S.backup(root, { state: stateWith('boom'), now: T0 + 2 * HOUR }), /disk full/);
  root.failWrites = false;
  assert.deepEqual(await names(root), before);
  assert.equal(JSON.parse(await S.loadHistoryText(root, 'case-history.json')).cases[0].id, 'ok', 'latest file is still the last good copy');
});

test('a snapshot with a missing screenshot refuses to load rather than restoring a broken case', async () => {
  const root = fakeDir();
  await S.backup(root, { state: stateWith('img', png), now: T0, manual: true });
  await root._dirs.get('images').removeEntry([...root._dirs.get('images')._files.keys()][0]);
  await assert.rejects(S.loadHistoryText(root, B.fileName('history', 'manual', T0)), /missing from the backup folder/);
});

test('summary reports totals including screenshots and the last backup time', async () => {
  const root = fakeDir();
  assert.equal((await S.summary(root)).hasBackups, false);
  await S.backup(root, { state: stateWith('sum', png), now: T0 });
  const s = await S.summary(root, T0);
  assert.equal(s.snapshots, 1); assert.ok(s.bytes > s.imageBytes && s.imageBytes > 0); assert.ok(s.lastBackup > 0);
});

test('every control the backup code looks up exists in case-notes.html, and every dialog has a title and close path', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(require.resolve('../case-notes.html'), 'utf8');
  const js = fs.readFileSync(require.resolve('../js/case-notes.js'), 'utf8');
  const block = js.slice(js.indexOf('// ---- Backup & Restore'), js.indexOf('const actionDockPreferenceKey'));
  const ids = new Set([...block.matchAll(/\$\("([A-Za-z]+)"\)/g)].map(m => m[1]));
  ids.delete('pageStatus'); ids.delete('openBackupRestore'); // the Settings menu entry is rendered by the shared top bar
  assert.match(fs.readFileSync(require.resolve('../js/site-topbar.js'), 'utf8'), /"openBackupRestore", "Backup &amp; Restore", "backup-restore"/);
  const missing = [...ids].filter(id => !new RegExp(`id="${id}"`).test(html));
  assert.deepEqual(missing, []);
  for (const dialog of ['backupRestoreMenu', 'restoreDialog', 'backupConfirmDialog']) assert.match(html, new RegExp(`<dialog id="${dialog}"[^>]*aria-labelledby=`));
  assert.match(html, /js\/case-backup-core\.js[^>]*>[\s\S]*js\/case-sync-core\.js/, 'backup core loads before the folder engine');
});

test('settings capture the retention choice, validate it, and can be wiped for a fresh start', () => {
  const Settings = require('../js/case-settings-core.js');
  const store = new Map([['dell-support.backup-retention-days', '90'], ['theme', 'dark']]);
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  assert.equal(Settings.capture(storage).retention, '90');
  const base = { fieldConfig: { customFields: {}, order: [] }, preferences: {} };
  const fields = C.fields || {};
  assert.throws(() => Settings.validate({ ...base, preferences: { retention: '5' } }, fields), /Invalid settings backup/);
  assert.equal(Settings.validate({ ...base, preferences: { retention: 'never' } }, fields).values['dell-support.backup-retention-days'], 'never');
  Settings.commit(storage, Settings.clearValues());
  assert.equal(store.size, 0, 'every preference key is cleared');
});
