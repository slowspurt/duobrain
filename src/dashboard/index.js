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
const maxWikiQueryLength = 500;
const wikiStatuses = new Set(['personal', 'proposed', 'agreed', 'superseded']);
const wikiRecordTypes = new Set(['source-note', 'summary']);

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

function wikiToolUnavailable(response, method) {
  send(response, 503, 'application/json; charset=utf-8', JSON.stringify({
    error: 'wiki_tools_unavailable',
    message: '공유 위키 탐색 기능을 사용할 수 없습니다.',
  }), method);
}

function wikiToolFailure(response, method) {
  send(response, 503, 'application/json; charset=utf-8', JSON.stringify({
    error: 'wiki_tools_unavailable',
    message: '공유 위키 기록을 불러오지 못했습니다.',
  }), method);
}

function badWikiRequest(response, method, message) {
  send(response, 400, 'application/json; charset=utf-8', JSON.stringify({
    error: 'invalid_wiki_query',
    message,
  }), method);
}

export function startDashboard({
  getSnapshot,
  getWikiNote,
  listWikiNotes,
  searchSharedWiki,
  traceSharedWiki,
  port = 0,
} = {}) {
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

    let requestUrl;
    let pathname;
    try {
      requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      pathname = requestUrl.pathname;
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
      const paths = requestUrl.searchParams.getAll('path');
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

    if (pathname === '/api/wiki/notes') {
      if (typeof listWikiNotes !== 'function') return wikiToolUnavailable(response, method);
      try {
        const notes = await listWikiNotes();
        if (!Array.isArray(notes)) throw new TypeError('invalid wiki list result');
        send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ notes }), method);
      } catch {
        wikiToolFailure(response, method);
      }
      return;
    }

    if (pathname === '/api/wiki/search') {
      if (typeof searchSharedWiki !== 'function') return wikiToolUnavailable(response, method);
      const params = requestUrl.searchParams;
      const queries = params.getAll('q');
      if (queries.length > 1 || (queries[0]?.length ?? 0) > maxWikiQueryLength) {
        return badWikiRequest(response, method, '검색어는 하나이며 500자 이하여야 합니다.');
      }
      const filters = {};
      for (const key of ['participant', 'status', 'recordType', 'includeSuperseded']) {
        if (params.getAll(key).length > 1) return badWikiRequest(response, method, '필터는 항목별로 하나만 지정할 수 있습니다.');
      }
      const participant = params.get('participant');
      const status = params.get('status');
      const recordType = params.get('recordType');
      const includeSuperseded = params.get('includeSuperseded');
      if (participant !== null) {
        if (!participant.trim() || participant.length > 100) return badWikiRequest(response, method, '참여자 필터가 올바르지 않습니다.');
        filters.participant = participant;
      }
      if (status !== null) {
        if (!wikiStatuses.has(status)) return badWikiRequest(response, method, '상태 필터가 올바르지 않습니다.');
        filters.status = status;
      }
      if (recordType !== null) {
        if (!wikiRecordTypes.has(recordType)) return badWikiRequest(response, method, '기록 종류 필터가 올바르지 않습니다.');
        filters.recordType = recordType;
      }
      if (includeSuperseded !== null) {
        if (includeSuperseded !== 'true' && includeSuperseded !== 'false') {
          return badWikiRequest(response, method, '대체된 기록 포함 필터가 올바르지 않습니다.');
        }
        filters.includeSuperseded = includeSuperseded === 'true';
      }
      try {
        const result = await searchSharedWiki({ query: queries[0] ?? '', filters });
        if (result === null || typeof result !== 'object' || !Array.isArray(result.results) || !Array.isArray(result.issues)) {
          throw new TypeError('invalid wiki search result');
        }
        send(response, 200, 'application/json; charset=utf-8', JSON.stringify(result), method);
      } catch {
        wikiToolFailure(response, method);
      }
      return;
    }

    if (pathname === '/api/wiki/lineage') {
      if (typeof traceSharedWiki !== 'function') return wikiToolUnavailable(response, method);
      const roots = requestUrl.searchParams.getAll('root');
      if (roots.length === 0 || roots.length > 20 || roots.some((root) => !wikiPathPattern.test(root))) {
        return badWikiRequest(response, method, '1~20개의 올바른 위키 루트 경로가 필요합니다.');
      }
      try {
        const result = await traceSharedWiki({ roots });
        if (
          result === null
          || typeof result !== 'object'
          || !Array.isArray(result.nodes)
          || !Array.isArray(result.edges)
          || !Array.isArray(result.issues)
        ) throw new TypeError('invalid wiki lineage result');
        send(response, 200, 'application/json; charset=utf-8', JSON.stringify(result), method);
      } catch {
        wikiToolFailure(response, method);
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
