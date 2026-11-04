// Regression suite: every fixture control declares its expected verdict in data-expect.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { serve } from './server.mjs';
import { run } from '../skills/button-graveyard/scripts/graveyard.mjs';
import { decide, classifySafety, isEmptyHref, compareRuns } from '../skills/button-graveyard/scripts/lib/verdict.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (name, fn) => { try { fn(); console.log('  ✓ ' + name); } catch (e) { failures++; console.log('  ✗ ' + name + '\n      ' + e.message.split('\n').join('\n      ')); } };

console.log('unit');
const blank = () => ({ actionability: { ok: true }, interrupted: null, pageErrors: [], console: [], visualNoisy: false, domNoise: 0,
  signals: { requests: [], writesIntercepted: [], domChanges: [] } });
check('no signals → dead/no-op', () => { const d = decide(blank()); assert.equal(d.verdict, 'dead'); assert.equal(d.cause, 'no-op'); });
check('request start counts as alive', () => { const e = blank(); e.signals.requests = ['GET /api']; assert.equal(decide(e).verdict, 'alive'); });
check('page error without effect → dead/crashed', () => { const e = blank(); e.pageErrors = ['TypeError: x']; assert.equal(decide(e).cause, 'crashed'); });
check('failed fetch still counts as an attempt', () => { const e = blank(); e.pageErrors = ['TypeError: Failed to fetch']; assert.equal(decide(e).verdict, 'alive'); });
check('covered → blocked', () => { const e = blank(); e.actionability = { ok: false, kind: 'covered' }; assert.equal(decide(e).verdict, 'blocked'); });
check('not visible → unknown, never dead', () => { const e = blank(); e.actionability = { ok: false, kind: 'not-visible' }; assert.equal(decide(e).verdict, 'unknown'); });
check('already-current item is unknown, not dead', () => { const e = blank(); e.current = true; assert.equal(decide(e).verdict, 'unknown'); });
check('noisy page lowers confidence', () => { const e = blank(); e.domNoise = 3; assert.equal(decide(e).confidence, 'medium'); });
check('danger words are skipped', () => assert.ok(classifySafety({ name: 'Delete project' }, { targetOrigin: 'http://x' }).skip));
check('danger words in Chinese are skipped', () => assert.ok(classifySafety({ name: '删除项目' }, { targetOrigin: 'http://x' }).skip));
check('"Release notes" is not dangerous', () => assert.equal(classifySafety({ name: 'Release notes' }, { targetOrigin: 'http://x' }).skip, null));
check('empty hrefs', () => { for (const h of ['#', '', 'javascript:void(0)', 'javascript:;', '#!']) assert.ok(isEmptyHref(h), h); assert.ok(!isEmptyHref('#far')); });
check('compareRuns finds resurrected', () => {
  const a = { results: [{ page: 'p', id: 'x', selector: '#x', name: 'X', verdict: 'dead' }] };
  const b = { results: [{ page: 'p', id: 'x', selector: '#x', name: 'X', verdict: 'alive', reason: 'ok' }] };
  assert.equal(compareRuns(a, b).resurrected.length, 1);
});

console.log('\nbrowser (fixtures/haunted.html)');
const srv = await serve(path.join(here, 'fixtures'));
const out = path.join(here, '.out');
fs.rmSync(out, { recursive: true, force: true });
const t0 = Date.now();
const data = await run({ urls: [`http://127.0.0.1:${srv.port}/haunted.html`], out, wait: 1500, concurrency: 6, max: 150, selectors: [], baselineMs: 400 });
console.log(`  (scan took ${((Date.now() - t0) / 1000).toFixed(1)}s)`);

const html = fs.readFileSync(path.join(here, 'fixtures/haunted.html'), 'utf8');
const expected = [...html.matchAll(/data-expect="([^"]+)" id="([^"]+)"/g)].map((m) => ({ expect: m[1], id: m[2] }));
const byId = new Map(data.results.filter((r) => r.id).map((r) => [r.id, r]));
for (const { expect, id } of expected) {
  const [verdict, flavour] = expect.split(':');
  check(`${id.padEnd(14)} → ${expect}`, () => {
    const r = byId.get(id);
    assert.ok(r, 'control was not enumerated');
    assert.equal(r.verdict, verdict, `got ${r.verdict}: ${r.reason}`);
    if (flavour === 'stub' || flavour === 'crashed') assert.equal(r.cause, flavour, r.reason);
    if (flavour === 'write') assert.ok(r.signals.writesIntercepted, 'expected an intercepted write: ' + r.reason);
    if (flavour === 'slow') assert.ok(r.slow, 'expected slow flag');
  });
}
check('no write ever reached the server', () => {
  const writes = srv.hits.filter((h) => !h.startsWith('GET'));
  assert.deepEqual(writes, []);
});
check('reports written', () => {
  for (const f of ['graveyard.json', 'graveyard.md', 'graveyard.html', 'card.png']) assert.ok(fs.existsSync(path.join(out, f)), f);
  const j = JSON.parse(fs.readFileSync(path.join(out, 'graveyard.json'), 'utf8'));
  assert.equal(j.schema, 'button-graveyard/v1');
  assert.ok(j.results.filter((r) => r.verdict === 'dead').every((r) => r.fixPrompt && r.evidence.crop));
});

srv.server.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
