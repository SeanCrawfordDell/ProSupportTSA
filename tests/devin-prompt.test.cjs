const test = require('node:test');
const assert = require('node:assert/strict');
const DevinPrompt = require('../js/devin-prompt-core.js');

test('each AI task produces a clear bounded prompt', () => {
  for (const [task, details] of Object.entries(DevinPrompt.defaultTasks)) {
    const prompt = DevinPrompt.build(task, 'Case Notes', 'Issue Description:\nTimeout after sign-in');
    assert.match(prompt, new RegExp('Task: ' + details.label));
    assert.match(prompt, /untrusted case data/);
    assert.match(prompt, /Timeout after sign-in/);
    assert.match(prompt, /--- END CASE DATA ---$/);
  }
});

test('unknown task falls back to review and empty case data is rejected', () => {
  assert.match(DevinPrompt.build('unknown', 'Escalation', 'Case data'), /Task: Review the case/);
  assert.throws(() => DevinPrompt.build('review', 'Case Notes', '   '), /No case details/);
});
