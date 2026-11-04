import fs from 'node:fs';
import path from 'node:path';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64 = (buf) => (buf ? 'data:image/jpeg;base64,' + Buffer.from(buf).toString('base64') : '');
const label = (r) => r.name || (r.origin === 'looks-clickable' ? `(unnamed clickable ${r.tag})` : '(unnamed icon button)');
const rel = (u, pages) => { try { const x = new URL(u); return pages.length > 1 ? x.pathname + x.search : x.pathname; } catch { return u; } };

export function fixPrompt(r) {
  const why = r.verdict === 'blocked'
    ? `It cannot be clicked: ${r.blocker || 'another element'} sits on top of it and intercepts the click.`
    : r.cause === 'crashed' ? `Clicking it throws: ${r.pageErrors[0]}.`
    : r.cause === 'stub' ? `Clicking it only logs to the console (${r.console[0]}) and does nothing else.`
    : 'Clicking it produces no request, navigation, DOM change, storage change, dialog or pixel change.';
  return [
    `The control "${label(r)}" on ${r.page} does nothing when clicked.`,
    why,
    `Selector: ${r.selector}`,
    `HTML: ${r.html}`,
    `Find the component that renders it and make it do what its label promises. If the feature does not exist yet, ask me whether to build it, hide the control, or show an honest "coming soon" state. Do not add a fake toast or dummy DOM change just to satisfy a checker.`,
  ].join('\n');
}

function stripShots(results, outDir) {
  const shotDir = path.join(outDir, 'shots');
  fs.mkdirSync(shotDir, { recursive: true });
  return results.map((r, i) => {
    const files = {};
    for (const [k, buf] of Object.entries(r.shots || {})) {
      if (!buf) continue;
      const f = `${String(i).padStart(3, '0')}-${k}.jpg`;
      fs.writeFileSync(path.join(shotDir, f), buf);
      files[k] = 'shots/' + f;
    }
    const { shots, ...rest } = r;
    return { ...rest, evidence: files };
  });
}

export async function writeReports(outDir, run, { browser, card = true } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const json = { ...run, results: stripShots(run.results, outDir) };
  for (const r of json.results) if (r.verdict === 'dead' || r.verdict === 'blocked') r.fixPrompt = fixPrompt(r);
  const files = {
    json: path.join(outDir, 'graveyard.json'),
    md: path.join(outDir, 'graveyard.md'),
    html: path.join(outDir, 'graveyard.html'),
  };
  fs.writeFileSync(files.json, JSON.stringify(json, null, 2));
  fs.writeFileSync(files.md, markdown(run));
  fs.writeFileSync(files.html, html(run));
  if (card && browser) {
    files.card = path.join(outDir, 'card.png');
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.setContent(cardHtml(run), { waitUntil: 'load' });
    await p.screenshot({ path: files.card });
    await ctx.close();
  }
  return files;
}

// ---------- Markdown (PR comment / chat) ----------
export function markdown(run) {
  const c = run.counts;
  const dead = run.results.filter((r) => r.verdict === 'dead');
  const blocked = run.results.filter((r) => r.verdict === 'blocked');
  const L = [];
  L.push(`### 🪦 Button Graveyard`);
  L.push('');
  L.push(`**${c.checked} controls clicked:** ${c.alive} alive · **${c.dead} dead** · ${c.blocked} buried alive · ${c.unknown} unknown · ${c.skipped} skipped for safety`);
  if (run.comparison) {
    const k = run.comparison;
    L.push('');
    L.push(`Since last scan: **${k.resurrected.length} resurrected** · ${k.newlyDead.length} newly dead · ${k.stillDead.length} still dead`);
    for (const r of k.resurrected) L.push(`- 🧟 ${label(r)} — now: ${r.reason}`);
    for (const r of k.newlyDead) L.push(`- ⚠️ ${label(r)} died — ${r.reason}`);
  }
  if (dead.length || blocked.length) {
    L.push('');
    L.push('| | Control | Page | Why |');
    L.push('|---|---|---|---|');
    for (const r of dead) L.push(`| ✝ | ${mdCell(label(r))} | \`${rel(r.page, run.pages)}\` | ${mdCell(r.reason)}${r.confidence === 'medium' ? ' _(noisy page)_' : ''} |`);
    for (const r of blocked) L.push(`| ▣ | ${mdCell(label(r))} | \`${rel(r.page, run.pages)}\` | buried alive: ${mdCell(r.reason)} |`);
  }
  L.push('');
  L.push(`<sub>"Dead" means no observable effect inside the observation window — review the evidence before calling it a bug. Deterministic browser checks, no AI judgement. button-graveyard v${run.version}</sub>`);
  return L.join('\n') + '\n';
}
const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 160);

// ---------- Terminal ----------
export function terminalSummary(run, files) {
  const c = run.counts;
  const dead = run.results.filter((r) => r.verdict === 'dead' || r.verdict === 'blocked');
  const L = [];
  L.push('');
  L.push('     .-----.');
  L.push(`     | RIP |   ${c.checked} controls clicked`);
  L.push(`     |     |   ${c.alive} alive · ${c.dead} dead · ${c.blocked} buried alive · ${c.unknown} unknown · ${c.skipped} skipped`);
  L.push('  ___|_____|___');
  L.push('');
  if (run.comparison) {
    const k = run.comparison;
    L.push(`  since last scan: ${k.resurrected.length} resurrected · ${k.newlyDead.length} newly dead · ${k.stillDead.length} still dead`);
    for (const r of k.resurrected) L.push(`    🧟 ${label(r)}  →  ${r.reason}`);
    L.push('');
  }
  for (const r of dead.slice(0, 20)) L.push(`  ${r.verdict === 'blocked' ? '▣' : '✝'} ${label(r).padEnd(28).slice(0, 28)}  ${r.epitaph}`);
  if (dead.length > 20) L.push(`  … and ${dead.length - 20} more`);
  if (dead.length) L.push('');
  L.push(`  report: ${files.html}`);
  L.push(`  json:   ${files.json}`);
  if (files.card) L.push(`  card:   ${files.card}`);
  return L.join('\n');
}

// ---------- HTML report ----------
const CSS = `
:root{--sky:#0b0f1a;--sky2:#141a2b;--ink:#e9e6dc;--mute:#9aa0b4;--stone:#2b3044;--stone2:#3a4058;--edge:#4b5270;--blood:#ff3b5c;--moss:#58d68d;--amber:#f5b942;--line:rgba(255,255,255,.08)}
*{box-sizing:border-box}html,body{margin:0}
html{background:var(--sky)}body{background:radial-gradient(1200px 600px at 80% 0,#26304f 0%,transparent 60%) no-repeat,linear-gradient(var(--sky),var(--sky2) 900px,var(--sky2));color:var(--ink);font:15px/1.55 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh}
.wrap{max-width:1120px;margin:0 auto;padding:48px 20px 80px}
.moon{position:fixed;right:7vw;top:48px;width:84px;height:84px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fffbe8,#e9e1c4 60%,#cfc6a5);box-shadow:0 0 80px 20px rgba(255,248,220,.12);opacity:.9;pointer-events:none}
.brand{font:600 12px/1 ui-monospace,"JetBrains Mono","DejaVu Sans Mono",monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--mute)}
h1{font-family:"Iowan Old Style","Palatino Linotype",Charter,"Bitstream Charter",Georgia,serif;font-weight:700;font-size:clamp(34px,6vw,64px);line-height:1.04;margin:14px 0 10px;letter-spacing:-.01em;max-width:16ch}
h1 em{font-style:normal;color:var(--blood)}
.sub{color:var(--mute);max-width:62ch;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 8px}
.chip{border:1px solid var(--line);background:rgba(255,255,255,.03);border-radius:999px;padding:7px 14px;font-size:13px}
.chip b{font-variant-numeric:tabular-nums;margin-right:6px}
.chip.dead b{color:var(--blood)}.chip.alive b{color:var(--moss)}.chip.blocked b{color:var(--amber)}
.meta{font:12px/1.6 ui-monospace,"JetBrains Mono","DejaVu Sans Mono",monospace;color:var(--mute);margin-top:12px;word-break:break-all}
h2{font-family:"Iowan Old Style","Palatino Linotype",Charter,Georgia,serif;font-size:26px;margin:56px 0 6px}
h2 small{font:13px Inter,system-ui,sans-serif;color:var(--mute);margin-left:10px}
.hint{color:var(--mute);margin:0 0 18px;font-size:14px}
.yard{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:22px;align-items:end;padding-bottom:18px;border-bottom:14px solid #1b2a1f;border-image:linear-gradient(#1f3324,#12201a) 1}
.stone{position:relative;background:linear-gradient(170deg,var(--stone2),var(--stone));border:1px solid var(--edge);border-radius:120px 120px 10px 10px;padding:34px 20px 18px;text-align:center;box-shadow:inset 0 2px 0 rgba(255,255,255,.06),0 18px 30px -18px #000}
.stone .rip{font:700 13px/1 "Iowan Old Style",Georgia,serif;letter-spacing:.35em;color:var(--mute)}
.stone .name{font-family:"Iowan Old Style","Palatino Linotype",Charter,Georgia,serif;font-size:22px;font-weight:700;margin:10px 0 4px;text-shadow:0 1px 0 #000,0 -1px 0 rgba(255,255,255,.08);overflow-wrap:anywhere}
.stone .page{font:12px ui-monospace,"DejaVu Sans Mono",monospace;color:var(--mute)}
.stone .epi{font-family:"Iowan Old Style",Georgia,serif;font-style:italic;color:#cfcab9;margin:12px 0;min-height:2.6em;overflow-wrap:anywhere}
.stone .crop{display:block;max-width:100%;max-height:64px;margin:8px auto 12px;border-radius:6px;border:1px solid var(--line);background:#fff;filter:grayscale(.6) contrast(.9)}
.stone.blocked{border-color:#6b5a2b}.stone.blocked .rip{color:var(--amber)}
.badge{display:inline-block;font:600 11px/1 Inter,system-ui,sans-serif;padding:5px 8px;border-radius:999px;border:1px solid var(--line);color:var(--mute);margin:2px}
.badge.crashed{color:var(--blood);border-color:rgba(255,59,92,.4)}.badge.stub{color:var(--amber);border-color:rgba(245,185,66,.4)}
details{margin-top:10px;text-align:left}
summary{cursor:pointer;color:var(--mute);font-size:13px}
summary:hover{color:var(--ink)}
.ev{margin-top:10px;font-size:13px}
.ev .pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ev figure{margin:0}.ev figcaption{font-size:11px;color:var(--mute);margin-bottom:3px;text-transform:uppercase;letter-spacing:.08em}
.ev img{width:100%;border-radius:4px;border:1px solid var(--line);cursor:zoom-in}
.ev code,.mono{font:12px/1.5 ui-monospace,"JetBrains Mono","DejaVu Sans Mono",monospace;overflow-wrap:anywhere}
.ev pre{white-space:pre-wrap;background:rgba(0,0,0,.35);padding:8px;border-radius:6px;margin:6px 0;max-height:140px;overflow:auto}
button.copy{margin-top:8px;width:100%;background:transparent;color:var(--ink);border:1px solid var(--edge);border-radius:8px;padding:8px 10px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer}
button.copy:hover{border-color:var(--ink)}
.res{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.res .card{border:1px solid rgba(88,214,141,.35);background:rgba(88,214,141,.06);border-radius:12px;padding:14px}
.res .card b{display:block;font-size:16px}.res .card span{color:var(--mute);font-size:13px}
.res .card.bad{border-color:rgba(255,59,92,.4);background:rgba(255,59,92,.06)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:600;color:var(--mute);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
td.v{white-space:nowrap}
.v-alive{color:var(--moss)}.v-unknown{color:var(--mute)}.v-skipped{color:var(--mute)}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.15)}
.empty{border:1px dashed var(--edge);border-radius:14px;padding:28px;text-align:center;color:var(--mute)}
footer{margin-top:64px;color:var(--mute);font-size:13px;border-top:1px solid var(--line);padding-top:18px}
#zoom{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;padding:24px;z-index:9;cursor:zoom-out}
#zoom img{max-width:100%;max-height:100%;border-radius:6px}
@media (max-width:560px){.wrap{padding:32px 16px 64px}.moon{width:54px;height:54px;top:24px}.ev .pair{grid-template-columns:1fr}}
@media print{body{background:#fff;color:#000}.moon{display:none}}
`;

function stone(r, run) {
  const blocked = r.verdict === 'blocked';
  const s = r.shots || {};
  const badges = [];
  if (r.cause === 'crashed') badges.push('<span class="badge crashed">threw an error</span>');
  if (r.cause === 'stub') badges.push('<span class="badge stub">stub handler</span>');
  if (r.origin === 'looks-clickable') badges.push('<span class="badge">looks clickable (cursor: pointer)</span>');
  if (r.confidence === 'medium') badges.push('<span class="badge">noisy page · medium confidence</span>');
  if (!r.name) badges.push('<span class="badge">no accessible name</span>');
  return `<article class="stone${blocked ? ' blocked' : ''}">
  <div class="rip">${blocked ? 'BURIED ALIVE' : 'R.I.P.'}</div>
  <div class="name">${esc(label(r))}</div>
  ${run.pages.length > 1 ? `<div class="page">${esc(rel(r.page, run.pages))}</div>` : ''}
  ${s.crop ? `<img class="crop" alt="" src="${b64(s.crop)}">` : ''}
  <div class="epi">${esc(r.epitaph)}</div>
  <div>${badges.join('')}</div>
  <details><summary>Evidence</summary><div class="ev">
    ${s.before || s.after ? `<div class="pair">${s.before ? `<figure><figcaption>before click</figcaption><img alt="before" src="${b64(s.before)}"></figure>` : ''}${s.after ? `<figure><figcaption>${blocked ? 'what users hit' : 'after ' + run.options.wait + 'ms'}</figcaption><img alt="after" src="${b64(s.after)}"></figure>` : ''}</div>` : ''}
    <p><b>Verdict:</b> ${esc(r.reason)}</p>
    <p><b>Selector</b><br><code>${esc(r.selector)}</code></p>
    <pre>${esc(r.html)}</pre>
    ${r.slow === false && r.verdict === 'dead' ? `<p class="hint">Clicked twice: once with a ${run.options.wait}ms window, once with ${run.options.wait * 3}ms. Watched for navigation, new tabs, downloads, dialogs, file pickers, network requests, DOM/ARIA changes, storage, clipboard, scroll and pixels.</p>` : ''}
  </div></details>
  <button class="copy" data-prompt="${esc(fixPrompt(r))}">Copy fix prompt for your agent</button>
</article>`;
}

export function html(run) {
  const c = run.counts;
  const dead = run.results.filter((r) => r.verdict === 'dead');
  const blocked = run.results.filter((r) => r.verdict === 'blocked');
  const unknown = run.results.filter((r) => r.verdict === 'unknown');
  const skipped = run.results.filter((r) => r.verdict === 'skipped');
  const alive = run.results.filter((r) => r.verdict === 'alive');
  const casualties = dead.length + blocked.length;
  const headline = casualties
    ? `${c.checked} buttons clicked.<br><em>${casualties} ${casualties === 1 ? 'does' : 'do'} nothing.</em>`
    : `${c.checked} buttons clicked.<br>Every one of them is alive.`;
  const k = run.comparison;
  const row = (r) => `<tr><td class="v v-${r.verdict}">${r.verdict}${r.slow ? ' (slow)' : ''}</td><td>${esc(label(r))}</td><td class="mono">${esc(rel(r.page, run.pages))}</td><td>${esc(r.reason)}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Button Graveyard</title><style>${CSS}</style></head><body><div class="moon"></div><div class="wrap">
<div class="brand">⚰ Button Graveyard · v${esc(run.version)}</div>
<h1>${headline}</h1>
<p class="sub">Every visible control was clicked in a fresh browser and watched for ${run.options.wait}ms. No AI decided anything here: each verdict is a recorded browser observation you can check below.</p>
<div class="chips">
  <span class="chip alive"><b>${c.alive}</b>alive</span>
  <span class="chip dead"><b>${c.dead}</b>dead</span>
  <span class="chip blocked"><b>${c.blocked}</b>buried alive</span>
  <span class="chip"><b>${c.unknown}</b>unknown</span>
  <span class="chip"><b>${c.skipped}</b>skipped for safety</span>
</div>
<div class="meta">${run.pages.map((p) => esc(p.url)).join(' · ')}<br>${esc(run.finishedAt)} · writes ${run.options.allowWrites ? 'allowed' : 'intercepted (never sent)'} · destructive controls ${run.options.allowDanger ? 'included' : 'skipped'}</div>

${k ? `<h2>Since last scan<small>${k.resurrected.length} resurrected · ${k.newlyDead.length} newly dead · ${k.stillDead.length} still dead</small></h2>
<div class="res">${k.resurrected.map((r) => `<div class="card"><b>🧟 ${esc(label(r))}</b><span>was ${esc(r.was)} → ${esc(r.reason)}</span></div>`).join('')}${k.newlyDead.map((r) => `<div class="card bad"><b>⚠ ${esc(label(r))}</b><span>was alive → ${esc(r.reason)}</span></div>`).join('')}${!k.resurrected.length && !k.newlyDead.length ? '<div class="empty">No changes since the last scan.</div>' : ''}</div>` : ''}

<h2>The graveyard<small>${dead.length} dead</small></h2>
<p class="hint">Clicked, given a second chance with a 3× longer wait, and still nothing observable happened. "Dead" is a lead to review, not a verdict on your code.</p>
${dead.length ? `<div class="yard">${dead.map((r) => stone(r, run)).join('')}</div>` : '<div class="empty">Nobody is buried here. 🌱</div>'}

${blocked.length ? `<h2>Buried alive<small>${blocked.length}</small></h2><p class="hint">These controls exist, but something is lying on top of them, so a real user's click never reaches them.</p><div class="yard">${blocked.map((r) => stone(r, run)).join('')}</div>` : ''}

${unknown.length || skipped.length ? `<h2>Not judged<small>${unknown.length} unknown · ${skipped.length} skipped</small></h2><p class="hint">Unknown means we could not get a reliable observation. Skipped means we chose not to click it. Neither counts as dead.</p>
<div class="tablewrap"><table><thead><tr><th>Status</th><th>Control</th><th>Page</th><th>Reason</th></tr></thead><tbody>${[...unknown, ...skipped].map(row).join('')}</tbody></table></div>` : ''}

<h2>Alive<small>${alive.length}</small></h2>
<details ${alive.length < 12 ? 'open' : ''}><summary>Show what each live control did</summary><div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>Status</th><th>Control</th><th>Page</th><th>Observed effect</th></tr></thead><tbody>${alive.map(row).join('')}</tbody></table></div></details>

<footer>Alive only means <i>something observable happened</i>. It does not prove the feature is correct. Generated by button-graveyard — a deterministic, zero-API-key agent skill.</footer>
</div><div id="zoom"><img alt=""></div>
<script>
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button.copy');
  if (b) {
    const t = b.dataset.prompt;
    try { await navigator.clipboard.writeText(t); } catch (_) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    const old = b.textContent; b.textContent = 'Copied ✓'; setTimeout(() => (b.textContent = old), 1400);
    return;
  }
  const z = document.getElementById('zoom');
  if (e.target.matches('.ev img')) { z.firstElementChild.src = e.target.src; z.style.display = 'flex'; return; }
  if (e.target.closest('#zoom')) z.style.display = 'none';
});
</script></body></html>`;
}

// ---------- Share card (1200x630) ----------
export function cardHtml(run) {
  const c = run.counts;
  const casualties = run.results.filter((r) => r.verdict === 'dead' || r.verdict === 'blocked');
  const k = run.comparison;
  const risen = !!(k && k.resurrected.length);
  const names = (risen ? k.resurrected : casualties).slice(0, 3).map((r) => label(r));
  const big = k && k.resurrected.length
    ? `<b class="g">${k.resurrected.length}</b> buttons<br>came back to life.`
    : casualties.length ? `<b>${casualties.length}</b> of ${c.checked} buttons<br>do nothing.` : `All ${c.checked} buttons<br>are alive.`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#e9e6dc;
background:radial-gradient(700px 420px at 88% 8%,#2c3760 0%,transparent 62%),linear-gradient(#0b0f1a,#151b2d)}
.moon{position:absolute;right:110px;top:70px;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fffbe8,#e9e1c4 60%,#cfc6a5);box-shadow:0 0 120px 30px rgba(255,248,220,.14)}
.t{position:absolute;left:80px;top:72px}
.brand{font:600 18px/1 "DejaVu Sans Mono",monospace;letter-spacing:.2em;color:#9aa0b4;text-transform:uppercase}
h1{font-family:"Bitstream Charter",Charter,Georgia,serif;font-size:86px;line-height:1.02;margin:22px 0 0;letter-spacing:-.01em}
h1 b{color:#ff3b5c}h1 b.g{color:#58d68d}
.row{position:absolute;left:0;right:0;bottom:0;height:200px;display:flex;align-items:flex-end;gap:26px;padding:0 80px 38px;border-bottom:34px solid #15241a}
.s{width:200px;height:150px;background:linear-gradient(170deg,#3a4058,#2b3044);border:2px solid #4b5270;border-radius:100px 100px 8px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px 14px 6px;text-align:center}
.s i{font:700 14px "Bitstream Charter",Georgia,serif;letter-spacing:.3em;color:#9aa0b4;font-style:normal}
.s span{font:700 20px/1.15 "Bitstream Charter",Georgia,serif;margin-top:8px;overflow:hidden;max-height:48px}
.s.r{border-color:#58d68d;box-shadow:0 0 40px rgba(88,214,141,.35)}.s.r i{color:#58d68d}
.foot{position:absolute;right:80px;bottom:76px;font-size:18px;color:#9aa0b4;text-align:right}
</style></head><body><div class="moon"></div>
<div class="t"><div class="brand">button-graveyard</div><h1>${big}</h1></div>
<div class="row">${names.map((n) => `<div class="s${risen ? ' r' : ''}"><i>${risen ? 'RISEN' : 'R.I.P.'}</i><span>${esc(n.slice(0, 28))}</span></div>`).join('')}</div>
<div class="foot">${c.alive} alive · ${c.dead} dead · ${c.blocked} buried alive<br>deterministic · zero AI judgement</div>
</body></html>`;
}
