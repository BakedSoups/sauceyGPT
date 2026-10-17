const $ = selector => document.querySelector(selector);
const thread = $('#thread'), input = $('#question'), status = $('#status');
let history = [], controller, busy = false, turn = 0;
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function sauceJar(className) {
  const jar = node('img', className);
  jar.src = '/sauce-jar.svg'; jar.alt = ''; jar.width = 180; jar.height = 210;
  return jar;
}
function showWelcome() {
  const welcome = node('section', 'welcome');
  welcome.append(sauceJar('welcome-jar'), node('h1', '', 'Cook ideas.'), node('p', '', 'Never forget the sauce.'));
  thread.append(welcome);
}
function safeLink(url) { try { const u = new URL(url, location.origin); return ['https:', 'http:'].includes(u.protocol) ? u.href : '#'; } catch { return '#'; } }
function externalLink(url, text, className) {
  const link = node('a', className, text);
  link.href = safeLink(url); link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}
function showEvidence(source, claim) {
  const dialog = $('#evidence-dialog'), body = $('#evidence-body');
  $('#evidence-title').textContent = source.title;
  body.replaceChildren(node('p', 'source-origin', source.local ? `Source ${source.id} · Your document library` : `Source ${source.id} · ${new URL(source.url, location.origin).hostname.replace(/^www\./, '')}`));
  const excerpts = (source.evidence || []).filter(item => !claim || item.claim === claim);
  if (excerpts.length) {
    for (const evidence of excerpts) {
      const section = node('section', 'excerpt');
      section.append(node('div', 'excerpt-label', 'For this sentence'), node('p', 'excerpt-claim', evidence.claim));
      section.append(node('div', 'excerpt-label quote-heading', 'Supporting passages'));
      for (const passage of evidence.passages || [evidence]) {
        const passageCard = node('div', 'passage');
        passageCard.append(node('blockquote', '', `“${passage.quote}”`));
        passageCard.append(externalLink(passage.locationURL, passage.page ? `View page ${passage.page} ↗` : 'View on source ↗', 'passage-link'));
        section.append(passageCard);
      }
      body.append(section);
    }
  } else {
    body.append(node('p', 'excerpt-note', source.readError || (source.readStatus === 'read' ? 'We read this source but couldn’t find a matching passage for this sentence.' : 'A matching passage isn’t available for this source.')));
  }
  const footer = node('div', 'evidence-footer');
  footer.append(externalLink(source.url, 'Read full source ↗', 'original-link'));
  const details = node('details', 'evidence-details');
  details.append(node('summary', '', 'About these excerpts'));
  if (excerpts.length) details.append(node('p', 'excerpt-note', 'These words were matched to the source text. Matching text does not by itself prove that an answer is correct.'));
  details.append(node('p', 'excerpt-note', source.format === 'pdf' ? 'Page links use PDF page numbers, which may differ from printed numbers. Navigation depends on your PDF viewer.' : '“View on source” opens the page at the quoted text when your browser and the website support highlighting.'));
  if (source.canonical) details.append(node('p', 'excerpt-note', source.canonical));
  if (source.readLimit) details.append(node('p', 'excerpt-note', source.readLimit));
  if (source.fetchedAt) details.append(node('p', 'excerpt-note', `Retrieved ${new Date(source.fetchedAt).toLocaleString()}.`));
  footer.append(details); body.append(footer);
  dialog.showModal();
}
function evidenceLink(source, text, className, claim) {
  const link = externalLink(source.url, text, className);
  link.setAttribute('aria-haspopup', 'dialog');
  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); showEvidence(source, claim);
  });
  return link;
}
function renderResult(data, container, id) {
  container.replaceChildren();
  for (const segments of data.blocks) {
    const p = node('p', 'claim');
    for (const segment of segments) {
      const sources = (segment.citations || []).map(n => data.sources.find(s => s.id === n)).filter(Boolean);
      if (!sources.length) { p.append(document.createTextNode(segment.text || '')); continue; }
      const link = evidenceLink(sources[0], segment.text, 'cited-claim', segment.text);
      link.title = sources.map(source => `[${source.id}] ${source.title}`).join('\n');
      p.append(link);
      for (const source of sources) {
        const ref = evidenceLink(source, `[${source.id}]`, 'citation', segment.text);
        ref.title = source.title; ref.setAttribute('aria-label', `Source ${source.id}: ${source.title}`);
        p.append(ref);
      }
    }
    container.append(p);
  }
  if (data.notice) container.append(node('p', 'notice', data.notice));
  if (data.sources.length) {
    const details = node('section', 'sources');
    details.append(node('h3', '', 'References'));
    const list = node('ol');
    for (const source of data.sources) {
      const item = node('li', 'source'); item.id = `source-${id}-${source.id}`;
      item.append(evidenceLink(source, source.title, 'reference-link'));
      if (!source.evidence?.length) item.append(node('span', 'reference-status', ' · excerpt unavailable'));
      list.append(item);
    }
    details.append(list); container.append(details);
  }
}
async function send(message) {
  if (busy || !message.trim()) return;
  $('.welcome')?.remove();
  busy = true; controller = new AbortController(); turn++;
  const currentTurn = turn;
  thread.append(node('div', 'message user', message));
  const output = node('article', 'message assistant'); thread.append(output);
  const workLabel = node('div', 'answer-label sauce-loading');
  workLabel.append(sauceJar('loading-jar'), node('span', '', 'Cooking up an answer…'));
  workLabel.setAttribute('role', 'status');
  output.setAttribute('aria-busy', 'true');
  output.append(workLabel);
  input.value = ''; $('#send').disabled = true; $('#stop').hidden = false;
  status.textContent = '';
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  try {
    const response = await fetch('/api/chat', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history: history.slice(-12), libraryMode: $('#library-mode').value, documentIds: [...selectedDocuments] }) });
    if (!response.ok) throw new Error((await response.json()).error || 'Request failed.');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', completed = false;
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'progress') workLabel.querySelector('span').textContent = event.message === 'Drafting an answer…' ? 'Planning what to look up…' : event.message;
        if (event.type === 'error') throw new Error(event.message);
        // Draft events guide server-side research; only the final answer is displayed.
        if (event.type === 'result') {
          renderResult(event, output, currentTurn); completed = true;
          history.push({ role: 'user', content: message }, { role: 'assistant', content: event.answer.slice(0, 8000) });
          history = history.slice(-12);
        }
      }
      if (done) break;
    }
    if (!completed) throw new Error('The connection ended before research finished. Please try again.');
  } catch (error) {
    workLabel.textContent = error.name === 'AbortError' ? 'Research stopped' : 'Research interrupted';
    output.append(node('p', 'error', error.name === 'AbortError' ? 'Research stopped. You can ask another question.' : error.message));
  } finally {
    output.removeAttribute('aria-busy');
    busy = false; $('#send').disabled = false; $('#stop').hidden = true; status.textContent = ''; input.focus();
  }
}
$('#composer').addEventListener('submit', event => { event.preventDefault(); send(input.value.trim()); });
input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#composer').requestSubmit(); } });
$('#stop').addEventListener('click', () => controller?.abort());
fetch('/api/config').then(r => r.json()).then(config => {
  if (!config.configured) { $('#setup').hidden = false; $('#setup').textContent = 'Add OPENAI_KEY or OPENAI_API_KEY to your .env file, then restart the app to begin researching.'; }
}).catch(() => { status.textContent = 'Could not connect to the server. Refresh to retry.'; });

input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; });

showWelcome();

$('#close-evidence').addEventListener('click', () => $('#evidence-dialog').close());
$('#evidence-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.currentTarget.close(); } });


let selectedDocuments = new Set(), knownDocuments = new Set();
async function loadLibrary() {
  const response = await fetch('/api/library');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  const docs = data.documents || [], ids = new Set(docs.map(d => d.id));
  selectedDocuments = new Set([...selectedDocuments].filter(id => ids.has(id)));
  for (const doc of docs) if (!knownDocuments.has(doc.id)) selectedDocuments.add(doc.id);
  knownDocuments = ids;
  $('#library-count').textContent = docs.length ? `(${docs.length})` : '';
  const list = $('#library-documents'); list.replaceChildren();
  if (!docs.length) list.append(node('p', 'excerpt-note', 'No documents yet. Add a source to start your library.'));
  for (const doc of docs) {
    const card = node('section', 'library-document'), row = node('div', 'document-row'), label = node('label');
    const check = node('input'); check.type = 'checkbox'; check.checked = selectedDocuments.has(doc.id);
    check.addEventListener('change', () => { if (check.checked) selectedDocuments.add(doc.id); else selectedDocuments.delete(doc.id); });
    label.append(check, document.createTextNode(doc.title));
    const remove = node('button', 'remove-document', 'Remove'); remove.type = 'button';
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try { const response = await fetch(`/api/library/${doc.id}`, { method: 'DELETE' }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await loadLibrary(); }
      catch (error) { $('#library-status').textContent = error.message; remove.disabled = false; }
    });
    row.append(label, remove); card.append(row, node('p', 'excerpt-note', `${doc.chunkCount} searchable passages · ${doc.outline}`));
    const toc = node('details', 'document-toc'); toc.append(node('summary', '', 'Chapters & sections'));
    const chapters = node('ol');
    for (const chapter of doc.chapters) {
      const item = node('li');
      item.append(externalLink(`/api/library/${doc.id}/file${chapter.page ? `#page=${chapter.page}` : `#:~:text=${encodeURIComponent(chapter.title)}`}`, chapter.title + (chapter.page ? ` · p. ${chapter.page}` : '')));
      item.append(node('small', '', chapter.id)); chapters.append(item);
    }
    toc.append(chapters); card.append(toc); list.append(card);
  }
}
$('#open-library').addEventListener('click', () => { $('#library-dialog').showModal(); loadLibrary().catch(e => { $('#library-status').textContent = e.message; }); });
$('#close-library').addEventListener('click', () => $('#library-dialog').close());
$('#upload-document').addEventListener('click', () => $('#document-file').click());
async function indexDocument(url, options) {
  $('#upload-document').disabled = true; $('#import-article').disabled = true;
  $('#library-status').textContent = 'Reading the document, mapping sections, and indexing passages…';
  try {
    const response = await fetch(url, options), data = await response.json();
    if (!response.ok) throw new Error(data.error);
    $('#library-status').textContent = data.duplicate ? 'Already indexed — ready to use.' : `Ready — ${data.chunkCount} passages across ${data.chapters.length} sections.`;
    $('#document-title').value = ''; $('#article-url').value = ''; await loadLibrary();
  } catch (error) { $('#library-status').textContent = error.message; }
  finally { $('#upload-document').disabled = false; $('#import-article').disabled = false; $('#document-file').value = ''; }
}
$('#document-file').addEventListener('change', () => {
  const file = $('#document-file').files[0]; if (!file) return;
  if (file.size > 20 * 1024 * 1024) { $('#library-status').textContent = 'Please choose a file under 20 MB.'; return; }
  indexDocument('/api/library/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name), 'X-Document-Title': encodeURIComponent($('#document-title').value) }, body: file });
});
$('#article-form').addEventListener('submit', event => {
  event.preventDefault(); indexDocument('/api/library/article', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: $('#article-url').value, title: $('#document-title').value }) });
});
loadLibrary().catch(() => {});
