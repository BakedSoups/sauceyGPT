import test from 'node:test';
import assert from 'node:assert/strict';
import { Researcher, wantsCode, answerScore } from '../research.js';

test('code intent respects explanation and negative requests', () => {
  for (const q of ['Explain without repeating the code', 'Would that code send the email?', 'What does slow_motion_scale mean?', 'Explain the API, no code']) assert.equal(wantsCode(q), false, q);
  for (const q of ['Show a Python example', 'How do I use the campaigns endpoint?', 'Implement slow motion in GDScript']) assert.equal(wantsCode(q), true, q);
});

test('supported answers outrank empty retries and requested code outranks prose alone', () => {
  const prose = { sources: [{}], blocks: [[{ kind: 'paragraph', text: 'Supported' }]] };
  const code = { sources: [{}], blocks: [[{ kind: 'code', text: 'example' }]] };
  assert.ok(answerScore(prose, false) > answerScore({ sources: [], blocks: [] }, false));
  assert.ok(answerScore(code, true) > answerScore(prose, true));
});

test('follow-up reuses server-verified excerpts without library lookup or web search', async () => {
  const fact = 'Multiplying delta changes the distance moved each frame.';
  const researcher = new Researcher({ key: 'test', reader: () => assert.fail('Must reuse verified passages') });
  const options = { libraryMode: 'prefer', documentIds: ['godot'] };
  researcher.recentAnswers.set('previous answer', { scope: JSON.stringify(['prefer', ['godot']]), at: Date.now(), result: {
    sources: [{ id: 1, url: 'https://docs.example.org', evidence: [{ passages: [{ quote: fact }] }] }],
    blocks: [[{ kind: 'code', text: 'position += velocity * delta * 0.25' }]]
  } });
  researcher.modelCall = async (_, input, signal, extra) => {
    assert.ok(input.exampleContext.includes('position += velocity * delta * 0.25'));
    const data = extra.text.format.name === 'grounded_rewrite'
      ? { sentences: [{ text: 'In this example, 0.25 makes movement one quarter as fast.', kind: 'paragraph', sourceIds: [1] }] }
      : { matches: [{ claimId: 1, sourceId: 1, supported: true, quotes: [fact] }] };
    return { output: [{ content: [{ type: 'output_text', text: JSON.stringify(data) }] }] };
  };
  const result = await researcher.run('What does that scale mean?', [{ role: 'assistant', content: 'previous answer' }], () => {}, new AbortController().signal, options);
  assert.equal(result.provider, 'Previous answer sources');
  assert.equal(result.sources.length, 1);
  assert.match(result.answer, /quarter/);
});

test('changed source selection and expired answers cannot reuse cached evidence', async () => {
  for (const stale of [false, true]) {
    let searched = false;
    const researcher = new Researcher({ key: 'test', library: { search: async () => { searched = true; return { sources: [] }; } } });
    researcher.recentAnswers.set('previous', { scope: JSON.stringify(['only', [stale ? 'new' : 'old']]), at: Date.now() - (stale ? 16 * 60_000 : 0), result: {} });
    researcher.modelCall = () => assert.fail('A cached answer must not bypass source selection or expiry');
    await researcher.run('Explain that', [{ role: 'assistant', content: 'previous' }], () => {}, new AbortController().signal, { libraryMode: 'only', documentIds: ['new'] });
    assert.equal(searched, true);
  }
});

test('quota failures are reported explicitly rather than as missing source evidence', async () => {
  const researcher = new Researcher({ key: 'test', request: async () => ({ ok: false, status: 429, json: async () => ({ error: { code: 'credit_balance_exhausted' } }) }) });
  await assert.rejects(researcher.modelCall('test', {}, new AbortController().signal), error => error.providerFailure && /credits are exhausted/.test(error.message));
});
