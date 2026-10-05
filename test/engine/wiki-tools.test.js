import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  addWikiNote,
  compareSharedMethods,
  createTicket,
  respondToTicket,
  getSnapshot,
  initSharedStore,
  listWikiNotes,
  searchSharedWiki,
  syncStore,
  traceSharedWiki,
} from '../../src/engine/index.js';
import { renderWikiNote } from '../../src/wiki/index.js';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('bin/duobrain.js');

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function duobrain(repository, ...args) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, ...args, '--repository', repository],
    { encoding: 'utf8' },
  );
  return JSON.parse(stdout);
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duobrain-wiki-tools-'));
  const remote = path.join(root, 'product.git');
  const seed = path.join(root, 'seed');
  const alice = path.join(root, 'alice');
  const bob = path.join(root, 'bob');
  await execFileAsync('git', ['init', '--bare', remote]);
  await execFileAsync('git', ['clone', remote, seed]);
  await git(seed, 'config', 'user.name', 'Test');
  await git(seed, 'config', 'user.email', 'test@example.invalid');
  await writeFile(path.join(seed, 'product.txt'), 'private product material\n');
  await git(seed, 'add', '--', 'product.txt');
  await git(seed, 'commit', '-m', 'Initial product');
  await git(seed, 'push', '-u', 'origin', 'HEAD:main');
  await execFileAsync('git', ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  await execFileAsync('git', ['clone', remote, alice]);
  await execFileAsync('git', ['clone', remote, bob]);
  await initSharedStore({ repository: alice, participants: ['alice', 'bob'], participant: 'alice' });
  await initSharedStore({ repository: bob, participants: ['alice', 'bob'], participant: 'bob' });
  return { root, remote, alice, bob };
}

function methodNote({ id, participant, title, promptRef, harnessRef, supersedes = [] }) {
  return renderWikiNote({
    schemaVersion: 1,
    id,
    recordType: 'source-note',
    title,
    author: { participant, kind: 'ai' },
    observedAt: '2026-09-20T01:00:00.000Z',
    workContext: { promptRef, harnessRef },
    status: supersedes.length > 0 ? 'superseded' : 'personal',
    sources: [{ kind: 'observation', ref: `${participant}:${id}` }],
    summarizes: [],
    previousSummary: null,
    decisionEvidence: [],
    supersedes,
  }, `# ${title}\n\nCaptured export method evidence.`);
}

test('shared wiki list/search/trace use only safe store notes through API and CLI', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const oldId = randomUUID();
  const currentId = randomUUID();
  const oldPath = `wiki/${oldId}.md`;
  const currentPath = `wiki/${currentId}.md`;
  await addWikiNote({
    repository: setup.alice,
    markdown: methodNote({
      id: oldId,
      participant: 'alice',
      title: 'Old export method',
      promptRef: 'prompt:old',
      harnessRef: 'harness:old',
    }),
  });
  await addWikiNote({
    repository: setup.alice,
    markdown: methodNote({
      id: currentId,
      participant: 'alice',
      title: 'Current export method',
      promptRef: 'prompt:current',
      harnessRef: 'harness:current',
      supersedes: [oldPath],
    }),
  });
  await writeFile(path.join(setup.alice, 'secret-comparison-artifact.txt'), 'export method secret\n');

  const listed = await listWikiNotes({ repository: setup.alice });
  assert.deepEqual(listed.map(({ path: wikiPath }) => wikiPath), [oldPath, currentPath].sort());
  assert.equal(listed.some(({ markdown }) => markdown.includes('secret-comparison-artifact')), false);

  const search = await searchSharedWiki({
    repository: setup.alice,
    query: 'current export',
    filters: { participant: 'alice' },
  });
  assert.deepEqual(search.results.map(({ path: wikiPath }) => wikiPath), [currentPath]);
  const cliSearch = await duobrain(setup.alice, 'wiki-search', '--query', 'current export');
  assert.deepEqual(cliSearch.results.map(({ path: wikiPath }) => wikiPath), [currentPath]);

  const lineage = await traceSharedWiki({ repository: setup.alice, roots: [currentPath] });
  assert.deepEqual(lineage.nodes.map(({ path: wikiPath }) => wikiPath), [currentPath, oldPath].sort());
  const cliTrace = await duobrain(setup.alice, 'wiki-trace', '--roots', currentPath);
  assert.equal(cliTrace.edges.some(({ from, to, relation }) => (
    from === currentPath && to === oldPath && relation === 'supersedes[0]'
  )), true);
});

test('find, wiki-get, ticket-get and wiki-list cards read the shared record through the CLI', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const created = await createTicket({
    repository: setup.bob,
    kind: 'information',
    title: 'Why did the review prompt change?',
    body: 'Record the reason for the shorter review prompt.',
    assignee: 'alice',
    actorKind: 'ai',
  });
  const ticketId = created.event.entityId;
  await syncStore({ repository: setup.alice });

  const noteId = randomUUID();
  const notePath = `wiki/${noteId}.md`;
  const added = await addWikiNote({
    repository: setup.alice,
    markdown: renderWikiNote({
      schemaVersion: 1,
      id: noteId,
      recordType: 'source-note',
      title: 'Review prompt shortened',
      abstract: 'The review prompt now lists three checks because the long checklist produced noise.',
      keywords: ['프롬프트 변경 이유', 'review prompt', 'prompts/review.md'],
      author: { participant: 'alice', kind: 'ai' },
      observedAt: '2026-10-05T01:00:00.000Z',
      workContext: { promptRef: 'prompts/review.md', harnessRef: null },
      status: 'personal',
      sources: [{ kind: 'file', ref: 'prompts/review.md' }],
      summarizes: [],
      previousSummary: null,
      decisionEvidence: [],
      supersedes: [],
    }, '# Review prompt shortened\n\nThe long checklist produced noise, so it was cut to three checks.'),
  });
  assert.equal(added.searchMetadata, undefined);
  await respondToTicket({
    repository: setup.alice,
    ticketId,
    body: 'Recorded.',
    evidence: [notePath],
    actorKind: 'ai',
  });
  await syncStore({ repository: setup.bob });

  const found = await duobrain(
    setup.bob,
    'find',
    '--query', '프롬프트를 왜 바꿨지?',
    '--expand', '변경 이유,review prompt',
  );
  assert.equal(found.match, 'strong');
  assert.equal(found.results[0].ref, notePath);
  assert.deepEqual(found.results[0].links.evidenceFor, [`ticket:${ticketId}`]);
  assert.equal(JSON.stringify(found).includes('so it was cut to three checks'), false);

  assert.equal(found.browse.total, 1, 'the ticket the search did not return is listed to browse');
  assert.equal(Object.hasOwn(
    await duobrain(setup.bob, 'find', '--query', 'review prompt', '--no-browse'),
    'browse',
  ), false);

  const byTicket = await duobrain(setup.bob, 'find', '--query', 'review prompt', '--entities', `ticket:${ticketId}`);
  assert.deepEqual(byTicket.results.map(({ ref }) => ref).sort(), [notePath, `ticket:${ticketId}`].sort());

  const note = await duobrain(setup.bob, 'wiki-get', '--path', notePath);
  assert.match(note.markdown, /cut to three checks/);
  const ticket = await duobrain(setup.bob, 'ticket-get', '--ticket', ticketId);
  assert.equal(ticket.status, 'answered');
  assert.deepEqual(ticket.evidence, [notePath]);

  const cards = await duobrain(setup.bob, 'wiki-list');
  assert.deepEqual(cards.map(({ ref }) => ref), [notePath]);
  assert.equal(cards[0].abstract.startsWith('The review prompt now lists'), true);
  assert.equal(Object.hasOwn(cards[0], 'markdown'), false);
  const full = await duobrain(setup.bob, 'wiki-list', '--full');
  assert.match(full[0].markdown, /cut to three checks/);

  await assert.rejects(
    duobrain(setup.bob, 'find', '--query', 'x', '--limit', '50'),
    (error) => /INVALID_QUERY/.test(error.stdout + error.stderr),
  );
});

test('method comparison defaults to a proposal and explicitly creates or reuses one request', async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.root, { recursive: true, force: true }));
  const leftId = randomUUID();
  const leftPath = `wiki/${leftId}.md`;
  const missingPath = `wiki/${randomUUID()}.md`;
  await addWikiNote({
    repository: setup.alice,
    markdown: methodNote({
      id: leftId,
      participant: 'alice',
      title: 'Alice export method',
      promptRef: 'prompt:alice',
      harnessRef: 'harness:alice',
    }),
  });
  const manifest = {
    left: {
      label: 'Alice export method',
      participant: 'alice',
      workRef: 'session:alice-export',
      noteRefs: [leftPath],
    },
    right: {
      label: 'Bob export method',
      participant: 'bob',
      workRef: 'session:bob-export',
      noteRefs: [missingPath],
    },
    artifacts: [
      { ref: 'prompt:alice', kind: 'prompt', version: '1', text: 'Return CSV rows.' },
      { ref: 'harness:alice', kind: 'harness', version: '1', text: 'fixture: csv' },
    ],
  };

  const proposed = await compareSharedMethods({ repository: setup.alice, manifest });
  assert.equal(proposed.comparison.complete, false);
  assert.equal(proposed.missingRequest.action, 'proposed');
  assert.equal((await getSnapshot({ repository: setup.alice })).tickets.length, 0);

  const manifestPath = path.join(setup.root, 'comparison.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const created = await duobrain(
    setup.alice,
    'method-compare',
    '--file', manifestPath,
    '--request-missing',
  );
  assert.equal(created.missingRequest.action, 'created');
  assert.equal(created.missingRequest.sync.status, 'synced');

  const reused = await compareSharedMethods({
    repository: setup.alice,
    manifest,
    requestMissing: true,
  });
  assert.equal(reused.missingRequest.action, 'reused');
  assert.equal(reused.missingRequest.ticketId, created.missingRequest.ticketId);
  assert.equal((await getSnapshot({ repository: setup.alice })).tickets.length, 1);

  await syncStore({ repository: setup.bob });
  const bobSnapshot = await getSnapshot({ repository: setup.bob });
  assert.equal(bobSnapshot.tickets[0].id, created.missingRequest.ticketId);
  assert.equal(bobSnapshot.tickets[0].requester, 'alice');
  assert.equal(bobSnapshot.tickets[0].assignee, 'bob');
});
