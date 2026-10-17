// Billable live search check: deliberately fail the first reading round.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { Researcher } from '../research.js';
import { readDocument } from '../evidence.js';
let recovery = false;
const researcher = new Researcher({
  key: process.env.OPENAI_KEY || process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-5.5',
  reader: (source, signal) => {
    if (!recovery) throw new Error('Simulated first-attempt source access failure; use a different URL.');
    return readDocument(source, signal);
  }
});
const result = await researcher.run('Why does the Moon have phases? Two sentences.', [], event => {
  if (event.message?.startsWith('Trying different searches')) recovery = true;
}, AbortSignal.timeout(240000));
console.log(JSON.stringify({ answer: result.answer, searchAttempts: result.searchAttempts, attempts: result.retrievalAttempts, timings: result.timings }, null, 2));
assert.equal(result.searchAttempts, 2);
assert.ok(result.sources.length, 'Live recovery found no supported sources');
assert.ok(result.sources.every(source => source.evidence.length));
