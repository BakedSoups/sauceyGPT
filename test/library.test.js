import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Library } from '../library.js';
import { parseUpload, buildChunks } from '../library-import.js';
import { passageLink } from '../evidence.js';
import { Researcher } from '../research.js';
import { createApp } from '../server.js';
const signal = () => new AbortController().signal;

test('headings create stable canonical chapter IDs; HTML scripts are not indexed', async () => {
  const parsed = await parseUpload(Buffer.from('# First\nA sentence about the first topic.\n# Second\nA different sentence with enough information.'), 'notes.md', signal());
  const doc = { id: 'id', title: 'Notes', canonical: 'notes-abcd', ...parsed };
  const a = buildChunks(doc), b = buildChunks(structuredClone(doc));
  assert.deepEqual(a.chapters, b.chapters);
  assert.equal(a.chapters.length, 2);
  assert.equal(a.chunks[1].chapterId, 'notes-abcd/002-second');
  const html = await parseUpload(Buffer.from('<main><h1>Topic</h1><p>Article facts here.</p><script>malicious()</script></main>'), 'page.html', signal());
  assert.equal(html.sections[0].heading, 'Topic'); assert.doesNotMatch(html.sections[0].text, /malicious/);
  assert.equal(passageLink('/api/library/abc/file', 'quote', 4), '/api/library/abc/file#page=4');
});

test('PDF bookmarks map real pages to named chapters', async () => {
  const stream = 'BT /F1 12 Tf 72 720 Td (The cobalt kettle stays on shelf seven.) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R /Outlines 6 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Outlines /First 7 0 R /Last 7 0 R /Count 1 >>', '<< /Title (Chapter 1: Kitchen) /Parent 6 0 R /Dest [3 0 R /Fit] >>'];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await parseUpload(Buffer.from(pdf), 'book.pdf', signal());
  assert.equal(result.sections[0].heading, 'Chapter 1: Kitchen');
  assert.equal(result.sections[0].page, 1);
  assert.match(result.sections[0].text, /cobalt kettle/);
});

test('index persists, duplicate uploads do not re-embed, selections filter search, deletion clears vectors', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sauce-library-')); t.after(() => rm(directory, { recursive: true, force: true }));
  let points = [], embeds = 0;
  const request = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    let data;
    if (url.endsWith('/embeddings')) { embeds++; data = { data: body.input.map((_, index) => ({ index, embedding: Array(1536).fill(0.1) })) }; }
    else if (url.endsWith('/exists')) data = { result: { exists: true } };
    else if (url.includes('/points?')) { points.push(...body.points); data = {}; }
    else if (url.includes('/points/query')) { assert.ok(body.filter.must[0].match.any.length); data = { result: { points: points.map(p => ({ ...p, score: 0.9 })) } }; }
    else if (url.includes('/points/delete')) { points = points.filter(p => p.payload.docId !== body.filter.must[0].match.value); data = {}; }
    else assert.fail(url);
    return { ok: true, json: async () => data };
  };
  const library = new Library({ key: 'test', directory, request });
  const bytes = Buffer.from('# Equipment\nThe cobalt kettle is kept on the seventh shelf.\n# Opening\nThe workshop opens every morning at eight.');
  const item = await library.upload(bytes, 'notes.md', 'Workshop', signal());
  assert.equal(item.chapters.length, 2); assert.equal(embeds, 1);
  assert.equal((await library.upload(bytes, 'again.md', '', signal())).duplicate, true); assert.equal(embeds, 1);
  const restarted = new Library({ key: 'test', directory, request });
  assert.equal((await restarted.list())[0].canonical, item.canonical);
  assert.equal(await restarted.search('kettle', [], [], signal()), null);
  const found = await restarted.search('kettle', [], [item.id], signal());
  assert.equal(found.sources[0].local, true); assert.match(found.documents.get(1).sections[0].text, /seventh/);
  await restarted.remove(item.id); assert.equal(points.length, 0); assert.deepEqual(await restarted.list(), []);
});

test('library-only answers never call web search and local citations retain page links', async () => {
  const fact = 'The cobalt kettle is on shelf seven.';
  const researcher = new Researcher({ key: 'test', library: { search: async () => ({ sources: [{ id: 1, title: 'Kitchen', local: true, url: '/api/library/test/file', readStatus: 'read', format: 'pdf' }], documents: new Map([[1, { url: '/api/library/test/file', sections: [{ text: fact, page: 3 }] }]]) }) } });
  researcher.modelCall = async (_, input, signal, options) => {
    assert.equal(options.tools, undefined);
    const data = options.text.format.name === 'grounded_rewrite' ? { sentences: [{ text: fact, sourceIds: [1] }] } : { matches: [{ claimId: 1, sourceId: 1, supported: true, quotes: [fact] }] };
    return { output: [{ content: [{ type: 'output_text', text: JSON.stringify(data) }] }] };
  };
  const result = await researcher.run('Where is the kettle?', [], () => {}, signal(), { libraryMode: 'only' });
  assert.equal(result.answer, fact); assert.equal(result.provider, 'Document library');
  assert.equal(result.sources[0].evidence[0].locationURL, '/api/library/test/file#page=3');
});

test('upload API rejects cross-origin requests and passes raw bytes and explicit library selection', async t => {
  let received;
  const library = { list: async () => [], upload: async (bytes, name) => { assert.equal(bytes.toString(), 'hello'); assert.equal(name, 'notes.md'); return { id: 'test' }; } };
  const server = createApp({ run: async (q, h, emit, signal, options) => { received = options; return { answer: 'ok' }; } }, true, library).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const upload = { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': 'notes.md' }, body: 'hello' };
  assert.equal((await fetch(base + '/api/library/upload', upload)).status, 200);
  assert.equal((await fetch(base + '/api/library/upload', { ...upload, headers: { ...upload.headers, Origin: 'https://evil.example' } })).status, 403);
  const response = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Hi', libraryMode: 'only', documentIds: [] }) });
  await response.text(); assert.deepEqual(received, { libraryMode: 'only', documentIds: [] });
});


test('PDF originals are served from the private dot-directory, but invalid IDs cannot escape it', async t => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'sauce-pdf-'));
  const directory = path.join(parent, '.private'); await mkdir(directory);
  t.after(() => rm(parent, { recursive: true, force: true }));
  const id = 'a'.repeat(64); await writeFile(path.join(directory, id + '.pdf'), '%PDF-test');
  const server = createApp({}, true, { directory, get: async value => { if (value !== id) throw new Error('Invalid ID'); return { id, format: 'pdf' }; } }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/library/${id}/file`);
  assert.equal(response.status, 200); assert.equal(await response.text(), '%PDF-test');
  assert.equal((await fetch(`${base}/api/library/unknown/file`)).status, 404);
});
