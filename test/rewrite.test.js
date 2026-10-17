import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteFromSources } from '../rewrite.js';
const response = data => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(data) }] }] });
const makeResult = () => ({ answer: 'Napoleon died at Waterloo.', blocks: [], sources: [{ id: 1, title: 'History', url: 'https://example.org' }] });
const doc = { url: 'https://example.org', format: 'html', fetchedAt: '2026-01-01', sections: [{ page: null, text: 'Napoleon died on Saint Helena in 1821.' }] };
const context = { query: 'Did Napoleon die at Waterloo?', history: [], draft: 'Napoleon died at Waterloo.' };
const run = (result, model, reader) => rewriteFromSources(result, context, model, new AbortController().signal, () => {}, reader);

test('incorrect draft is replaced with source-based answer and downloaded only once', async () => {
  let calls = 0, reads = 0;
  const result = await run(makeResult(), async (instructions, input) => {
    if (++calls === 1) {
      assert.equal(input.draft, context.draft);
      assert.equal(input.sources[0].windows[0].text, doc.sections[0].text);
      return response({ sentences: [{ text: 'Napoleon died on Saint Helena in 1821.', sourceIds: [1] }] });
    }
    assert.equal(input.claims[0].text, doc.sections[0].text);
    return response({ matches: [{ claimId: 1, sourceId: 1, supported: true, quotes: [doc.sections[0].text] }] });
  }, async () => { reads++; return doc; });
  assert.equal(reads, 1); assert.equal(calls, 2);
  assert.equal(result.answer, doc.sections[0].text);
  assert.equal(result.sources[0].evidence[0].claim, result.answer);
});
test('uncited, invented-ID, unsupported, and fabricated-quote claims cannot survive the final check', async () => {
  let calls = 0;
  const result = await run(makeResult(), async () => ++calls === 1 ? response({ sentences: [
    { text: 'Uncited assertion.', sourceIds: [] }, { text: 'Invented source.', sourceIds: [99] },
    { text: 'He died at Waterloo.', sourceIds: [1] }, { text: 'Fake quote.', sourceIds: [1] }
  ] }) : response({ matches: [
    { claimId: 1, sourceId: 1, supported: false, quotes: [] },
    { claimId: 2, sourceId: 1, supported: true, quotes: ['These words do not occur.'] }
  ] }), async () => doc);
  assert.equal(result.sources.length, 0);
  assert.match(result.answer, /couldn’t verify/);
  assert.doesNotMatch(result.answer, /Waterloo|Uncited assertion|Fake quote/);
  assert.equal(result.omittedClaims, 4);
});
test('unreadable sources produce uncertainty without promoting the draft', async () => {
  const result = await run(makeResult(), () => assert.fail('No source text to compose from'), async () => { throw new Error('403'); });
  assert.match(result.notice, /not source-verified/);
  assert.doesNotMatch(result.answer, /Waterloo/);
});
test('verifier failure cannot publish unchecked rewritten claims', async () => {
  let calls = 0;
  const result = await run(makeResult(), async () => {
    if (++calls === 1) return response({ sentences: [{ text: doc.sections[0].text, sourceIds: [1] }] });
    throw new Error('Verifier unavailable');
  }, async () => doc);
  assert.equal(result.sources.length, 0);
  assert.match(result.answer, /couldn’t verify/);
});

test('remaining citations, evidence, references and history text agree after omissions', async () => {
  const result = makeResult();
  result.sources.push({ id: 2, title: 'Second source', url: 'https://example.org/second' });
  let calls = 0;
  await run(result, async () => ++calls === 1 ? response({ sentences: [
    { text: 'Unsupported extra detail.', sourceIds: [1] },
    { text: doc.sections[0].text, sourceIds: [2] }
  ] }) : response({ matches: [
    { claimId: 1, sourceId: 1, supported: false, quotes: [] },
    { claimId: 2, sourceId: 2, supported: true, quotes: [doc.sections[0].text] }
  ] }), async source => ({ ...doc, url: source.url }));
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].id, 1);
  assert.equal(result.sources[0].title, 'Second source');
  assert.deepEqual(result.blocks[0][0].citations, [1]);
  assert.equal(result.blocks[0][0].evidence[0].sourceId, 1);
  assert.equal(result.sources[0].evidence[0].claim, result.answer);
  assert.doesNotMatch(result.answer, /Unsupported/);
  assert.match(result.notice, /left out/);
});
