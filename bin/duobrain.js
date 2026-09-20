#!/usr/bin/env node

import {
  endSession,
  getEngineStatus,
  initSharedStore,
  startSession,
  syncStore,
} from '../src/engine/index.js';

const HELP = `duobrain — Git-backed collaboration records for exactly two people

Usage:
  duobrain init --participants <id,id> --participant <id> [--repository <path>]
  duobrain start --title <text> [--scope <path,path>] [--goal <text>]
                  [--branch <name>] [--base-commit <sha>] [--actor <human|ai>]
  duobrain end --session <uuid> --summary <text> [--blockers <text,text>]
                [--next <text>] [--actor <human|ai>]
  duobrain sync [--repository <path>]
  duobrain status [--repository <path>]
  duobrain <command> --help

start and end commit locally before attempting to sync. A failed push remains pending
and can be retried with duobrain sync. Output is JSON.`;

const COMMAND_HELP = {
  init: 'Usage: duobrain init --participants <id,id> --participant <id> [--repository <path>]',
  start: 'Usage: duobrain start --title <text> [--scope <path,path>] [--goal <text>] [--branch <name>] [--base-commit <sha>] [--actor <human|ai>] [--repository <path>]',
  end: 'Usage: duobrain end --session <uuid> --summary <text> [--blockers <text,text>] [--next <text>] [--actor <human|ai>] [--repository <path>]',
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
  } else if (command === 'end') {
    result = await endSession({
      repository,
      sessionId: requireOption(options, 'session'),
      summary: requireOption(options, 'summary'),
      blockers: list(options.blockers),
      next: options.next,
      actorKind: options.actor ?? 'human',
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
