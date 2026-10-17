# SauceyGPT

**A quick answer, followed by supporting references.** The minimal interface starts with a sauce jar and “Cook ideas. Never forget the sauce.” The conversation begins empty. While researching, an animated cylindrical jar with a face shows the actual current step until the final result is ready.

The app drafts internally from the model’s existing knowledge, then uses OpenAI web search to revise it and add clickable citations. While working, the chat shows a sauce jar with the current research step. The final result replaces it; draft answers remain hidden.

## We read this and thought it was cool. Please read it.

[CiteGuard: Faithful Citation Attribution for LLMs via Retrieval-Augmented Validation](https://aclanthology.org/2026.acl-long.282/) — Yee Man Choi, Xuehang Guo, Yi R. Fung, and Qingyun Wang, ACL 2026 (July). [Paper PDF](https://aclanthology.org/2026.acl-long.282.pdf).

The paper explores retrieval-aware citation validation: does a citation align with the evidence a human would cite? We thought that was cool and wanted to make an app inspired by the idea. This project is an independent prototype, not a reproduction of CiteGuard or an implementation of its benchmark results.

Also worth reading:

- [RARR: Researching and Revising What Language Models Say, Using Language Models](https://aclanthology.org/2023.acl-long.910/) (ACL 2023): directly relevant to the draft-first flow—find evidence after generation, then revise unsupported content. This app follows that broad idea, not the paper’s full implementation.
- [Enabling Large Language Models to Generate Text with Citations (ALCE)](https://aclanthology.org/2023.emnlp-main.398/) (EMNLP 2023): evaluates fluency, correctness, and citation quality separately. A working link alone does not establish that a claim is supported.

- [Evaluating and Guarding Citation Faithfulness in Agentic Scientific Synthesis](https://arxiv.org/abs/2607.20527) (2026 preprint): citation evaluators can disagree, so an automated verification pass needs its own evaluation. This app does **not** implement the paper’s calibrated statistical guarantees.
- [Correctness is not Faithfulness in Retrieval Augmented Generation Attributions](https://staff.fnwi.uva.nl/m.derijke/wp-content/papercite-data/pdf/wallat-2025-correctness.pdf) (2025): a citation can support a statement without demonstrating that the model actually relied on it.

These are relevant recent papers found while building the app; without a specific title, we cannot be certain which paper originally prompted the idea.

## Applying this to a real conversation

We also read these and thought they were useful—please read them:

- [CORAL: Benchmarking Multi-turn Conversational Retrieval-Augmentation Generation](https://arxiv.org/abs/2410.23090) (2024): evaluates passage retrieval, response generation, and citation labeling in conversations, including topic shifts.
- [mtRAG](https://aclanthology.org/2025.tacl-1.36/) (TACL 2025): a human-generated benchmark covering later turns, questions that depend on context, unanswerable questions, and multiple domains.

Our design takeaway: use conversation history to understand the question, but do not treat an earlier assistant answer as source evidence. Search and check the current answer again. RARR motivates researching and correcting drafts; ALCE motivates evaluating answer quality and citation support separately. These are design influences, not benchmarks this app has passed.

Run `node scripts/live-chat-check.js` against the running server (defaults to port 3001; override with `APP_URL`) for a billable browser test. It starts an empty conversation, asks about Napoleon, follows up using “he” and “that battle,” then changes topic to seasons. It checks that final citations have matching claim excerpts and that clicking a citation displays a quote. Results and a screenshot are saved to `/tmp/sauceygpt-live-chat-results.json` and `/tmp/sauceygpt-live-chat.png`. Set `BROWSER_EXECUTABLE` if Chromium is installed outside Playwright’s default location. This small smoke test is not a factual-accuracy benchmark; review its answers and supporting passages too.

## Deeper research review — 16 October 2026

Update: the app now implements draft → search → read → rewrite from source text → verify rewritten claims. The broader experiments below remain proposals; no benchmark accuracy improvement is claimed. The review examined paper methods, limitations, and selected public implementations; it did not reproduce their experiments.

| Work | Relevant finding or method | Scope and limitation |
| --- | --- | --- |
| [Attribute First, then Generate](https://aclanthology.org/2024.acl-long.182.pdf), ACL 2024 | Select verbatim spans, plan sentences, then generate from those spans. | Shorter excerpts helped human verification; generation costs more, and narrow excerpts sometimes omit needed support. |
| [ALCE](https://aclanthology.org/2023.emnlp-main.398.pdf), EMNLP 2023; [evaluation code](https://github.com/princeton-nlp/ALCE/blob/main/eval.py) | Evaluate answer quality, citation coverage, and citation relevance separately; test joint support from multiple sources. | Its automated entailment metric has documented partial-support limitations. |
| [Correctness is not Faithfulness](https://arxiv.org/pdf/2412.18004), preprint underlying ICTIR 2025 work | Supporting a claim and causally influencing the model are different properties. | A matched quote does not establish which information caused an answer. |
| [SelfCite](https://sls.csail.mit.edu/publications/2025/YChuang_ICML_2025.pdf), ICML 2025 | Remove or isolate cited context and measure answer-probability changes. | Its method requires model probability access; it is not simply a verification prompt. |
| [CiteGuard](https://aclanthology.org/2026.acl-long.282.pdf), ACL 2026 | Retrieve scientific references using additional context and full-text search. | Reference recovery/alignment is a different task from validating every clause in open-domain chat. |
| [Ai2 Scholar QA](https://arxiv.org/html/2504.10861v1), 2025 | Retrieve and rank passages, synthesize answers, expose excerpts through citations. | A useful implemented precedent, designed for scientific literature synthesis. |
| [Evaluating and Guarding Citation Faithfulness](https://arxiv.org/html/2607.20527v1), 2026 preprint | Evaluate verifiers against human labels; calibrate detection rather than trusting a judge alone. | Reported guarantees depend on calibration/deployment assumptions; thresholds do not transfer automatically to harder unsupported examples. |

Implementation references: [Attribute First code](https://github.com/lovodkin93/attribute-first-then-generate) includes both three-stage and two-stage prompting pipelines; [PaperQA](https://github.com/Future-House/paper-qa) provides document caching, contextual evidence ranking/summarization, and iterative retrieval. These are references, not added dependencies.

### Findings from the pre-rewrite code review (historical)

- `attachEvidence` considers only segments that already carry citations. Completely uncited factual claims are outside its verification coverage.
- The model must approve each claim/source pair independently. Two complementary sources cannot jointly establish a compound sentence unless each alone supports it. Prefer splitting the sentence; support evidence sets for genuinely combined claims.
- Failed matching removes a citation but preserves the assertion. A final repair step should narrow, remove, or explicitly qualify unsupported content, followed by checking any changed text again.
- Exact quote matching establishes text presence, not entailment. The model judge can still overlook an unsupported number, cause, qualifier, or date.
- Relevant windows use keyword overlap and fixed character boundaries. Paraphrases and nearby necessary context can be missed. Reading errors must remain distinct from contradictory evidence.
- The browser retains answer text but not evidence in follow-up context. Reusing evidence would require a server-controlled source store with provenance and freshness checks; client-supplied citations must not be trusted as verification.
- The live browser check proves that the flow and citation dialogs work. Three familiar questions and lexical assertions do not establish factual accuracy.

### Proposed experiment and acceptance criteria

Compare the current pipeline with: resolve the current question → retrieve/read sources → select exact passages → compose concise claims referencing server-assigned evidence IDs → check all externally verifiable claims → perform at most one targeted repair/search round. Keep greetings, user preferences, and clearly labeled analogies outside factual citation requirements. Preserve surrounding source context for checking and let readers expand it.

Use a fixed, human-reviewed evaluation set: 20 conversations of 4–6 turns, spanning history, science, software, current facts, and ambiguous questions. Include wrong user premises, topic changes, contradictory sources, fabricated quotations, inaccessible pages, and evidence that supports only half a sentence. Use frozen source fixtures for repeatable comparisons and a separate live-web set for access/freshness failures. Keep prompt-tuning cases separate from held-out cases.

Measure false approvals, unsupported factual-claim rate, citation coverage, answer completeness, appropriate abstention, and follow-up accuracy separately. Report time to first supported sentence, total p50/p95 latency, and token/search cost. Do not improve apparent precision merely by dropping useful answers or citations. Match evaluations on question sets and budgets; record the model, prompts, source snapshots, and judge versions. For a small project, manually review roughly 100–200 claim/evidence pairs initially, including difficult negatives; this is a practical proposal, not a statistically established sample-size guarantee.

Latency ideas to test: fetch independent sources concurrently, cache read documents within a conversation, batch passage selection and verification, avoid unnecessary searches for conversational acknowledgments, and retry only missing evidence. Preserve freshness checks for changing facts. None of these optimizations has yet been benchmarked against the proposed pipeline.

## Run locally

Requires Node.js 24 or newer.

```bash
npm install
cp .env.example .env
# Edit .env and set OPENAI_KEY=your-key
npm start
```

Open **http://localhost:3000**. If that port is occupied, use `PORT=3001 npm start` and open **http://localhost:3001**. `npm run dev` restarts when code changes.

Existing `OPENAI_KEY` or `OPENAI_API_KEY` environment variables work without a `.env` file. `OPENAI_KEY` takes precedence when both are set. Environment variables take precedence over `.env`. Keys stay on the server, and `.env` is ignored by Git.

| Setting | Default | Purpose |
| --- | --- | --- |
| `OPENAI_KEY` / `OPENAI_API_KEY` | Required | OpenAI API access |
| `OPENAI_MODEL` | `gpt-5.5` | Responses model supporting web search |
| `PORT` | `3000` | Local server port |

Only OpenAI web search is used. API access and billing are separate from a ChatGPT subscription.

## Fast answer flow

1. **Draft:** generate a concise internal hypothesis from the model’s existing knowledge. The UI shows the current research step while this draft guides searching; draft text is not displayed.
2. **Find supporting references:** send the draft, question, and conversation context to OpenAI with web search required. Read up to nine candidate pages from native search metadata, prioritizing cited pages and diversifying other results across domains. This includes useful results that the search answer did not cite. If no supported answer survives, make one broader search with alternative queries and feedback about unreadable pages or missing evidence. Reuse downloads and failures within the request instead of repeatedly fetching the same URLs. Only OpenAI web search is used.
3. **Read and rewrite:** fetch candidate articles once, then generate a fresh answer using their relevant text windows. The draft and search answer are hypotheses, not evidence. Correct conflicting details, split compound claims, and omit facts the available text cannot establish. The rewrite uses server-assigned source IDs, never model-invented URLs.
4. **Check the rewritten claims:** Reuse the fetched HTML, plain text, or PDF documents and ask a separate model pass to locate up to three short excerpts (40 words each) supporting all parts of each cited claim. Quotes must occur exactly in the extracted source text (whitespace is normalized); invented quotes and unknown source/claim IDs are rejected. PDF page numbers are derived from the matching page, never generated by the model.
5. **Replace the preview:** keep answer text dark and show small blue citation numbers only where supporting excerpts were matched. Cited text has a subtle blue underline that darkens on hover. A completed web search and source URLs obtained from native search metadata are still required. Tracking tags are ignored for URL matching, but page-identifying parameters are preserved. References remain expanded below the answer.
6. **Inspect a citation:** click a cited sentence, its blue [1] marker, or a reference title to open the excerpt dialog. It shows the sentence and supporting passages, with a View on source link for each excerpt. Retrieval and verification details stay under About these excerpts. Links target a text-fragment highlight or PDF page. For books, only accessible text is quoted; the model's memory of a book is not accepted as evidence. PDF page numbers may differ from printed page numbers.

“Cooking up an answer…” appears immediately; the draft stays hidden until research produces a final answer. A fully cited answer now normally takes four model requests plus source downloads. Sources are downloaded only once per turn and reused for rewriting, verification, and the optional recovery attempt. A recovery search can add three model calls and additional source downloads; the overall request timeout still applies. This adds latency compared with the previous search-only mode, but the app can show actual source excerpts. The app records time to first draft text and total completion time in the result's `timings` field.

A page reader attempts up to nine candidate sources per search attempt in batches of three, with a 20-second timeout and an 8 MB download limit per document. It reads up to 160,000 extracted characters and the first 30 PDF pages, then selects up to twelve overlapping text windows using term rarity and per-claim ranking so less prominent claims retain context. It does not bypass paywalls, run page JavaScript, or OCR scanned books. The source dialog reports reading limits and failures. In live chat, rewritten claims without accepted supporting excerpts are omitted from the final answer, with a brief notice when details were omitted. If no claims survive, the app says it lacks sufficient readable evidence instead of publishing the draft as the answer. Only references used by surviving claims appear. This can produce incomplete answers; model-based support judgments can still be wrong. Saved examples use the older excerpt-only flow.

Exact matching establishes that a quote occurred in the fetched text. Whether it supports the whole claim is assessed by a model and can still be wrong. References do not identify training sources or prove every claim is correct. Browser/site support determines whether a highlighted-passage link scrolls or highlights; the local excerpt always remains available. PDF navigation similarly depends on the viewer.

Examples include saved excerpts obtained through the same reading and matching flow. Refresh them with `node --use-env-proxy scripts/refresh-examples.js` (billable API calls). Reloading the page itself makes no API calls for examples.

## Document library: index once, reuse in chat

Click **＋ Sources** to upload a PDF, Markdown, TXT, or HTML file, or import a public article URL. Give it a name, then inspect **Chapters & sections**. Checked documents are searched; uncheck documents to exclude them. **Library first, then web** is the default, **Library only** never falls back to web search, and **Web only** skips the library.

Start the local vector database with:

```bash
docker compose up -d
```

The app uses its own Qdrant service on `127.0.0.1:16333`, avoiding an existing service on port 6333. Data survives container restarts in the `sauceygpt_vectors` Compose volume. Set `QDRANT_URL` and optionally `QDRANT_API_KEY` to use another instance. Stop this service with `docker compose stop`; do not use `down -v` unless you intend to erase its vectors.

Uploaded PDFs and extracted text/metadata live in `.data/library/` (ignored by Git). The index uses OpenAI `text-embedding-3-small`, 1,536 dimensions, in the `sauceygpt_documents_v1` Qdrant collection. Uploading sends extracted text to OpenAI for embeddings; answering sends selected source windows. This is not an offline model. There is one shared local library, not separate user accounts. Back up both `.data/library/` and the Qdrant volume together.

Each document gets a content hash and a canonical name such as `workshop-handbook-37add1d9`. Each chapter gets a stable path such as `workshop-handbook-37add1d9/002-hours`. PDF bookmarks provide chapter names and nesting; PDFs without bookmarks use honest page labels rather than guessed chapter names. Markdown/HTML headings define sections. Text is split into overlapping passages, carrying document ID, chapter path/title, page number, and exact original text in the vector payload. Re-uploading identical content reuses the existing index and name. Changing document content creates a new version with a new ID; remove the old entry if it is obsolete.

Library search embeds the question (with recent user questions for follow-up context), retrieves candidate passages restricted to selected documents, and supplies their chapter text to final generation and excerpt verification. A supported library answer skips the draft and web-search stages. Similarity scores select candidates; they do not prove support. Every displayed citation still requires a matched source excerpt. PDF citations link to the original PDF page; other uploads link to a safe plain-text snapshot. Chapter names, page links, and exact excerpts remain available in the source dialog. Generated answers and retrieved documents remain untrusted input to the model.

Uploads are limited to 20 MB, 300 PDF pages, 2 million extracted characters, and 1,500 passages per file. Scanned PDFs require OCR beforehand; password-protected or malformed PDFs may fail. Public article imports use the existing safe reader and its smaller limits; large PDFs should be uploaded directly. Only one upload/import is indexed at a time. A failed upload is not listed as ready. Remove deletes its local files and indexed passages. Deletion is blocked while a chat or indexing request is active.

The first ingestion costs embedding time and tokens; later queries reuse the vectors. A small two-section live test answered in about 3.7 seconds; this is not a general latency guarantee. `scripts/library-check.js` runs a billable browser integration check with a temporary uploaded document and removes it afterward. Offline tests cover PDF bookmarks, canonical names, duplicate uploads, persistence, source selection, vector deletion, local page links, and avoiding web calls in library-only mode.

References: [Qdrant local quickstart](https://qdrant.tech/documentation/quickstart/), [Qdrant query API](https://api.qdrant.tech/api-reference/search/query-points), and the [official OpenAI embeddings guide](https://developers.openai.com/api/docs/guides/embeddings).

## Privacy and local operation

- Keys stay server-side. Queries, conversation context, the preliminary draft, and selected source text are sent to OpenAI. Calls use `store: false`, which is not a promise of zero provider retention.
- History stays in browser memory. Reload starts an empty conversation; The last 12 successful messages are sent as context; stored answer context is limited to 8,000 characters per answer.
- The server binds to `127.0.0.1`, rejects cross-origin requests and non-local Host headers, and allows one request at a time. Stop cancels the request; it times out after four minutes. Authentication and multi-user hosting are not included.
- Source fetches accept only public HTTP(S) addresses, recheck redirects, and validate DNS at direct connection time. Configured proxies control final destination resolution and must enforce private-network restrictions. API keys are never forwarded to source websites.
- All model text renders as text, never executable HTML. Citation links use native API metadata, HTTP(S) URL validation, and safe external-link attributes.

## Development and validation

```bash
npm test
node --check server.js
node --check research.js
node --check public/app.js
# Optional browser check (install Chromium once with npx playwright install chromium):
node scripts/ui-check.js
# Optional live check; uses billable API calls:
node --use-env-proxy scripts/smoke.js
```

Offline tests cover native citation mapping, duplicate references, unsafe URLs and invalid offsets, chunked streaming, draft-before-search sequencing, the draft/search/excerpt pipeline, missing citations and failed search, and HTTP endpoint behavior. Browser checks cover desktop/mobile layout, safe rendering, citation links, and resetting a conversation. Tests also cover exact excerpt matching, rejected fabricated quotes, source-reading failures, PDF text/page extraction, and blocked private addresses. Browser checks exercise always-visible references, excerpt dialogs, and highlight links. These tests do not measure factual accuracy. `node --use-env-proxy scripts/question-check.js` runs billable live checks on mathematics, history, science, and conversational follow-ups and writes results to `/tmp/sauceygpt-question-results.json`.

Files: `server.js` serves the app and streams progress; `research.js` implements drafting and citation mapping; `evidence.js` reads sources and checks excerpts; `rewrite.js` composes and filters the final source-based answer; `public/` contains the chat UI; `test/` contains offline tests; `scripts/` contains browser and live checks.

The integration follows OpenAI’s [web search guide](https://developers.openai.com/api/docs/guides/tools-web-search) and [streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses).

Search recovery tests cover uncited candidate results, URL deduplication, domain diversity, balanced passage selection, blocked-source recovery, cached failures, and a two-attempt limit. Result metadata includes `searchAttempts` and `retrievalAttempts` with candidate reading outcomes, proposed claims, and accepted claims for diagnosis. These are operational counts, not accuracy scores.

Run `node --use-env-proxy scripts/search-recovery-check.js` for a billable live check that deliberately blocks the first reading round and requires recovery from alternative sources. This tests the recovery path with real searches; it does not reproduce every access failure.

### Source shelf

Open **Source shelf** beside the chat composer. Each upload, article, or documentation collection is a sauce jar. Click a jar to activate or deactivate it; active jars move to the **Top shelf**. Search filters sauce names, source URLs, and chapter titles. Selections persist in this browser. “Shelf only” searches only active sauces; “Shelf first, then web” can fall back to web research.

Under **Add a sauce**, upload a file, add an article URL, or collect a documentation site. Presets link to the [pandas user guide](https://pandas.pydata.org/docs/user_guide/index.html) and [Klaviyo developer guides](https://developers.klaviyo.com/en/docs/get_started). Pick a page limit (5–30 in the UI; 1–30 through the API). Collection follows same-origin links within the starting URL's folder, discards fragment duplicates and query links, and stops at the page or text budget. It does not render JavaScript or bypass inaccessible pages. The shelf shows collected page counts and partial coverage; a small collection is not the complete documentation site.

Each collection stores readable page snapshots and canonical chapter mappings locally, with embeddings in the local Qdrant database. Citations retain the actual page URL and matched excerpts. **Inside this sauce** lists collected chapters. **Refresh** reads the same site scope and page budget again, reusing unchanged content or indexing a replacement. Previous snapshots remain available for existing citations but superseded sauces are excluded from new retrieval. Refresh currently re-embeds the changed collection as a whole; it is not an incremental page-sync service. Archived versions retain storage until manually cleaned up.

The site endpoints are `POST /api/library/site` (`url`, optional `title`, `maxPages`) and `POST /api/library/:id/refresh`. Collection is sequential, capped at 30 readable pages, 3× that many attempted pages, 2 million text characters, and the existing four-minute indexing deadline. Site content is treated as untrusted source text, with the same public-network URL protections as the web reader.

### Choosing a sauce in chat

Type `using:` in the message box to open the source picker, then keep typing to filter saved sauces. Arrow keys move through matches; Enter or Tab selects one; Escape closes the list. Selecting a source inserts `using: X sauce;` directly into the message, and that text is displayed in the conversation. The directive is stripped from the research query while the selected source ID is sent separately. Follow-up turns retain removable **Using X sauce** chips. You can choose more than one. Their characters appear to the left of the red jar while waiting. The selected sauces remain attached for follow-up questions until you remove their chips. Retrieval starts with those saved sources; if a requested code example is missing or fails verification, the app searches the selected documentation domains for the missing endpoint reference. It reuses the partial answer as its search hypothesis instead of generating another draft. Without a selection, the mode menu controls retrieval (Web only is the initial default). Explicit Shelf only mode still avoids web search.

How-to answers can now contain a concise explanation, numbered actions, and an original illustrative code example. Code renders as inert text, never executes, and has source citations beside it. The excerpt verifier checks API details as well as prose; ordinary programming glue need not be copied from a source. Examples are not claimed to have been executed. Missing or incompatible API details can cause an example to be omitted rather than fabricated.
