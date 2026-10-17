import { load } from 'cheerio';
import { normalize } from './evidence.js';
export const slug = value => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'document';

export async function parseUpload(bytes, name, signal) {
  if (bytes.subarray(0, 5).toString() === '%PDF-') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 });
    const stop = () => { task.destroy().catch(() => {}); };
    signal.addEventListener('abort', stop, { once: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 300) throw new Error('PDF limit is 300 pages. Upload a smaller volume or chapter.');
      const outline = [];
      async function visit(items, parents = []) {
        for (const item of items || []) {
          const path = [...parents, normalize(item.title).slice(0, 200)];
          try {
            const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
            if (dest?.length) outline.push({ page: (typeof dest[0] === 'number' ? dest[0] : await pdf.getPageIndex(dest[0])) + 1, title: path.join(' / ').slice(0, 300) });
          } catch { /* Some PDFs contain broken bookmarks; page labels remain usable. */ }
          await visit(item.items, path);
        }
      }
      await visit(await pdf.getOutline()); outline.sort((a, b) => a.page - b.page);
      const sections = []; let size = 0;
      for (let page = 1; page <= pdf.numPages; page++) {
        signal.throwIfAborted();
        const p = await pdf.getPage(page), content = await p.getTextContent();
        const text = normalize(content.items.map(i => i.str || '').join(' '));
        size += text.length;
        if (size > 2_000_000) throw new Error('Document text exceeds 2 million characters. Upload a smaller part.');
        const heading = outline.filter(o => o.page <= page).at(-1)?.title || `Page ${page}`;
        sections.push({ page, heading, text }); p.cleanup();
      }
      return { format: 'pdf', sections, outline: outline.length ? 'PDF bookmarks' : 'Page labels (no chapter bookmarks)' };
    } finally { signal.removeEventListener('abort', stop); await task.destroy(); }
  }
  if (!/\.(txt|md|html?|markdown)$/i.test(name)) throw new Error('Upload a PDF, TXT, Markdown, or HTML article.');
  const raw = bytes.toString('utf8');
  const sections = []; let heading = 'Introduction', lines = [];
  const flush = () => { const text = normalize(lines.join('\n')); if (text) sections.push({ page: null, heading, text }); lines = []; };
  if (/\.html?$/i.test(name)) {
    const $ = load(raw); $('script,style,nav,footer,header,aside,noscript,form').remove();
    const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
    root.find('h1,h2,h3,p,li,pre').each((_, el) => {
      if (/^h[123]$/.test(el.tagName)) { flush(); heading = normalize($(el).text()).slice(0, 300); }
      else lines.push($(el).text());
    });
    if (!lines.length && !sections.length) lines.push(root.text());
  } else {
    for (const line of raw.split('\n')) {
      const match = line.match(/^#{1,6}\s+(.+)|^(Chapter\s+\d+.*)$/i);
      if (match) { flush(); heading = (match[1] || match[2]).trim().slice(0, 300); } else lines.push(line);
    }
  }
  flush();
  if (sections.reduce((n, s) => n + s.text.length, 0) > 2_000_000) throw new Error('Document text exceeds 2 million characters.');
  return { format: 'text', sections, outline: 'Document headings' };
}

export function buildChunks(document) {
  const chapters = [], chunks = []; let previous;
  for (const section of document.sections) {
    if (!section.text.trim()) continue;
    if (!previous || previous.title !== section.heading || previous.originalURL !== section.originalURL) {
      previous = { id: `${document.canonical}/${String(chapters.length + 1).padStart(3, '0')}-${slug(section.heading)}`, title: section.heading, page: section.page, originalURL: section.originalURL };
      chapters.push(previous);
    }
    section.chapterId = previous.id;
    for (let offset = 0; offset < section.text.length; offset += 1700) {
      chunks.push({ docId: document.id, title: document.title, canonical: document.canonical, chapterId: previous.id, chapter: previous.title, page: section.page, text: section.text.slice(offset, offset + 2000) });
    }
  }
  return { chapters, chunks };
}
