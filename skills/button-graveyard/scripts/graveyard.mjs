#!/usr/bin/env node
// button-graveyard — click every button in your app, bury the ones that do nothing.
// Deterministic: no LLM decides anything here. Same page + same rules => same verdicts.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import { INJECT } from './lib/inject.mjs';
import { enumerateControls } from './lib/enumerate.mjs';
import { classifySafety, decide, isEmptyHref, compareRuns, epitaph } from './lib/verdict.mjs';
import { writeReports, terminalSummary } from './lib/report.mjs';

export const VERSION = '0.1.0';

const HELP = `button-graveyard v${VERSION}
Click every visible control on your page in a fresh browser, and report the ones that do nothing.

Usage:
  node graveyard.mjs <url> [more urls...] [options]

Options:
  --out <dir>          Output folder (default: .button-graveyard)
  --wait <ms>          Observation window after each click (default: 1500)
  --concurrency <n>    Parallel browser contexts (default: 4)
  --max <n>            Max controls per page (default: 150)
  --only <regex>       Only test controls whose label/selector matches
  --skip <regex>       Never click controls whose label/selector matches
  --selector <css>     Extra CSS selector to treat as a control (repeatable)
  --compare <json>     Previous graveyard.json: report resurrected / newly dead
  --fail-on-dead       Exit 1 if any control is dead or blocked (for CI)
  --allow-danger       Also click controls that look destructive (delete, pay, logout...)
  --allow-writes       Let POST/PUT/PATCH/DELETE fired by clicks reach the server
  --i-own-this-app     Required to scan anything that is not localhost / file://
  --no-card            Skip rendering the share card PNG
  --headed             Show the browser
  -h, --help           Show help
`;

function parseArgs(argv) {
  const o = { urls: [], out: '.button-graveyard', wait: 1500, concurrency: 4, max: 150, selectors: [], baselineMs: 400 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; if (v === undefined) die(`missing value for ${a}`); return v; };
    switch (a) {
      case '-h': case '--help': console.log(HELP); process.exit(0);
      case '--out': o.out = next(); break;
      case '--wait': o.wait = +next(); break;
      case '--concurrency': o.concurrency = Math.max(1, +next()); break;
      case '--max': o.max = +next(); break;
      case '--only': o.only = new RegExp(next(), 'i'); break;
      case '--skip': o.skip = new RegExp(next(), 'i'); break;
      case '--selector': o.selectors.push(next()); break;
      case '--compare': o.compare = next(); break;
      case '--fail-on-dead': o.failOnDead = true; break;
      case '--allow-danger': o.allowDanger = true; break;
      case '--allow-writes': o.allowWrites = true; break;
      case '--i-own-this-app': o.owned = true; break;
      case '--no-card': o.noCard = true; break;
      case '--headed': o.headed = true; break;
      default:
        if (a.startsWith('-')) die(`unknown option ${a}\n\n${HELP}`);
        o.urls.push(a);
    }
  }
  if (!o.urls.length) die(HELP);
  return o;
}

function die(msg, code = 2) { console.error(msg); process.exit(code); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadPlaywright() {
  const candidates = ['playwright', 'playwright-core', '@playwright/test'];
  const roots = [process.env.BG_PLAYWRIGHT_DIR, path.join(process.cwd(), 'node_modules'), path.join(os.homedir(), '.cache', 'button-graveyard', 'node_modules')].filter(Boolean);
  try { roots.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch {}
  const req = createRequire(import.meta.url);
  for (const root of roots) for (const name of candidates) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    try { const m = req(p); if (m && m.chromium) return m; } catch {}
  }
  die(`Playwright not found. Install it once into a private cache (your project's package.json is untouched):

  npm install --prefix ~/.cache/button-graveyard playwright
  ~/.cache/button-graveyard/node_modules/.bin/playwright install chromium
`);
}

const LOCAL_HOST = /^(localhost|127(\.\d+){3}|\[?::1\]?|0\.0\.0\.0|.+\.localhost)$/i;
function checkTarget(u, owned) {
  let url;
  try { url = new URL(u); } catch { die(`not a URL: ${u}`); }
  if (url.protocol === 'file:') return url;
  if (!/^https?:$/.test(url.protocol)) die(`unsupported protocol: ${url.protocol}`);
  if (!LOCAL_HOST.test(url.hostname) && !owned)
    die(`Refusing to scan ${url.host}: clicking every button is an active test.
Run it against your local dev server, or pass --i-own-this-app if you own ${url.host} and it holds only disposable data.`);
  return url;
}

const NOISE_URL = /(google-analytics|googletagmanager|doubleclick|posthog|segment\.(io|com)|mixpanel|amplitude|plausible|sentry|hotjar|clarity\.ms|datadoghq|intercom|fullstory|\/_vercel\/insights|\/_vercel\/speed-insights)/i;
const DEV_URL = /(__vite|@vite|hot-update|webpack-hmr|_next\/webpack|__nextjs|sockjs-node|\.map(\?|$)|favicon\.ico)/i;
const reqKey = (r) => { try { const u = new URL(r.url()); return r.method() + ' ' + u.origin + u.pathname; } catch { return r.method() + ' ' + r.url(); } };
const shortUrl = (u, base) => { try { const x = new URL(u); const b = new URL(base); return x.origin === b.origin ? x.pathname + x.search + x.hash : x.href; } catch { return u; } };
const stripHash = (u) => u.split('#')[0];
const isTopNav = (r) => { if (!r.isNavigationRequest()) return false; try { return !r.frame().parentFrame(); } catch { return true; } };

function trackActivity(page) {
  const st = { last: Date.now() };
  const bump = () => { st.last = Date.now(); };
  page.on('request', bump); page.on('requestfinished', bump); page.on('requestfailed', bump);
  return st;
}
async function settle(st, quietMs = 400, maxMs = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) { if (Date.now() - st.last >= quietMs) return; await sleep(50); }
}

async function newContext(browser, o, target) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, acceptDownloads: true, reducedMotion: 'reduce',
  });
  if (target.protocol !== 'file:') {
    try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: target.origin }); } catch {}
  }
  await ctx.addInitScript(INJECT);
  return ctx;
}

async function enumeratePage(browser, pageUrl, o) {
  const target = new URL(pageUrl);
  const ctx = await newContext(browser, o, target);
  await ctx.route(NOISE_URL, (r) => r.abort());
  const page = await ctx.newPage();
  const act = trackActivity(page);
  try {
    await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
    await settle(act, 500, 8000);
    return await page.evaluate(enumerateControls, { max: o.max, extraSelectors: o.selectors });
  } finally { await ctx.close(); }
}

export async function probe(browser, pageUrl, c, o, windowMs) {
  const target = new URL(pageUrl);
  const ctx = await newContext(browser, o, target);
  const sameOrigin = (u) => target.protocol === 'file:' ? u.startsWith('file:') : (() => { try { return new URL(u).origin === target.origin; } catch { return false; } })();

  let phase = 'pre';
  const preCounts = new Map();
  const baselineKeys = new Set();
  const postReqs = [];
  const writes = [];
  const sig = { navigation: null, popup: null, download: null, dialog: null, filechooser: false };
  const pageErrors = [];
  const consoleMsgs = [];
  const popups = [];
  let extNav = null;

  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (NOISE_URL.test(url)) return route.abort();
    const isMainNav = isTopNav(req);
    if (isMainNav && /^https?:/.test(url) && !sameOrigin(url)) {
      if (phase === 'post') extNav = url;
      return route.abort();
    }
    if (phase === 'post' && !o.allowWrites && !/^(GET|HEAD|OPTIONS)$/.test(req.method()) && /^https?:/.test(url)) {
      writes.push(req.method() + ' ' + shortUrl(url, pageUrl));
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });

  const page = await ctx.newPage();
  const act = trackActivity(page);
  page.on('request', (r) => {
    const k = reqKey(r);
    if (phase === 'pre') preCounts.set(k, (preCounts.get(k) || 0) + 1);
    else if (phase === 'baseline') baselineKeys.add(k);
    else if (phase === 'post') {
      if (NOISE_URL.test(r.url()) || DEV_URL.test(r.url()) || /^(data|blob):/.test(r.url())) return;
      if ((preCounts.get(k) || 0) >= 2 || baselineKeys.has(k)) return; // polling / background noise
      if (isTopNav(r)) return; // counted as navigation
      postReqs.push(r.method() + ' ' + shortUrl(r.url(), pageUrl));
    }
  });
  page.on('dialog', (d) => { if (phase === 'post') sig.dialog = `${d.type()}("${d.message().slice(0, 80)}")`; d.dismiss().catch(() => {}); });
  page.on('download', (d) => { if (phase === 'post') sig.download = d.suggestedFilename(); d.cancel().catch(() => {}); });
  page.on('filechooser', () => { if (phase === 'post') sig.filechooser = true; });
  page.on('framenavigated', (f) => { if (phase === 'post' && f === page.mainFrame()) sig.navigation = f.url(); });
  page.on('pageerror', (e) => { if (phase === 'post') pageErrors.push(`${e.name || 'Error'}: ${String(e.message).slice(0, 140)}`); });
  page.on('console', (m) => {
    if (phase !== 'post') return;
    const t = m.text();
    if (/blockedbyclient|ERR_BLOCKED_BY_CLIENT|Failed to load resource/i.test(t)) return; // our own write interception
    consoleMsgs.push(`console.${m.type()}("${t.slice(0, 100)}")`);
  });
  ctx.on('page', (p) => { if (p !== page && phase === 'post') popups.push(p); });

  const base = {
    actionability: { ok: true }, interrupted: null, pageErrors, console: consoleMsgs, current: !!c.current,
    signals: { requests: postReqs, writesIntercepted: writes, domChanges: [] }, visualNoisy: false, domNoise: 0,
  };
  const shots = {};
  let blocker = null;
  const finish = async (extra = {}) => {
    for (const p of popups) { if (!sig.popup) sig.popup = p.url(); await p.close().catch(() => {}); }
    await ctx.close().catch(() => {});
    return { ...extra, shots, blocker };
  };

  try {
    await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
  } catch (e) {
    return finish({ ev: { ...base, interrupted: 'page failed to load: ' + String(e.message).split('\n')[0] } });
  }
  await settle(act, 400, 5000);

  const loc = page.locator(c.selector);
  if ((await loc.count().catch(() => 0)) !== 1)
    return finish({ ev: { ...base, interrupted: 'control not found after reload (page renders differently on each load)' } });

  try {
    await loc.click({ trial: true, timeout: 1500 });
  } catch (e) {
    const msg = String(e.message);
    const m = msg.match(/(<[^\n]*?>)[^\n]*? (?:from [^\n]*? )?subtree intercepts pointer events|(<[^\n]*?>)[^\n]*? intercepts pointer events/);
    const kind = m ? 'covered' : /not visible/.test(msg) ? 'not-visible' : /not stable/.test(msg) ? 'not-stable' : /detached/.test(msg) ? 'detached' : 'timeout';
    if (m) blocker = (m[1] || m[2]).slice(0, 160);
    shots.crop = await loc.screenshot({ type: 'jpeg', quality: 70, timeout: 1500 }).catch(() => null);
    if (kind === 'covered') {
      shots.before = await page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null);
      shots.after = await annotate(page, loc, 'BURIED ALIVE');
    }
    return finish({ ev: { ...base, actionability: { ok: false, kind, message: blocker ? blocker + ' intercepts the click' : msg.split('\n')[0].slice(0, 160) } } });
  }

  await loc.hover({ timeout: 1500 }).catch(() => {});
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur()).catch(() => {});
  await sleep(80);

  // Baseline: what changes on this page when nobody touches it?
  phase = 'baseline';
  await page.evaluate(() => window.__bg.snap('A'));
  await sleep(o.baselineMs);
  await page.evaluate(() => window.__bg.snap('B'));
  const noise = await page.evaluate(() => window.__bg.diff('A', 'B'));
  // Pixel evidence only where the DOM cannot see it: <canvas> (2D and WebGL).
  const canvasLocs = [];
  const nCanvas = Math.min(5, await page.locator('canvas').count().catch(() => 0));
  for (let i = 0; i < nCanvas; i++) canvasLocs.push(page.locator('canvas').nth(i));
  const shootCanvases = () => Promise.all(canvasLocs.map((l) => l.screenshot({ animations: 'disabled', timeout: 1000 }).catch(() => null)));
  const cv1 = await shootCanvases();
  await sleep(nCanvas ? 120 : 0);
  const cv1b = await shootCanvases();
  const canvasStable = cv1.map((b, i) => !!(b && cv1b[i] && b.equals(cv1b[i])));
  const visualNoisy = canvasStable.some((x) => !x);
  const pre = await page.evaluate(() => ({ storage: window.__bg.storage(), muts: window.__bg.muts, clip: window.__bg.clip.length, prints: window.__bg.prints, submits: window.__bg.submits, url: location.href }));
  shots.crop = await loc.screenshot({ type: 'jpeg', quality: 70, timeout: 1500, animations: 'disabled' }).catch(() => null);
  const beforeView = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' }).catch(() => null);

  // Click, then watch.
  phase = 'post';
  const tClick = Date.now();
  try {
    await loc.click({ timeout: 2000, noWaitAfter: true });
  } catch (e) {
    return finish({ ev: { ...base, interrupted: 'click failed: ' + String(e.message).split('\n')[0].slice(0, 140) } });
  }
  const strong = () => sig.dialog || sig.download || sig.filechooser || popups.length || extNav || writes.length || postReqs.length ||
    (sig.navigation && !(isEmptyHref(c.href) && stripHash(sig.navigation) === stripHash(pre.url)));
  let lastDomCheck = 0;
  while (Date.now() - tClick < windowMs) {
    await sleep(100);
    if (strong()) break;
    if (Date.now() - lastDomCheck > 250) {
      lastDomCheck = Date.now();
      try { if ((await page.evaluate((n) => window.__bg.diff('B', null, n).length, noise)) > 0) break; } catch { break; }
    }
  }
  await sleep(60);

  let after = null;
  try {
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    after = await page.evaluate((n) => ({ dom: window.__bg.diff('B', null, n), storage: window.__bg.storage(), muts: window.__bg.muts, clip: window.__bg.clip.length, prints: window.__bg.prints, submits: window.__bg.submits, url: location.href }), noise);
    if (process.env.BG_DEBUG && after.dom.length) console.error('[debug]', c.selector, JSON.stringify(await page.evaluate((d) => window.__bg.explain('B', d.slice(0, 5)), after.dom)));
  } catch { /* document was replaced: navigation */ }

  const emptyHref = isEmptyHref(c.href);
  let navigation = extNav ? 'external ' + extNav : null;
  if (!navigation && sig.navigation) {
    const hashOnly = stripHash(sig.navigation) === stripHash(pre.url);
    if (!(emptyHref && hashOnly)) navigation = shortUrl(sig.navigation, pageUrl);
  }
  if (!navigation && after && after.url !== pre.url && !(emptyHref && stripHash(after.url) === stripHash(pre.url)))
    navigation = shortUrl(after.url, pageUrl);
  if (!after && !navigation) navigation = '(document replaced)';

  let dom = after ? after.dom : [];
  let scroll = dom.includes('::window-scroll');
  dom = dom.filter((p) => p !== '::window-scroll');
  if (emptyHref) scroll = false;

  let visual = false;
  if (after && nCanvas) {
    const cv2 = await shootCanvases();
    visual = cv2.some((b, i) => canvasStable[i] && b && !b.equals(cv1b[i]));
  }

  const ev = {
    ...base,
    visualNoisy,
    domNoise: noise.length,
    signals: {
      navigation, popup: popups.length ? (popups[0].url() || 'about:blank') : null,
      download: sig.download, dialog: sig.dialog, filechooser: sig.filechooser,
      requests: postReqs, writesIntercepted: writes, domChanges: dom,
      storage: !!(after && after.storage !== pre.storage), scroll,
      clipboard: !!(after && after.clip > pre.clip), print: !!(after && after.prints > pre.prints),
      submit: !!(after && after.submits > pre.submits),
      visual, transientDom: !!(after && !dom.length && after.muts > pre.muts && noise.length === 0),
    },
  };
  const verdictPreview = decide(ev);
  if (verdictPreview.verdict === 'dead') {
    shots.before = beforeView;
    shots.after = await annotate(page, loc, 'NOTHING HAPPENED');
  }
  return finish({ ev, ms: Date.now() - tClick });
}

async function annotate(page, loc, label) {
  try {
    const box = await loc.boundingBox({ timeout: 800 });
    if (box) {
      await page.evaluate(({ box, label }) => {
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;left:${box.x - 6}px;top:${box.y - 6}px;width:${box.width + 12}px;height:${box.height + 12}px;border:3px dashed #ff3b5c;border-radius:8px;z-index:2147483647;pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,.35)`;
        const t = document.createElement('div');
        t.textContent = label;
        t.style.cssText = 'position:absolute;left:-3px;top:-28px;background:#ff3b5c;color:#fff;font:700 12px/1 system-ui,sans-serif;padding:6px 8px;border-radius:4px;white-space:nowrap;letter-spacing:.04em';
        d.appendChild(t);
        document.documentElement.appendChild(d);
      }, { box, label });
    }
    return await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
  } catch { return null; }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

export async function run(o) {
  const targets = o.urls.map((u) => checkTarget(u, o.owned));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: !o.headed });
  const startedAt = new Date().toISOString();
  const results = [];
  const pages = [];
  try {
    for (const t of targets) {
      const pageUrl = t.href;
      let controls;
      try { controls = await enumeratePage(browser, pageUrl, o); }
      catch (e) { die(`Could not load ${pageUrl}: ${String(e.message).split('\n')[0]}\nIs your dev server running?`); }
      pages.push({ url: pageUrl, controls: controls.length });
      const queue = [];
      controls.forEach((c, idx) => {
        const r = { page: pageUrl, index: idx, ...c };
        const { skip } = classifySafety(c, { targetOrigin: t.origin, allowDanger: o.allowDanger, skipRe: o.skip, onlyRe: o.only });
        if (skip) { if (skip !== 'not matched by --only') results.push({ ...r, verdict: 'skipped', reason: skip }); }
        else queue.push(r);
      });
      process.stderr.write(`⚰  ${shortUrl(pageUrl, pageUrl) || pageUrl}: ${controls.length} controls found, clicking ${queue.length}…\n`);
      const done = await pool(queue, o.concurrency, async (r) => {
        let out = await probe(browser, pageUrl, r, o, o.wait);
        let d = decide(out.ev);
        let slow = false;
        if (d.verdict === 'dead') { // second chance with a 3x window before we bury anything
          const retry = await probe(browser, pageUrl, r, o, o.wait * 3);
          const d2 = decide(retry.ev);
          if (d2.verdict !== 'dead') { out = retry; d = d2; slow = d2.verdict === 'alive'; }
          else out = retry.shots.after ? retry : out;
        }
        const res = {
          ...r, ...d, slow, blocker: out.blocker, pageErrors: out.ev.pageErrors.slice(0, 3), console: out.ev.console.slice(0, 3),
          signals: summarizeSignals(out.ev.signals), shots: out.shots,
        };
        res.epitaph = res.verdict === 'dead' || res.verdict === 'blocked' ? epitaph(res) : null;
        process.stderr.write(symbol(res.verdict));
        return res;
      });
      process.stderr.write('\n');
      results.push(...done);
    }
    results.sort((a, b) => a.page.localeCompare(b.page) || a.index - b.index);
    const counts = { checked: 0, alive: 0, dead: 0, blocked: 0, unknown: 0, skipped: 0 };
    for (const r of results) { counts[r.verdict]++; if (r.verdict !== 'skipped') counts.checked++; }
    const runData = {
      schema: 'button-graveyard/v1', tool: 'button-graveyard', version: VERSION, startedAt, finishedAt: new Date().toISOString(),
      options: { wait: o.wait, allowDanger: !!o.allowDanger, allowWrites: !!o.allowWrites },
      pages, counts, results,
    };
    if (o.compare) {
      try { runData.comparison = compareRuns(JSON.parse(fs.readFileSync(o.compare, 'utf8')), runData); }
      catch (e) { process.stderr.write(`(could not read --compare file: ${e.message})\n`); }
    }
    const files = await writeReports(o.out, runData, { browser, card: !o.noCard });
    console.log(terminalSummary(runData, files));
    return runData;
  } finally { await browser.close(); }
}

function summarizeSignals(s) {
  const o = {};
  for (const [k, v] of Object.entries(s)) if (v && (!Array.isArray(v) || v.length)) o[k] = Array.isArray(v) ? v.slice(0, 5) : v;
  return o;
}
const symbol = (v) => ({ alive: '.', dead: '✝', blocked: '▣', unknown: '?' }[v] || '');

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  run(o).then((d) => {
    if (o.failOnDead && d.counts.dead + d.counts.blocked > 0) process.exit(1);
  }).catch((e) => die(e.stack || String(e), 3));
}
