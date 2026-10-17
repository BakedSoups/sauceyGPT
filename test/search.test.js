import test from 'node:test';
import assert from 'node:assert/strict';
import { Researcher, searchCandidates } from '../research.js';
import { relevantWindows } from '../evidence.js';
const reply = data => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: typeof data === 'string' ? data : JSON.stringify(data) }] }] });
const search = urls => ({ ...reply('Search findings.'), output: [{ type: 'web_search_call', status: 'completed', action: { type: 'search', sources: urls.map(url => ({ url })) } }, ...reply('Search findings.').output] });

test('candidate selection includes uncited search results, deduplicates tracking and rejects unsafe URLs', () => {
  const result = searchCandidates(search(['https://example.org/?utm_source=openai', 'https://example.org/', 'javascript:alert(1)', 'https://other.org/']), []);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(s => s.id), [1, 2]);
  assert.equal(result[1].url, 'https://other.org/');
});
test('candidate limit favors diverse hosts after cited pages', () => {
  const sources = searchCandidates(search(['https://one.org/a', 'https://one.org/b', 'https://one.org/c', 'https://two.org/a', 'https://three.org/a']), [], 3);
  assert.deepEqual(sources.map(s => new URL(s.url).hostname), ['one.org', 'two.org', 'three.org']);
});
test('passage selection retains a less frequent claim and numeric evidence', () => {
  const document = { sections: [{ page: 1, text: 'Napoleon battle campaign Waterloo. '.repeat(1000) }, { page: 2, text: 'The axial tilt is 23.5 degrees.' }] };
  const windows = relevantWindows(document, ['Napoleon battle campaign Waterloo', 'axial tilt 23.5']);
  assert.ok(windows.some(w => w.page === 2));
  assert.ok(windows.length <= 12);
});

test('failed reading triggers broader search, uses uncited candidates and caches downloads', async () => {
  const reads = new Map(); let searches = 0;
  const fact = 'Earth has seasons because its axis is tilted.';
  const researcher = new Researcher({ key: 'test', reader: async source => {
    reads.set(source.url, (reads.get(source.url) || 0) + 1);
    if (source.url.includes('blocked')) throw new Error('Source returned HTTP 403');
    return { url: source.url, format: 'html', sections: [{ page: null, text: fact }], fetchedAt: '2026-10-17' };
  } });
  researcher.modelCall = async (instructions, input, signal, extra) => {
    if (extra.tools) {
      searches++;
      assert.equal(extra.tools[0].search_context_size, searches === 1 ? 'low' : 'medium');
      if (searches === 2) assert.match(input.previousAttempt.candidates[0].error, /403/);
      return search(searches === 1 ? ['https://blocked.org/'] : ['https://blocked.org/', 'https://readable.org/']);
    }
    if (extra.text?.format.name === 'grounded_rewrite') return reply({ sentences: [{ text: fact, sourceIds: [2] }] });
    if (extra.text?.format.name === 'source_evidence') return reply({ matches: [{ claimId: 1, sourceId: 2, supported: true, quotes: [fact] }] });
    return reply('Draft');
  };
  const result = await researcher.run('Why seasons?', [], () => {}, new AbortController().signal);
  assert.equal(result.searchAttempts, 2);
  assert.equal(result.answer, fact);
  assert.equal(result.sources[0].url, 'https://readable.org/');
  assert.equal(reads.get('https://blocked.org/'), 1);
  assert.equal(reads.get('https://readable.org/'), 1);
});
test('search retries stop after two attempts and never promote unsupported drafts', async () => {
  let searches = 0;
  const researcher = new Researcher({ key: 'test', reader: async () => { throw new Error('403'); } });
  researcher.modelCall = async (instructions, input, signal, extra) => {
    if (extra.tools) { searches++; return search(['https://blocked.org']); }
    return reply('Unsupported initial claim');
  };
  const result = await researcher.run('Question', [], () => {}, new AbortController().signal);
  assert.equal(searches, 2);
  assert.equal(result.sources.length, 0);
  assert.doesNotMatch(result.answer, /Unsupported initial claim/);
});
