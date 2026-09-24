#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  acknowledgeTicket,
  addWikiNote,
  assessOverlap,
  briefOverlap,
  briefStatus,
  captureWorkContext,
  clarifyTicket,
  closeTicket,
  compareSharedMethods,
  createTicket,
  detectGithubAccount,
  endSession,
  getEngineStatus,
  initSharedStore,
  inspectOnboarding,
  listWikiNotes,
  pauseSession,
  prepareProductWorktree,
  recordCommitNote,
  reopenTicket,
  requestTicketInformation,
  resumeSession,
  resolveTicket,
  respondToTicket,
  runWikiRefinement,
  saveOnboardingProgress,
  searchSharedWiki,
  setPlan,
  setDashboardLocale,
  setParticipantProfile,
  startSession,
  syncStore,
  traceSharedWiki,
  updateSessionScope,
} from '../src/engine/index.js';
import {
  TOOL_ROOT,
  guidePaths,
  hasAgentsBlock,
  installVendored,
  isVendored,
  syncAgentFiles,
  updateTool,
  updateVendored,
} from '../src/tool/index.js';

const execFileAsync = promisify(execFile);

const HELP = `duobrain — Git-backed collaboration records for exactly two people

Usage:
  duobrain --version
  duobrain guide
  duobrain install [--repository <path>]
  duobrain update [--check] [--ref <vX.Y.Z>] [--repository <path>]
  duobrain agents-sync [--dry-run] [--repository <path>]
  duobrain onboarding-inspect [--repository <path>]
  duobrain onboarding-save --file <json-path> [--repository <path>]
  duobrain account-detect
  duobrain init --participant <id> [--participants <id,id>] [--no-agents] [--repository <path>]
  duobrain profile-set [--nickname <text>] [--github-login <login>] [--actor <human|ai>]
  duobrain dashboard-locale-set --locale <system|language-tag>
  duobrain start --title <text> [--scope <path,path>] [--goal <text>]
                  [--branch <name>] [--base-commit <sha>] [--actor <human|ai>]
  duobrain pause --session <uuid> [--body <text>] [--actor <human|ai>]
  duobrain resume --session <uuid> [--body <text>] [--actor <human|ai>]
  duobrain scope-update --session <uuid> --file <json-path> [--actor <human|ai>]
  duobrain end --session <uuid> --summary <text> [--blockers <text,text>]
                [--next <text>] [--actor <human|ai>]
  duobrain ticket-create --kind <information|feedback> --title <text> --body <text>
                         [--assignee <id>] [--goal <text>] [--actor <human|ai>]
  duobrain ticket-ack --ticket <uuid> [--actor <human|ai>]
  duobrain ticket-needs-information --ticket <uuid> --body <text> [--actor <human|ai>]
  duobrain ticket-clarify --ticket <uuid> --body <text> [--actor <human|ai>]
  duobrain ticket-respond --ticket <uuid> --body <text>
                           [--evidence <wiki/path,...>] [--actor <human|ai>]
  duobrain ticket-resolve --ticket <uuid> --body <text> [--actor <human|ai>]
  duobrain ticket-close --ticket <uuid> --reason <cancelled|duplicate> --body <text>
  duobrain ticket-reopen --ticket <uuid> --body <text> [--actor <human|ai>]
  duobrain note-add --file <markdown-path> [--id <uuid>]
  duobrain wiki-list
  duobrain wiki-search --query <text> [--filters <json-path>]
  duobrain wiki-trace --roots <wiki/path,...>
  duobrain method-compare --file <json-path> [--request-missing] [--actor <human|ai>]
  duobrain wiki-refine --file <refinement-json> [--now <iso-timestamp>]
  duobrain plan-set --file <json-path> [--actor <human|ai>]
  duobrain capture-extract [--transcript <jsonl>] [--since <iso>] [--until <iso>]
                           [--bundle] [--out <path>]
  duobrain commit-note --file <summary-json> [--message-out <path>] [--dry-run]
  duobrain overlap --scope <path,path> [--base-commit <ref>] [--brief]
  duobrain worktree-prepare --directory <path> [--branch <name>] [--base-commit <ref>]
  duobrain sync [--repository <path>]
  duobrain status [--brief] [--repository <path>]
  duobrain <command> --help

start and end commit locally before attempting to sync. A failed push remains pending
and can be retried with duobrain sync. Output is JSON; --brief prints a compact
summary without event histories.`;

const COMMAND_HELP = {
  'onboarding-inspect': 'Usage: duobrain onboarding-inspect [--repository <path>]',
  'onboarding-save': 'Usage: duobrain onboarding-save --file <json-path> [--repository <path>]',
  'account-detect': 'Usage: duobrain account-detect',
  guide: 'Usage: duobrain guide',
  install: 'Usage: duobrain install [--repository <path>] (copies duobrain into <product>/.duobrain and writes the agent files)',
  update: 'Usage: duobrain update [--check] [--ref <vX.Y.Z>] [--repository <path>]',
  'agents-sync': 'Usage: duobrain agents-sync [--dry-run] [--repository <path>]',
  init: 'Usage: duobrain init --participant <id> [--participants <id,id>] [--no-agents] [--repository <path>] (the first person passes --participants; a joining person may omit it)',
  'profile-set': 'Usage: duobrain profile-set [--nickname <text>] [--github-login <login>] [--actor <human|ai>] [--repository <path>]',
  'dashboard-locale-set': 'Usage: duobrain dashboard-locale-set --locale <system|language-tag> [--repository <path>]',
  start: 'Usage: duobrain start --title <text> [--scope <path,path>] [--goal <text>] [--branch <name>] [--base-commit <sha>] [--actor <human|ai>] [--repository <path>]',
  pause: 'Usage: duobrain pause --session <uuid> [--body <text>] [--actor <human|ai>] [--repository <path>]',
  resume: 'Usage: duobrain resume --session <uuid> [--body <text>] [--actor <human|ai>] [--repository <path>]',
  'scope-update': 'Usage: duobrain scope-update --session <uuid> --file <json-path> [--actor <human|ai>] [--repository <path>]',
  end: 'Usage: duobrain end --session <uuid> --summary <text> [--blockers <text,text>] [--next <text>] [--actor <human|ai>] [--repository <path>]',
  'ticket-create': 'Usage: duobrain ticket-create --kind <information|feedback> --title <text> --body <text> [--assignee <id>] [--goal <text>] [--actor <human|ai>] [--repository <path>]',
  'ticket-ack': 'Usage: duobrain ticket-ack --ticket <uuid> [--actor <human|ai>] [--repository <path>]',
  'ticket-needs-information': 'Usage: duobrain ticket-needs-information --ticket <uuid> --body <text> [--actor <human|ai>] [--repository <path>]',
  'ticket-clarify': 'Usage: duobrain ticket-clarify --ticket <uuid> --body <text> [--actor <human|ai>] [--repository <path>]',
  'ticket-respond': 'Usage: duobrain ticket-respond --ticket <uuid> --body <text> [--evidence <wiki/path,...>] [--actor <human|ai>] [--repository <path>]',
  'ticket-resolve': 'Usage: duobrain ticket-resolve --ticket <uuid> --body <text> [--actor <human|ai>] [--repository <path>]',
  'ticket-close': 'Usage: duobrain ticket-close --ticket <uuid> --reason <cancelled|duplicate> --body <text> [--actor <human|ai>] [--repository <path>]',
  'ticket-reopen': 'Usage: duobrain ticket-reopen --ticket <uuid> --body <text> [--actor <human|ai>] [--repository <path>]',
  'note-add': 'Usage: duobrain note-add --file <markdown-path> [--id <uuid>] [--repository <path>]',
  'wiki-list': 'Usage: duobrain wiki-list [--repository <path>]',
  'wiki-search': 'Usage: duobrain wiki-search --query <text> [--filters <json-path>] [--repository <path>]',
  'wiki-trace': 'Usage: duobrain wiki-trace --roots <wiki/path,...> [--repository <path>]',
  'method-compare': 'Usage: duobrain method-compare --file <json-path> [--request-missing] [--actor <human|ai>] [--repository <path>]',
  'wiki-refine': 'Usage: duobrain wiki-refine --file <refinement-json> [--now <iso-timestamp>] [--repository <path>]',
  'plan-set': 'Usage: duobrain plan-set --file <json-path> [--actor <human|ai>] [--repository <path>]',
  'capture-extract': 'Usage: duobrain capture-extract [--transcript <jsonl>] [--since <iso>] [--until <iso>] [--bundle] [--out <path>] [--repository <path>]',
  'commit-note': 'Usage: duobrain commit-note --file <summary-json> [--message-out <path>] [--dry-run] [--repository <path>]',
  overlap: 'Usage: duobrain overlap --scope <path,path> [--base-commit <ref>] [--brief] [--repository <path>]',
  'worktree-prepare': 'Usage: duobrain worktree-prepare --directory <path> [--branch <name>] [--base-commit <ref>] [--repository <path>]',
  sync: 'Usage: duobrain sync [--repository <path>]',
  status: 'Usage: duobrain status [--brief] [--repository <path>]',
};

function parseOptions(tokens) {
  const options = {};
  const booleanOptions = new Set(['help', 'request-missing', 'brief', 'dry-run', 'bundle', 'check', 'no-agents']);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (booleanOptions.has(name)) {
      if (Object.hasOwn(options, name)) throw new Error(`Duplicate option: --${name}`);
      options[name] = true;
      continue;
    }
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate option: --${name}`);
    options[name] = value;
    index += 1;
  }
  return options;
}

function requireOption(options, name) {
  if (!options[name]) throw new Error(`Missing required option: --${name}`);
  return options[name];
}

async function productRoot(repository) {
  const { stdout } = await execFileAsync('git', ['-C', repository, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return stdout.trim();
}

function list(value) {
  return value === undefined || value === '' ? [] : value.split(',').map((item) => item.trim());
}

function output(value, brief = false) {
  process.stdout.write(`${brief ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const [command, ...tokens] = process.argv.slice(2);
  if (command === '--version' || command === '-v') {
    const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${version}\n`);
    return;
  }
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (!Object.hasOwn(COMMAND_HELP, command)) throw new Error(`Unknown command: ${command}`);
  const options = parseOptions(tokens);
  if (options.help) {
    process.stdout.write(`${COMMAND_HELP[command]}\n`);
    return;
  }
  const repository = options.repository ?? '.';
  let result;
  if (command === 'guide') {
    result = await guidePaths();
  } else if (command === 'agents-sync') {
    result = await syncAgentFiles({ productRoot: await productRoot(repository), dryRun: options['dry-run'] === true });
  } else if (command === 'install') {
    const root = await productRoot(repository);
    const installed = await installVendored({ productRoot: root });
    // Write the agent files with the code that was just copied into the product.
    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(installed.path, 'bin', 'duobrain.js'), 'agents-sync', '--repository', root],
      { encoding: 'utf8' },
    );
    result = { ...installed, agents: JSON.parse(stdout) };
  } else if (command === 'update' && await isVendored(TOOL_ROOT)) {
    result = await updateVendored({ vendorRoot: TOOL_ROOT, check: options.check === true, ref: options.ref });
    if (result.updated) {
      const { stdout } = await execFileAsync(
        process.execPath,
        [path.join(TOOL_ROOT, 'bin', 'duobrain.js'), 'agents-sync', '--repository', path.dirname(TOOL_ROOT)],
        { encoding: 'utf8' },
      );
      result = { ...result, agents: JSON.parse(stdout) };
    }
  } else if (command === 'update') {
    result = await updateTool({ check: options.check === true });
    const root = await productRoot(repository).catch(() => null);
    if (result.updated && root !== null && root !== TOOL_ROOT && await hasAgentsBlock(root)) {
      // Run the freshly pulled code, not the modules already loaded by this process.
      const { stdout } = await execFileAsync(
        process.execPath,
        [path.join(TOOL_ROOT, 'bin', 'duobrain.js'), 'agents-sync', '--repository', root],
        { encoding: 'utf8' },
      );
      result = { ...result, agents: JSON.parse(stdout) };
    }
  } else if (command === 'onboarding-inspect') {
    result = await inspectOnboarding({ repository });
  } else if (command === 'onboarding-save') {
    result = await saveOnboardingProgress({
      repository,
      progress: JSON.parse(await readFile(requireOption(options, 'file'), 'utf8')),
    });
  } else if (command === 'account-detect') {
    result = await detectGithubAccount();
  } else if (command === 'init') {
    result = await initSharedStore({
      repository,
      participants: options.participants === undefined ? undefined : list(options.participants),
      participant: requireOption(options, 'participant'),
    });
    if (!options['no-agents']) {
      result = { ...result, agents: await syncAgentFiles({ productRoot: await productRoot(repository) }) };
    }
  } else if (command === 'profile-set') {
    result = await setParticipantProfile({
      repository,
      nickname: options.nickname,
      githubLogin: options['github-login'],
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'dashboard-locale-set') {
    result = await setDashboardLocale({
      repository,
      locale: requireOption(options, 'locale'),
    });
  } else if (command === 'start') {
    result = await startSession({
      repository,
      title: requireOption(options, 'title'),
      scope: list(options.scope),
      goal: options.goal,
      branch: options.branch,
      baseCommit: options['base-commit'],
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'pause') {
    result = await pauseSession({
      repository,
      sessionId: requireOption(options, 'session'),
      body: options.body,
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'resume') {
    result = await resumeSession({
      repository,
      sessionId: requireOption(options, 'session'),
      body: options.body,
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'scope-update') {
    const change = JSON.parse(await readFile(requireOption(options, 'file'), 'utf8'));
    result = await updateSessionScope({
      ...change,
      repository,
      sessionId: requireOption(options, 'session'),
      actorKind: options.actor ?? 'human',
      sync: true,
    });
  } else if (command === 'end') {
    result = await endSession({
      repository,
      sessionId: requireOption(options, 'session'),
      summary: requireOption(options, 'summary'),
      blockers: list(options.blockers),
      next: options.next,
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'ticket-create') {
    result = await createTicket({
      repository,
      kind: requireOption(options, 'kind'),
      title: requireOption(options, 'title'),
      body: requireOption(options, 'body'),
      assignee: options.assignee,
      goal: options.goal,
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'ticket-ack') {
    result = await acknowledgeTicket({
      repository,
      ticketId: requireOption(options, 'ticket'),
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'ticket-needs-information') {
    result = await requestTicketInformation({
      repository,
      ticketId: requireOption(options, 'ticket'),
      body: requireOption(options, 'body'),
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'ticket-clarify') {
    result = await clarifyTicket({
      repository,
      ticketId: requireOption(options, 'ticket'),
      body: requireOption(options, 'body'),
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'ticket-respond') {
    result = await respondToTicket({
      repository,
      ticketId: requireOption(options, 'ticket'),
      body: requireOption(options, 'body'),
      evidence: list(options.evidence),
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'ticket-resolve') {
    result = await resolveTicket({
      repository,
      ticketId: requireOption(options, 'ticket'),
      body: requireOption(options, 'body'),
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'ticket-close') {
    result = await closeTicket({
      repository,
      ticketId: requireOption(options, 'ticket'),
      reason: requireOption(options, 'reason'),
      body: requireOption(options, 'body'),
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'ticket-reopen') {
    result = await reopenTicket({
      repository,
      ticketId: requireOption(options, 'ticket'),
      body: requireOption(options, 'body'),
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'note-add') {
    result = await addWikiNote({
      repository,
      markdown: await readFile(requireOption(options, 'file'), 'utf8'),
      id: options.id,
    });
  } else if (command === 'wiki-list') {
    result = await listWikiNotes({ repository });
  } else if (command === 'wiki-search') {
    result = await searchSharedWiki({
      repository,
      query: requireOption(options, 'query'),
      filters: options.filters
        ? JSON.parse(await readFile(options.filters, 'utf8'))
        : {},
    });
  } else if (command === 'wiki-trace') {
    result = await traceSharedWiki({
      repository,
      roots: list(requireOption(options, 'roots')),
    });
  } else if (command === 'method-compare') {
    result = await compareSharedMethods({
      repository,
      manifest: JSON.parse(await readFile(requireOption(options, 'file'), 'utf8')),
      requestMissing: options['request-missing'] === true,
      actorKind: options.actor ?? 'ai',
    });
  } else if (command === 'wiki-refine') {
    result = await runWikiRefinement({
      repository,
      config: JSON.parse(await readFile(requireOption(options, 'file'), 'utf8')),
      now: options.now,
    });
  } else if (command === 'plan-set') {
    result = await setPlan({
      repository,
      plan: JSON.parse(await readFile(requireOption(options, 'file'), 'utf8')),
      actorKind: options.actor ?? 'human',
    });
  } else if (command === 'capture-extract') {
    result = await captureWorkContext({
      repository,
      transcript: options.transcript,
      since: options.since,
      until: options.until,
      bundle: options.bundle === true,
    });
    if (options.out) {
      await writeFile(options.out, `${result.text}\n`, 'utf8');
      result = { ...result, text: undefined, out: options.out };
    }
  } else if (command === 'commit-note') {
    result = await recordCommitNote({
      repository,
      summary: JSON.parse(await readFile(requireOption(options, 'file'), 'utf8')),
      dryRun: options['dry-run'] === true,
    });
    if (options['message-out']) {
      await writeFile(options['message-out'], result.message, 'utf8');
      result = { ...result, messageOut: options['message-out'] };
    }
  } else if (command === 'overlap') {
    result = await assessOverlap({
      repository,
      scope: list(requireOption(options, 'scope')),
      baseCommit: options['base-commit'] ?? 'HEAD',
    });
    if (options.brief) result = briefOverlap(result);
  } else if (command === 'worktree-prepare') {
    result = await prepareProductWorktree({
      repository,
      directory: requireOption(options, 'directory'),
      branch: options.branch,
      baseCommit: options['base-commit'] ?? 'HEAD',
    });
  } else if (command === 'sync') {
    result = await syncStore({ repository });
  } else {
    result = await getEngineStatus({ repository });
    if (options.brief) result = briefStatus(result);
  }
  output(result, options.brief === true);
  const sync = result.sync ?? result;
  if (sync.status === 'pending') process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error.message, code: error.code ?? 'CLI_ERROR' })}\n`);
  process.exitCode = 1;
});
