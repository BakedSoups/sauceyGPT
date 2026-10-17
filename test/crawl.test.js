import test from 'node:test';
import assert from 'node:assert/strict';
import { crawlDocumentation } from '../crawl.js';
import { buildChunks } from '../library-import.js';

test('documentation crawling stays in scope, deduplicates anchors, limits pages, and preserves provenance', async () => {
  const visited = [];
  const reader = async ({ url }) => {
    visited.push(url);
    return { url, rawHTML: `<main><h1>Guide</h1><p>A real explanation with sufficient text to index as a source.</p></main><a href="/docs/next#one">Next</a><a href="/docs/next#two">Duplicate</a><a href="https://other.example/docs/">External</a><a href="/account">Outside</a><a href="/docs/search?q=x">Search</a><a href="/docs/third">Third</a>` };
  };
  const parsed = await crawlDocumentation('https://example.com/docs/', 2, new AbortController().signal, reader);
  assert.deepEqual(visited, ['https://example.com/docs/', 'https://example.com/docs/next']);
  assert.equal(parsed.partial, true); assert.equal(parsed.pageCount, 2);
  const { chapters } = buildChunks({ ...parsed, canonical: 'guide', id: 'test', title: 'Guide' });
  assert.equal(chapters.length, 2); assert.equal(chapters[1].originalURL, visited[1]);
  assert.equal(parsed.sections[1].originalURL, visited[1]);
});

test('unreadable documentation is reported, redirects outside scope are not indexed, and invalid limits are rejected', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(crawlDocumentation('https://example.com/docs/', 31, signal), /1 and 30/);
  await assert.rejects(crawlDocumentation('https://example.com/docs/', 2, signal, async () => ({ url: 'https://elsewhere.example/', rawHTML: '<p>Other site</p>' })), /Redirect left/);
  await assert.rejects(crawlDocumentation('https://example.com/docs/', 2, signal, async () => { throw new Error('HTTP 403'); }), /403/);
});
