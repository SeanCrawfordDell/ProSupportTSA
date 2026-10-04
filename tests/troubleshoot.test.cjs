const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const core = require('../js/troubleshoot-core.js');
require('../js/troubleshoot-data-windows.js');

test('every workflow is a valid, fully connected decision tree', () => {
  for (const workflow of core.all()) assert.deepEqual(core.validate(workflow), [], workflow.id);
});

test('each Windows area has at least two workflows with unique ids', () => {
  const ids = core.all().map(w => w.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const area of core.areas) assert.ok(core.list({ os: 'windows-server', area: area.id }).length >= 2, area.id);
});

test('validation rejects dangling answers, cycles, unreachable steps and non-https links', () => {
  const base = () => ({ id: 'x', os: ['windows-server'], area: 'dns', title: 'T', summary: 'S', reviewed: '2026-10-03', sources: ['https://learn.microsoft.com/x'], start: 'a',
    steps: { a: { prompt: 'Q', answers: [{ label: 'Y', next: 'o' }, { label: 'N', next: 'o' }] }, o: { outcome: { cause: 'C', fix: ['F'] } } } });
  assert.deepEqual(core.validate(base()), []);
  const dangling = base(); dangling.steps.a.answers[1].next = 'missing';
  assert.match(core.validate(dangling).join(), /missing step/);
  const cycle = base(); cycle.steps.b = { prompt: 'B', answers: [{ label: 'Y', next: 'a' }, { label: 'N', next: 'o' }] }; cycle.steps.a.answers[1].next = 'b';
  assert.match(core.validate(cycle).join(), /cycle/);
  const orphan = base(); orphan.steps.z = { outcome: { cause: 'C', fix: ['F'] } };
  assert.match(core.validate(orphan).join(), /unreachable/);
  const http = base(); http.sources = ['http://example.com'];
  assert.match(core.validate(http).join(), /https/);
  assert.throws(() => core.register(core.all()[0]), /duplicate/);
});

test('search and filters narrow the list', () => {
  assert.ok(core.list({ query: 'replication' }).some(w => w.id === 'ad-replication'));
  assert.ok(core.list({ area: 'dns' }).every(w => w.area === 'dns'));
  assert.equal(core.list({ os: 'linux' }).length, 0);
});

test('summary text records each answer and the outcome', () => {
  const workflow = core.find('dns-resolution');
  const text = core.text(workflow, [{ step: 'server', answer: 0 }, { step: 'client', answer: 1 }]);
  assert.match(text, /Troubleshooting guide: Name resolution fails \(DNS\)/);
  assert.match(text, /1\. Does the name resolve .* → Yes/);
  assert.match(text, /2\. Is the client configured .* → Yes/);
  assert.match(text, /Likely cause: A stale cache/);
  assert.match(text, /- Clear the cache/);
});

test('handoff payloads round-trip and expire', () => {
  const raw = core.handoff('Guide', 'Steps', 1000);
  assert.deepEqual(core.readHandoff(raw, 2000), { title: 'Guide', text: 'Steps', created: 1000 });
  assert.equal(core.readHandoff(raw, 1000 + 25 * 3600 * 1000), null);
  assert.equal(core.readHandoff('not json', 2000), null);
  assert.equal(core.readHandoff(JSON.stringify({ text: '', created: 1 }), 2), null);
});

test('workflow data contains no markup that would break the CSP', () => {
  const source = fs.readFileSync(require.resolve('../js/troubleshoot-data-windows.js'), 'utf8');
  assert.doesNotMatch(source, /<script|style=|\son[a-z]+=/i);
  const html = fs.readFileSync(require.resolve('../troubleshooting.html'), 'utf8');
  assert.doesNotMatch(html, /style=|\son[a-z]+=/i);
});

function ui(hash = '') {
  const elements = {}, stored = new Map();
  const node = tag => ({ tag, value: '', textContent: '', hidden: false, disabled: false, children: [], listeners: {}, attributes: {},
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
    addEventListener(k, f) { this.listeners[k] = f; }, setAttribute(k, v) { this.attributes[k] = v; }, focus() {} });
  const get = id => elements[id] ??= node('div');
  const ctx = { window: {}, document: { readyState: 'complete', getElementById: get, createElement: node }, TroubleshootCore: core, URLSearchParams,
    location: { hash, pathname: '/troubleshooting.html', search: '', assign(url) { ctx.assigned = url; } }, history: { replaceState() {} },
    localStorage: { setItem: (k, v) => stored.set(k, v), getItem: k => stored.get(k) ?? null },
    navigator: { clipboard: { async writeText(text) { ctx.copied = text; } } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/troubleshoot.js'), 'utf8'), ctx);
  const answers = () => get('tsAnswers').children;
  return { get, ctx, stored, guides: ctx.window.TroubleshootGuides, answers };
}

test('page walks a workflow, goes back, and reaches an outcome', async () => {
  const page = ui('#wf=dns-resolution');
  assert.equal(page.get('tsActive').hidden, false);
  assert.match(page.get('tsPrompt').textContent, /query the DNS server directly/);
  page.answers()[0].listeners.click();
  assert.match(page.get('tsPrompt').textContent, /client configured/);
  assert.equal(page.get('tsTrail').children.length, 1);
  page.get('tsBack').listeners.click();
  assert.equal(page.get('tsTrail').children.length, 0);
  page.answers()[0].listeners.click(); page.answers()[1].listeners.click();
  assert.equal(page.get('tsOutcome').hidden, false);
  assert.equal(page.get('tsStep').hidden, true);
  assert.match(page.get('tsCause').textContent, /stale cache/);
  await page.get('tsCopy').listeners.click();
  assert.match(page.ctx.copied, /Likely cause: A stale cache/);
  page.get('tsSend').listeners.click();
  const handoff = core.readHandoff(page.stored.get(core.handoffKey));
  assert.equal(handoff.title, 'Name resolution fails');
  assert.match(handoff.text, /Recommended actions/);
  assert.equal(page.ctx.assigned, 'case-notes.html');
});

test('area deep link filters the guide list', () => {
  const page = ui('#area=cluster');
  const list = page.get('tsList').children;
  assert.equal(list.length, 3);
  assert.equal(page.get('tsActive').hidden, true);
});
