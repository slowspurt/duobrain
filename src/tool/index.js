import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const BLOCK_START = '<!-- duobrain:start -->';
const BLOCK_END = '<!-- duobrain:end -->';
const CLAUDE_IMPORT = '@AGENTS.md';

export class ToolError extends Error {
  constructor(message, { code }) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
  }
}

/** Absolute paths of the files an AI reads, resolved from this checkout. */
export async function guidePaths(toolRoot = TOOL_ROOT) {
  const { version } = JSON.parse(await readFile(path.join(toolRoot, 'package.json'), 'utf8'));
  const at = (...parts) => path.join(toolRoot, ...parts);
  return {
    version,
    toolRoot,
    cli: at('bin', 'duobrain.js'),
    guide: at('guides', 'duobrain-ai.md'),
    references: {
      sessions: at('guides', 'reference', 'sessions.md'),
      tickets: at('guides', 'reference', 'tickets.md'),
      wiki: at('guides', 'reference', 'wiki.md'),
    },
    onboarding: at('guides', 'duobrain-onboarding.md'),
    commitSkill: at('skills', 'duobrain-commit', 'SKILL.md'),
  };
}

/**
 * The block duobrain keeps in a product repository's AGENTS.md. It holds no
 * machine-specific paths because both people commit the same file; `duobrain guide`
 * resolves paths on each machine.
 */
export function renderAgentsBlock() {
  return [
    BLOCK_START,
    '## duobrain',
    '',
    'Two people share this repository\'s work record through duobrain. This block is managed by `duobrain agents-sync`; edits inside it are overwritten.',
    '',
    '- Before starting work or answering about the partner\'s work, run `duobrain guide` and follow the `guide` file it returns.',
    '- Begin with `duobrain sync` and `duobrain status --brief` from the repository root.',
    '- Before every commit, follow the `commitSkill` file that `duobrain guide` returns.',
    '- If `duobrain` is not on PATH, ask the user for the duobrain checkout and run `node <checkout>/bin/duobrain.js` instead.',
    BLOCK_END,
  ].join('\n');
}

/** Insert or replace the managed block, leaving everything outside the markers untouched. */
export function upsertManagedBlock(existing, block = renderAgentsBlock()) {
  if (existing === null) return { content: `${block}\n`, action: 'created' };
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END, start);
  let content;
  if (start !== -1 && end !== -1) {
    content = `${existing.slice(0, start)}${block}${existing.slice(end + BLOCK_END.length)}`;
  } else if (start !== -1 || existing.includes(BLOCK_END)) {
    throw new ToolError('AGENTS.md has an unmatched duobrain marker; fix it by hand, then rerun agents-sync.', {
      code: 'AGENTS_MARKER_BROKEN',
    });
  } else {
    content = `${existing.replace(/\s*$/, '')}${existing.trim() ? '\n\n' : ''}${block}\n`;
  }
  return { content, action: content === existing ? 'unchanged' : 'updated' };
}

/** Make Claude Code load AGENTS.md through CLAUDE.md, which it reads natively. */
export function ensureClaudeImport(existing) {
  if (existing === null) return { content: `${CLAUDE_IMPORT}\n`, action: 'created' };
  if (existing.split('\n').some((line) => line.trim() === CLAUDE_IMPORT)) {
    return { content: existing, action: 'unchanged' };
  }
  return { content: `${CLAUDE_IMPORT}\n\n${existing}`, action: 'updated' };
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Write the duobrain block into <productRoot>/AGENTS.md and the import into CLAUDE.md.
 * Only these two files are written, and nothing is committed.
 */
export async function syncAgentFiles({ productRoot, dryRun = false }) {
  const files = [];
  for (const [name, update] of [
    ['AGENTS.md', (text) => upsertManagedBlock(text)],
    ['CLAUDE.md', (text) => ensureClaudeImport(text)],
  ]) {
    const filePath = path.join(productRoot, name);
    const { content, action } = update(await readOptional(filePath));
    if (!dryRun && action !== 'unchanged') await writeFile(filePath, content, 'utf8');
    files.push({ path: filePath, action });
  }
  return {
    dryRun,
    files,
    commitNeeded: files.some(({ action }) => action !== 'unchanged'),
  };
}

/** Whether a product repository already carries the managed block. */
export async function hasAgentsBlock(productRoot) {
  return (await readOptional(path.join(productRoot, 'AGENTS.md')))?.includes(BLOCK_START) ?? false;
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

/**
 * Fast-forward this duobrain checkout to its upstream. Refuses local changes and
 * diverged history so an update never overwrites the user's work.
 */
export async function updateTool({ toolRoot = TOOL_ROOT, check = false } = {}) {
  try {
    await git(toolRoot, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new ToolError('This duobrain copy is not a Git checkout; download the new release instead.', {
      code: 'UPDATE_NOT_GIT',
    });
  }
  const current = JSON.parse(await readFile(path.join(toolRoot, 'package.json'), 'utf8')).version;
  let upstream;
  try {
    upstream = await git(toolRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  } catch {
    throw new ToolError('The duobrain checkout has no upstream branch to update from.', { code: 'UPDATE_NO_UPSTREAM' });
  }
  await git(toolRoot, ['fetch', '--quiet']);
  const from = await git(toolRoot, ['rev-parse', 'HEAD']);
  const [ahead, behind] = (await git(toolRoot, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']))
    .split(/\s+/).map(Number);
  const latest = JSON.parse(await git(toolRoot, ['show', '@{u}:package.json'])).version;
  const commits = behind === 0 ? [] : (await git(toolRoot, ['log', '--format=%h %s', 'HEAD..@{u}'])).split('\n');
  const report = { upstream, current, latest, ahead, behind, commits };
  if (check || behind === 0) return { ...report, updated: false, from, to: from };
  if (ahead > 0) {
    throw new ToolError('The duobrain checkout has local commits that are not upstream; update it by hand.', {
      code: 'UPDATE_DIVERGED',
    });
  }
  if ((await git(toolRoot, ['status', '--porcelain', '--untracked-files=no'])) !== '') {
    throw new ToolError('The duobrain checkout has uncommitted changes; commit or stash them first.', {
      code: 'UPDATE_DIRTY',
    });
  }
  await git(toolRoot, ['merge', '--ff-only', '--quiet', '@{u}']);
  return { ...report, updated: true, from, to: await git(toolRoot, ['rev-parse', 'HEAD']) };
}
