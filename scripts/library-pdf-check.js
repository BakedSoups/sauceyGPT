// Billable PDF + article indexing check; removes its test documents afterwards.
import assert from 'node:assert/strict';
const base = process.env.APP_URL || 'http://localhost:3001';
const ids = [];
const text = 'The amber lantern is stored in cabinet nine.';
const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
let pdf = '%PDF-1.4\n'; const offsets = [0];
for (let i = 0; i < objects.length; i++) { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
const xref = pdf.length;
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
try {
  const uploaded = await fetch(base + '/api/library/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': 'library-pdf-check.pdf' }, body: pdf });
  const doc = await uploaded.json(); assert.equal(uploaded.status, 200, JSON.stringify(doc)); ids.push(doc.id);
  const original = await (await fetch(`${base}/api/library/${doc.id}/file`)).text(); assert.equal(original, pdf);
  const response = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Where is the amber lantern stored?', libraryMode: 'only', documentIds: [doc.id] }) });
  const result = (await response.text()).trim().split('\n').map(JSON.parse).find(e => e.type === 'result');
  assert.ok(result, 'No PDF answer'); assert.match(result.answer, /nine|9/);
  assert.equal(result.sources[0].evidence[0].page, 1); assert.match(result.sources[0].evidence[0].locationURL, /#page=1$/);
  console.log(JSON.stringify({ pdfAnswer: result.answer, timings: result.timings }));
  const imported = await fetch(base + '/api/library/article', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://spaceplace.nasa.gov/seasons/en/', title: 'NASA seasons integration check' }) });
  const article = await imported.json(); assert.equal(imported.status, 200, JSON.stringify(article)); ids.push(article.id);
  assert.ok(article.chunkCount > 0); assert.ok(article.chapters.length > 0);
  console.log(JSON.stringify({ articleChunks: article.chunkCount, articleChapters: article.chapters.length }));
} finally { for (const id of ids) await fetch(`${base}/api/library/${id}`, { method: 'DELETE' }); }
