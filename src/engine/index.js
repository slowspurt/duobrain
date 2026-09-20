import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const STATE_BRANCH = 'duobrain/state';
const NULL_GOALS = Object.freeze({ project: null, mediumTerm: null, currentPhase: null });

export class EngineError extends Error {
  constructor(message, { code = 'ENGINE_ERROR', cause } = {}) {
    super(message, { cause });
    this.name = 'EngineError';
    this.code = code;
  }
}

async function git(cwd, args, { allowFailure = false } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (error) {
    const result = {
      ok: false,
      stdout: String(error.stdout ?? '').trim(),
      stderr: String(error.stderr ?? '').trim(),
      code: error.code,
    };
    if (allowFailure) return result;
    throw new EngineError(result.stderr || `git ${args[0]} failed`, {
      code: 'GIT_ERROR',
      cause: error,
    });
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, filePath);
}

function assertParticipantList(participants) {
  if (!Array.isArray(participants) || participants.length !== 2) {
    throw new EngineError('Exactly two participant IDs are required.', { code: 'INVALID_CONFIG' });
  }
  if (participants.some((item) => typeof item !== 'string' || item.trim() !== item || item.length === 0)) {
    throw new EngineError('Participant IDs must be non-empty trimmed strings.', { code: 'INVALID_CONFIG' });
  }
  if (new Set(participants).size !== 2) {
    throw new EngineError('Participant IDs must be distinct.', { code: 'INVALID_CONFIG' });
  }
}

function sameParticipants(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function resolveLayout(repository = '.') {
  const repositoryPath = path.resolve(repository);
  const topLevel = await git(repositoryPath, ['rev-parse', '--show-toplevel']);
  const common = await git(repositoryPath, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const root = path.join(common.stdout, 'duobrain');
  return {
    repositoryPath: topLevel.stdout,
    root,
    statePath: path.join(root, 'state'),
    identityPath: path.join(root, 'identity.json'),
    statusPath: path.join(root, 'sync-status.json'),
  };
}

async function loadLayout(repository) {
  const layout = await resolveLayout(repository);
  if (!(await exists(path.join(layout.statePath, '.git')))) {
    throw new EngineError('duobrain is not initialized; run `duobrain init` first.', {
      code: 'NOT_INITIALIZED',
    });
  }
  return layout;
}

async function loadIdentity(layout) {
  if (!(await exists(layout.identityPath))) {
    throw new EngineError('Local participant identity is missing; run `duobrain init`.', {
      code: 'MISSING_IDENTITY',
    });
  }
  return readJson(layout.identityPath);
}

async function loadConfig(layout) {
  const config = await readJson(path.join(layout.statePath, 'config.json'));
  if (config.schemaVersion !== 1) {
    throw new EngineError(`Unsupported shared schema version: ${config.schemaVersion}`, {
      code: 'INCOMPATIBLE_CONFIG',
    });
  }
  assertParticipantList(config.participants);
  return config;
}

async function setSyncStatus(layout, status, message, extra = {}) {
  const previous = (await exists(layout.statusPath))
    ? await readJson(layout.statusPath)
    : { lastSyncedAt: null, lastRemoteHead: null };
  const next = {
    status,
    lastSyncedAt: status === 'synced' ? new Date().toISOString() : previous.lastSyncedAt ?? null,
    message: message ?? null,
    lastRemoteHead: extra.lastRemoteHead ?? previous.lastRemoteHead ?? null,
  };
  await writeJsonAtomic(layout.statusPath, next);
  return next;
}

async function remoteHasState(statePath) {
  const result = await git(
    statePath,
    ['ls-remote', '--exit-code', '--heads', 'origin', STATE_BRANCH],
    { allowFailure: true },
  );
  if (result.ok) return true;
  if (result.code === 2 && result.stdout === '') return false;
  throw new EngineError(result.stderr || 'Unable to inspect the shared state remote.', {
    code: 'SYNC_UNAVAILABLE',
  });
}

async function configureStateRepository(statePath, remoteUrl) {
  await mkdir(statePath, { recursive: true });
  await git(statePath, ['init', `--initial-branch=${STATE_BRANCH}`]);
  await git(statePath, ['config', 'user.name', 'duobrain']);
  await git(statePath, ['config', 'user.email', 'duobrain@local.invalid']);
  await git(statePath, ['remote', 'add', 'origin', remoteUrl]);
}

export async function initSharedStore({
  repository = '.',
  participants,
  participant,
} = {}) {
  assertParticipantList(participants);
  if (!participants.includes(participant)) {
    throw new EngineError('Local participant must be one of the two configured participants.', {
      code: 'INVALID_IDENTITY',
    });
  }

  const layout = await resolveLayout(repository);
  const remote = await git(layout.repositoryPath, ['remote', 'get-url', 'origin']);
  if (await exists(path.join(layout.statePath, '.git'))) {
    const config = await loadConfig(layout);
    if (!sameParticipants(config.participants, participants)) {
      throw new EngineError('Existing shared participant configuration does not match.', {
        code: 'INCOMPATIBLE_CONFIG',
      });
    }
    const identity = await loadIdentity(layout);
    if (identity.participant !== participant) {
      throw new EngineError(`This checkout already belongs to participant ${identity.participant}.`, {
        code: 'IDENTITY_MISMATCH',
      });
    }
    return { initialized: false, participant, storePath: layout.statePath };
  }

  await configureStateRepository(layout.statePath, remote.stdout);
  if (await remoteHasState(layout.statePath)) {
    await git(layout.statePath, ['fetch', 'origin', `refs/heads/${STATE_BRANCH}`]);
    await git(layout.statePath, ['checkout', '-B', STATE_BRANCH, 'FETCH_HEAD']);
    const config = await loadConfig(layout);
    if (!sameParticipants(config.participants, participants)) {
      throw new EngineError('Remote shared participant configuration does not match.', {
        code: 'INCOMPATIBLE_CONFIG',
      });
    }
  } else {
    await writeJsonAtomic(path.join(layout.statePath, 'config.json'), {
      schemaVersion: 1,
      participants,
    });
    await git(layout.statePath, ['add', '--', 'config.json']);
    await git(layout.statePath, ['commit', '-m', 'Initialize duobrain shared state']);
  }

  await writeJsonAtomic(layout.identityPath, { schemaVersion: 1, participant });
  await setSyncStatus(layout, 'unknown', 'Shared state has not been synchronized yet.');
  const sync = await syncStore({ repository: layout.repositoryPath });
  return { initialized: true, participant, storePath: layout.statePath, sync };
}

async function changedPaths(statePath, base, head) {
  const result = await git(statePath, ['diff', '--name-status', '--find-renames', base, head]);
  if (!result.stdout) return [];
  return result.stdout.split('\n').map((line) => {
    const [statusCode, ...names] = line.split('\t');
    return { statusCode, names };
  });
}

async function assertAppendOnly(statePath, base, head, side) {
  const changes = await changedPaths(statePath, base, head);
  for (const change of changes) {
    const name = change.names.at(-1);
    const allowedAddition = change.statusCode === 'A'
      && (name.startsWith('events/') || name.startsWith('wiki/'));
    if (!allowedAddition) {
      throw new EngineError(
        `${side} shared history is not append-only: ${change.statusCode} ${change.names.join(' -> ')}`,
        { code: 'IMMUTABLE_HISTORY_VIOLATION' },
      );
    }
  }
}

async function validateCurrentStore(layout) {
  await loadConfig(layout);
  const files = await git(layout.statePath, ['ls-files']);
  for (const name of files.stdout.split('\n').filter(Boolean)) {
    if (name === 'config.json' || name.startsWith('events/') || name.startsWith('wiki/')) continue;
    throw new EngineError(`Unexpected shared-store path: ${name}`, { code: 'INVALID_STORE' });
  }
}

export async function syncStore({ repository = '.' } = {}) {
  const layout = await loadLayout(repository);
  try {
    const dirty = await git(layout.statePath, ['status', '--porcelain']);
    if (dirty.stdout) {
      throw new EngineError('Shared state checkout has uncommitted changes.', { code: 'DIRTY_STORE' });
    }
    await validateCurrentStore(layout);
    const localHead = (await git(layout.statePath, ['rev-parse', 'HEAD'])).stdout;
    const previousStatus = (await exists(layout.statusPath)) ? await readJson(layout.statusPath) : {};

    const hasRemote = await remoteHasState(layout.statePath);
    if (!hasRemote) {
      const pushed = await git(
        layout.statePath,
        ['push', '-u', 'origin', `HEAD:refs/heads/${STATE_BRANCH}`],
        { allowFailure: true },
      );
      if (!pushed.ok) {
        return setSyncStatus(layout, 'pending', pushed.stderr || 'Push failed; retry sync.', {
          lastRemoteHead: previousStatus.lastRemoteHead,
        });
      }
      const head = (await git(layout.statePath, ['rev-parse', 'HEAD'])).stdout;
      return setSyncStatus(layout, 'synced', null, { lastRemoteHead: head });
    }

    const fetched = await git(
      layout.statePath,
      ['fetch', 'origin', `+refs/heads/${STATE_BRANCH}:refs/remotes/origin/${STATE_BRANCH}`],
      { allowFailure: true },
    );
    if (!fetched.ok) {
      return setSyncStatus(layout, 'pending', fetched.stderr || 'Fetch failed; retry sync.');
    }
    const remoteRef = `refs/remotes/origin/${STATE_BRANCH}`;
    const remoteHead = (await git(layout.statePath, ['rev-parse', remoteRef])).stdout;
    if (previousStatus.lastRemoteHead) {
      const stable = await git(
        layout.statePath,
        ['merge-base', '--is-ancestor', previousStatus.lastRemoteHead, remoteHead],
        { allowFailure: true },
      );
      if (!stable.ok) {
        throw new EngineError('Remote shared history was rewritten.', {
          code: 'REMOTE_HISTORY_REWRITTEN',
        });
      }
    }

    const baseResult = await git(layout.statePath, ['merge-base', localHead, remoteHead], {
      allowFailure: true,
    });
    if (!baseResult.ok || !baseResult.stdout) {
      throw new EngineError('Local and remote shared histories have no common base.', {
        code: 'UNRELATED_HISTORY',
      });
    }
    await assertAppendOnly(layout.statePath, baseResult.stdout, localHead, 'Local');
    await assertAppendOnly(layout.statePath, baseResult.stdout, remoteHead, 'Remote');

    const remoteIsLocal = remoteHead === localHead;
    if (!remoteIsLocal) {
      const merged = await git(layout.statePath, ['merge', '--no-edit', remoteRef], {
        allowFailure: true,
      });
      if (!merged.ok) {
        await git(layout.statePath, ['merge', '--abort'], { allowFailure: true });
        throw new EngineError(
          'Shared histories conflict. Both versions remain in Git; manual coordination is required.',
          { code: 'SYNC_CONFLICT' },
        );
      }
      await validateCurrentStore(layout);
    }

    const pushed = await git(
      layout.statePath,
      ['push', 'origin', `HEAD:refs/heads/${STATE_BRANCH}`],
      { allowFailure: true },
    );
    if (!pushed.ok) {
      return setSyncStatus(layout, 'pending', pushed.stderr || 'Push was rejected; retry sync.', {
        lastRemoteHead: remoteHead,
      });
    }
    const head = (await git(layout.statePath, ['rev-parse', 'HEAD'])).stdout;
    return setSyncStatus(layout, 'synced', null, { lastRemoteHead: head });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof EngineError && error.code === 'SYNC_UNAVAILABLE') {
      return setSyncStatus(layout, 'pending', message);
    }
    await setSyncStatus(layout, 'error', message);
    if (error instanceof EngineError) throw error;
    throw new EngineError(message, { cause: error });
  }
}

function assertString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    throw new EngineError(`${label} must be ${allowEmpty ? 'a string' : 'a non-empty string'}.`, {
      code: 'INVALID_INPUT',
    });
  }
}

function normalizeOptional(value, label) {
  if (value === undefined || value === null) return null;
  assertString(value, label);
  return value;
}

async function commitEvent(layout, event) {
  const relativePath = `events/${event.id}.json`;
  const eventPath = path.join(layout.statePath, relativePath);
  await mkdir(path.dirname(eventPath), { recursive: true });
  await writeJsonAtomic(eventPath, event);
  await git(layout.statePath, ['add', '--', relativePath]);
  await git(layout.statePath, ['commit', '-m', `Record ${event.type} ${event.entityId}`]);
  return (await git(layout.statePath, ['rev-parse', 'HEAD'])).stdout;
}

async function recordEvent(layout, event, sync) {
  const commit = await commitEvent(layout, event);
  const syncResult = sync ? await syncStore({ repository: layout.repositoryPath }) : await setSyncStatus(
    layout,
    'pending',
    'Local event is committed but has not been pushed.',
  );
  return { event, commit, sync: syncResult };
}

export async function startSession({
  repository = '.',
  title,
  scope = [],
  goal = null,
  branch = null,
  baseCommit = null,
  actorKind = 'human',
  sync = true,
} = {}) {
  assertString(title, 'title');
  if (!Array.isArray(scope) || scope.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new EngineError('scope must be an array of non-empty strings.', { code: 'INVALID_INPUT' });
  }
  if (!['human', 'ai'].includes(actorKind)) {
    throw new EngineError('actorKind must be human or ai.', { code: 'INVALID_INPUT' });
  }
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const config = await loadConfig(layout);
  if (!config.participants.includes(identity.participant)) {
    throw new EngineError('Local identity is not in shared configuration.', { code: 'IDENTITY_MISMATCH' });
  }
  const id = randomUUID();
  const event = {
    schemaVersion: 1,
    id,
    at: new Date().toISOString(),
    actor: { participant: identity.participant, kind: actorKind },
    entityId: id,
    type: 'session.started',
    previous: null,
    data: {
      title,
      scope,
      goal: normalizeOptional(goal, 'goal'),
      branch: normalizeOptional(branch, 'branch'),
      baseCommit: normalizeOptional(baseCommit, 'baseCommit'),
    },
  };
  return recordEvent(layout, event, sync);
}

export async function endSession({
  repository = '.',
  sessionId,
  summary,
  blockers = [],
  next = null,
  actorKind = 'human',
  sync = true,
} = {}) {
  assertString(sessionId, 'sessionId');
  assertString(summary, 'summary');
  if (!Array.isArray(blockers) || blockers.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new EngineError('blockers must be an array of non-empty strings.', { code: 'INVALID_INPUT' });
  }
  if (!['human', 'ai'].includes(actorKind)) {
    throw new EngineError('actorKind must be human or ai.', { code: 'INVALID_INPUT' });
  }
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const built = await buildSnapshot(layout);
  const session = built.sessions.find((item) => item.id === sessionId);
  if (!session) throw new EngineError(`Unknown session: ${sessionId}`, { code: 'UNKNOWN_SESSION' });
  if (session.participant !== identity.participant) {
    throw new EngineError('Only the session owner can end it.', { code: 'NOT_SESSION_OWNER' });
  }
  if (!['active', 'paused'].includes(session.status)) {
    throw new EngineError(`Session is already ${session.status}.`, { code: 'INVALID_TRANSITION' });
  }
  if (built.conflicts.some((conflict) => conflict.entityId === sessionId)) {
    throw new EngineError('The session has a concurrent history conflict.', { code: 'ENTITY_CONFLICT' });
  }
  const previous = session.history.at(-1)?.id ?? sessionId;
  const event = {
    schemaVersion: 1,
    id: randomUUID(),
    at: new Date().toISOString(),
    actor: { participant: identity.participant, kind: actorKind },
    entityId: sessionId,
    type: 'session.ended',
    previous,
    data: {
      summary,
      blockers,
      next: normalizeOptional(next, 'next'),
    },
  };
  return recordEvent(layout, event, sync);
}

async function readEvents(layout) {
  const directory = path.join(layout.statePath, 'events');
  if (!(await exists(directory))) return [];
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map((name) => readJson(path.join(directory, name))));
}

function validDateMs(value) {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function collectEntityHistory(root, events) {
  const byPrevious = new Map();
  for (const event of events) {
    if (event.id === root.id) continue;
    const list = byPrevious.get(event.previous) ?? [];
    list.push(event);
    byPrevious.set(event.previous, list);
  }
  const history = [];
  const conflicts = [];
  let cursor = root.id;
  const visited = new Set([root.id]);
  while (true) {
    const children = byPrevious.get(cursor) ?? [];
    if (children.length === 0) break;
    if (children.length > 1) {
      conflicts.push({
        entityId: root.entityId,
        previous: cursor,
        eventIds: children.map((event) => event.id).sort(),
        message: 'Concurrent events share the same previous event.',
      });
      break;
    }
    const child = children[0];
    if (visited.has(child.id)) break;
    visited.add(child.id);
    history.push(child);
    cursor = child.id;
  }
  return { history, conflicts };
}

async function buildSnapshot(layout) {
  const config = await loadConfig(layout);
  const events = await readEvents(layout);
  const roots = events.filter((event) => event.type === 'session.started' && event.previous === null);
  const sessions = [];
  const conflicts = [];

  for (const root of roots) {
    const entityEvents = events.filter((event) => event.entityId === root.entityId);
    const collected = collectEntityHistory(root, entityEvents);
    conflicts.push(...collected.conflicts);
    let status = 'active';
    let endedAt = null;
    let blockers = [];
    let next = null;
    for (const event of collected.history) {
      if (event.type === 'session.paused') status = 'paused';
      if (event.type === 'session.resumed') status = 'active';
      if (event.type === 'session.ended') {
        status = 'ended';
        endedAt = event.at;
        blockers = event.data.blockers ?? [];
        next = event.data.next ?? null;
      }
    }
    const startedMs = validDateMs(root.at);
    const endedMs = endedAt === null ? null : validDateMs(endedAt);
    sessions.push({
      id: root.entityId,
      participant: root.actor.participant,
      title: root.data.title,
      scope: root.data.scope,
      goal: root.data.goal ?? null,
      status,
      startedAt: root.at,
      endedAt,
      elapsedMs: startedMs !== null && endedMs !== null ? Math.max(0, endedMs - startedMs) : null,
      blockers,
      next,
      history: [root, ...collected.history].map((event) => ({
        id: event.id,
        type: event.type,
        at: event.at,
        actor: event.actor,
      })),
    });
  }
  sessions.sort((left, right) => left.startedAt.localeCompare(right.startedAt));

  const sync = (await exists(layout.statusPath))
    ? await readJson(layout.statusPath)
    : { status: 'unknown', lastSyncedAt: null, message: null };
  return {
    schemaVersion: 1,
    sample: false,
    participants: config.participants,
    goals: { ...NULL_GOALS },
    sessions,
    tickets: [],
    sync: {
      status: sync.status ?? 'unknown',
      lastSyncedAt: sync.lastSyncedAt ?? null,
      message: sync.message ?? null,
    },
    conflicts,
  };
}

export async function getSnapshot({ repository = '.' } = {}) {
  const layout = await loadLayout(repository);
  return buildSnapshot(layout);
}

export async function getEngineStatus({ repository = '.' } = {}) {
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const snapshot = await buildSnapshot(layout);
  const head = (await git(layout.statePath, ['rev-parse', 'HEAD'])).stdout;
  return { participant: identity.participant, head, storePath: layout.statePath, snapshot };
}
