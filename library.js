import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseUpload, buildChunks, slug } from './library-import.js';
import { readDocument } from './evidence.js';
import { crawlDocumentation } from './crawl.js';
const collection = 'sauceygpt_documents_v1';
const model = 'text-embedding-3-small';
const validID = id => /^[a-f0-9]{64}$/.test(id);
export class Library {
  constructor({ key, directory = '.data/library', qdrant = process.env.QDRANT_URL || 'http://127.0.0.1:16333', request = globalThis.fetch }) {
    Object.assign(this, { key, directory: path.resolve(directory), qdrant, request });
  }
  async db(route, method = 'GET', body, signal = AbortSignal.timeout(20000)) {
    const response = await this.request(`${this.qdrant}${route}`, { method, signal, headers: { 'Content-Type': 'application/json', ...(process.env.QDRANT_API_KEY ? { 'api-key': process.env.QDRANT_API_KEY } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(`Document index returned HTTP ${response.status}. Check Qdrant is running (docker compose up -d).`);
    return response.json();
  }
  async ensure() {
    if (!this.initializing) this.initializing = (async () => {
      const info = await this.db(`/collections/${collection}/exists`);
      if (!info.result.exists) await this.db(`/collections/${collection}`, 'PUT', { vectors: { size: 1536, distance: 'Cosine' } });
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
    })().catch(error => { this.initializing = null; throw error; });
    return this.initializing;
  }
  async embed(input, signal) {
    const response = await this.request('https://api.openai.com/v1/embeddings', { method: 'POST', signal, headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input }) });
    if (!response.ok) throw new Error(`Embedding request returned HTTP ${response.status}. Check OpenAI access and billing.`);
    const data = await response.json();
    if (!Array.isArray(data.data) || data.data.length !== input.length) throw new Error('Incomplete embedding response.');
    return data.data.sort((a, b) => a.index - b.index).map(item => {
      if (item.embedding?.length !== 1536) throw new Error('Unexpected embedding dimensions.');
      return item.embedding;
    });
  }
  async get(id) {
    if (!validID(id)) throw new Error('Invalid document ID.');
    return JSON.parse(await readFile(path.join(this.directory, `${id}.json`), 'utf8'));
  }
  async list() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const docs = [];
    for (const file of await readdir(this.directory)) if (/^[a-f0-9]{64}\.json$/.test(file)) {
      const { sections, ...meta } = await this.get(file.slice(0, -5)); if (!meta.archived) docs.push(meta);
    }
    return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async upload(bytes, name, title, signal, url, supplied) {
    await this.ensure();
    const id = createHash('sha256').update(bytes).digest('hex');
    try {
      const existing = await this.get(id);
      if (existing.archived) {
        delete existing.archived; delete existing.replacedBy;
        const file = path.join(this.directory, `${id}.json`);
        await writeFile(file + '.tmp', JSON.stringify(existing), { mode: 0o600 }); await rename(file + '.tmp', file);
      }
      const { sections, ...meta } = existing; return { ...meta, duplicate: true };
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const parsed = supplied || await parseUpload(bytes, name, signal);
    if (!parsed.sections.some(s => s.text.length > 30)) throw new Error('No readable text found. Scanned PDFs need OCR before upload.');
    const document = { id, title: (title || name.replace(/\.[^.]+$/, '')).trim().slice(0, 180), ...parsed, createdAt: new Date().toISOString(), originalName: name.slice(0, 200), originalURL: url || null };
    document.canonical = `${slug(document.title)}-${id.slice(0, 8)}`;
    const { chapters, chunks } = buildChunks(document);
    if (chunks.length > 1500) throw new Error('Document is too large to index in one upload. Split it into volumes.');
    Object.assign(document, { chapters, chunkCount: chunks.length, embeddingModel: model });
    try {
      if (document.format === 'pdf') await writeFile(path.join(this.directory, `${id}.pdf`), bytes, { mode: 0o600 });
      for (let i = 0; i < chunks.length; i += 16) {
        signal.throwIfAborted();
        const batch = chunks.slice(i, i + 16);
        const vectors = await this.embed(batch.map(c => `${c.title}\n${c.chapter}\n${c.text}`), signal);
        await this.db(`/collections/${collection}/points?wait=true`, 'PUT', { points: batch.map((payload, j) => ({ id: randomUUID(), vector: vectors[j], payload })) }, signal);
      }
      const file = path.join(this.directory, `${id}.json`);
      await writeFile(file + '.tmp', JSON.stringify(document), { mode: 0o600 });
      await rename(file + '.tmp', file);
    } catch (error) {
      await this.db(`/collections/${collection}/points/delete?wait=true`, 'POST', { filter: { must: [{ key: 'docId', match: { value: id } }] } }).catch(() => {});
      await rm(path.join(this.directory, `${id}.pdf`), { force: true });
      throw error;
    }
    const { sections, ...meta } = document; return meta;
  }
  async importURL(url, title, signal) {
    const document = await readDocument({ url, includeHTML: true }, signal);
    if (document.limit) throw new Error('This article exceeds the web reader limit. Download and upload the document instead.');
    // Store the fetched text snapshot, never execute HTML from an imported article.
    return this.upload(Buffer.from(document.rawHTML || document.sections.map(s => s.text).join('\n\n')), `${new URL(url).hostname}.${document.rawHTML ? 'html' : 'txt'}`, title, signal, document.url);
  }
  async importSite(url, title, maxPages, signal) {
    const parsed = await crawlDocumentation(url, maxPages, signal);
    const bytes = Buffer.from(JSON.stringify({ root: parsed.rootURL, sections: parsed.sections }));
    return this.upload(bytes, new URL(url).hostname + '.txt', title, signal, url, parsed);
  }
  async refresh(id, signal) {
    const old = await this.get(id);
    const fresh = old.kind === 'documentation'
      ? await this.importSite(old.rootURL, old.title, old.maxPages, signal)
      : old.originalURL ? await this.importURL(old.originalURL, old.title, signal) : null;
    if (!fresh) throw new Error('Upload a new version of this file to update it.');
    if (fresh.id !== id) {
      // Keep old snapshots for citations; hide superseded versions from retrieval.
      const file = path.join(this.directory, `${id}.json`);
      await writeFile(file + '.tmp', JSON.stringify({ ...old, archived: true, replacedBy: fresh.id }), { mode: 0o600 });
      await rename(file + '.tmp', file);
    }
    return fresh;
  }
  async remove(id) {
    await this.get(id); await this.ensure();
    await this.db(`/collections/${collection}/points/delete?wait=true`, 'POST', { filter: { must: [{ key: 'docId', match: { value: id } }] } });
    await rm(path.join(this.directory, `${id}.json`));
    await rm(path.join(this.directory, `${id}.pdf`), { force: true });
  }
  async search(query, history, ids, signal) {
    const docs = await this.list();
    const available = docs.filter(d => ids === undefined || ids.includes(d.id));
    if (!available.length) return null;
    await this.ensure();
    const context = history.filter(m => m.role === 'user').slice(-2).map(m => m.content.slice(0, 300)).join('\n');
    const [vector] = await this.embed([`${context}\n${query}`], signal);
    const result = await this.db(`/collections/${collection}/points/query`, 'POST', {
      query: vector, limit: 16, with_payload: true,
      filter: { must: [{ key: 'docId', match: { any: available.map(d => d.id) } }] }
    }, signal);
    const sources = [], documents = new Map(), groups = new Map();
    for (const hit of result.result.points) {
      const p = hit.payload;
      if (hit.score < 0.2 || !available.some(d => d.id === p.docId)) continue;
      if (!groups.has(p.chapterId)) groups.set(p.chapterId, p);
    }
    for (const p of [...groups.values()].slice(0, 6)) {
      const doc = await this.get(p.docId), id = sources.length + 1;
      const url = doc.sections.find(s => s.chapterId === p.chapterId)?.originalURL || `/api/library/${doc.id}/file`;
      sources.push({ id, url, title: `${doc.title} — ${p.chapter}`, local: url.startsWith('/'), canonical: p.chapterId, format: doc.format, readStatus: 'read', fetchedAt: doc.createdAt, evidence: [] });
      documents.set(id, { url, format: doc.format, fetchedAt: doc.createdAt, sections: doc.sections.filter(s => s.chapterId === p.chapterId), limit: '' });
    }
    return { sources, documents };
  }
}
