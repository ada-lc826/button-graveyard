// Reproducible demo: scan the broken dashboard, swap in the fixed one, rescan with --compare.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../test/server.mjs';
import { run } from '../skills/button-graveyard/scripts/graveyard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
fs.rmSync(out, { recursive: true, force: true });
const srv = await serve(path.join(here, 'broken'), +(process.env.PORT || 4173));
const url = `http://localhost:${srv.port}/`;
const base = { urls: [url], wait: 1500, concurrency: 4, max: 150, selectors: [], baselineMs: 400 };

console.log('\n=== 1) the AI-built dashboard, as generated ===');
await run({ ...base, out: path.join(out, 'before') });

console.log('\n=== 2) after the agent fixed it ===');
srv.setRoot(path.join(here, 'fixed'));
await run({ ...base, out: path.join(out, 'after'), compare: path.join(out, 'before', 'graveyard.json') });
srv.server.close();
