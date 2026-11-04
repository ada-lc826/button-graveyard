// Regenerates README images from demo/out (run `npm run demo` first). Needs ffmpeg for the GIF.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, '..', 'assets');
const req = createRequire(import.meta.url);
let pw; for (const p of [path.join(process.cwd(), 'node_modules/playwright'), path.join(execSync('npm root -g').toString().trim(), 'playwright')]) { try { pw = req(p); break; } catch {} }
const log = fs.readFileSync(path.join(here, 'out.log'), 'utf8').replace(/\/[^\s]*\/demo\/out\//g, '.button-graveyard/');
const [before, after] = log.split('=== 2)');
const term = (txt, cmd) => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0b0f1a;width:1200px;height:700px;display:flex;align-items:center;justify-content:center;font-family:'DejaVu Sans Mono',monospace">
<div style="width:1100px;background:#11162a;border:1px solid #262c48;border-radius:14px;box-shadow:0 30px 60px #0008;overflow:hidden">
<div style="padding:12px 16px;border-bottom:1px solid #262c48;display:flex;gap:8px"><i style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></i><i style="width:12px;height:12px;border-radius:50%;background:#febc2e"></i><i style="width:12px;height:12px;border-radius:50%;background:#28c840"></i></div>
<pre style="margin:0;padding:22px 26px;color:#d6d9e6;font-size:17px;line-height:1.45;white-space:pre-wrap"><span style="color:#58d68d">❯</span> ${cmd}\n${txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/(✝[^\n]*|▣[^\n]*)/g,'<span style="color:#ff6b84">$1</span>').replace(/(🧟[^\n]*)/g,'<span style="color:#58d68d">$1</span>')}</pre></div></body>`;
const b = await pw.chromium.launch();
const shot = async (html, file, w = 1200, h = 700, url) => { const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 }); if (url) await p.goto(url); else await p.setContent(html); await p.waitForTimeout(200); await p.screenshot({ path: file }); await p.close(); };
const tmp = fs.mkdtempSync(path.join(here, '.frames-'));
const clean = (s) => s.replace(/^.*===.*$/m, '').replace(/^\s*report:.*$|^\s*json:.*$|^\s*card:.*$/gm, '').trim();
await shot(null, path.join(tmp, '1.png'), 1200, 700, 'file://' + path.join(here, 'broken/index.html'));
await shot(term(clean(before), 'use button-graveyard on localhost:4173'), path.join(tmp, '2.png'));
await shot(null, path.join(tmp, '3.png'), 1200, 700, 'file://' + path.join(here, 'out/before/graveyard.html'));
await shot(term(clean(after), 'fix them, then rescan with --compare'), path.join(tmp, '4.png'));
fs.copyFileSync(path.join(here, 'out/after/card.png'), path.join(tmp, '5src.png'));
execSync(`ffmpeg -y -loglevel error -i ${tmp}/5src.png -vf scale=1200:630,pad=1200:700:0:35:0x0b0f1a ${tmp}/5.png`);
// Static images for the README
const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('file://' + path.join(here, 'out/before/graveyard.html'));
await p.screenshot({ path: path.join(assets, 'report.png'), clip: { x: 0, y: 0, width: 1280, height: 1000 } });
await p.close();
fs.copyFileSync(path.join(here, 'out/before/card.png'), path.join(assets, 'card-before.png'));
fs.copyFileSync(path.join(here, 'out/after/card.png'), path.join(assets, 'card-after.png'));
await b.close();
// GIF: 5 frames, ~2.6s each
const list = [1, 2, 3, 4, 5].map((i) => `file '${tmp}/${i}.png'\nduration ${i === 2 || i === 4 ? 3.6 : 2.6}`).join('\n') + `\nfile '${tmp}/5.png'\n`;
fs.writeFileSync(path.join(tmp, 'list.txt'), list);
execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i ${tmp}/list.txt -vf "fps=8,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" ${path.join(assets, 'demo.gif')}`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('assets written to', assets);
