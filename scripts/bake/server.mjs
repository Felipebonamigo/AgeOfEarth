// Servidor estático mínimo para o bake: serve `scripts/bake/page/` na raiz, o three.js de `node_modules/three/` e a
// pasta `art/` do projeto (modelos .glb em art/src). Porta livre (0). Usado só por bake.mjs; sem dependências.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream' };

/** Sobe o servidor e devolve `{ port, close }`. `root` é a raiz do repositório. */
export async function startServer(root) {
  const pageDir = path.join(root, 'scripts', 'bake', 'page');
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';
    let file;
    if (p.startsWith('/node_modules/three/') || p.startsWith('/art/')) file = path.join(root, p);
    else file = path.join(pageDir, p);
    const rel = path.relative(root, file);
    if (rel.startsWith('..') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}
