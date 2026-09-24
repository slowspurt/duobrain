import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  addWikiNote,
  initSharedStore,
  runWikiRefinement,
} from '../../src/engine/index.js';
import { startDashboard } from '../../src/dashboard/index.js';
import { recordedContextDifferences, wikiListRecords } from '../../src/dashboard/public/model.js';
import { createSnapshotGetter, createWikiNoteGetter, createWikiToolGetters } from '../../src/dashboard/source.js';
import { renderWikiNote } from '../../src/wiki/index.js';

const execFileAsync = promisify(execFile);

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-dashboard-wiki-'));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const repository = path.join(root, 'product');
  await execFileAsync('git', ['init', '--bare', remote]);
  await execFileAsync('git', ['clone', remote, seed]);
  await git(seed, 'config', 'user.name', 'Dashboard Wiki');
  await git(seed, 'config', 'user.email', 'dashboard-wiki@example.invalid');
  await writeFile(path.join(seed, 'private-product.txt'), 'PRIVATE_PRODUCT_MATERIAL\n');
  await git(seed, 'add', '--', 'private-product.txt');
  await git(seed, 'commit', '-m', 'Initial product');
  await git(seed, 'push', '-u', 'origin', 'HEAD:main');
  await execFileAsync('git', ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  await execFileAsync('git', ['clone', remote, repository]);
  await initSharedStore({ repository, participants: ['alice', 'bob'], participant: 'alice' });
  return { root, repository };
}

function sourceNote({ id, title, promptRef, harnessRef, supersedes = [] }) {
  return renderWikiNote({
    schemaVersion: 1,
    id,
    recordType: 'source-note',
    title,
    author: { participant: 'alice', kind: 'ai' },
    observedAt: '2026-09-19T02:00:00.000Z',
    workContext: { promptRef, harnessRef },
    status: supersedes.length ? 'superseded' : 'personal',
    sources: [{ kind: 'observation', ref: `dashboard:${id}` }],
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes,
  }, `# ${title}\n\nShared multiline export evidence.`);
}

function refinementConfig() {
  return {
    timezone: 'Asia/Seoul',
    policy: {
      id: 'dashboard-daily-index',
      version: '1',
      staleAfterDays: 30,
      recencyWindowDays: 90,
      lowImportanceThreshold: 0.3,
      highImportanceThreshold: 0.7,
      unknownImportanceExposure: 'normal',
      importanceSignals: [],
    },
  };
}

async function close(server) {
  server.close();
  await once(server, 'close');
}

test('wiki HTTP APIs validate filters and lineage roots before calling injected readers', async (t) => {
  const calls = [];
  const server = startDashboard({
    getSnapshot: () => ({}),
    listWikiNotes: async () => [],
    searchSharedWiki: async (input) => { calls.push(input); return { results: [], issues: [] }; },
    traceSharedWiki: async (input) => { calls.push(input); return { nodes: [], edges: [], issues: [] }; },
    port: 0,
  });
  await once(server, 'listening');
  t.after(() => close(server));
  const origin = `http://127.0.0.1:${server.address().port}`;

  let response = await fetch(`${origin}/api/wiki/search?q=export&participant=alice&status=personal&recordType=source-note&includeSuperseded=false`);
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], {
    query: 'export',
    filters: { participant: 'alice', status: 'personal', recordType: 'source-note', includeSuperseded: false },
  });

  response = await fetch(`${origin}/api/wiki/search?status=made-up`);
  assert.equal(response.status, 400);
  response = await fetch(`${origin}/api/wiki/search?includeSuperseded=sometimes`);
  assert.equal(response.status, 400);
  response = await fetch(`${origin}/api/wiki/lineage?root=../private-product.txt`);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 1);
});

test('dashboard explores actual E5 list, search, lineage, source, and daily refinement results', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const oldId = randomUUID();
  const currentId = randomUUID();
  const oldPath = `wiki/${oldId}.md`;
  const currentPath = `wiki/${currentId}.md`;
  await addWikiNote({
    repository: setup.repository,
    markdown: sourceNote({ id: oldId, title: 'Old export workflow', promptRef: 'prompt:old', harnessRef: 'harness:old' }),
  });
  await addWikiNote({
    repository: setup.repository,
    markdown: sourceNote({
      id: currentId,
      title: 'Current export workflow',
      promptRef: 'prompt:current',
      harnessRef: 'harness:current',
      supersedes: [oldPath],
    }),
  });
  const refined = await runWikiRefinement({
    repository: setup.repository,
    config: refinementConfig(),
    now: '2026-09-20T09:30:00+09:00',
  });
  assert.equal(refined.outcome, 'completed');

  const server = startDashboard({
    getSnapshot: createSnapshotGetter({ repository: setup.repository }),
    getWikiNote: createWikiNoteGetter({ repository: setup.repository }),
    ...createWikiToolGetters({ repository: setup.repository }),
    port: 0,
  });
  await once(server, 'listening');
  t.after(() => close(server));
  const origin = `http://127.0.0.1:${server.address().port}`;

  let response = await fetch(`${origin}/api/wiki/notes`);
  assert.equal(response.status, 200);
  const listed = await response.json();
  assert.equal(listed.notes.some((note) => note.path === oldPath), true);
  assert.equal(listed.notes.some((note) => note.path === currentPath), true);
  assert.equal(JSON.stringify(listed).includes('PRIVATE_PRODUCT_MATERIAL'), false);
  const records = wikiListRecords(listed.notes);
  assert.equal(records.some((record) => record.dailyRefinement?.date === '2026-09-20'), true);
  assert.deepEqual(recordedContextDifferences(records), {
    promptRefs: ['prompt:current', 'prompt:old'],
    harnessRefs: ['harness:current', 'harness:old'],
    promptDiffers: true,
    harnessDiffers: true,
  });
  assert.equal(wikiListRecords([{
    path: `wiki/${randomUUID()}.md`,
    validation: { valid: true, note: { format: 'structured', metadata: { recordType: 'summary', dailyRefinement: { date: 'bad' } } } },
  }])[0].dailyRefinement, null);

  response = await fetch(`${origin}/api/wiki/search?q=current%20export&participant=alice&recordType=source-note&includeSuperseded=true`);
  assert.equal(response.status, 200);
  const search = await response.json();
  assert.deepEqual(search.results.map((record) => record.path), [currentPath]);

  response = await fetch(`${origin}/api/wiki/lineage?root=${encodeURIComponent(currentPath)}`);
  assert.equal(response.status, 200);
  const lineage = await response.json();
  assert.deepEqual(lineage.nodes.map((record) => record.path), [currentPath, oldPath].sort());
  assert.equal(lineage.edges.some((edge) => edge.from === currentPath && edge.to === oldPath), true);

  response = await fetch(`${origin}/api/wiki?path=${encodeURIComponent(currentPath)}`);
  assert.equal(response.status, 200);
  assert.match((await response.json()).markdown, /Shared multiline export evidence/);
});
