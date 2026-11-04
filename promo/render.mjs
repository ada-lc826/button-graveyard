// Renders promo/stage.html → promo/out/promo.mp4 (1080x1920, 30fps) + soundtrack.
// usage: node render.mjs preview 4.9 18.6 ...   |   node render.mjs [scene ids...]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const STAGE = process.env.STAGE || 'stage.html';
const out = path.join(here, process.env.OUTDIR || 'out');
fs.mkdirSync(out, { recursive: true });
const req = createRequire(import.meta.url);
let pw; for (const p of [path.join(here, '../node_modules/playwright'), path.join(execSync('npm root -g').toString().trim(), 'playwright'), '/opt/npm-tools/node_modules/playwright']) { try { pw = req(p); break; } catch {} }
const FPS = 30;
const [mode, ...rest] = process.argv.slice(2);

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(here, STAGE));
await page.evaluate(() => window.ready);
await page.waitForTimeout(300);
const scenes = await page.evaluate(() => window.SCENES);
fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify(await page.evaluate(() => ({ events: window.EVENTS, duration: window.DURATION, scenes: window.SCENES })), null, 1));

if (mode === 'preview') {
  for (const t of rest) {
    await page.evaluate((t) => window.render(t), +t);
    await page.screenshot({ path: path.join(out, `preview-${t}.jpg`), type: 'jpeg', quality: 92 });
  }
  await browser.close(); process.exit(0);
}
if (mode === 'cover') {
  await page.evaluate((t) => window.render(t), +rest[0]);
  await page.screenshot({ path: path.join(out, 'cover-9x16.jpg'), type: 'jpeg', quality: 92 });
  await browser.close(); process.exit(0);
}

const only = mode ? [mode, ...rest] : null;
for (const [id, a, b] of scenes) {
  if (only && !only.includes(id)) continue;
  const n = Math.round((b - a) * FPS);
  const tmp = path.join(out, `${id}.tmp.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((r) => ff.on('close', r));
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.render(t), a + i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  const code = await done;
  if (code !== 0) throw new Error(`ffmpeg failed on ${id}`);
  fs.renameSync(tmp, path.join(out, `${id}.mp4`));
  console.log(`${id}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await browser.close();
