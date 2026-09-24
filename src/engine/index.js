import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import {
  compareKnowledgeMethods,
  parseWikiNote,
  planDailyWikiRefinement,
  searchWikiNotes,
  traceWikiLineage,
  validateWikiNote,
} from '../wiki/index.js';

const execFileAsync = promisify(execFile);
const STATE_BRANCH = 'duobrain/state';
const NULL_GOALS = Object.freeze({ project: null, mediumTerm: null, currentPhase: null });
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WIKI_PATH_PATTERN = /^wiki\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.md$/i;
const NONTERMINAL_TICKET_STATUSES = new Set(['open', 'acknowledged', 'needs_information', 'answered']);
const MAX_WIKI_NOTE_BYTES = 1024 * 1024;
const ONBOARDING_MODES = new Set(['new-project', 'existing-project', 'join-existing']);
const PROJECT_KINDS = new Set(['new', 'existing']);
const IDENTITY_STATUSES = new Set(['confirmed', 'explicit', 'unavailable']);
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

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

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

async function withFileLock(layout, { name, busyCode, busyMessage }, action) {
  const lockPath = path.join(layout.root, name);
  const deadline = Date.now() + 10_000;
  await mkdir(layout.root, { recursive: true });
  let handle;
  while (!handle) {
    try {
      handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const owner = JSON.parse(await readFile(lockPath, 'utf8'));
        if (!processIsAlive(owner.pid)) {
          await unlink(lockPath);
          continue;
        }
      } catch (ownerError) {
        if (ownerError.code === 'ENOENT') continue;
      }
      if (Date.now() >= deadline) {
        throw new EngineError(busyMessage, {
          code: busyCode,
        });
      }
      await delay(25);
    }
  }
  try {
    return await action();
  } finally {
    await handle.close();
    try {
      await unlink(lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

async function withStateLock(layout, action) {
  return withFileLock(layout, {
    name: 'engine.lock',
    busyCode: 'STORE_BUSY',
    busyMessage: 'The shared store is busy in another local process.',
  }, action);
}

async function withRefinementLock(layout, action) {
  return withFileLock(layout, {
    name: 'daily-refinement.lock',
    busyCode: 'REFINEMENT_BUSY',
    busyMessage: 'Daily wiki refinement is already running in another local process.',
  }, action);
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
    onboardingPath: path.join(root, 'onboarding.json'),
    preferencesPath: path.join(root, 'preferences.json'),
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
    if (!(await exists(layout.identityPath))) {
      await writeJsonAtomic(layout.identityPath, { schemaVersion: 1, participant });
      if (!(await exists(layout.statusPath))) {
        await setSyncStatus(layout, 'unknown', 'Shared state has not been synchronized yet.');
      }
      const sync = await syncStore({ repository: layout.repositoryPath });
      return {
        initialized: false,
        recoveredIdentity: true,
        participant,
        storePath: layout.statePath,
        sync,
      };
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

function cleanCommandFailure(result) {
  const message = result.stderr || result.stdout || 'command unavailable';
  return message.split('\n')[0].slice(0, 240);
}

/**
 * Confirm the GitHub account exposed by the authenticated GitHub CLI session.
 * This intentionally does not inspect Git author metadata or the origin owner.
 */
export async function detectGithubAccount({ executable = 'gh' } = {}) {
  try {
    const { stdout } = await execFileAsync(executable, ['api', 'user', '--jq', '.login'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    const login = stdout.trim();
    if (!login || /[\s/]/.test(login)) {
      return { provider: 'github', status: 'unavailable', login: null, reason: 'Authenticated account did not return a valid login.' };
    }
    return { provider: 'github', status: 'confirmed', login, source: 'gh-api-user' };
  } catch (error) {
    return {
      provider: 'github',
      status: 'unavailable',
      login: null,
      reason: cleanCommandFailure({ stdout: error.stdout, stderr: error.stderr }),
    };
  }
}

function normalizeEvidence(input) {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    throw new EngineError('projectEvidence must be an array.', { code: 'INVALID_ONBOARDING' });
  }
  return input.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new EngineError(`projectEvidence[${index}] must be an object.`, { code: 'INVALID_ONBOARDING' });
    }
    assertString(item.source, `projectEvidence[${index}].source`);
    assertString(item.fact, `projectEvidence[${index}].fact`);
    return { source: item.source, fact: item.fact };
  });
}

function normalizeStringList(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new EngineError(`${label} must contain non-empty strings.`, { code: 'INVALID_ONBOARDING' });
  }
  return [...value];
}

function normalizeOnboardingProgress(input, previous = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new EngineError('Onboarding progress must be an object.', { code: 'INVALID_ONBOARDING' });
  }
  const merged = {
    ...previous,
    ...input,
    identity: { ...(previous.identity ?? {}), ...(input.identity ?? {}) },
    context: { ...(previous.context ?? {}), ...(input.context ?? {}) },
  };
  if (!ONBOARDING_MODES.has(merged.mode)) {
    throw new EngineError('mode must be new-project, existing-project, or join-existing.', { code: 'INVALID_ONBOARDING' });
  }
  if (!PROJECT_KINDS.has(merged.projectKind)) {
    throw new EngineError('projectKind must be new or existing.', { code: 'INVALID_ONBOARDING' });
  }
  if (merged.mode === 'new-project' && merged.projectKind !== 'new') {
    throw new EngineError('new-project mode requires projectKind new.', { code: 'INVALID_ONBOARDING' });
  }
  if (merged.mode !== 'new-project' && merged.projectKind !== 'existing') {
    throw new EngineError('Existing and joining modes require projectKind existing.', { code: 'INVALID_ONBOARDING' });
  }
  const projectEvidence = normalizeEvidence(merged.projectEvidence);
  if (merged.projectKind === 'existing' && projectEvidence.length === 0) {
    throw new EngineError('Existing projects require at least one observed project fact.', { code: 'INVALID_ONBOARDING' });
  }
  const identityStatus = merged.identity?.status;
  if (!IDENTITY_STATUSES.has(identityStatus)) {
    throw new EngineError('identity.status must be confirmed, explicit, or unavailable.', { code: 'INVALID_ONBOARDING' });
  }
  const githubLogin = merged.identity.githubLogin ?? null;
  if (githubLogin !== null) {
    assertString(githubLogin, 'identity.githubLogin');
    if (/[\s/]/.test(githubLogin)) {
      throw new EngineError('identity.githubLogin must be one GitHub login.', { code: 'INVALID_ONBOARDING' });
    }
  }
  if (['confirmed', 'explicit'].includes(identityStatus) && githubLogin === null) {
    throw new EngineError('Confirmed or explicit identity requires githubLogin.', { code: 'INVALID_ONBOARDING' });
  }
  const context = merged.context ?? {};
  const summary = context.summary ?? null;
  if (summary !== null) assertString(summary, 'context.summary');
  for (const flag of ['planReviewed', 'roleReviewed']) {
    if (merged[flag] !== undefined && typeof merged[flag] !== 'boolean') {
      throw new EngineError(`${flag} must be boolean.`, { code: 'INVALID_ONBOARDING' });
    }
  }
  return {
    schemaVersion: 1,
    mode: merged.mode,
    projectKind: merged.projectKind,
    projectEvidence,
    identity: { status: identityStatus, githubLogin },
    context: {
      sources: normalizeStringList(context.sources, 'context.sources'),
      summary,
      missingFacts: normalizeStringList(context.missingFacts, 'context.missingFacts'),
    },
    planReviewed: merged.planReviewed === true,
    roleReviewed: merged.roleReviewed === true,
    updatedAt: new Date().toISOString(),
  };
}

async function localPreferences(layout) {
  if (!(await exists(layout.preferencesPath))) return { schemaVersion: 1, dashboardLocale: 'system' };
  const preferences = await readJson(layout.preferencesPath);
  return { schemaVersion: 1, dashboardLocale: preferences.dashboardLocale ?? 'system' };
}

export async function setDashboardLocale({ repository = '.', locale } = {}) {
  const layout = await resolveLayout(repository);
  if (locale !== 'system' && (typeof locale !== 'string' || !LOCALE_PATTERN.test(locale))) {
    throw new EngineError('locale must be system or a BCP 47 language tag.', { code: 'INVALID_LOCALE' });
  }
  const preferences = { schemaVersion: 1, dashboardLocale: locale };
  await writeJsonAtomic(layout.preferencesPath, preferences);
  return preferences;
}

async function sharedStateAvailability(layout) {
  const result = await git(
    layout.repositoryPath,
    ['ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${STATE_BRANCH}`],
    { allowFailure: true },
  );
  if (result.ok) return { status: 'available' };
  if (result.code === 2 && result.stdout === '') return { status: 'absent' };
  return { status: 'unknown', reason: cleanCommandFailure(result) };
}

async function repositoryOnboardingFacts(layout) {
  const [head, branch, dirty, files] = await Promise.all([
    git(layout.repositoryPath, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true }),
    git(layout.repositoryPath, ['branch', '--show-current']),
    git(layout.repositoryPath, ['status', '--porcelain']),
    git(layout.repositoryPath, ['ls-files']),
  ]);
  const count = head.ok ? await git(layout.repositoryPath, ['rev-list', '--count', 'HEAD']) : null;
  const contextPattern = /(^|\/)(readme(?:\.[^/]*)?|[^/]*(?:plan|roadmap|brief|meeting|requirements)[^/]*)$/i;
  return {
    head: head.ok ? head.stdout : null,
    branch: branch.stdout || null,
    commitCount: count ? Number.parseInt(count.stdout, 10) : 0,
    hasWorkingChanges: dirty.stdout !== '',
    contextCandidates: files.stdout.split('\n').filter((name) => contextPattern.test(name)).slice(0, 50),
  };
}

function nextOnboardingStage({ progress, initialized, snapshot, localProfile }) {
  if (!progress) return 'assess-project';
  if (!initialized) return 'initialize';
  if (!localProfile) return 'profile';
  if (!progress.context.summary || progress.context.missingFacts.length > 0) return 'review-context';
  if (!snapshot.plan) return 'review-plan';
  const currentRevision = snapshot.plan.history.at(-1)?.id;
  if (progress.mode === 'join-existing'
    && (!progress.roleReviewed || progress.reviewedRoleRevision !== currentRevision)) return 'review-role';
  if (progress.mode !== 'join-existing'
    && (!progress.planReviewed || progress.reviewedPlanRevision !== currentRevision)) return 'review-plan';
  if (snapshot.sync.status !== 'synced') return 'sync';
  return 'ready';
}

export async function inspectOnboarding({ repository = '.' } = {}) {
  const layout = await resolveLayout(repository);
  const initialized = await exists(path.join(layout.statePath, '.git'));
  const [repositoryFacts, sharedState, preferences] = await Promise.all([
    repositoryOnboardingFacts(layout),
    sharedStateAvailability(layout),
    localPreferences(layout),
  ]);
  const progress = (await exists(layout.onboardingPath)) ? await readJson(layout.onboardingPath) : null;
  let participant = null;
  let snapshot = null;
  let localProfile = null;
  const identityAvailable = initialized && await exists(layout.identityPath);
  if (identityAvailable) {
    const identity = await loadIdentity(layout);
    participant = identity.participant;
    snapshot = await buildSnapshot(layout);
    localProfile = snapshot.profiles.find((profile) => profile.participant === participant) ?? null;
  }
  const suggestedMode = progress?.mode
    ?? (sharedState.status === 'available' && !initialized ? 'join-existing' : null);
  const projectKindProposal = progress?.projectKind
    ?? (snapshot?.plan || snapshot?.sessions.length > 0 ? 'existing' : 'undetermined');
  const nextStage = nextOnboardingStage({
    progress,
    initialized: initialized && identityAvailable,
    snapshot,
    localProfile,
  });
  return {
    schemaVersion: 1,
    initialized,
    identityAvailable,
    participant,
    sharedState,
    repository: repositoryFacts,
    progress,
    suggestedMode,
    projectKindProposal,
    nextStage,
    ready: nextStage === 'ready',
    shared: snapshot === null ? null : {
      participants: snapshot.participants,
      planStatus: snapshot.plan?.status ?? null,
      sessionCount: snapshot.sessions.length,
      ticketCount: snapshot.tickets.length,
      sync: snapshot.sync,
    },
    local: { profile: localProfile, dashboardLocale: preferences.dashboardLocale },
  };
}

export async function saveOnboardingProgress({ repository = '.', progress } = {}) {
  const layout = await resolveLayout(repository);
  const previous = (await exists(layout.onboardingPath)) ? await readJson(layout.onboardingPath) : {};
  const normalized = normalizeOnboardingProgress(progress, previous);
  const sharedState = await sharedStateAvailability(layout);
  if (normalized.mode === 'join-existing' && sharedState.status === 'absent') {
    throw new EngineError('join-existing requires an existing duobrain/state branch.', { code: 'INVALID_ONBOARDING' });
  }
  // A local review applies to the plan that was actually visible at that time.
  // Never carry a boolean approval forward to a different plan revision.
  let currentRevision = null;
  if (progress.planReviewed === true || progress.roleReviewed === true) {
    const snapshot = await buildSnapshot(await loadLayout(repository));
    currentRevision = snapshot.plan?.history.at(-1)?.id ?? null;
    if (!currentRevision) {
      throw new EngineError('A valid shared plan is required before recording its review.', {
        code: 'INVALID_ONBOARDING',
      });
    }
  }
  normalized.reviewedPlanRevision = normalized.planReviewed
    ? (progress.planReviewed === true ? currentRevision : previous.reviewedPlanRevision ?? null) : null;
  normalized.reviewedRoleRevision = normalized.roleReviewed
    ? (progress.roleReviewed === true ? currentRevision : previous.reviewedRoleRevision ?? null) : null;
  await writeJsonAtomic(layout.onboardingPath, normalized);
  return inspectOnboarding({ repository: layout.repositoryPath });
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

async function syncStoreUnlocked(layout) {
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

export async function syncStore({ repository = '.' } = {}) {
  const layout = await loadLayout(repository);
  return withStateLock(layout, () => syncStoreUnlocked(layout));
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
  return withStateLock(layout, async () => {
    const relativePath = `events/${event.id}.json`;
    const eventPath = path.join(layout.statePath, relativePath);
    await mkdir(path.dirname(eventPath), { recursive: true });
    await writeJsonAtomic(eventPath, event);
    await git(layout.statePath, ['add', '--', relativePath]);
    await git(layout.statePath, ['commit', '-m', `Record ${event.type} ${event.entityId}`]);
    return (await git(layout.statePath, ['rev-parse', 'HEAD'])).stdout;
  });
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

function assertUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new EngineError(`${label} must be a UUID.`, { code: 'INVALID_INPUT' });
  }
}

function createEvent({ identity, entityId, type, previous, data, actorKind }) {
  return {
    schemaVersion: 1,
    id: randomUUID(),
    at: new Date().toISOString(),
    actor: { participant: identity.participant, kind: actorKind },
    entityId,
    type,
    previous,
    data,
  };
}

function ticketProjection(root, history) {
  let status = 'open';
  let evidence = [];
  let response = null;
  const acceptedHistory = [];
  const invalidEvents = [];
  for (const event of history) {
    if (event.type === 'ticket.clarified') {
      if (
        event.actor?.participant !== root.actor.participant
        || !NONTERMINAL_TICKET_STATUSES.has(status)
        || typeof event.data?.body !== 'string'
        || event.data.body.trim() === ''
      ) {
        invalidEvents.push(event);
        break;
      }
      acceptedHistory.push(event);
      continue;
    }
    acceptedHistory.push(event);
    if (event.type === 'ticket.acknowledged') status = 'acknowledged';
    if (event.type === 'ticket.needs_information') status = 'needs_information';
    if (event.type === 'ticket.responded') {
      status = 'answered';
      evidence = event.data.evidence;
      response = event;
    }
    if (event.type === 'ticket.resolved') status = 'resolved';
    if (event.type === 'ticket.closed') status = 'closed';
    if (event.type === 'ticket.reopened') {
      status = 'open';
      evidence = [];
      response = null;
    }
  }
  return {
    ticket: {
      id: root.entityId,
      kind: root.data.kind,
      title: root.data.title,
      body: root.data.body,
      requester: root.actor.participant,
      assignee: root.data.assignee,
      status,
      goal: root.data.goal ?? null,
      evidence,
      history: [root, ...acceptedHistory].map((event) => ({
        id: event.id,
        type: event.type,
        at: event.at,
        actor: event.actor,
        previous: event.previous,
        data: event.data,
      })),
    },
    response,
    lastEvent: acceptedHistory.at(-1) ?? root,
    invalidEvents,
  };
}

async function getTicketState(layout, ticketId) {
  assertUuid(ticketId, 'ticketId');
  const entityEvents = (await readEvents(layout)).filter((event) => event.entityId === ticketId);
  const roots = entityEvents.filter(
    (event) => event.type === 'ticket.created' && event.previous === null,
  );
  if (roots.length !== 1) {
    throw new EngineError(`Unknown or invalid ticket: ${ticketId}`, { code: 'UNKNOWN_TICKET' });
  }
  const collected = collectEntityHistory(roots[0], entityEvents);
  const projected = ticketProjection(roots[0], collected.history);
  return {
    ...projected,
    conflicts: [
      ...collected.conflicts,
      ...unreachableHistoryConflict(roots[0], collected.unreachable),
      ...(projected.invalidEvents.length > 0 ? [{
        entityId: roots[0].entityId,
        previous: projected.invalidEvents[0].previous,
        eventIds: projected.invalidEvents.map((event) => event.id),
        message: 'Invalid requester clarification event.',
      }] : []),
    ],
  };
}

function assertActorKind(actorKind) {
  if (!['human', 'ai'].includes(actorKind)) {
    throw new EngineError('actorKind must be human or ai.', { code: 'INVALID_INPUT' });
  }
}

async function ticketContext(repository, ticketId) {
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const state = await getTicketState(layout, ticketId);
  if (state.conflicts.length > 0) {
    throw new EngineError('The ticket has a concurrent history conflict.', {
      code: 'ENTITY_CONFLICT',
    });
  }
  return { layout, identity, state };
}

function assertTicketRole(ticket, identity, role) {
  if (ticket[role] !== identity.participant) {
    throw new EngineError(`Only the ticket ${role} can perform this transition.`, {
      code: 'TICKET_ROLE_VIOLATION',
    });
  }
}

function assertTicketStatus(ticket, allowed) {
  if (!allowed.has(ticket.status)) {
    throw new EngineError(`Ticket status ${ticket.status} does not allow this transition.`, {
      code: 'INVALID_TRANSITION',
    });
  }
}

async function appendTicketEvent({
  repository,
  ticketId,
  type,
  data,
  role,
  allowedStatuses,
  actorKind,
  sync,
}) {
  assertActorKind(actorKind);
  const { layout, identity, state } = await ticketContext(repository, ticketId);
  assertTicketRole(state.ticket, identity, role);
  assertTicketStatus(state.ticket, allowedStatuses);
  const event = createEvent({
    identity,
    entityId: ticketId,
    type,
    previous: state.lastEvent.id,
    data,
    actorKind,
  });
  return recordEvent(layout, event, sync);
}

export async function createTicket({
  repository = '.',
  kind,
  title,
  body,
  assignee,
  goal = null,
  actorKind = 'human',
  sync = true,
} = {}) {
  if (!['information', 'feedback'].includes(kind)) {
    throw new EngineError('kind must be information or feedback.', { code: 'INVALID_INPUT' });
  }
  assertString(title, 'title');
  assertString(body, 'body');
  assertActorKind(actorKind);
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const config = await loadConfig(layout);
  const other = config.participants.find((participant) => participant !== identity.participant);
  const selectedAssignee = assignee ?? other;
  if (selectedAssignee !== other) {
    throw new EngineError('Ticket assignee must be the other configured participant.', {
      code: 'INVALID_ASSIGNEE',
    });
  }
  const id = randomUUID();
  const event = createEvent({
    identity,
    entityId: id,
    type: 'ticket.created',
    previous: null,
    data: {
      kind,
      title,
      body,
      assignee: selectedAssignee,
      goal: normalizeOptional(goal, 'goal'),
    },
    actorKind,
  });
  return recordEvent(layout, event, sync);
}

export async function acknowledgeTicket({
  repository = '.',
  ticketId,
  actorKind = 'human',
  sync = true,
} = {}) {
  return appendTicketEvent({
    repository,
    ticketId,
    type: 'ticket.acknowledged',
    data: {},
    role: 'assignee',
    allowedStatuses: new Set(['open']),
    actorKind,
    sync,
  });
}

export async function requestTicketInformation({
  repository = '.',
  ticketId,
  body,
  actorKind = 'human',
  sync = true,
} = {}) {
  assertString(body, 'body');
  return appendTicketEvent({
    repository,
    ticketId,
    type: 'ticket.needs_information',
    data: { body },
    role: 'assignee',
    allowedStatuses: NONTERMINAL_TICKET_STATUSES,
    actorKind,
    sync,
  });
}

export async function clarifyTicket({
  repository = '.',
  ticketId,
  body,
  actorKind = 'human',
  sync = true,
} = {}) {
  assertString(body, 'body');
  return appendTicketEvent({
    repository,
    ticketId,
    type: 'ticket.clarified',
    data: { body },
    role: 'requester',
    allowedStatuses: NONTERMINAL_TICKET_STATUSES,
    actorKind,
    sync,
  });
}

async function validateEvidence(layout, evidence) {
  if (!Array.isArray(evidence)) {
    throw new EngineError('evidence must be an array of wiki paths.', { code: 'INVALID_INPUT' });
  }
  for (const evidencePath of evidence) {
    if (typeof evidencePath !== 'string' || !WIKI_PATH_PATTERN.test(evidencePath)) {
      throw new EngineError('Evidence paths must use wiki/<uuid>.md.', {
        code: 'INVALID_EVIDENCE',
      });
    }
    const absolutePath = path.join(layout.statePath, evidencePath);
    if (!(await exists(absolutePath))) {
      throw new EngineError(`Evidence does not exist in the shared store: ${evidencePath}`, {
        code: 'MISSING_EVIDENCE',
      });
    }
    const validation = validateWikiNote(await readFile(absolutePath, 'utf8'), { path: evidencePath });
    if (!validation.valid) {
      throw new EngineError(`Evidence note is invalid: ${evidencePath}`, {
        code: 'INVALID_EVIDENCE',
      });
    }
  }
}

export async function respondToTicket({
  repository = '.',
  ticketId,
  body,
  evidence = [],
  actorKind = 'human',
  sync = true,
} = {}) {
  assertString(body, 'body');
  assertActorKind(actorKind);
  const context = await ticketContext(repository, ticketId);
  assertTicketRole(context.state.ticket, context.identity, 'assignee');
  assertTicketStatus(context.state.ticket, NONTERMINAL_TICKET_STATUSES);
  if (context.state.ticket.kind === 'information' && evidence.length === 0) {
    throw new EngineError('Information responses require at least one shared wiki note.', {
      code: 'MISSING_EVIDENCE',
    });
  }
  if (context.state.ticket.kind === 'feedback' && actorKind !== 'human') {
    throw new EngineError('Feedback responses require human attribution.', {
      code: 'HUMAN_RESPONSE_REQUIRED',
    });
  }
  await validateEvidence(context.layout, evidence);
  const event = createEvent({
    identity: context.identity,
    entityId: ticketId,
    type: 'ticket.responded',
    previous: context.state.lastEvent.id,
    data: { body, evidence },
    actorKind,
  });
  return recordEvent(context.layout, event, sync);
}

export async function resolveTicket({
  repository = '.',
  ticketId,
  body,
  actorKind = 'human',
  sync = true,
} = {}) {
  assertString(body, 'body');
  assertActorKind(actorKind);
  const context = await ticketContext(repository, ticketId);
  assertTicketRole(context.state.ticket, context.identity, 'requester');
  assertTicketStatus(context.state.ticket, new Set(['answered']));
  if (!context.state.response) {
    throw new EngineError('A current response is required before resolution.', {
      code: 'INVALID_TRANSITION',
    });
  }
  if (context.state.ticket.kind === 'information') {
    await validateEvidence(context.layout, context.state.response.data.evidence);
  }
  if (
    context.state.ticket.kind === 'feedback'
    && context.state.response.actor.kind !== 'human'
  ) {
    throw new EngineError('A human feedback response is required before resolution.', {
      code: 'HUMAN_RESPONSE_REQUIRED',
    });
  }
  const event = createEvent({
    identity: context.identity,
    entityId: ticketId,
    type: 'ticket.resolved',
    previous: context.state.lastEvent.id,
    data: { body },
    actorKind,
  });
  return recordEvent(context.layout, event, sync);
}

export async function closeTicket({
  repository = '.',
  ticketId,
  reason,
  body,
  actorKind = 'human',
  sync = true,
} = {}) {
  if (!['cancelled', 'duplicate'].includes(reason)) {
    throw new EngineError('reason must be cancelled or duplicate.', { code: 'INVALID_INPUT' });
  }
  assertString(body, 'body');
  return appendTicketEvent({
    repository,
    ticketId,
    type: 'ticket.closed',
    data: { reason, body },
    role: 'requester',
    allowedStatuses: NONTERMINAL_TICKET_STATUSES,
    actorKind,
    sync,
  });
}

export async function reopenTicket({
  repository = '.',
  ticketId,
  body,
  actorKind = 'human',
  sync = true,
} = {}) {
  assertString(body, 'body');
  return appendTicketEvent({
    repository,
    ticketId,
    type: 'ticket.reopened',
    data: { body },
    role: 'requester',
    allowedStatuses: new Set(['resolved', 'closed']),
    actorKind,
    sync,
  });
}

async function commitWikiNoteUnlocked(layout, identity, { markdown, id }) {
  assertString(markdown, 'markdown');
  const parsed = parseWikiNote(markdown);
  const noteId = parsed.format === 'structured' ? parsed.metadata.id : id;
  assertUuid(noteId, 'id');
  const relativePath = `wiki/${noteId}.md`;
  const validation = validateWikiNote(parsed, { path: relativePath });
  if (!validation.valid) {
    throw new EngineError(
      `Wiki note is invalid: ${validation.errors.map((error) => error.code).join(', ')}`,
      { code: 'INVALID_WIKI_NOTE' },
    );
  }
  if (
    parsed.format === 'structured'
    && parsed.metadata.author.participant !== identity.participant
  ) {
    throw new EngineError('Structured note author must match the local participant.', {
      code: 'WIKI_AUTHOR_MISMATCH',
    });
  }
  const notePath = path.join(layout.statePath, relativePath);
  if (await exists(notePath)) {
    if (await readFile(notePath, 'utf8') !== markdown) {
      throw new EngineError(`Immutable wiki note already exists with different content: ${relativePath}`, {
        code: 'IMMUTABLE_NOTE_CONFLICT',
      });
    }
    return { created: false, path: relativePath, validation };
  }
  await mkdir(path.dirname(notePath), { recursive: true });
  await writeFile(notePath, markdown, 'utf8');
  await git(layout.statePath, ['add', '--', relativePath]);
  await git(layout.statePath, ['commit', '-m', `Record wiki note ${noteId}`]);
  const commit = (await git(layout.statePath, ['rev-parse', 'HEAD'])).stdout;
  return { created: true, path: relativePath, commit, validation };
}

export async function addWikiNote({
  repository = '.',
  markdown,
  id,
  sync = true,
} = {}) {
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const local = await withStateLock(
    layout,
    () => commitWikiNoteUnlocked(layout, identity, { markdown, id }),
  );
  const syncResult = sync
    ? await syncStore({ repository: layout.repositoryPath })
    : await setSyncStatus(
      layout,
      'pending',
      local.created
        ? 'Local wiki note is committed but has not been pushed.'
        : 'Existing note has not been synchronized.',
    );
  return { ...local, sync: syncResult };
}

export async function getWikiNote({ repository = '.', path: wikiPath } = {}) {
  if (typeof wikiPath !== 'string' || !WIKI_PATH_PATTERN.test(wikiPath)) {
    throw new EngineError('Wiki note path must use wiki/<uuid>.md.', {
      code: 'INVALID_WIKI_PATH',
    });
  }
  const layout = await loadLayout(repository);
  const notePath = path.resolve(layout.statePath, wikiPath);
  const storePath = await realpath(layout.statePath);
  const wikiDirectory = path.join(layout.statePath, 'wiki');
  let directoryInfo;
  try {
    directoryInfo = await lstat(wikiDirectory);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new EngineError(`Wiki note does not exist: ${wikiPath}`, {
        code: 'WIKI_NOTE_NOT_FOUND',
      });
    }
    throw error;
  }
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
    throw new EngineError('The shared wiki directory is not a safe directory.', {
      code: 'UNSAFE_WIKI_NOTE',
    });
  }
  if (await realpath(wikiDirectory) !== path.join(storePath, 'wiki')) {
    throw new EngineError('The shared wiki directory resolves outside the expected store path.', {
      code: 'WIKI_PATH_ESCAPE',
    });
  }
  let noteInfo;
  try {
    noteInfo = await lstat(notePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new EngineError(`Wiki note does not exist: ${wikiPath}`, {
        code: 'WIKI_NOTE_NOT_FOUND',
      });
    }
    throw error;
  }
  if (noteInfo.isSymbolicLink() || !noteInfo.isFile() || noteInfo.nlink !== 1) {
    throw new EngineError('Wiki note must be a regular file, not a link or special file.', {
      code: 'UNSAFE_WIKI_NOTE',
    });
  }
  const resolvedNotePath = await realpath(notePath);
  const relative = path.relative(storePath, resolvedNotePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new EngineError('Wiki note resolves outside the isolated shared store.', {
      code: 'WIKI_PATH_ESCAPE',
    });
  }
  if (noteInfo.size > MAX_WIKI_NOTE_BYTES) {
    throw new EngineError(`Wiki note exceeds ${MAX_WIKI_NOTE_BYTES} bytes.`, {
      code: 'WIKI_NOTE_TOO_LARGE',
    });
  }

  let handle;
  try {
    handle = await open(notePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const openedInfo = await handle.stat();
    if (
      !openedInfo.isFile()
      || openedInfo.nlink !== 1
      || openedInfo.dev !== noteInfo.dev
      || openedInfo.ino !== noteInfo.ino
    ) {
      throw new EngineError('Wiki note must be a regular file.', { code: 'UNSAFE_WIKI_NOTE' });
    }
    if (openedInfo.size > MAX_WIKI_NOTE_BYTES) {
      throw new EngineError(`Wiki note exceeds ${MAX_WIKI_NOTE_BYTES} bytes.`, {
        code: 'WIKI_NOTE_TOO_LARGE',
      });
    }
    const content = Buffer.alloc(MAX_WIKI_NOTE_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < content.length) {
      const read = await handle.read(content, bytesRead, content.length - bytesRead, bytesRead);
      if (read.bytesRead === 0) break;
      bytesRead += read.bytesRead;
    }
    if (bytesRead > MAX_WIKI_NOTE_BYTES) {
      throw new EngineError(`Wiki note exceeds ${MAX_WIKI_NOTE_BYTES} bytes.`, {
        code: 'WIKI_NOTE_TOO_LARGE',
      });
    }
    const markdown = content.subarray(0, bytesRead).toString('utf8');
    return {
      path: wikiPath,
      markdown,
      validation: validateWikiNote(markdown, { path: wikiPath }),
    };
  } catch (error) {
    if (error.code === 'ELOOP') {
      throw new EngineError('Wiki note symlinks are not allowed.', { code: 'UNSAFE_WIKI_NOTE' });
    }
    if (error.code === 'ENOENT') {
      throw new EngineError(`Wiki note does not exist: ${wikiPath}`, {
        code: 'WIKI_NOTE_NOT_FOUND',
      });
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

/**
 * List notes from the isolated shared wiki. Enumeration is limited to
 * UUID-named Markdown files and every result passes through getWikiNote's
 * containment, link, size, and validation checks.
 */
export async function listWikiNotes({ repository = '.' } = {}) {
  const layout = await loadLayout(repository);
  const wikiDirectory = path.join(layout.statePath, 'wiki');
  let directoryInfo;
  try {
    directoryInfo = await lstat(wikiDirectory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
    throw new EngineError('The shared wiki directory is not a safe directory.', {
      code: 'UNSAFE_WIKI_NOTE',
    });
  }
  const storePath = await realpath(layout.statePath);
  if (await realpath(wikiDirectory) !== path.join(storePath, 'wiki')) {
    throw new EngineError('The shared wiki directory resolves outside the expected store path.', {
      code: 'WIKI_PATH_ESCAPE',
    });
  }
  let entries;
  try {
    entries = await readdir(wikiDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new EngineError('The shared wiki directory changed while it was being read.', {
        code: 'UNSAFE_WIKI_NOTE',
      });
    }
    throw error;
  }
  const notePaths = entries
    .map((entry) => `wiki/${entry.name}`)
    .filter((wikiPath) => WIKI_PATH_PATTERN.test(wikiPath))
    .sort();
  return Promise.all(notePaths.map((wikiPath) => getWikiNote({
    repository: layout.repositoryPath,
    path: wikiPath,
  })));
}

export async function searchSharedWiki({ repository = '.', query = '', filters = {} } = {}) {
  const notes = await listWikiNotes({ repository });
  return searchWikiNotes({ notes, query, filters });
}

export async function traceSharedWiki({ repository = '.', roots = [] } = {}) {
  if (!Array.isArray(roots) || roots.some((root) => typeof root !== 'string' || !WIKI_PATH_PATTERN.test(root))) {
    throw new EngineError('Lineage roots must use wiki/<uuid>.md.', {
      code: 'INVALID_WIKI_PATH',
    });
  }
  const notes = await listWikiNotes({ repository });
  return traceWikiLineage({ notes, roots });
}

function assertComparisonManifest(manifest, identity, config) {
  if (
    manifest === null
    || typeof manifest !== 'object'
    || Array.isArray(manifest)
    || manifest.left === null
    || typeof manifest.left !== 'object'
    || Array.isArray(manifest.left)
    || manifest.right === null
    || typeof manifest.right !== 'object'
    || Array.isArray(manifest.right)
    || !Array.isArray(manifest.artifacts)
  ) {
    throw new EngineError('Comparison manifest requires left, right, and artifacts.', {
      code: 'INVALID_COMPARISON_MANIFEST',
    });
  }
  const other = config.participants.find((participant) => participant !== identity.participant);
  if (manifest.left.participant !== identity.participant || manifest.right.participant !== other) {
    throw new EngineError('Comparison must run from the local participant to the other configured participant.', {
      code: 'INVALID_COMPARISON_PARTICIPANTS',
    });
  }
  for (const [sideName, side] of [['left', manifest.left], ['right', manifest.right]]) {
    if (!Array.isArray(side.noteRefs) || side.noteRefs.some(
      (wikiPath) => typeof wikiPath !== 'string' || !WIKI_PATH_PATTERN.test(wikiPath),
    )) {
      throw new EngineError(`${sideName}.noteRefs must contain only wiki/<uuid>.md paths.`, {
        code: 'INVALID_COMPARISON_MANIFEST',
      });
    }
  }
}

function identicalInformationRequest(ticket, candidate) {
  return ticket.kind === 'information'
    && NONTERMINAL_TICKET_STATUSES.has(ticket.status)
    && ticket.requester === candidate.requester
    && ticket.assignee === candidate.assignee
    && ticket.title === candidate.title
    && ticket.body === candidate.body;
}

/**
 * Compare explicitly selected method records using shared wiki notes. Artifact
 * refs are identifiers only; content is compared only from manifest artifacts.
 * Missing evidence remains a dry proposal unless requestMissing is true.
 */
export async function compareSharedMethods({
  repository = '.',
  manifest,
  requestMissing = false,
  actorKind = 'ai',
} = {}) {
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const config = await loadConfig(layout);
  assertComparisonManifest(manifest, identity, config);
  const notes = await listWikiNotes({ repository: layout.repositoryPath });
  const comparison = compareKnowledgeMethods({
    notes,
    left: manifest.left,
    right: manifest.right,
    artifacts: manifest.artifacts,
  });
  const candidate = comparison.ticketCandidate;
  if (!requestMissing || candidate === null) {
    return {
      comparison,
      missingRequest: {
        action: candidate === null ? 'none' : 'proposed',
        ticketCandidate: candidate,
      },
    };
  }
  if (candidate.requester !== identity.participant) {
    throw new EngineError('The missing-information request must originate from the local participant.', {
      code: 'TICKET_ROLE_VIOLATION',
    });
  }
  const snapshot = await buildSnapshot(layout);
  const existing = snapshot.tickets.find((ticket) => identicalInformationRequest(ticket, candidate));
  if (existing) {
    return {
      comparison,
      missingRequest: {
        action: 'reused',
        ticketId: existing.id,
        ticketCandidate: candidate,
      },
    };
  }
  const created = await createTicket({
    repository: layout.repositoryPath,
    kind: candidate.kind,
    title: candidate.title,
    body: candidate.body,
    assignee: candidate.assignee,
    actorKind,
  });
  return {
    comparison,
    missingRequest: {
      action: 'created',
      ticketId: created.event.entityId,
      ticketCandidate: candidate,
      event: created.event,
      commit: created.commit,
      sync: created.sync,
    },
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function validatedDailyRefinement(note) {
  const parsed = note.validation?.valid ? note.validation.note : null;
  if (parsed?.format !== 'structured' || parsed.metadata.recordType !== 'summary') return null;
  const run = parsed.metadata.dailyRefinement;
  if (
    run === null
    || typeof run !== 'object'
    || Array.isArray(run)
    || typeof run.date !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(run.date)
    || typeof run.timezone !== 'string'
    || typeof run.sourceRevision !== 'string'
    || run.sourceRevision.length === 0
    || typeof run.policyFingerprint !== 'string'
    || run.policyFingerprint.length === 0
    || typeof run.runKey !== 'string'
    || run.runKey.length === 0
  ) return null;
  let observedDate;
  try {
    observedDate = zonedDate(new Date(parsed.metadata.observedAt), run.timezone);
  } catch {
    return null;
  }
  const expectedRunKey = createHash('sha256').update(stableStringify({
    date: run.date,
    timezone: run.timezone,
    sourceRevision: run.sourceRevision,
    policyFingerprint: run.policyFingerprint,
  })).digest('hex');
  if (observedDate !== run.date || run.runKey !== expectedRunKey) return null;
  return {
    ...run,
    summaryPath: note.path,
    observedAt: parsed.metadata.observedAt,
    participant: parsed.metadata.author.participant,
  };
}

function latestPriorRefinement(notes, nowMs) {
  return notes
    .map(validatedDailyRefinement)
    .filter((run) => run !== null && Date.parse(run.observedAt) <= nowMs)
    .sort((left, right) => (
      right.observedAt.localeCompare(left.observedAt)
      || right.summaryPath.localeCompare(left.summaryPath)
    ))[0] ?? null;
}

function sourceRevisionFor(notes, ticketEvents) {
  const nonRefinementNotes = notes
    .filter((note) => validatedDailyRefinement(note) === null)
    .map(({ path: wikiPath, markdown }) => ({ path: wikiPath, markdown }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const tickets = ticketEvents
    .filter((event) => typeof event.type === 'string' && event.type.startsWith('ticket.'))
    .sort((left, right) => left.id.localeCompare(right.id));
  return createHash('sha256').update(stableStringify({
    schemaVersion: 1,
    notes: nonRefinementNotes,
    tickets,
  })).digest('hex');
}

function normalizeRefinementConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new EngineError('Wiki refinement config must be a JSON object.', {
      code: 'INVALID_REFINEMENT_CONFIG',
    });
  }
  const timezone = config.timezone;
  if (typeof timezone !== 'string' || timezone.trim() === '') {
    throw new EngineError('Wiki refinement timezone must be an IANA timezone.', {
      code: 'INVALID_REFINEMENT_CONFIG',
    });
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
  } catch {
    throw new EngineError('Wiki refinement timezone must be an IANA timezone.', {
      code: 'INVALID_REFINEMENT_CONFIG',
    });
  }
  if (config.policy === null || typeof config.policy !== 'object' || Array.isArray(config.policy)) {
    throw new EngineError('Wiki refinement config requires a policy object.', {
      code: 'INVALID_REFINEMENT_CONFIG',
    });
  }
  return { timezone, policy: config.policy };
}

function normalizeRefinementNow(now) {
  const value = now === undefined ? new Date() : new Date(now);
  if (!Number.isFinite(value.getTime())) {
    throw new EngineError('Wiki refinement now must be a valid date or timestamp.', {
      code: 'INVALID_REFINEMENT_CONFIG',
    });
  }
  return value;
}

function zonedDate(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Run the pure refinement planner against synchronized shared state on explicit
 * request. The summary is keyed by local date, timezone, source revision and
 * policy; repeating the same key is skipped as no-new-input.
 */
export async function runWikiRefinement({
  repository = '.',
  config,
  now,
} = {}) {
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const normalized = normalizeRefinementConfig(config);
  const instant = normalizeRefinementNow(now);
  const nowIso = instant.toISOString();
  const date = zonedDate(instant, normalized.timezone);

  return withRefinementLock(layout, () => withStateLock(layout, async () => {
    const initialSync = await syncStoreUnlocked(layout);
    if (initialSync.status !== 'synced') {
      return {
        outcome: 'pending',
        reason: 'sync-failed',
        date,
        sync: initialSync,
      };
    }

    const notes = await listWikiNotes({ repository: layout.repositoryPath });
    const snapshot = await buildSnapshot(layout);
    const ticketEvents = await readEvents(layout);
    const sourceRevision = sourceRevisionFor(notes, ticketEvents);
    const priorRun = latestPriorRefinement(notes, instant.getTime());

    const candidateId = randomUUID();
    const plan = planDailyWikiRefinement({
      notes,
      tickets: snapshot.tickets,
      now: nowIso,
      date,
      timezone: normalized.timezone,
      sourceRevision,
      policy: normalized.policy,
      priorRun,
      candidate: {
        id: candidateId,
        author: { participant: identity.participant, kind: 'ai' },
        observedAt: nowIso,
        workContext: {
          promptRef: `wiki-refinement:${normalized.policy.id ?? 'unknown'}@${normalized.policy.version ?? 'unknown'}`,
          harnessRef: 'duobrain:manual-refresh',
        },
      },
    });
    if (!plan.ready) {
      return {
        outcome: plan.outcome,
        reason: 'planner-insufficient',
        plan,
        sourceRevision,
        date,
        sync: initialSync,
      };
    }
    if (priorRun !== null && priorRun.runKey === plan.run.runKey) {
      return {
        outcome: 'skipped',
        reason: 'no-new-input',
        summaryPath: priorRun.summaryPath,
        sourceRevision,
        date,
        plan,
        sync: initialSync,
      };
    }
    if (plan.candidate === null) {
      return {
        outcome: plan.outcome,
        reason: 'already-planned',
        plan,
        sourceRevision,
        date,
        sync: initialSync,
      };
    }

    const local = await commitWikiNoteUnlocked(layout, identity, {
      markdown: plan.candidate.markdown,
      id: candidateId,
    });
    const sync = await syncStoreUnlocked(layout);
    return {
      outcome: sync.status === 'synced' ? 'completed' : 'pending',
      reason: sync.status === 'synced' ? null : 'push-failed',
      summaryPath: local.path,
      sourceRevision,
      date,
      plan,
      commit: local.commit,
      sync,
    };
  }));
}

function validateNullablePlanString(value, label) {
  if (value === null) return null;
  assertString(value, label);
  return value;
}

async function validatePlanData(layout, config, input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new EngineError('Plan input must be a JSON object.', { code: 'INVALID_PLAN' });
  }
  const goals = input.goals;
  if (goals === null || typeof goals !== 'object' || Array.isArray(goals)) {
    throw new EngineError('Plan goals must be an object.', { code: 'INVALID_PLAN' });
  }
  const normalizedGoals = {
    project: validateNullablePlanString(goals.project, 'goals.project'),
    mediumTerm: validateNullablePlanString(goals.mediumTerm, 'goals.mediumTerm'),
    currentPhase: validateNullablePlanString(goals.currentPhase, 'goals.currentPhase'),
  };
  if (!Array.isArray(input.assignments) || input.assignments.length !== 2) {
    throw new EngineError('Plan assignments must contain exactly two entries.', {
      code: 'INVALID_PLAN',
    });
  }
  const assignments = input.assignments.map((assignment, index) => {
    if (assignment === null || typeof assignment !== 'object' || Array.isArray(assignment)) {
      throw new EngineError(`assignments[${index}] must be an object.`, { code: 'INVALID_PLAN' });
    }
    if (!config.participants.includes(assignment.participant)) {
      throw new EngineError(`assignments[${index}].participant is not configured.`, {
        code: 'INVALID_PLAN',
      });
    }
    if (
      !Array.isArray(assignment.scope)
      || assignment.scope.some((item) => typeof item !== 'string' || item.trim() === '')
    ) {
      throw new EngineError(`assignments[${index}].scope must contain non-empty strings.`, {
        code: 'INVALID_PLAN',
      });
    }
    return {
      participant: assignment.participant,
      scope: [...assignment.scope],
      next: validateNullablePlanString(assignment.next, `assignments[${index}].next`),
    };
  });
  if (new Set(assignments.map((assignment) => assignment.participant)).size !== 2) {
    throw new EngineError('Plan assignments must contain each configured participant once.', {
      code: 'INVALID_PLAN',
    });
  }
  const status = input.status ?? 'proposed';
  if (!['proposed', 'agreed'].includes(status)) {
    throw new EngineError('Plan status must be proposed or agreed.', { code: 'INVALID_PLAN' });
  }
  const evidence = input.evidence ?? [];
  if (!Array.isArray(evidence)) {
    throw new EngineError('Plan evidence must be an array of wiki paths.', {
      code: 'INVALID_PLAN',
    });
  }
  await validateEvidence(layout, evidence);
  if (status === 'agreed') {
    const humanParticipants = new Set();
    for (const evidencePath of evidence) {
      const parsed = parseWikiNote(await readFile(path.join(layout.statePath, evidencePath), 'utf8'));
      if (
        parsed.format === 'structured'
        && parsed.metadata.author.kind === 'human'
        && config.participants.includes(parsed.metadata.author.participant)
      ) {
        humanParticipants.add(parsed.metadata.author.participant);
      }
    }
    if (config.participants.some((participant) => !humanParticipants.has(participant))) {
      throw new EngineError(
        'Agreed plans require structured human evidence attributed to both participants.',
        { code: 'PLAN_AGREEMENT_EVIDENCE_REQUIRED' },
      );
    }
  }
  assertString(input.body, 'body');
  return {
    goals: normalizedGoals,
    assignments,
    status,
    evidence: [...evidence],
    body: input.body,
  };
}

async function validatePlanEvent(layout, config, event, expectedType) {
  if (
    event.schemaVersion !== 1
    || !UUID_PATTERN.test(event.id ?? '')
    || !UUID_PATTERN.test(event.entityId ?? '')
    || validDateMs(event.at) === null
    || event.type !== expectedType
    || !config.participants.includes(event.actor?.participant)
    || !['human', 'ai'].includes(event.actor?.kind)
  ) {
    throw new EngineError(`Invalid ${expectedType} event metadata.`, {
      code: 'INVALID_PLAN_EVENT',
    });
  }
  return validatePlanData(layout, config, event.data);
}

async function buildPlanState(layout, config, events) {
  const planEvents = events.filter(
    (event) => typeof event.type === 'string' && event.type.startsWith('plan.'),
  );
  const roots = planEvents.filter((event) => event.type === 'plan.created' && event.previous === null);
  if (planEvents.length === 0) return { plan: null, conflicts: [], root: null, lastEvent: null };
  if (roots.length !== 1) {
    return {
      plan: null,
      root: null,
      lastEvent: null,
      conflicts: [{
        entityId: 'plan',
        previous: null,
        eventIds: roots.map((event) => event.id).sort(),
        candidateEntityIds: roots.map((event) => event.entityId).sort(),
        message: roots.length === 0
          ? 'Plan updates exist without one valid root.'
          : 'Multiple independent plan roots conflict.',
      }],
    };
  }
  const root = roots[0];
  const entityEvents = planEvents.filter((event) => event.entityId === root.entityId);
  const collected = collectEntityHistory(root, entityEvents);
  const unreachable = planEvents.filter(
    (event) => event.entityId !== root.entityId
      || (event.id !== root.id && !collected.history.some((item) => item.id === event.id)),
  );
  if (collected.conflicts.length > 0 || unreachable.length > 0) {
    return {
      plan: null,
      root,
      lastEvent: null,
      conflicts: [
        ...collected.conflicts,
        ...(unreachable.length > 0 ? [{
          entityId: root.entityId,
          previous: null,
          eventIds: unreachable.map((event) => event.id).sort(),
          message: 'Plan history contains an unreachable or unrelated event.',
        }] : []),
      ],
    };
  }
  const chain = [root, ...collected.history];
  try {
    let projected = await validatePlanEvent(layout, config, root, 'plan.created');
    for (const event of collected.history) {
      projected = await validatePlanEvent(layout, config, event, 'plan.updated');
    }
    return {
      root,
      lastEvent: chain.at(-1),
      conflicts: [],
      plan: {
        id: root.entityId,
        ...projected,
        history: chain.map((event) => ({
          id: event.id,
          type: event.type,
          at: event.at,
          actor: event.actor,
          previous: event.previous,
          data: event.data,
        })),
      },
    };
  } catch (error) {
    return {
      plan: null,
      root,
      lastEvent: null,
      conflicts: [{
        entityId: root.entityId,
        previous: null,
        eventIds: chain.map((event) => event.id),
        message: `Invalid plan history: ${error.message}`,
      }],
    };
  }
}

function validateProfileEvent(event, config, participant, expectedType) {
  if (
    event.schemaVersion !== 1
    || !UUID_PATTERN.test(event.id ?? '')
    || !UUID_PATTERN.test(event.entityId ?? '')
    || validDateMs(event.at) === null
    || event.type !== expectedType
    || event.actor?.participant !== participant
    || !config.participants.includes(participant)
    || !['human', 'ai'].includes(event.actor?.kind)
    || event.data === null
    || typeof event.data !== 'object'
    || Array.isArray(event.data)
  ) {
    throw new EngineError(`Invalid ${expectedType} event metadata.`, { code: 'INVALID_PROFILE_EVENT' });
  }
  assertString(event.data.nickname, 'profile nickname');
  if (event.data.githubLogin !== null) {
    assertString(event.data.githubLogin, 'profile githubLogin');
    if (/[\s/]/.test(event.data.githubLogin)) {
      throw new EngineError('profile githubLogin must be one GitHub login.', { code: 'INVALID_PROFILE_EVENT' });
    }
  }
  return { nickname: event.data.nickname, githubLogin: event.data.githubLogin };
}

function buildProfileState(config, events) {
  const profiles = [];
  const conflicts = [];
  for (const participant of config.participants) {
    const participantEvents = events.filter(
      (event) => event.actor?.participant === participant
        && typeof event.type === 'string'
        && event.type.startsWith('profile.'),
    );
    if (participantEvents.length === 0) continue;
    const roots = participantEvents.filter(
      (event) => event.type === 'profile.created' && event.previous === null,
    );
    if (roots.length !== 1) {
      conflicts.push({
        entityId: `profile:${participant}`,
        participant,
        previous: null,
        eventIds: roots.map((event) => event.id).sort(),
        message: roots.length === 0
          ? 'Profile updates exist without one valid root.'
          : 'Multiple independent profile roots conflict.',
      });
      continue;
    }
    const root = roots[0];
    const entityEvents = participantEvents.filter((event) => event.entityId === root.entityId);
    const collected = collectEntityHistory(root, entityEvents);
    const unreachable = participantEvents.filter(
      (event) => event.entityId !== root.entityId
        || (event.id !== root.id && !collected.history.some((item) => item.id === event.id)),
    );
    if (collected.conflicts.length > 0 || unreachable.length > 0) {
      conflicts.push(
        ...collected.conflicts.map((conflict) => ({ ...conflict, participant })),
        ...(unreachable.length > 0 ? [{
          entityId: root.entityId,
          participant,
          previous: null,
          eventIds: unreachable.map((event) => event.id).sort(),
          message: 'Profile history contains an unreachable or unrelated event.',
        }] : []),
      );
      continue;
    }
    const chain = [root, ...collected.history];
    try {
      let projected = validateProfileEvent(root, config, participant, 'profile.created');
      for (const event of collected.history) {
        projected = validateProfileEvent(event, config, participant, 'profile.updated');
      }
      profiles.push({
        id: root.entityId,
        participant,
        ...projected,
        history: chain.map((event) => ({
          id: event.id,
          type: event.type,
          at: event.at,
          actor: event.actor,
          previous: event.previous,
          data: event.data,
        })),
      });
    } catch (error) {
      conflicts.push({
        entityId: root.entityId,
        participant,
        previous: null,
        eventIds: chain.map((event) => event.id),
        message: `Invalid profile history: ${error.message}`,
      });
    }
  }
  return { profiles, conflicts };
}

export async function setParticipantProfile({
  repository = '.',
  nickname,
  githubLogin,
  actorKind = 'human',
  sync = true,
} = {}) {
  assertActorKind(actorKind);
  if (nickname !== undefined) assertString(nickname, 'nickname');
  if (githubLogin !== undefined && githubLogin !== null) {
    assertString(githubLogin, 'githubLogin');
    if (/[\s/]/.test(githubLogin)) {
      throw new EngineError('githubLogin must be one GitHub login.', { code: 'INVALID_PROFILE' });
    }
  }
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const config = await loadConfig(layout);
  const events = await readEvents(layout);
  const state = buildProfileState(config, events);
  const current = state.profiles.find((profile) => profile.participant === identity.participant) ?? null;
  if (state.conflicts.some((conflict) => conflict.participant === identity.participant)) {
    throw new EngineError('The local profile history is conflicted or invalid.', { code: 'PROFILE_CONFLICT' });
  }
  const previous = current?.history.at(-1) ?? null;
  const entityId = current?.id ?? randomUUID();
  const normalizedGithubLogin = githubLogin === undefined
    ? current?.githubLogin ?? null
    : githubLogin;
  const normalizedNickname = nickname
    ?? current?.nickname
    ?? normalizedGithubLogin
    ?? identity.participant;
  const event = createEvent({
    identity,
    entityId,
    type: current ? 'profile.updated' : 'profile.created',
    previous: previous?.id ?? null,
    data: { nickname: normalizedNickname, githubLogin: normalizedGithubLogin },
    actorKind,
  });
  return recordEvent(layout, event, sync);
}

export async function setPlan({
  repository = '.',
  plan,
  actorKind = 'human',
  sync = true,
} = {}) {
  assertActorKind(actorKind);
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const config = await loadConfig(layout);
  if (!config.participants.includes(identity.participant)) {
    throw new EngineError('Local identity is not in shared configuration.', {
      code: 'IDENTITY_MISMATCH',
    });
  }
  const data = await validatePlanData(layout, config, plan);
  const events = await readEvents(layout);
  const current = await buildPlanState(layout, config, events);
  if (current.conflicts.length > 0) {
    throw new EngineError('The shared plan history is conflicted or invalid.', {
      code: 'PLAN_CONFLICT',
    });
  }
  const entityId = current.plan?.id ?? randomUUID();
  const event = createEvent({
    identity,
    entityId,
    type: current.plan ? 'plan.updated' : 'plan.created',
    previous: current.lastEvent?.id ?? null,
    data,
    actorKind,
  });
  return recordEvent(layout, event, sync);
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

async function sessionContext(repository, sessionId) {
  assertUuid(sessionId, 'sessionId');
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const built = await buildSnapshot(layout);
  const session = built.sessions.find((item) => item.id === sessionId);
  if (!session) throw new EngineError(`Unknown session: ${sessionId}`, { code: 'UNKNOWN_SESSION' });
  if (session.participant !== identity.participant) {
    throw new EngineError('Only the session owner can change it.', { code: 'NOT_SESSION_OWNER' });
  }
  if (built.conflicts.some((conflict) => conflict.entityId === sessionId)) {
    throw new EngineError('The session has a concurrent history conflict.', { code: 'ENTITY_CONFLICT' });
  }
  return { layout, identity, session };
}

async function appendSessionEvent({
  repository,
  sessionId,
  type,
  data,
  allowedStatuses,
  actorKind,
  sync,
}) {
  assertActorKind(actorKind);
  const context = await sessionContext(repository, sessionId);
  if (!allowedStatuses.includes(context.session.status)) {
    throw new EngineError(
      `Session status ${context.session.status} does not allow ${type}.`,
      { code: 'INVALID_TRANSITION' },
    );
  }
  const event = createEvent({
    identity: context.identity,
    entityId: sessionId,
    type,
    previous: context.session.history.at(-1)?.id ?? sessionId,
    data,
    actorKind,
  });
  return recordEvent(context.layout, event, sync);
}

export async function pauseSession({
  repository = '.',
  sessionId,
  body = null,
  actorKind = 'human',
  sync = true,
} = {}) {
  return appendSessionEvent({
    repository,
    sessionId,
    type: 'session.paused',
    data: { body: normalizeOptional(body, 'body') },
    allowedStatuses: ['active'],
    actorKind,
    sync,
  });
}

export async function resumeSession({
  repository = '.',
  sessionId,
  body = null,
  actorKind = 'human',
  sync = true,
} = {}) {
  return appendSessionEvent({
    repository,
    sessionId,
    type: 'session.resumed',
    data: { body: normalizeOptional(body, 'body') },
    allowedStatuses: ['paused'],
    actorKind,
    sync,
  });
}

export async function updateSessionScope(options = {}) {
  const {
    repository = '.',
    sessionId,
    scope,
    reason,
    actorKind = 'human',
    sync = true,
  } = options;
  if (!Array.isArray(scope) || scope.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new EngineError('scope must be an array of non-empty strings.', { code: 'INVALID_INPUT' });
  }
  assertString(reason, 'reason');
  const data = { scope: [...scope], reason };
  for (const field of ['goal', 'branch', 'baseCommit']) {
    if (Object.hasOwn(options, field)) {
      data[field] = options[field] === null
        ? null
        : normalizeOptional(options[field], field);
    }
  }
  return appendSessionEvent({
    repository,
    sessionId,
    type: 'session.scope_updated',
    data,
    allowedStatuses: ['active', 'paused'],
    actorKind,
    sync,
  });
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
  assertString(summary, 'summary');
  if (!Array.isArray(blockers) || blockers.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new EngineError('blockers must be an array of non-empty strings.', { code: 'INVALID_INPUT' });
  }
  if (!['human', 'ai'].includes(actorKind)) {
    throw new EngineError('actorKind must be human or ai.', { code: 'INVALID_INPUT' });
  }
  return appendSessionEvent({
    repository,
    sessionId,
    type: 'session.ended',
    data: {
      summary,
      blockers,
      next: normalizeOptional(next, 'next'),
    },
    allowedStatuses: ['active', 'paused'],
    actorKind,
    sync,
  });
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
  const accounted = new Set([
    root.id,
    ...history.map((event) => event.id),
    ...conflicts.flatMap((conflict) => conflict.eventIds),
  ]);
  const unreachable = events.filter((event) => !accounted.has(event.id));
  return { history, conflicts, unreachable };
}

function unreachableHistoryConflict(root, unreachable) {
  if (unreachable.length === 0) return [];
  return [{
    entityId: root.entityId,
    previous: null,
    eventIds: unreachable.map((event) => event.id).sort(),
    message: 'Entity history contains an unreachable event.',
  }];
}

function validateSessionEnvelope(event, config, owner) {
  if (
    event.schemaVersion !== 1
    || !UUID_PATTERN.test(event.id ?? '')
    || !UUID_PATTERN.test(event.entityId ?? '')
    || validDateMs(event.at) === null
    || event.actor?.participant !== owner
    || !config.participants.includes(owner)
    || !['human', 'ai'].includes(event.actor?.kind)
    || event.data === null
    || typeof event.data !== 'object'
    || Array.isArray(event.data)
  ) {
    throw new EngineError('Invalid session event metadata.', { code: 'INVALID_SESSION_EVENT' });
  }
}

function validateSessionRoot(root, config) {
  validateSessionEnvelope(root, config, root.actor?.participant);
  if (root.type !== 'session.started' || root.previous !== null) {
    throw new EngineError('Invalid session root.', { code: 'INVALID_SESSION_EVENT' });
  }
  assertString(root.data.title, 'session title');
  if (
    !Array.isArray(root.data.scope)
    || root.data.scope.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    throw new EngineError('Invalid session start scope.', { code: 'INVALID_SESSION_EVENT' });
  }
  for (const field of ['goal', 'branch', 'baseCommit']) {
    if (root.data[field] !== null && root.data[field] !== undefined) {
      assertString(root.data[field], field);
    }
  }
}

function validateSessionChild(event, config, owner, status) {
  validateSessionEnvelope(event, config, owner);
  if (event.type === 'session.paused') {
    if (status !== 'active') throw new EngineError('Invalid pause transition.', { code: 'INVALID_SESSION_EVENT' });
    if (event.data.body !== null && event.data.body !== undefined) assertString(event.data.body, 'body');
    return 'paused';
  }
  if (event.type === 'session.resumed') {
    if (status !== 'paused') throw new EngineError('Invalid resume transition.', { code: 'INVALID_SESSION_EVENT' });
    if (event.data.body !== null && event.data.body !== undefined) assertString(event.data.body, 'body');
    return 'active';
  }
  if (event.type === 'session.scope_updated') {
    if (!['active', 'paused'].includes(status)) {
      throw new EngineError('Invalid scope update transition.', { code: 'INVALID_SESSION_EVENT' });
    }
    if (
      !Array.isArray(event.data.scope)
      || event.data.scope.some((item) => typeof item !== 'string' || item.trim() === '')
    ) {
      throw new EngineError('Invalid updated scope.', { code: 'INVALID_SESSION_EVENT' });
    }
    assertString(event.data.reason, 'scope update reason');
    for (const field of ['goal', 'branch', 'baseCommit']) {
      if (Object.hasOwn(event.data, field) && event.data[field] !== null) {
        assertString(event.data[field], field);
      }
    }
    return status;
  }
  if (event.type === 'session.ended') {
    if (!['active', 'paused'].includes(status)) {
      throw new EngineError('Invalid end transition.', { code: 'INVALID_SESSION_EVENT' });
    }
    assertString(event.data.summary, 'summary');
    if (
      event.data.blockers !== undefined
      && (!Array.isArray(event.data.blockers)
        || event.data.blockers.some((item) => typeof item !== 'string' || item.trim() === ''))
    ) {
      throw new EngineError('Invalid session blockers.', { code: 'INVALID_SESSION_EVENT' });
    }
    if (event.data.next !== null && event.data.next !== undefined) assertString(event.data.next, 'next');
    return 'ended';
  }
  throw new EngineError(`Unsupported session event: ${event.type}`, {
    code: 'INVALID_SESSION_EVENT',
  });
}

async function buildSnapshot(layout) {
  const config = await loadConfig(layout);
  const events = await readEvents(layout);
  const sessionRoots = events.filter((event) => event.type === 'session.started' && event.previous === null);
  const sessions = [];
  const tickets = [];
  const conflicts = [];
  const planState = await buildPlanState(layout, config, events);
  const profileState = buildProfileState(config, events);
  conflicts.push(...planState.conflicts);
  conflicts.push(...profileState.conflicts);

  for (const root of sessionRoots) {
    const entityEvents = events.filter((event) => event.entityId === root.entityId);
    const collected = collectEntityHistory(root, entityEvents);
    conflicts.push(...collected.conflicts);
    conflicts.push(...unreachableHistoryConflict(root, collected.unreachable));
    try {
      validateSessionRoot(root, config);
    } catch (error) {
      conflicts.push({
        entityId: root.entityId,
        previous: null,
        eventIds: [root.id],
        message: `Invalid session root: ${error.message}`,
      });
      continue;
    }
    let status = 'active';
    let endedAt = null;
    let summary = null;
    let blockers = [];
    let next = null;
    let scope = [...root.data.scope];
    let goal = root.data.goal ?? null;
    let branch = root.data.branch ?? null;
    let baseCommit = root.data.baseCommit ?? null;
    for (const event of collected.history) {
      let nextStatus;
      try {
        nextStatus = validateSessionChild(event, config, root.actor.participant, status);
      } catch (error) {
        conflicts.push({
          entityId: root.entityId,
          previous: event.previous,
          eventIds: [event.id],
          message: `Invalid session history: ${error.message}`,
        });
        break;
      }
      if (event.type === 'session.scope_updated') {
        scope = [...event.data.scope];
        if (Object.hasOwn(event.data, 'goal')) goal = event.data.goal;
        if (Object.hasOwn(event.data, 'branch')) branch = event.data.branch;
        if (Object.hasOwn(event.data, 'baseCommit')) baseCommit = event.data.baseCommit;
      }
      if (event.type === 'session.ended') {
        status = 'ended';
        endedAt = event.at;
        summary = event.data.summary;
        blockers = event.data.blockers ?? [];
        next = event.data.next ?? null;
      }
      status = nextStatus;
    }
    const startedMs = validDateMs(root.at);
    const endedMs = endedAt === null ? null : validDateMs(endedAt);
    sessions.push({
      id: root.entityId,
      participant: root.actor.participant,
      title: root.data.title,
      scope,
      goal,
      summary,
      branch,
      baseCommit,
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
        previous: event.previous,
        data: event.data,
      })),
    });
  }
  sessions.sort((left, right) => left.startedAt.localeCompare(right.startedAt));

  const ticketRoots = events.filter((event) => event.type === 'ticket.created' && event.previous === null);
  for (const root of ticketRoots) {
    const entityEvents = events.filter((event) => event.entityId === root.entityId);
    const collected = collectEntityHistory(root, entityEvents);
    conflicts.push(...collected.conflicts);
    conflicts.push(...unreachableHistoryConflict(root, collected.unreachable));
    const projected = ticketProjection(root, collected.history);
    if (projected.invalidEvents.length > 0) {
      conflicts.push({
        entityId: root.entityId,
        previous: projected.invalidEvents[0].previous,
        eventIds: projected.invalidEvents.map((event) => event.id),
        message: 'Invalid requester clarification event.',
      });
    }
    tickets.push(projected.ticket);
  }
  tickets.sort((left, right) => {
    const leftAt = left.history[0]?.at ?? '';
    const rightAt = right.history[0]?.at ?? '';
    return leftAt.localeCompare(rightAt);
  });

  const sync = (await exists(layout.statusPath))
    ? await readJson(layout.statusPath)
    : { status: 'unknown', lastSyncedAt: null, message: null };
  return {
    schemaVersion: 1,
    sample: false,
    participants: config.participants,
    profiles: profileState.profiles,
    localPreferences: await localPreferences(layout),
    goals: planState.plan ? { ...planState.plan.goals } : { ...NULL_GOALS },
    plan: planState.plan,
    sessions,
    tickets,
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

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => (
    item !== null && item !== undefined && !(Array.isArray(item) && item.length === 0)
  )));
}

/**
 * Reduce a full engine status to what an AI needs for a briefing: open work,
 * each participant's latest handoff, actionable tickets, sync state and
 * conflicts. Event histories are omitted; run status without --brief for them.
 */
export function briefStatus({ participant, snapshot }) {
  const partner = snapshot.participants.find((id) => id !== participant) ?? null;
  const lastEventAt = (session) => session.history.at(-1)?.at ?? session.startedAt;
  const latestEnded = snapshot.participants.map((id) => snapshot.sessions
    .filter((session) => session.participant === id && session.status === 'ended')
    .sort((left, right) => right.endedAt.localeCompare(left.endedAt))[0])
    .filter(Boolean);
  const sessions = [
    ...snapshot.sessions.filter((session) => session.status !== 'ended'),
    ...latestEnded,
  ].map((session) => compact({
    id: session.id,
    participant: session.participant,
    status: session.status,
    title: session.title,
    scope: session.scope,
    goal: session.goal,
    branch: session.branch,
    baseCommit: session.baseCommit,
    startedAt: session.startedAt,
    lastEventAt: lastEventAt(session),
    endedAt: session.endedAt,
    summary: session.summary,
    blockers: session.blockers,
    next: session.next,
  }));
  const terminal = new Set(['resolved', 'closed']);
  const ticket = (item, extra) => compact({
    id: item.id,
    kind: item.kind,
    status: item.status,
    title: item.title,
    ...extra,
  });
  const plan = snapshot.plan === null ? null : compact({
    status: snapshot.plan.status,
    goals: compact(snapshot.plan.goals),
    assignments: snapshot.plan.assignments.map(compact),
  });
  return {
    participant,
    partner,
    sync: compact(snapshot.sync),
    plan,
    sessions,
    tickets: {
      forMe: snapshot.tickets
        .filter((item) => item.assignee === participant
          && !terminal.has(item.status) && item.status !== 'answered')
        .map((item) => ticket(item, { requester: item.requester, body: item.body })),
      fromMe: snapshot.tickets
        .filter((item) => item.requester === participant && !terminal.has(item.status))
        .map((item) => ticket(item, { evidence: item.evidence })),
    },
    conflicts: snapshot.conflicts.map(({ entityId, message }) => ({ entityId, message })),
  };
}

/** Reduce an overlap assessment to a verdict, the overlapping paths and the unknowns. */
export function briefOverlap(result) {
  return {
    verdict: result.pathAssessment.status,
    overlaps: result.pathAssessment.overlaps.map(({ participant, proposed, recorded, relation }) => ({
      participant,
      proposed,
      recorded,
      relation,
    })),
    semantic: result.semanticAssessment.status,
    unknowns: result.unknowns,
  };
}

function normalizeScopeValue(value, label) {
  assertString(value, label);
  const slashPath = value.replaceAll('\\', '/');
  if (path.posix.isAbsolute(slashPath)) {
    throw new EngineError(`${label} must be relative to the product repository.`, {
      code: 'INVALID_SCOPE',
    });
  }
  const normalized = path.posix.normalize(slashPath).replace(/^\.\//, '').replace(/\/$/, '');
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new EngineError(`${label} cannot leave the product repository.`, {
      code: 'INVALID_SCOPE',
    });
  }
  return normalized;
}

function normalizeProposedScope(scope) {
  if (!Array.isArray(scope) || scope.length === 0) {
    throw new EngineError('scope must contain at least one relative product path.', {
      code: 'INVALID_SCOPE',
    });
  }
  return [...new Set(scope.map((value, index) => normalizeScopeValue(value, `scope[${index}]`)))];
}

function hasPatternSyntax(value) {
  return /[*?[\]{}]/.test(value);
}

function pathRelation(proposed, recorded) {
  if (hasPatternSyntax(proposed) || hasPatternSyntax(recorded)) return null;
  if (proposed === '.' || recorded === '.') return 'contains_or_is_contained_by';
  if (proposed === recorded) return 'same_path';
  if (proposed.startsWith(`${recorded}/`)) return 'proposed_within_recorded';
  if (recorded.startsWith(`${proposed}/`)) return 'proposed_contains_recorded';
  return null;
}

async function resolveProductCommit(repositoryPath, ref, label = 'baseCommit') {
  if (typeof ref !== 'string' || ref.trim() === '' || ref.startsWith('-')) {
    throw new EngineError(`${label} must be a valid Git revision.`, {
      code: 'INVALID_BASE_REVISION',
    });
  }
  const result = await git(
    repositoryPath,
    ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
    { allowFailure: true },
  );
  if (!result.ok) {
    throw new EngineError(`Cannot resolve ${label}: ${ref}`, { code: 'INVALID_BASE_REVISION' });
  }
  return result.stdout;
}

async function productState(repositoryPath) {
  const head = (await git(repositoryPath, ['rev-parse', 'HEAD'])).stdout;
  const branchResult = await git(repositoryPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    allowFailure: true,
  });
  const upstreamResult = await git(
    repositoryPath,
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    { allowFailure: true },
  );
  const dirty = (await git(repositoryPath, ['status', '--porcelain'])).stdout !== '';
  let unpushedCommits = null;
  if (upstreamResult.ok) {
    const count = await git(repositoryPath, ['rev-list', '--count', `${upstreamResult.stdout}..HEAD`]);
    unpushedCommits = Number.parseInt(count.stdout, 10);
  }
  return {
    head,
    branch: branchResult.ok ? branchResult.stdout : null,
    dirty,
    upstream: upstreamResult.ok ? upstreamResult.stdout : null,
    unpushedCommits,
  };
}

async function sourceCheckoutFingerprint(repositoryPath) {
  const state = await productState(repositoryPath);
  const status = await git(repositoryPath, ['status', '--porcelain=v1', '-z']);
  const staged = await git(repositoryPath, ['diff', '--binary', '--cached']);
  const unstaged = await git(repositoryPath, ['diff', '--binary']);
  return { state, status: status.stdout, staged: staged.stdout, unstaged: unstaged.stdout };
}

export async function assessOverlap({
  repository = '.',
  scope,
  baseCommit = 'HEAD',
} = {}) {
  const proposedScope = normalizeProposedScope(scope);
  const layout = await loadLayout(repository);
  const identity = await loadIdentity(layout);
  const snapshot = await buildSnapshot(layout);
  const product = await productState(layout.repositoryPath);
  const resolvedBase = await resolveProductCommit(layout.repositoryPath, baseCommit);
  const comparedSessions = snapshot.sessions
    .filter((session) => session.participant !== identity.participant && session.status !== 'ended')
    .map((session) => ({
      id: session.id,
      participant: session.participant,
      status: session.status,
      scope: session.scope,
      goal: session.goal,
      branch: session.branch,
      baseCommit: session.baseCommit,
      startedAt: session.startedAt,
      lastEventAt: session.history.at(-1)?.at ?? session.startedAt,
      endedAt: session.endedAt,
      endKnown: session.endedAt !== null,
    }));
  const overlaps = [];
  const incomparableScopes = [];
  for (const session of comparedSessions) {
    for (const recordedValue of session.scope) {
      let recorded;
      try {
        recorded = normalizeScopeValue(recordedValue, 'recorded scope');
      } catch {
        incomparableScopes.push({ sessionId: session.id, recorded: recordedValue });
        continue;
      }
      for (const proposed of proposedScope) {
        const relation = pathRelation(proposed, recorded);
        if (relation) {
          overlaps.push({
            sessionId: session.id,
            participant: session.participant,
            proposed,
            recorded,
            relation,
          });
        } else if (hasPatternSyntax(proposed) || hasPatternSyntax(recorded)) {
          incomparableScopes.push({ sessionId: session.id, proposed, recorded });
        }
      }
    }
  }
  const conflictedSessions = new Set(snapshot.conflicts.map((conflict) => conflict.entityId));
  const comparisonHasConflict = comparedSessions.some((session) => conflictedSessions.has(session.id));
  const pathStatus = snapshot.sync.status !== 'synced' || comparisonHasConflict || incomparableScopes.length > 0
    ? 'unknown'
    : overlaps.length > 0 ? 'overlap' : 'no_overlap';
  const unknowns = [
    'semantic_interface_overlap_not_inferred',
    'peer_live_presence_unknown',
    'peer_unpushed_product_changes_unknown',
  ];
  if (snapshot.sync.status !== 'synced') unknowns.push('shared_state_not_confirmed_synced');
  if (snapshot.sync.lastSyncedAt === null) unknowns.push('last_sync_time_unknown');
  if (comparisonHasConflict) unknowns.push('peer_session_history_conflicted');
  if (incomparableScopes.length > 0) unknowns.push('pattern_or_invalid_scope_not_comparable');
  if (comparedSessions.length > 0) unknowns.push('peer_session_end_not_recorded');
  if (comparedSessions.some((session) => session.baseCommit === null)) {
    unknowns.push('peer_base_revision_unknown');
  }
  if (product.dirty) unknowns.push('local_uncommitted_product_changes_not_shared');
  if (product.upstream === null) unknowns.push('product_upstream_unknown');
  if (product.unpushedCommits === null || product.unpushedCommits > 0) {
    unknowns.push('product_unpushed_commits_not_confirmed_shared');
  }
  return {
    proposed: { scope: proposedScope, baseCommit: resolvedBase },
    localParticipant: identity.participant,
    product,
    shared: {
      syncStatus: snapshot.sync.status,
      lastSyncedAt: snapshot.sync.lastSyncedAt,
      message: snapshot.sync.message,
    },
    comparedSessions,
    pathAssessment: { status: pathStatus, overlaps, incomparableScopes },
    semanticAssessment: {
      status: 'unknown',
      message: 'Path comparison cannot prove interface or behavior overlap; inspect recorded goals and shared evidence.',
    },
    unknowns: [...new Set(unknowns)],
  };
}

function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function pathEntryExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function resolveProspectivePath(filePath) {
  const missing = [];
  let existing = filePath;
  while (!(await pathEntryExists(existing))) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  const resolvedParent = await realpath(existing);
  return path.join(resolvedParent, ...missing);
}

function defaultWorktreeBranch(directory) {
  const slug = path.basename(directory)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'work';
  return `codex/${slug}-${randomUUID().slice(0, 8)}`;
}

export async function prepareProductWorktree({
  repository = '.',
  directory,
  branch = null,
  baseCommit = 'HEAD',
} = {}) {
  assertString(directory, 'directory');
  const layout = await resolveLayout(repository);
  const requestedDestination = path.resolve(layout.repositoryPath, directory);
  if (await pathEntryExists(requestedDestination)) {
    throw new EngineError(`Worktree path already exists: ${requestedDestination}`, {
      code: 'WORKTREE_PATH_EXISTS',
    });
  }
  const destination = await resolveProspectivePath(requestedDestination);
  const commonDirectory = path.dirname(layout.root);
  if (
    destination === path.parse(destination).root
    || isWithin(layout.repositoryPath, destination)
    || isWithin(commonDirectory, destination)
  ) {
    throw new EngineError('Worktree directory must be a new path outside the product and common Git directories.', {
      code: 'INVALID_WORKTREE_PATH',
    });
  }
  const selectedBranch = branch ?? defaultWorktreeBranch(destination);
  const validBranch = await git(
    layout.repositoryPath,
    ['check-ref-format', `refs/heads/${selectedBranch}`],
    { allowFailure: true },
  );
  if (!validBranch.ok) {
    throw new EngineError(`Invalid worktree branch name: ${selectedBranch}`, {
      code: 'INVALID_BRANCH',
    });
  }
  const localBranch = await git(
    layout.repositoryPath,
    ['show-ref', '--verify', '--quiet', `refs/heads/${selectedBranch}`],
    { allowFailure: true },
  );
  const remoteBranch = await git(
    layout.repositoryPath,
    ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${selectedBranch}`],
    { allowFailure: true },
  );
  if (localBranch.ok || remoteBranch.ok) {
    throw new EngineError(`Worktree branch already exists: ${selectedBranch}`, {
      code: 'WORKTREE_BRANCH_EXISTS',
    });
  }
  const resolvedBase = await resolveProductCommit(layout.repositoryPath, baseCommit);
  const before = await sourceCheckoutFingerprint(layout.repositoryPath);
  await mkdir(path.dirname(destination), { recursive: true });
  const created = await git(
    layout.repositoryPath,
    ['worktree', 'add', '-b', selectedBranch, destination, resolvedBase],
    { allowFailure: true },
  );
  if (!created.ok) {
    throw new EngineError(created.stderr || 'Unable to create product worktree.', {
      code: 'WORKTREE_CREATE_FAILED',
    });
  }
  const after = await sourceCheckoutFingerprint(layout.repositoryPath);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new EngineError('The source product checkout changed while preparing the worktree.', {
      code: 'SOURCE_CHECKOUT_CHANGED',
    });
  }
  const worktreeHead = (await git(destination, ['rev-parse', 'HEAD'])).stdout;
  return {
    created: true,
    directory: destination,
    branch: selectedBranch,
    baseCommit: resolvedBase,
    head: worktreeHead,
    sourceCheckoutPreserved: true,
    uncommittedChangesCopied: false,
    automaticIntegration: false,
  };
}
