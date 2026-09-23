// Minimal static server for the synthetic dev fixture (no dependencies).
// Usage: pnpm fixtures:serve  ->  http://localhost:4173/site/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.FIXTURE_PORT ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.js': 'text/javascript' };
const placeholderSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="#4b6cff"/></svg>';

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  if (url.pathname === '/') {
    res.writeHead(302, { location: '/site/' }).end();
    return;
  }
  if (url.pathname.startsWith('/site/img/')) {
    res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(placeholderSvg);
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  const file = join(root, rel.endsWith(sep) || rel.endsWith('/') || rel === 'site' ? join(rel, 'index.html') : rel);
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`Synthetic EA fixture: http://localhost:${port}/site/`));
