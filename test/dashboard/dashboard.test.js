import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { startDashboard } from '../../src/dashboard/index.js';

const fixtureUrl = new URL('../../examples/shared/snapshot.json', import.meta.url);

async function launch(getSnapshot) {
  const server = startDashboard({ getSnapshot, port: 0 });
  await once(server, 'listening');
  const { address, port } = server.address();
  assert.equal(address, '127.0.0.1');
  return { server, origin: `http://127.0.0.1:${port}` };
}

async function close(server) {
  server.close();
  await once(server, 'close');
}

test('serves the shared sample snapshot through the read-only API', async (t) => {
  const snapshot = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const { server, origin } = await launch(() => snapshot);
  t.after(() => close(server));

  const response = await fetch(`${origin}/api/snapshot`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await response.json(), snapshot);

  const post = await fetch(`${origin}/api/snapshot`, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('accepts an asynchronous getter and reports snapshot failures without details', async (t) => {
  const expected = { schemaVersion: 1, sample: true, participants: [], goals: {}, sessions: [], tickets: [], sync: { status: 'unknown' } };
  const first = await launch(async () => expected);
  t.after(() => close(first.server));
  assert.deepEqual(await (await fetch(`${first.origin}/api/snapshot`)).json(), expected);

  const failed = await launch(() => { throw new Error('secret file path'); });
  t.after(() => close(failed.server));
  const response = await fetch(`${failed.origin}/api/snapshot`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'snapshot_unavailable', message: '기록을 불러오지 못했습니다.' });
});

test('serves a static shell with a restrictive policy and no snapshot interpolation', async (t) => {
  const attack = '</script><img src=x onerror=alert(1)>';
  const { server, origin } = await launch(() => ({ sample: true, goals: { project: attack } }));
  t.after(() => close(server));

  const response = await fetch(origin);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.doesNotMatch(html, /onerror=alert/);

  const script = await (await fetch(`${origin}/app.js`)).text();
  assert.match(script, /textContent/);
  assert.doesNotMatch(script, /innerHTML/);

  const model = await (await fetch(`${origin}/model.js`)).text();
  assert.match(model, /export function filterTickets/);

  const styles = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(styles, /\[hidden\]\s*{\s*display:\s*none\s*!important;/);
});

test('supports empty snapshots and validates startup arguments', async (t) => {
  assert.throws(() => startDashboard({}), /getSnapshot/);
  assert.throws(() => startDashboard({ getSnapshot: () => ({}), port: -1 }), /port/);

  const { server, origin } = await launch(() => ({}));
  t.after(() => close(server));
  assert.deepEqual(await (await fetch(`${origin}/api/snapshot`)).json(), {});
  assert.equal((await fetch(`${origin}/missing`)).status, 404);
});
