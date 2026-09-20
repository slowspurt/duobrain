import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const assets = new Map([
  ['/', ['text/html; charset=utf-8', new URL('./public/index.html', import.meta.url)]],
  ['/app.js', ['text/javascript; charset=utf-8', new URL('./public/app.js', import.meta.url)]],
  ['/styles.css', ['text/css; charset=utf-8', new URL('./public/styles.css', import.meta.url)]],
]);

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function send(response, status, contentType, body, method = 'GET') {
  response.writeHead(status, {
    ...securityHeaders,
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  response.end(method === 'HEAD' ? undefined : body);
}

export function startDashboard({ getSnapshot, port = 0 } = {}) {
  if (typeof getSnapshot !== 'function') {
    throw new TypeError('getSnapshot must be a function');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new RangeError('port must be an integer between 0 and 65535');
  }

  const server = createServer(async (request, response) => {
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      send(response, 405, 'application/json; charset=utf-8', JSON.stringify({ error: 'method_not_allowed' }), method);
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    } catch {
      send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'bad_request' }), method);
      return;
    }

    if (pathname === '/api/snapshot') {
      try {
        const snapshot = await getSnapshot();
        if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
          throw new TypeError('snapshot must be an object');
        }
        send(response, 200, 'application/json; charset=utf-8', JSON.stringify(snapshot), method);
      } catch {
        send(
          response,
          503,
          'application/json; charset=utf-8',
          JSON.stringify({ error: 'snapshot_unavailable', message: '기록을 불러오지 못했습니다.' }),
          method,
        );
      }
      return;
    }

    const asset = assets.get(pathname);
    if (!asset) {
      send(response, 404, 'text/plain; charset=utf-8', 'Not found', method);
      return;
    }

    try {
      const [contentType, url] = asset;
      send(response, 200, contentType, await readFile(url), method);
    } catch {
      send(response, 500, 'text/plain; charset=utf-8', 'Dashboard asset unavailable', method);
    }
  });

  server.listen(port, '127.0.0.1');
  return server;
}
