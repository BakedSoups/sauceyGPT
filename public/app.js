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
// Seed the assignment from the source identity so its look survives reloads and site refreshes.
function shelfSauce(doc) {
  let seed = 2166136261;
  for (const char of (doc.originalURL || doc.id)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const shapes = [
    { name: 'cylinder', body: 'M27 32H93V96Q93 109 60 109Q27 109 27 96Z', lid: [24, 20, 72] },
    { name: 'round-jar', body: 'M31 32H89V43Q101 51 101 76V92Q101 109 60 109Q19 109 19 92V76Q19 51 31 43Z', lid: [28, 20, 64] },
    { name: 'tall-jar', body: 'M32 27H88V96Q88 110 60 110Q32 110 32 96Z', lid: [29, 15, 62] },
    { name: 'square-jar', body: 'M29 32H91Q99 40 99 49V96Q99 108 87 108H33Q21 108 21 96V49Q21 40 29 32Z', lid: [26, 20, 68] },
    { name: 'tapered-jar', body: 'M23 32H97L89 97Q87 109 60 109Q33 109 31 97Z', lid: [20, 20, 80] },
    { name: 'wide-jar', body: 'M22 39H98V96Q98 109 60 109Q22 109 22 96Z', lid: [19, 27, 82] }
  ];
  const colors = ['#EC7763', '#EAB64C', '#86BE74', '#50C5D5', '#7C9CEB', '#AE8AD6', '#E58EB4', '#EFA36B'];
  const shape = shapes[seed % shapes.length], color = colors[(seed >>> 8) % colors.length];
  const [lidX, lidY, lidWidth] = shape.lid;
  const liquidTop = 45 + ((seed >>> 16) % 10);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 126" fill="none">
    <defs><clipPath id="glass"><path d="${shape.body}"/></clipPath></defs>
    <ellipse cx="60" cy="117" rx="36" ry="5" fill="#57351F" opacity=".08"/>
    <path d="${shape.body}" fill="#F4DCC1" stroke="#714B35" stroke-width="2"/>
    <g clip-path="url(#glass)">
      <path d="M26 ${liquidTop}H94V96Q94 105 60 105Q26 105 26 96Z" fill="${color}"/>
      <ellipse cx="60" cy="${liquidTop}" rx="34" ry="6" fill="${color}"/>
      <ellipse cx="60" cy="${liquidTop - 1}" rx="33" ry="5" fill="white" opacity=".16"/>
      <path d="M26 68Q60 75 94 68V94Q60 101 26 94Z" fill="#FFF7E7"/>
    </g>
    <ellipse cx="49" cy="82" rx="2.5" ry="3.5" fill="#171717"/>
    <ellipse cx="71" cy="82" rx="2.5" ry="3.5" fill="#171717"/>
    <path d="M54 90Q60 96 66 90" stroke="#593B2D" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="42" cy="90" rx="3.5" ry="2" fill="#DE9B82" opacity=".6"/>
    <ellipse cx="78" cy="90" rx="3.5" ry="2" fill="#DE9B82" opacity=".6"/>
    <path d="M35 41V57" stroke="#FFF8EC" stroke-width="3" stroke-linecap="round"/>
    <rect x="${lidX}" y="${lidY}" width="${lidWidth}" height="14" rx="5" fill="#7B8B65" stroke="#536149" stroke-width="2"/>
    <ellipse cx="60" cy="${lidY}" rx="${lidWidth / 2}" ry="6" fill="#98A783" stroke="#536149" stroke-width="2"/>
    <path d="M${lidX + 9} ${lidY + 5}v5m10-5v5m10-5v5m10-5v5m10-5v5" stroke="#C5CEAD" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  const img = node('img', 'shelf-jar'); img.alt = ''; img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  img.dataset.shape = shape.name; img.dataset.color = color;
  return img;
}
function showWelcome() {
  const welcome = node('section', 'welcome');
  const jars = node('div', 'welcome-sauces'); jars.append(sauceJar('welcome-jar'));
  welcome.append(jars, node('h1', '', 'Cook ideas.'), node('p', '', 'Never forget the sauce.'));
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
  let stepNumber = 0;
  for (const segments of data.blocks) {
    const isCode = segments[0]?.kind === 'code';
    const p = node(isCode ? 'section' : 'p', isCode ? 'code-example' : 'claim');
    if (segments[0]?.kind === 'step') p.append(node('span', 'step-number', `${++stepNumber}. `));
    if (isCode) p.append(node('div', 'code-label', `Illustrative example${segments[0].language ? ' · ' + segments[0].language : ''}`));
    for (const segment of segments) {
      const sources = (segment.citations || []).map(n => data.sources.find(s => s.id === n)).filter(Boolean);
      if (!sources.length) { p.append(document.createTextNode(segment.text || '')); continue; }
      if (isCode) {
        const pre = node('pre'); pre.append(node('code', '', segment.text)); p.append(pre);
        p.append(node('span', 'code-source-label', 'API details supported by '));
      } else {
        const link = evidenceLink(sources[0], segment.text, 'cited-claim', segment.text);
        link.title = sources.map(source => `[${source.id}] ${source.title}`).join('\n');
        p.append(link);
      }
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
  if (mentionMatch()) { status.textContent = 'Choose a sauce from the list, or remove use:.'; return; }
  const turnSauces = [...messageSauces], displayedMessage = message;
  for (const doc of turnSauces) message = message.replaceAll(`using: ${sauceName(doc)};`, '').trim();
  if (!message) { status.textContent = 'Add a question after the sauce name.'; return; }
  $('.welcome')?.remove();
  busy = true; controller = new AbortController(); turn++;
  const currentTurn = turn;
  thread.append(node('div', 'message user', (turnSauces.length && displayedMessage === message ? 'Using ' + turnSauces.map(sauceName).join(', ') + '\n' : '') + displayedMessage));
  const output = node('article', 'message assistant'); thread.append(output);
  const workLabel = node('div', 'answer-label sauce-loading');
  for (const doc of turnSauces) { const mascot = shelfSauce(doc); mascot.classList.add('selected-loading-sauce'); mascot.title = sauceName(doc); workLabel.append(mascot); }
  workLabel.append(sauceJar('loading-jar'), node('span', '', 'Cooking up an answer…'));
  if (turnSauces.length) output.append(node('p', 'using-label', 'Using ' + turnSauces.map(sauceName).join(', ')));
  workLabel.setAttribute('role', 'status');
  output.setAttribute('aria-busy', 'true');
  output.append(workLabel);
  input.value = ''; renderMessageSauces(); hideSaucePicker(); $('#send').disabled = true; $('#stop').hidden = false;
  status.textContent = '';
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  try {
    const response = await fetch('/api/chat', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history: history.slice(-12), libraryMode: turnSauces.length ? 'prefer' : $('#library-mode').value, documentIds: turnSauces.length ? turnSauces.map(d => d.id) : [...selectedDocuments] }) });
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
input.addEventListener('keydown', event => { if (event.defaultPrevented) return; if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#composer').requestSubmit(); } });
$('#stop').addEventListener('click', () => controller?.abort());
fetch('/api/config').then(r => r.json()).then(config => {
  if (!config.configured) { $('#setup').hidden = false; $('#setup').textContent = 'Add OPENAI_KEY or OPENAI_API_KEY to your .env file, then restart the app to begin researching.'; }
}).catch(() => { status.textContent = 'Could not connect to the server. Refresh to retry.'; });

input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; });

showWelcome();

$('#close-evidence').addEventListener('click', () => $('#evidence-dialog').close());
$('#evidence-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.currentTarget.close(); } });


let selectedDocuments = new Set(), knownDocuments = new Set(), shelfDocuments = [], shelfFilter = 'all';
try {
  const saved = JSON.parse(localStorage.getItem('source-shelf') || '{}');
  selectedDocuments = new Set(saved.selected || []); knownDocuments = new Set(saved.known || []);
} catch { /* Storage may be unavailable. */ }
function saveShelf() {
  try { localStorage.setItem('source-shelf', JSON.stringify({ selected: [...selectedDocuments], known: [...knownDocuments] })); } catch {}
}
async function loadLibrary() {
  const response = await fetch('/api/library'), data = await response.json();
  if (!response.ok) throw new Error(data.error);
  shelfDocuments = data.documents || [];
  const ids = new Set(shelfDocuments.map(d => d.id));
  selectedDocuments = new Set([...selectedDocuments].filter(id => ids.has(id)));
  for (const doc of shelfDocuments) if (!knownDocuments.has(doc.id)) selectedDocuments.add(doc.id);
  knownDocuments = ids; saveShelf(); renderShelf();
}
function renderShelf() {
  $('#library-count').textContent = shelfDocuments.length ? `(${selectedDocuments.size} active)` : '';
  const list = $('#library-documents'); list.replaceChildren();
  const query = $('#sauce-search').value.trim().toLowerCase();
  const matching = shelfDocuments.filter(d => [d.title, d.originalURL || '', ...d.chapters.map(c => c.title)].join(' ').toLowerCase().includes(query));
  for (const button of document.querySelectorAll('[data-shelf]')) button.setAttribute('aria-pressed', String(button.dataset.shelf === shelfFilter));
  $('#sauce-search').placeholder = shelfFilter === 'all' ? 'Search sauces or chapters…' : `Search the ${shelfFilter} shelf…`;
  for (const active of [true, false]) {
    if (shelfFilter !== 'all' && shelfFilter !== (active ? 'top' : 'bottom')) continue;
    const shelf = node('section', 'sauce-shelf');
    shelf.append(node('h3', '', active ? 'Top shelf' : 'Bottom shelf'));
    const grid = node('div', 'sauce-grid');
    const docs = matching.filter(d => selectedDocuments.has(d.id) === active);
    if (!docs.length) shelf.append(node('p', 'excerpt-note', query ? 'No matching sauces.' : active ? 'Choose a sauce below, or add your first one.' : 'All your sauces are on the top shelf.'));
    for (const doc of docs) {
      const card = node('article', 'sauce-card');
      const toggle = node('button', 'sauce-toggle'); toggle.type = 'button'; toggle.setAttribute('aria-pressed', String(active));
      toggle.setAttribute('aria-label', doc.title);
      toggle.title = active ? 'Move to bottom shelf' : 'Move to top shelf';
      toggle.append(shelfSauce(doc), node('strong', '', doc.title));
      toggle.addEventListener('click', () => { if (active) selectedDocuments.delete(doc.id); else selectedDocuments.add(doc.id); if (shelfFilter !== 'all') shelfFilter = active ? 'bottom' : 'top'; saveShelf(); renderShelf(); });
      card.append(toggle);
      const info = node('button', 'sauce-info-button', 'i'); info.type = 'button'; info.setAttribute('aria-label', `About ${doc.title}`);
      info.addEventListener('click', () => showSauceInfo(doc)); card.append(info); grid.append(card);
    }
    shelf.append(grid); list.append(shelf);
  }
}
function showSauceInfo(doc) {
      const dialog = $('#sauce-info-dialog'), card = $('#sauce-info-body');
      $('#sauce-info-title').textContent = doc.title;
      card.replaceChildren(shelfSauce(doc), node('p', 'excerpt-note', `${doc.pageCount ? doc.pageCount + ' pages · ' : ''}${doc.chunkCount} passages`));
      const toc = node('details', 'document-toc'); toc.append(node('summary', '', 'Inside this sauce'));
      if (doc.rootURL) toc.append(node('p', 'excerpt-note', `${doc.partial ? 'Partial collection' : 'Collected linked pages'} · limit ${doc.maxPages} pages · ${doc.failures?.length || 0} unreadable pages`));
      const chapters = node('ol');
      for (const chapter of doc.chapters) {
        const item = node('li');
        item.append(externalLink(chapter.originalURL || `/api/library/${doc.id}/file${chapter.page ? `#page=${chapter.page}` : `#:~:text=${encodeURIComponent(chapter.title)}`}`, chapter.title + (chapter.page ? ` · p. ${chapter.page}` : '')));
        chapters.append(item);
      }
      toc.append(chapters); card.append(toc);
      const actions = node('div', 'sauce-actions');
      if (doc.originalURL) {
        const refresh = node('button', 'remove-document', 'Refresh'); refresh.type = 'button';
        refresh.addEventListener('click', async () => { refresh.disabled = true; await indexDocument(`/api/library/${doc.id}/refresh`, { method: 'POST' }); refresh.disabled = false; dialog.close(); });
        actions.append(refresh);
      }
      const remove = node('button', 'remove-document delete-sauce', 'Delete'); remove.type = 'button';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { const response = await fetch(`/api/library/${doc.id}`, { method: 'DELETE' }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await loadLibrary(); dialog.close(); }
        catch (error) { let errorLabel = card.querySelector('.error'); if (!errorLabel) { errorLabel = node('p', 'error'); card.append(errorLabel); } errorLabel.textContent = error.message; remove.disabled = false; }
      });
      actions.append(remove); card.append(actions); dialog.showModal();
}
$('#close-sauce-info').addEventListener('click', () => $('#sauce-info-dialog').close());
for (const button of document.querySelectorAll('[data-shelf]')) button.addEventListener('click', () => { shelfFilter = button.dataset.shelf; renderShelf(); });
$('#sauce-search').addEventListener('input', renderShelf);
function showShelfView(adding = false) {
  $('#shelf-view').hidden = adding; $('#add-sauce-view').hidden = !adding;
  $('#add-sauce').hidden = adding;
  $('#library-title').textContent = adding ? 'Add a sauce' : 'Source shelf';
  $('#library-dialog').scrollTop = 0;
  (adding ? $('#document-title') : $('#sauce-search')).focus();
}
$('#add-sauce').addEventListener('click', () => showShelfView(true));
$('#back-to-shelf').addEventListener('click', () => showShelfView(false));
$('#open-library').addEventListener('click', () => { $('#library-dialog').showModal(); showShelfView(false); loadLibrary().catch(e => { $('#library-status').textContent = e.message; }); });
$('#close-library').addEventListener('click', () => $('#library-dialog').close());
$('#upload-document').addEventListener('click', () => $('#document-file').click());
async function indexDocument(url, options) {
  $('#upload-document').disabled = true; $('#import-article').disabled = true; $('#import-site').disabled = true;
  $('#library-status').textContent = 'Reading sources, mapping sections, and saving searchable passages…';
  try {
    const response = await fetch(url, options), data = await response.json();
    if (!response.ok) throw new Error(data.error);
    $('#library-status').textContent = data.duplicate ? 'Already indexed — ready to use.' : `Ready — ${data.pageCount ? data.pageCount + " pages, " : ""}${data.chunkCount} passages across ${data.chapters.length} sections.${data.partial ? " This is a partial site collection." : ""}`;
    $('#document-title').value = ''; $('#article-url').value = ''; $('#site-url').value = ''; await loadLibrary(); shelfFilter = 'all'; $('#sauce-search').value = ''; renderShelf(); showShelfView(false);
  } catch (error) { $('#library-status').textContent = error.message; }
  finally { $('#upload-document').disabled = false; $('#import-article').disabled = false; $('#import-site').disabled = false; $('#document-file').value = ''; }
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

$('#site-form').addEventListener('submit', event => {
  event.preventDefault(); indexDocument('/api/library/site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: $('#site-url').value, title: $('#document-title').value, maxPages: Number($('#site-limit').value) }) });
});
for (const button of document.querySelectorAll('[data-site]')) button.addEventListener('click', () => {
  const presets = {
    pandas: ['pandas documentation', 'https://pandas.pydata.org/docs/user_guide/index.html'],
    godot: ['Godot documentation', 'https://docs.godotengine.org/en/stable/getting_started/step_by_step/index.html'],
    klaviyo: ['Klaviyo documentation', 'https://developers.klaviyo.com/en/docs/get_started']
  };
  const [title, url] = presets[button.dataset.site];
  $('#document-title').value = title; $('#site-url').value = url;
  $('#site-url').focus();
});

// using: selects sources for this message; the actual question stays clean.
let messageSauces = [], pickerIndex = 0, pickerMatches = [];
function mentionMatch() { return /(?:^|\s)(?:use|using)\s*:\s*([^;\n]*)$/i.exec(input.value.slice(0, input.selectionStart)); }
function hideSaucePicker() {
  $('#sauce-picker').hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
}
function sauceName(doc) { return doc.title.replace(/\s+(documentation|docs)$/i, '').replace(/\s+sauce$/i, '') + ' sauce'; }
function renderMessageSauces() {
  const holder = $('#message-sauces'); holder.replaceChildren();
  holder.hidden = messageSauces.length > 0 && messageSauces.every(d => input.value.includes(`using: ${sauceName(d)};`));
  for (const doc of messageSauces) {
    const chip = node('button', 'sauce-chip'); chip.append(shelfSauce(doc), node('span', '', `Using ${sauceName(doc)} ×`)); chip.type = 'button'; chip.setAttribute('aria-label', `Remove ${doc.title}`);
    chip.addEventListener('click', () => { messageSauces = messageSauces.filter(d => d.id !== doc.id); input.value = input.value.replaceAll(`using: ${sauceName(doc)};`, '').trim(); renderMessageSauces(); input.focus(); }); holder.append(chip);
  }
  $('#library-mode').disabled = messageSauces.length > 0;
  const lineup = $('.welcome-sauces');
  if (lineup) { lineup.replaceChildren(); for (const doc of messageSauces) { const mascot = shelfSauce(doc); mascot.classList.add('welcome-selected-sauce'); lineup.append(mascot); } lineup.append(sauceJar('welcome-jar')); }
}
function chooseSauce(doc) {
  const match = mentionMatch(); if (!match) return;
  const caret = input.selectionStart;
  const prefix = input.value.slice(0, match.index) + (/^\s/.test(match[0]) ? match[0][0] : '');
  const inserted = `using: ${sauceName(doc)}; `;
  input.value = prefix + inserted + input.value.slice(caret);
  if (!messageSauces.some(d => d.id === doc.id)) messageSauces.push(doc);
  input.focus(); input.setSelectionRange(prefix.length + inserted.length, prefix.length + inserted.length);
  renderMessageSauces(); hideSaucePicker(); input.dispatchEvent(new Event('input'));
}
function updateSaucePicker() {
  const match = mentionMatch(); if (!match) { hideSaucePicker(); return; }
  const query = match[1].trim().toLowerCase();
  pickerMatches = shelfDocuments.filter(d => !messageSauces.some(chosen => chosen.id === d.id) && [d.title, ...d.chapters.map(c => c.title)].join(' ').toLowerCase().includes(query))
    .sort((a, b) => Number(selectedDocuments.has(b.id)) - Number(selectedDocuments.has(a.id)));
  pickerIndex = Math.min(pickerIndex, Math.max(0, pickerMatches.length - 1));
  const list = $('#sauce-picker'); list.replaceChildren(); list.hidden = false; input.setAttribute('aria-expanded', 'true');
  if (!pickerMatches.length) list.append(node('div', 'picker-empty', shelfDocuments.length ? 'No matching sauces.' : 'Add a sauce in Source shelf first.'));
  pickerMatches.forEach((doc, index) => {
    const option = node('div', 'sauce-option'); option.id = `sauce-option-${index}`; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(index === pickerIndex));
    option.append(shelfSauce(doc), node('span', '', doc.title));
    option.addEventListener('mousedown', event => event.preventDefault()); option.addEventListener('click', () => chooseSauce(doc)); list.append(option);
  });
  if (pickerMatches.length) { input.setAttribute('aria-activedescendant', `sauce-option-${pickerIndex}`); list.children[pickerIndex].scrollIntoView({ block: 'nearest' }); }
  else input.removeAttribute('aria-activedescendant');
}
input.addEventListener('input', () => { pickerIndex = 0; renderMessageSauces(); updateSaucePicker(); });
input.addEventListener('click', updateSaucePicker);
input.addEventListener('keydown', event => {
  if ($('#sauce-picker').hidden || event.isComposing) return;
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault(); pickerIndex = (pickerIndex + (event.key === 'ArrowDown' ? 1 : -1) + pickerMatches.length) % (pickerMatches.length || 1); updateSaucePicker();
  } else if (['Enter', 'Tab'].includes(event.key) && pickerMatches.length) { event.preventDefault(); chooseSauce(pickerMatches[pickerIndex]); }
  else if (event.key === 'Escape') { event.preventDefault(); hideSaucePicker(); }
}, true);
document.addEventListener('click', event => { if (!$('#composer').contains(event.target) && !$('#sauce-picker').contains(event.target)) hideSaucePicker(); });
