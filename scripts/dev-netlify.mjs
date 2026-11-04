import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { handler } = require('../netlify/functions/api.js');
const publicDir = new URL('../public/', import.meta.url).pathname;
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/admin', ['admin.html', 'text/html; charset=utf-8']],
  ['/admin.html', ['admin.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://localhost:${port}`).pathname;
  try {
    if (pathname === '/.netlify/functions/api') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const result = await handler({httpMethod: req.method, body: Buffer.concat(chunks).toString('utf8')});
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
      return;
    }
    const file = files.get(pathname);
    if (!file || req.method !== 'GET') { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': file[1], 'Cache-Control': 'no-store'});
    res.end(await readFile(join(publicDir, file[0])));
  } catch (error) {
    console.error(error);
    res.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Lỗi máy chủ xem trước.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Netlify preview: http://127.0.0.1:${port}`));
