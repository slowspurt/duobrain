import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const BLOCK_START = '<!-- duobrain:start -->';
const BLOCK_END = '<!-- duobrain:end -->';
const CLAUDE_IMPORT = '@AGENTS.md';

/** The directory, inside a product repository, that holds a vendored copy of duobrain. */
export const VENDOR_DIR = '.duobrain';
/** What a vendored copy contains: only what the CLI, dashboard and AI need at run time. */
export const RUNTIME_ENTRIES = ['package.json', 'LICENSE', 'bin', 'src', 'guides', 'skills'];
const GITATTRIBUTES_LINE = `/${VENDOR_DIR}/** linguist-vendored linguist-generated`;

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
 * The block duobrain keeps in a product repository's AGENTS.md. Both people commit the
 * same file, so it holds no machine-specific paths: a vendored project points at
 * .duobrain/, and a global install asks `duobrain guide` for this machine's paths.
 */
export function renderAgentsBlock({ vendored = false } = {}) {
  if (vendored) {
    return [
      BLOCK_START,
      '## duobrain',
      '',
      'Two people share this repository\'s work record through duobrain. This block is managed by `node .duobrain/bin/duobrain.js agents-sync`; edits inside it are overwritten.',
      '',
      '- `.duobrain/` is a vendored copy of the duobrain tool, pinned by `.duobrain/VENDOR.json`. It is not product code: never edit it and leave it out of product reviews, searches and refactors.',
      '- Run duobrain as `node .duobrain/bin/duobrain.js <command>` from the repository root.',
      '- If this clone is not connected yet, follow `.duobrain/guides/duobrain-onboarding.md`. A person joining existing shared state runs only `init --participant <their-id>`.',
      '- Before starting work or answering about the partner\'s work, follow `.duobrain/guides/duobrain-ai.md`, beginning with `sync` and `status --brief`.',
      '- Before every commit, follow `.duobrain/skills/duobrain-commit/SKILL.md`.',
      '- To update duobrain for both people, run `update`, then commit `.duobrain/` and this file.',
      BLOCK_END,
    ].join('\n');
  }
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
 * Write the duobrain block into <productRoot>/AGENTS.md and the import into CLAUDE.md,
 * plus the vendored-copy line in .gitattributes when .duobrain exists. Only these files
 * are written, and nothing is committed.
 */
export async function syncAgentFiles({ productRoot, dryRun = false }) {
  const vendored = await isVendored(path.join(productRoot, VENDOR_DIR));
  const files = [];
  const steps = [
    ['AGENTS.md', (text) => upsertManagedBlock(text, renderAgentsBlock({ vendored }))],
    ['CLAUDE.md', (text) => ensureClaudeImport(text)],
  ];
  if (vendored) steps.push(['.gitattributes', (text) => ensureGitattributes(text)]);
  for (const [name, update] of steps) {
    const filePath = path.join(productRoot, name);
    const { content, action } = update(await readOptional(filePath));
    if (!dryRun && action !== 'unchanged') await writeFile(filePath, content, 'utf8');
    files.push({ path: filePath, action });
  }
  return {
    dryRun,
    vendored,
    files,
    commitNeeded: files.some(({ action }) => action !== 'unchanged'),
  };
}

/** Mark the vendored copy so GitHub leaves it out of language stats and collapses its diffs. */
export function ensureGitattributes(existing) {
  if (existing === null) return { content: `${GITATTRIBUTES_LINE}\n`, action: 'created' };
  if (existing.split('\n').some((line) => line.trim() === GITATTRIBUTES_LINE)) {
    return { content: existing, action: 'unchanged' };
  }
  return { content: `${existing.replace(/\s*$/, '')}${existing.trim() ? '\n' : ''}${GITATTRIBUTES_LINE}\n`, action: 'updated' };
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Whether a directory is a vendored copy (it carries VENDOR.json) rather than a Git checkout. */
export async function isVendored(toolRoot) {
  return pathExists(path.join(toolRoot, 'VENDOR.json'));
}

async function readVendorManifest(toolRoot) {
  return JSON.parse(await readFile(path.join(toolRoot, 'VENDOR.json'), 'utf8'));
}

async function gitOptional(cwd, args) {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
}

async function walkFiles(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

/** Runtime files of a source copy: Git-tracked files for a checkout, everything for a vendored copy. */
async function runtimeFiles(sourceRoot) {
  const tracked = await gitOptional(sourceRoot, ['ls-files', '--', ...RUNTIME_ENTRIES]);
  if (tracked !== null && tracked !== '' && !(await isVendored(sourceRoot))) return tracked.split('\n');
  const files = [];
  for (const entry of RUNTIME_ENTRIES) {
    const full = path.join(sourceRoot, entry);
    if (!(await pathExists(full))) continue;
    if ((await stat(full)).isDirectory()) files.push(...await walkFiles(sourceRoot, entry));
    else files.push(entry);
  }
  return files;
}

async function sourceIdentity(sourceRoot) {
  if (await isVendored(sourceRoot)) {
    const { ref, commit } = await readVendorManifest(sourceRoot);
    return { ref, commit };
  }
  const commit = await gitOptional(sourceRoot, ['rev-parse', 'HEAD']);
  const tag = await gitOptional(sourceRoot, ['describe', '--tags', '--exact-match', 'HEAD']);
  return { ref: tag ?? commit, commit };
}

function vendorReadme(manifest) {
  return [
    `# Vendored duobrain ${manifest.version}`,
    '',
    'This directory is a copy of the duobrain tool committed into this project so both people run the same',
    'version without installing anything. It is not product code: do not edit it by hand.',
    '',
    `- Source: ${manifest.source} at \`${manifest.ref}\``,
    '- Run: `node .duobrain/bin/duobrain.js <command>` from the repository root',
    '- Update: `node .duobrain/bin/duobrain.js update`, then commit `.duobrain/` and `AGENTS.md`',
    '',
  ].join('\n');
}

/**
 * Copy duobrain's runtime files into <productRoot>/.duobrain and pin the version in
 * VENDOR.json. The copy has no .git, so it is ordinary product files. Refuses to
 * overwrite uncommitted edits inside .duobrain. Nothing is committed.
 */
export async function installVendored({ sourceRoot = TOOL_ROOT, productRoot }) {
  const vendorRoot = path.join(productRoot, VENDOR_DIR);
  if (path.resolve(sourceRoot) === path.resolve(productRoot)) {
    throw new ToolError('Run install inside the product repository, not in the duobrain checkout.', {
      code: 'VENDOR_SELF',
    });
  }
  if (path.resolve(sourceRoot) === path.resolve(vendorRoot)) {
    throw new ToolError('This is already the vendored copy; use `update` to change its version.', {
      code: 'VENDOR_SELF',
    });
  }
  const pkg = JSON.parse(await readFile(path.join(sourceRoot, 'package.json'), 'utf8'));
  const identity = await sourceIdentity(sourceRoot);
  const manifest = {
    schemaVersion: 1,
    name: 'duobrain',
    version: pkg.version,
    source: pkg.repository?.url ?? null,
    ref: identity.ref,
    commit: identity.commit,
  };
  if (await isVendored(vendorRoot)) {
    const current = await readVendorManifest(vendorRoot);
    if (current.version === manifest.version && current.commit === manifest.commit) {
      return { path: vendorRoot, action: 'unchanged', from: current.version, to: manifest.version, manifest };
    }
  }
  // Only committed-then-edited files count; a copy that was never committed can be replaced.
  const dirty = await gitOptional(productRoot, ['status', '--porcelain', '--untracked-files=no', '--', VENDOR_DIR]);
  if (dirty && (await isVendored(vendorRoot))) {
    throw new ToolError('.duobrain has uncommitted changes; commit or discard them before replacing it.', {
      code: 'VENDOR_DIRTY',
    });
  }
  const previous = (await isVendored(vendorRoot)) ? (await readVendorManifest(vendorRoot)).version : null;
  const files = await runtimeFiles(sourceRoot);
  await rm(vendorRoot, { recursive: true, force: true });
  for (const file of files) {
    await mkdir(path.dirname(path.join(vendorRoot, file)), { recursive: true });
    await cp(path.join(sourceRoot, file), path.join(vendorRoot, file));
  }
  await writeFile(path.join(vendorRoot, 'VENDOR.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(path.join(vendorRoot, 'README.md'), vendorReadme(manifest), 'utf8');
  return {
    path: vendorRoot,
    action: previous === null ? 'created' : 'updated',
    from: previous,
    to: manifest.version,
    files: files.length,
    manifest,
  };
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

/** Release tags (vX.Y.Z) published at a Git source, highest first. */
export async function releaseTags(source) {
  const { stdout } = await execFileAsync('git', ['ls-remote', '--tags', '--refs', source], { encoding: 'utf8' });
  return stdout.split('\n')
    .map((line) => line.split('refs/tags/')[1])
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag ?? ''))
    .sort((left, right) => compareVersions(right.slice(1), left.slice(1)));
}

/**
 * Replace a vendored copy with a published release (the newest, or `ref`). Downloads
 * the tagged source with a shallow clone, copies its runtime files and deletes the clone.
 */
export async function updateVendored({ vendorRoot, check = false, ref } = {}) {
  const current = await readVendorManifest(vendorRoot);
  if (!current.source) {
    throw new ToolError('VENDOR.json has no source to update from.', { code: 'UPDATE_NO_UPSTREAM' });
  }
  const tags = await releaseTags(current.source);
  const target = ref ?? tags[0];
  if (!target) throw new ToolError('No release tags were found at the source.', { code: 'UPDATE_NO_RELEASE' });
  if (ref && !tags.includes(ref)) throw new ToolError(`Release ${ref} was not found at the source.`, { code: 'UPDATE_NO_RELEASE' });
  const report = { mode: 'vendored', source: current.source, current: current.version, latest: target.slice(1), releases: tags.slice(0, 5) };
  const newer = compareVersions(target.slice(1), current.version) > 0;
  // Without an explicit --ref, only move forward: a copy installed from a commit ahead of
  // the newest tag must not be replaced by that older release.
  if (check || current.ref === target || (!ref && !newer)) return { ...report, updated: false };
  const productRoot = path.dirname(vendorRoot);
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'duobrain-release-'));
  try {
    await execFileAsync('git', ['clone', '--quiet', '--depth', '1', '--branch', target, current.source, temporary]);
    const installed = await installVendored({ sourceRoot: temporary, productRoot });
    return { ...report, updated: installed.action !== 'unchanged', from: installed.from, to: installed.to };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
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
