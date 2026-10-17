import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Researcher, outputText } from '../research.js';
import { attachEvidence } from '../evidence.js';
const context = { window: {} };
vm.runInNewContext(await readFile(new URL('../public/examples.js', import.meta.url), 'utf8'), context);
const examples = context.window.exampleChat;
const researcher = new Researcher({ key: process.env.OPENAI_KEY || process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5.5' });
for (const example of examples) {
  // Restore attempted source IDs for repeatable refreshes after a previous failed read.
  for (const segment of example.result.blocks.flat()) {
    if (segment.originalCitations) segment.citations = segment.originalCitations;
    else if (segment.citations) segment.originalCitations = [...segment.citations];
  }
  example.result.notice = '';
  await attachEvidence(example.result, async (...args) => { const response = await researcher.modelCall(...args); await writeFile('/tmp/sauceygpt-example-matches-' + examples.indexOf(example) + '.json', outputText(response)); return response; }, AbortSignal.timeout(120000), event => console.log(event.message));
  console.log(JSON.stringify({ question: example.question, excerpts: example.result.sources.map(source => ({ title: source.title, quotes: source.evidence?.length, error: source.readError })) }));
}
await writeFile(new URL('../public/examples.js', import.meta.url), `window.exampleChat = ${JSON.stringify(examples, null, 2)};\n`);
