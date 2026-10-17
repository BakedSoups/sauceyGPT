import { load } from 'cheerio';
import { readDocument } from './evidence.js';
import { parseUpload } from './library-import.js';

// Deliberately bounded: follow documentation links, never the whole domain.
export async function crawlDocumentation(start, maxPages, signal, reader = readDocument) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 30) throw new Error('Choose between 1 and 30 pages.');
  const root = new URL(start);
  if (!['http:', 'https:'].includes(root.protocol) || root.username || root.password) throw new Error('Enter a public documentation URL.');
  root.hash = ''; root.search = '';
  const prefix = root.pathname.endsWith('/') ? root.pathname : root.pathname.slice(0, root.pathname.lastIndexOf('/') + 1);
  const queue = [root.href], seen = new Set(), sections = [], pages = [], failures = [];
  let size = 0;
  while (queue.length && pages.length < maxPages && seen.size < maxPages * 3) {
    signal.throwIfAborted();
    const url = queue.shift(); if (seen.has(url)) continue; seen.add(url);
    try {
      const page = await reader({ url, includeHTML: true }, signal);
      const final = new URL(page.url || url);
      if (final.origin !== root.origin || !final.pathname.startsWith(prefix)) throw new Error('Redirect left the documentation scope.');
      if (!page.rawHTML || page.limit) throw new Error('Page is not complete readable HTML.');
      const $ = load(page.rawHTML);
      const parsed = await parseUpload(Buffer.from(page.rawHTML), 'page.html', signal);
      if (!parsed.sections.some(s => s.text.length > 30)) throw new Error('No readable content.');
      const title = ($('h1').first().text() || $('title').text() || final.pathname).trim().slice(0, 150);
      const added = parsed.sections.reduce((n, s) => n + s.text.length, 0);
      if (size + added > 2_000_000) break;
      size += added;
      pages.push({ url: final.href, title });
      sections.push(...parsed.sections.map(s => ({ ...s, heading: `${title} / ${s.heading}`.slice(0, 300), originalURL: final.href })));
      $('a[href]').each((_, el) => {
        try {
          const link = new URL($(el).attr('href'), final); link.hash = '';
          if (link.origin !== root.origin || !link.pathname.startsWith(prefix) || link.search || /\.(pdf|zip|png|jpg|svg|gif|css|js|xml)$/i.test(link.pathname)) return;
          if (!seen.has(link.href) && !queue.includes(link.href) && queue.length < 3000) queue.push(link.href);
        } catch { /* malformed link */ }
      });
    } catch (error) { signal.throwIfAborted(); failures.push({ url, error: error.message }); }
  }
  if (!pages.length) throw new Error(`Could not read this documentation: ${failures[0]?.error || 'no readable pages'}`);
  return { format: 'text', outline: 'Documentation pages and headings', sections, kind: 'documentation', rootURL: root.href, maxPages, pages, pageCount: pages.length, failures, scope: root.origin + prefix, partial: queue.length > 0 || failures.length > 0 };
}
