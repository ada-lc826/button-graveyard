// Tiny static server + fake API for fixtures and demos. Records every API hit.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export function serve(root, port = 0) {
  const hits = [];
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      hits.push(req.method + ' ' + url.pathname);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, items: [1, 2, 3] }));
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(path.resolve(root))) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, hits, port: server.address().port, setRoot: (r) => { root = r; } })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = path.resolve(process.argv[2] || '.');
  const port = +(process.argv[3] || 4173);
  serve(root, port).then(({ port }) => console.log(`serving ${root} on http://127.0.0.1:${port}`));
}
