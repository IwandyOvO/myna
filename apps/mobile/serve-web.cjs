// Serves the exported web app (expo export --platform web). Used by Dockerfile.web.
//   node serve-web.cjs <dir>   — listens on $PORT (default 8080)
// Hashed bundles are cached for a year; index.html is never cached so new deploys show up immediately.
// Paths without a file extension fall back to index.html (client-side routes like /post/123).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.env.PORT) || 8080;
const index = path.join(root, 'index.html');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const compressible = new Set(['.html', '.js', '.css', '.json', '.map', '.txt', '.svg']);

http
  .createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (urlPath === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    let file = path.join(root, urlPath);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    let stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat || stat.isDirectory()) {
      // A missing asset is a real 404; a missing route is handled by the app.
      if (path.extname(urlPath)) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      file = index;
      stat = fs.statSync(file);
    }
    const ext = path.extname(file);
    const headers = {
      'content-type': types[ext] || 'application/octet-stream',
      'cache-control': file === index ? 'no-cache' : urlPath.startsWith('/_expo/static/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      vary: 'accept-encoding',
    };
    const gzip = compressible.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (gzip) headers['content-encoding'] = 'gzip';
    else headers['content-length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(file);
    (gzip ? stream.pipe(zlib.createGzip()) : stream).pipe(res);
  })
  .listen(port, '0.0.0.0', () => console.log(`web app on :${port} from ${root}`));
