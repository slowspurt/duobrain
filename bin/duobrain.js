#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

import {
  acknowledgeTicket,
  addWikiNote,
  assessOverlap,
  closeTicket,
  createTicket,
  endSession,
  getEngineStatus,
  initSharedStore,
  pauseSession,
  prepareProductWorktree,
  reopenTicket,
  requestTicketInformation,
  resumeSession,
  resolveTicket,
  respondToTicket,
  startSession,
  syncStore,
} from '../src/engine/index.js';

const HELP = `duobrain — Git-backed collaboration records for exactly two people

Usage:
  duobrain init --participants <id,id> --participant <id> [--repository <path>]
  duobrain start --title <text> [--scope <path,path>] [--goal <text>]
                  [--branch <name>] [--base-commit <sha>] [--actor <human|ai>]
  duobrain pause --session <uuid> [--body <text>] [--actor <human|ai>]
  duobrain resume --session <uuid> [--body <text>] [--actor <human|ai>]
  duobrain end --session <uuid> --summary <text> [--blockers <text,text>]
                [--next <text>] [--actor <human|ai>]
  duobrain ticket-create --kind <information|feedback> --title <text> --body <text>
                         [--assignee <id>] [--goal <text>] [--actor <human|ai>]
  duobrain ticket-ack --ticket <uuid> [--actor <human|ai>]
  duobrain ticket-needs-information --ticket <uuid> --body <text> [--actor <human|ai>]
  duobrain ticket-respond --ticket <uuid> --body <text>
                           [--evidence <wiki/path,...>] [--actor <human|ai>]
  duobrain ticket-resolve --ticket <uuid> --body <text> [--actor <human|ai>]
  duobrain ticket-close --ticket <uuid> --reason <cancelled|duplicate> --body <text>
  duobrain ticket-reopen --ticket <uuid> --body <text> [--actor <human|ai>]
  duobrain note-add --file <markdown-path> [--id <uuid>]
  duobrain overlap --scope <path,path> [--base-commit <ref>]
  duobrain worktree-prepare --directory <path> [--branch <name>] [--base-commit <ref>]
  duobrain sync [--repository <path>]
  duobrain status [--repository <path>]
  duobrain <command> --help

start and end commit locally before attempting to sync. A failed push remains pending
and can be retried with duobrain sync. Output is JSON.`;

const COMMAND_HELP = {
  init: 'Usage: duobrain init --participants <id,id> --participant <id> [--repository <path>]',
  start: 'Usage: duobrain start --title <text> [--scope <path,path>] [--goal <text>] [--branch <name>] [--base-commit <sha>] [--actor <human|ai>] [--repository <path>]',
  pause: 'Usage: duobrain pause --session <uuid> [--body <text>] [--actor <human|ai>] [--repository <path>]',
  resume: 'Usage: duobrain resume --session <uuid> [--body <text>] [--actor <human|ai>] [--repository <path>]',
  end: 'Usage: duobrain end --session <uuid> --summary <text> [--blockers <text,text>] [--next <text>] [--actor <human|ai>] [--repository <path>]',
  'ticket-create': 'Usage: duobrain ticket-create --kind <information|feedback> --title <text> --body <text> [--assignee <id>] [--goal <text>] [--actor <human|ai>] [--repository <path>]',
  'ticket-ack': 'Usage: duobrain ticket-ack --ticket <uuid> [--actor <human|ai>] [--repository <path>]',
  'ticket-needs-information': 'Usage: duobrain ticket-needs-information --ticket <uuid> --body <text> [--actor <human|ai>] [--repository <path>]',
  'ticket-respond': 'Usage: duobrain ticket-respond --ticket <uuid> --body <text> [--evidence <wiki/path,...>] [--actor <human|ai>] [--repository <path>]',
  'ticket-resolve': 'Usage: duobrain ticket-resolve --ticket <uuid> --body <text> [--actor <human|ai>] [--repository <path>]',
  'ticket-close': 'Usage: duobrain ticket-close --ticket <uuid> --reason <cancelled|duplicate> --body <text> [--actor <human|ai>] [--repository <path>]',
  'ticket-reopen': 'Usage: duobrain ticket-reopen --ticket <uuid> --body <text> [--actor <human|ai>] [--repository <path>]',
  'note-add': 'Usage: duobrain note-add --file <markdown-path> [--id <uuid>] [--repository <path>]',
  overlap: 'Usage: duobrain overlap --scope <path,path> [--base-commit <ref>] [--repository <path>]',
  'worktree-prepare': 'Usage: duobrain worktree-prepare --directory <path> [--branch <name>] [--base-commit <ref>] [--repository <path>]',
  sync: 'Usage: duobrain sync [--repository <path>]',
  status: 'Usage: duobrain status [--repository <path>]',
};

function parseOptions(tokens) {
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (name === 'help') {
      options.help = true;
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

function list(value) {
  return value === undefined || value === '' ? [] : value.split(',').map((item) => item.trim());
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const [command, ...tokens] = process.argv.slice(2);
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
  if (command === 'init') {
    result = await initSharedStore({
      repository,
      participants: list(requireOption(options, 'participants')),
      participant: requireOption(options, 'participant'),
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
  } else if (command === 'overlap') {
    result = await assessOverlap({
      repository,
      scope: list(requireOption(options, 'scope')),
      baseCommit: options['base-commit'] ?? 'HEAD',
    });
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
  }
  output(result);
  const sync = result.sync ?? result;
  if (sync.status === 'pending') process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error.message, code: error.code ?? 'CLI_ERROR' })}\n`);
  process.exitCode = 1;
});
