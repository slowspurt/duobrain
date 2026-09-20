import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const assets = new Map([
  ['/', ['text/html; charset=utf-8', new URL('./public/index.html', import.meta.url)]],
  ['/app.js', ['text/javascript; charset=utf-8', new URL('./public/app.js', import.meta.url)]],
  ['/model.js', ['text/javascript; charset=utf-8', new URL('./public/model.js', import.meta.url)]],
  ['/styles.css', ['text/css; charset=utf-8', new URL('./public/styles.css', import.meta.url)]],
]);

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

const wikiPathPattern = /^wiki\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.md$/i;
const maxWikiNoteBytes = 1024 * 1024;

function send(response, status, contentType, body, method = 'GET') {
  response.writeHead(status, {
    ...securityHeaders,
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  response.end(method === 'HEAD' ? undefined : body);
}

function wikiErrorResponse(error) {
  if (error?.code === 'INVALID_WIKI_PATH') {
    return [400, { error: 'invalid_wiki_path', message: '올바른 위키 근거 경로가 아닙니다.' }];
  }
  if (error?.code === 'WIKI_NOTE_NOT_FOUND') {
    return [404, { error: 'wiki_note_not_found', message: '근거 노트를 찾을 수 없습니다.' }];
  }
  if (error?.code === 'WIKI_NOTE_TOO_LARGE') {
    return [413, { error: 'wiki_note_too_large', message: '근거 노트가 표시 가능한 크기를 초과했습니다.' }];
  }
  return [503, { error: 'wiki_note_unavailable', message: '근거 노트를 불러오지 못했습니다.' }];
}

export function startDashboard({ getSnapshot, getWikiNote, port = 0 } = {}) {
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

    if (pathname === '/api/wiki') {
      const paths = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.getAll('path');
      if (paths.length !== 1 || !wikiPathPattern.test(paths[0])) {
        const [status, body] = wikiErrorResponse({ code: 'INVALID_WIKI_PATH' });
        send(response, status, 'application/json; charset=utf-8', JSON.stringify(body), method);
        return;
      }
      if (typeof getWikiNote !== 'function') {
        const [status, body] = wikiErrorResponse({ code: 'WIKI_READER_UNAVAILABLE' });
        send(response, status, 'application/json; charset=utf-8', JSON.stringify(body), method);
        return;
      }
      try {
        const note = await getWikiNote({ path: paths[0] });
        if (
          note === null
          || typeof note !== 'object'
          || note.path !== paths[0]
          || typeof note.markdown !== 'string'
          || note.validation === null
          || typeof note.validation !== 'object'
        ) {
          throw new TypeError('invalid wiki note result');
        }
        if (Buffer.byteLength(note.markdown, 'utf8') > maxWikiNoteBytes) {
          const tooLarge = new Error('wiki note too large');
          tooLarge.code = 'WIKI_NOTE_TOO_LARGE';
          throw tooLarge;
        }
        send(
          response,
          200,
          'application/json; charset=utf-8',
          JSON.stringify({ path: note.path, markdown: note.markdown, validation: note.validation }),
          method,
        );
      } catch (error) {
        const [status, body] = wikiErrorResponse(error);
        send(response, status, 'application/json; charset=utf-8', JSON.stringify(body), method);
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
