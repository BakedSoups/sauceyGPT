import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { Researcher } from './research.js';
import { Library } from './library.js';
import path from 'node:path';

export function createApp(researcher, configured = true, library = researcher.library) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Local app: block cross-site requests and DNS-rebinding hostnames.
    if (!['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) return res.status(403).json({ error: 'Use localhost to access this app.' });
    if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.headers.host}`) return res.status(403).json({ error: 'Cross-origin requests are disabled.' });
    next();
  });
  app.use(express.json({ limit: '48kb' }));
  app.get('/api/config', (_, res) => res.json({ configured, provider: 'OpenAI web search' }));
  let active = false, indexing = false;
  app.get('/api/library', async (req, res) => {
    try { res.json({ documents: library ? await library.list() : [], enabled: Boolean(library) }); }
    catch { res.status(503).json({ error: 'Could not read the document library.' }); }
  });
  const ingest = handler => async (req, res) => {
    if (!configured || !library) return res.status(503).json({ error: 'Configure an OpenAI key to index documents.' });
    if (indexing) return res.status(429).json({ error: 'Another document is being indexed. Please wait.' });
    indexing = true;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 240000);
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try { res.json(await handler(req, controller.signal)); }
    catch (error) { res.status(400).json({ error: controller.signal.aborted ? 'Indexing stopped or timed out. Try a smaller document.' : error.message }); }
    finally { indexing = false; clearTimeout(timer); }
  };
  app.post('/api/library/upload', express.raw({ type: 'application/octet-stream', limit: '20mb' }), ingest((req, signal) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('Choose a document to upload.');
    const name = decodeURIComponent(req.get('X-Filename') || 'document.txt');
    const title = decodeURIComponent(req.get('X-Document-Title') || '').slice(0, 180);
    return library.upload(req.body, name, title, signal);
  }));
  app.post('/api/library/article', ingest((req, signal) => {
    if (typeof req.body?.url !== 'string' || req.body.url.length > 4000 || (req.body.title && typeof req.body.title !== 'string')) throw new Error('Enter a valid article URL and title.');
    return library.importURL(req.body.url, req.body.title, signal);
  }));
  app.post('/api/library/site', ingest((req, signal) => {
    const { url, title, maxPages = 10 } = req.body || {};
    if (typeof url !== 'string' || url.length > 4000 || (title && typeof title !== 'string')) throw new Error('Enter a documentation URL and name.');
    return library.importSite(url, title, maxPages, signal);
  }));
  app.post('/api/library/:id/refresh', ingest((req, signal) => library.refresh(req.params.id, signal)));
  app.delete('/api/library/:id', async (req, res) => {
    if (!library) return res.status(503).json({ error: 'Library unavailable.' });
    if (indexing || active) return res.status(409).json({ error: 'Wait for indexing or the current answer to finish before removing a document.' });
    indexing = true;
    try { await library.remove(req.params.id); res.json({ removed: true }); }
    catch (error) { res.status(400).json({ error: error.message }); }
    finally { indexing = false; }
  });
  app.get('/api/library/:id/file', async (req, res) => {
    try {
      const doc = await library.get(req.params.id);
      res.setHeader('Cache-Control', 'no-store');
      if (doc.format === 'pdf') return res.sendFile(path.join(library.directory, `${doc.id}.pdf`), { dotfiles: 'allow' });
      res.type('text/plain').send(doc.sections.map(s => `${s.heading}\n\n${s.text}`).join('\n\n'));
    } catch { res.status(404).type('text/plain').send('Document not found.'); }
  });
  app.post('/api/chat', async (req, res) => {
    if (!configured) return res.status(503).json({ error: 'Set OPENAI_KEY or OPENAI_API_KEY in .env, then restart the server.' });
    const { message, history = [], libraryMode = 'prefer', documentIds } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || message.length > 4000 || !Array.isArray(history) || history.length > 12 || history.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 8000)) return res.status(400).json({ error: 'Enter a question under 4,000 characters with valid conversation history.' });
    if (!['prefer', 'only', 'off'].includes(libraryMode) || (documentIds !== undefined && (!Array.isArray(documentIds) || documentIds.length > 100 || documentIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))))) return res.status(400).json({ error: 'Invalid library selection.' });
    if (active) return res.status(429).json({ error: 'A research request is already running. Please wait or stop it first.' });
    active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Research timed out. Please try a narrower question.')), 240000);
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-store');
    res.flushHeaders();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const emit = data => { if (!res.destroyed) res.write(JSON.stringify(data) + '\n'); };
    try { emit({ type: 'result', ...(await researcher.run(message.trim(), history, emit, controller.signal, { libraryMode, documentIds })) }); }
    catch (error) { emit({ type: 'error', message: controller.signal.aborted ? 'Research stopped or timed out. Please retry.' : error.message }); }
    finally { clearTimeout(timer); active = false; res.end(); }
  });
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.status === 413 ? 'Request is too large.' : 'Invalid request.' }));
  return app;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const key = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY;
  const library = new Library({ key });
  const researcher = new Researcher({ key, model: process.env.OPENAI_MODEL || 'gpt-5.5', library });
  const port = Number(process.env.PORT || 3000);
  createApp(researcher, Boolean(key)).listen(port, '127.0.0.1', error => {
    if (error) { console.error(`Could not start on port ${port}: ${error.message}`); process.exitCode = 1; return; }
    console.log(`SauceyGPT: http://localhost:${port}${key ? '' : ' — add your API key to .env to research'}`);
  });
}
