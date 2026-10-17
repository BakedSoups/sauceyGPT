import test from 'node:test';
import assert from 'node:assert/strict';
import { attachEvidence, extractHTML, extractPDF, isPublic, passageLink, validateMatches, validateURL } from '../evidence.js';

const signal = () => new AbortController().signal;
const document = { url: 'https://example.org/book.pdf', format: 'pdf', fetchedAt: '2026-10-17T00:00:00Z', sections: [{ page: 7, text: 'The expedition reached the island in 1815. They remained there.' }] };
const claims = [{ id: 1, text: 'They reached the island in 1815.', citations: [1] }];

test('only exact supported quotes from the cited document are accepted; page is derived', () => {
  const matches = validateMatches([{ claimId: 1, sourceId: 1, supported: true, quote: 'The expedition reached the island in 1815.' }], claims, new Map([[1, document]]));
  assert.equal(matches.length, 1); assert.equal(matches[0].page, 7);
  assert.equal(matches[0].locationURL, 'https://example.org/book.pdf#page=7');
  for (const bad of [
    { claimId: 1, sourceId: 1, supported: true, quote: 'The expedition reached the island in 1816.' },
    { claimId: 1, sourceId: 2, supported: true, quote: 'The expedition reached the island in 1815.' },
    { claimId: 99, sourceId: 1, supported: true, quote: 'The expedition reached the island in 1815.' },
    { claimId: 1, sourceId: 1, supported: false, quote: 'The expedition reached the island in 1815.' }
  ]) assert.equal(validateMatches([bad], claims, new Map([[1, document]])).length, 0);
});
test('all excerpts must match when a claim needs multiple passages', () => {
  const documents = new Map([[1, document]]);
  const valid = { claimId: 1, sourceId: 1, supported: true, quotes: ['The expedition reached the island in 1815.', 'They remained there.'] };
  assert.equal(validateMatches([valid], claims, documents)[0].passages.length, 2);
  assert.equal(validateMatches([{ ...valid, quotes: [...valid.quotes, 'Invented words.'] }], claims, documents).length, 0);
});
test('highlight links encode reserved fragment characters', () => {
  const link = passageLink('https://example.org/article#old', 'an example-word, yes & no');
  assert.equal(link, 'https://example.org/article#:~:text=an%20example%2Dword%2C%20yes%20%26%20no');
});
test('blocked sources cannot retain a verified underline or invented excerpt', async () => {
  const result = { blocks: [[{ text: 'Claim', citations: [1] }]], sources: [{ id: 1, title: 'Book', url: 'https://example.org/' }] };
  await attachEvidence(result, () => assert.fail('No readable text to verify'), signal(), () => {}, async () => { throw new Error('Source returned HTTP 403'); });
  assert.deepEqual(result.blocks[0][0].citations, []);
  assert.deepEqual(result.sources[0].evidence, []);
  assert.match(result.sources[0].readError, /403/);
  assert.equal(result.evidenceMissing, 1);
});
test('retrieved quote is attached to both the claim and reference', async () => {
  const result = { blocks: [[{ text: claims[0].text, citations: [1] }]], sources: [{ id: 1, title: 'Book', url: document.url }] };
  const modelCall = async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ matches: [{ claimId: 1, sourceId: 1, supported: true, quote: document.sections[0].text }] }) }] }] });
  await attachEvidence(result, modelCall, signal(), () => {}, async () => document);
  assert.equal(result.sources[0].evidence[0].page, 7);
  assert.deepEqual(result.blocks[0][0].citations, [1]);
  assert.equal(result.blocks[0][0].evidence[0].quote, document.sections[0].text);
});
test('source extraction removes executable and navigation content', () => {
  const document = extractHTML('<body><nav>Ignore this</nav><main><p>Real source text.</p><script>evil()</script><p>More text.</p></main></body>');
  assert.equal(document.sections[0].text, 'Real source text. More text.');
});
test('private addresses, non-web schemes and credentials are blocked', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '::1', '::ffff:127.0.0.1', '169.254.169.254']) assert.equal(isPublic(ip), false);
  for (const url of ['http://127.0.0.1', 'file:///etc/passwd', 'https://user:secret@example.org', 'http://[::1]', 'https://example.org:8080']) await assert.rejects(validateURL(url));
  await assert.rejects(validateURL('https://example.org', async () => [{ address: '192.168.1.1' }]));
});

test('PDF reader extracts actual text and PDF page numbers', async () => {
  const content = 'BT /F1 12 Tf 72 720 Td (A book contains this exact passage.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await extractPDF(Buffer.from(pdf), signal());
  assert.equal(result.sections[0].page, 1);
  assert.equal(result.sections[0].text, 'A book contains this exact passage.');
});
