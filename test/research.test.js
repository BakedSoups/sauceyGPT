import test from 'node:test';
import assert from 'node:assert/strict';
import { Researcher, citedAnswer, consumeStream, safeSourceURL, searchedSources, sourceKey, underlineCitations } from '../research.js';
import { createApp } from '../server.js';

const response = (text, annotations = []) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text, annotations }] }] });
const annotation = (url, start = 5, end = 8) => ({ type: 'url_citation', url, title: 'Reference', start_index: start, end_index: end });

const withSearch = result => ({ ...result, output: [{ type: 'web_search_call', status: 'completed', action: { type: 'search', sources: [{ url: 'https://example.org' }] } }, ...result.output] });

test('search must actually complete and cited URLs must appear in retrieved sources', () => {
  assert.throws(() => searchedSources(response('A')), /did not complete/);
  const found = searchedSources(withSearch(response('A')));
  const result = citedAnswer(response('Fact [1]', [annotation('https://invented.example')]), found);
  assert.equal(result.sources.length, 0);
  assert.equal(sourceKey('https://example.org?utm_source=openai'), 'https://example.org/');
  assert.notEqual(sourceKey('https://example.org?id=1'), sourceKey('https://example.org?id=2'));
});
test('only the cited sentence is underlined and multiple references stay attached', () => {
  const blocks = underlineCitations([[{ text: 'Uncited statement. Supported sentence. ' }, { sourceId: 1 }, { sourceId: 2 }, { text: ' Another uncited sentence.' }]]);
  assert.deepEqual(blocks[0], [{ text: 'Uncited statement. ' }, { text: 'Supported sentence.', citations: [1, 2] }, { text: ' ' }, { text: ' Another uncited sentence.' }]);
});
test('native citation offsets map to references without dropping surrounding text', () => {
  const result = citedAnswer(response('Fact [1] more.', [annotation('https://example.org')]));
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.blocks[0], [{ text: 'Fact ' }, { sourceId: 1 }, { text: ' more.' }]);
  assert.equal(result.answer, 'Fact  more.');
});
test('native Markdown link annotations become numbered citations', () => {
  const text = 'Fact ([Example](https://example.org))';
  const result = citedAnswer(response(text, [annotation('https://example.org', 5, text.length)]));
  assert.equal(result.answer, 'Fact ');
  assert.deepEqual(result.blocks[0], [{ text: 'Fact ' }, { sourceId: 1 }]);
});
test('multiple citations sharing a span are preserved and repeated URLs deduplicate', () => {
  const result = citedAnswer(response('Fact [1] next [2]', [annotation('https://example.org'), annotation('https://example.net'), annotation('https://example.org', 14, 17)]));
  // The repeated URL keeps the same source number.
  assert.equal(result.sources.length, 2);
  assert.deepEqual(result.blocks[0].filter(s => s.sourceId).map(s => s.sourceId), [1, 2, 1]);
  const repeated = citedAnswer(response('Fact [1] next [2]', [annotation('https://example.org'), annotation('https://example.org', 14, 17)]));
  assert.equal(repeated.sources.length, 1);
});
test('unsafe URLs, absent metadata and invalid offsets cannot create citations', () => {
  const result = citedAnswer(response('Fact [1] https://invented.example', [annotation('javascript:alert(1)'), annotation('https://example.org', -1, 8), annotation('https://example.net', 5, 999)]));
  assert.equal(result.sources.length, 0);
  assert.equal(safeSourceURL('https://user:secret@example.org'), null);
  assert.equal(safeSourceURL('file:///etc/passwd'), null);
});
test('prose covered by a citation annotation is preserved', () => {
  const result = citedAnswer(response('Supported fact.', [annotation('https://example.org', 0, 15)]));
  assert.equal(result.answer, 'Supported fact.');
  assert.equal(result.blocks[0][1].sourceId, 1);
});
async function* chunks(text) {
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < bytes.length; i += 3) yield bytes.slice(i, i + 3);
}
test('stream parser handles chunked UTF-8, CRLF, and terminal completion', async () => {
  const delta = { type: 'response.output_text.delta', delta: 'Café ☕' };
  const done = { type: 'response.completed', response: response('Café ☕') };
  const received = [];
  await consumeStream(chunks(`event: delta\r\ndata: ${JSON.stringify(delta)}\r\n\r\ndata: ${JSON.stringify(done)}\r\n\r\n`), text => received.push(text));
  assert.deepEqual(received, ['Café ☕']);
  await assert.rejects(consumeStream(chunks(`data: ${JSON.stringify(delta)}\n\n`), () => {}), /ended early/);
});
test('draft appears before search, then sources are read, answer rewritten and excerpts checked', async () => {
  const calls = [], events = [];
  const researcher = new Researcher({ key: 'test', reader: async () => ({ format: 'html', url: 'https://example.org/', fetchedAt: '2026-10-17T00:00:00Z', sections: [{ page: null, text: 'Fact' }] }), request: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body); calls.push(body);
    if (calls.length === 1) {
      assert.equal(body.tools, undefined); assert.equal(body.stream, true);
      return { ok: true, body: chunks(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Initial draft' })}\n\ndata: ${JSON.stringify({ type: 'response.completed', response: response('Initial draft') })}\n\n`) };
    }
    if (calls.length === 3) {
      assert.equal(JSON.parse(body.input).sources[0].windows[0].text, 'Fact');
      return { ok: true, json: async () => response(JSON.stringify({ sentences: [{ text: 'Fact', sourceIds: [1] }] })) };
    }
    if (calls.length === 4) return { ok: true, json: async () => response(JSON.stringify({ matches: [{ claimId: 1, sourceId: 1, supported: true, quote: 'Fact' }] })) };
    assert.ok(events.some(e => e.type === 'draft_delta'));
    assert.equal(JSON.parse(body.input).draft, 'Initial draft');
    return { ok: true, json: async () => withSearch(response('Fact [1]', [annotation('https://example.org')])) };
  } });
  const result = await researcher.run('Question', [], e => events.push(e), new AbortController().signal);
  assert.equal(calls.length, 4); assert.equal(calls[1].tool_choice, 'required');
  assert.equal(calls[1].tools[0].search_context_size, 'low');
  assert.ok(calls.every(c => c.store === false)); assert.equal(result.sources.length, 1);
  assert.equal(result.notice, '');
  assert.deepEqual(calls[1].include, ['web_search_call.action.sources']);
  assert.deepEqual(result.blocks[0][0].citations, [1]);
});
test('missing source annotations are disclosed, and failed search never promotes the draft', async () => {
  const researcher = new Researcher({ key: 'test', reader: async () => { throw new Error('403'); } });
  researcher.modelCall = async () => withSearch(response('Uncited answer'));
  const result = await researcher.run('Q', [], () => {}, new AbortController().signal);
  assert.equal(result.sources.length, 0); assert.match(result.notice, /not source-verified/);
  let calls = 0;
  researcher.modelCall = async () => { if (++calls === 2) throw new Error('Search failed'); return response('Draft'); };
  await assert.rejects(researcher.run('Q', [], () => {}, new AbortController().signal), /Search failed/);
});
test('server streams progress/results and rejects invalid and cross-origin requests', async t => {
  const app = createApp({ run: async (question, history, emit) => { emit({ type: 'progress', message: 'Reading' }); return { claims: [] }; } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const options = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await fetch(base + '/api/chat', options({ message: '' }))).status, 400);
  const evil = options({ message: 'Hello' }); evil.headers.Origin = 'https://evil.example';
  assert.equal((await fetch(base + '/api/chat', evil)).status, 403);
  const response = await fetch(base + '/api/chat', options({ message: 'Hello' }));
  assert.equal(response.status, 200);
  const events = (await response.text()).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(e => e.type), ['progress', 'result']);
  assert.match((await fetch(base)).headers.get('content-security-policy'), /script-src 'self'/);
});
test('missing API key yields actionable setup error', async t => {
  const server = createApp({}, false).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Hi' }) });
  assert.equal(response.status, 503); assert.match((await response.json()).error, /OPENAI_KEY/);
});
