import 'dotenv/config';
import { Researcher } from '../research.js';
const key = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY;
if (!key) throw new Error('Set OPENAI_KEY or OPENAI_API_KEY before running the live smoke test.');
const researcher = new Researcher({ key, model: process.env.OPENAI_MODEL || 'gpt-5.5' });
try {
  const result = await researcher.run('How does spaced repetition help people remember information? Give a short answer.', [], event => { if (event.type === 'progress') console.log(event.message); }, AbortSignal.timeout(240000));
  console.log(JSON.stringify({ references: result.sources, answer: result.answer, timings: result.timings }, null, 2));
  if (!result.sources.length) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
