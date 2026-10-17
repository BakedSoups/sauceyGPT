import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { Researcher } from '../research.js';
const researcher = new Researcher({ key: process.env.OPENAI_KEY || process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5.5' });
const questions = [
  { query: 'Is P equal to NP? Answer briefly.', history: [] },
  { query: 'What happened to Napoleon?', history: [] },
  { query: 'Why do we have seasons? Answer briefly.', history: [] },
  { query: 'Wait, did he die at Waterloo?', history: [{ role: 'user', content: 'What happened to Napoleon?' }, { role: 'assistant', content: 'Napoleon lost at Waterloo and was exiled to Saint Helena, where he died in 1821.' }] }
];
const results = await Promise.all(questions.map(async ({ query, history }) => {
  try {
    const result = await researcher.run(query, history, () => {}, AbortSignal.timeout(120000));
    const citedPassages = result.blocks.flat().filter(s => s.citations?.length);
    if (!citedPassages.length || !result.sources.length) throw new Error('No source-linked passages');
    if (citedPassages.some(s => s.citations.some(id => !result.sources.find(source => source.id === id)))) throw new Error('Unknown reference ID');
    return { query, ...result };
  } catch (error) { process.exitCode = 1; return { query, error: error.message }; }
}));
await writeFile('/tmp/sauceygpt-question-results.json', JSON.stringify(results, null, 2));
for (const r of results) console.log(JSON.stringify({ question: r.query, answer: r.answer, sources: r.sources?.map(s => s.url), error: r.error }));
