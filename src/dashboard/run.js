import { startDashboard } from './index.js';
import { createSnapshotGetter, createWikiNoteGetter, createWikiToolGetters, sampleSnapshotUrl } from './source.js';

function usage() {
  return `Usage: node src/dashboard/run.js [--repository <path>] [--port <number>]

Without --repository, the dashboard uses the shared sample snapshot.
With --repository, it reads the real isolated duobrain store for that Git worktree.`;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument !== '--repository' && argument !== '--port') throw new Error(`Unknown option: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
    if (argument === '--repository') options.repository = value;
    if (argument === '--port') options.port = value;
    index += 1;
  }
  return options;
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  console.error(usage());
  process.exitCode = 1;
}

if (options?.help) {
  console.log(usage());
} else if (options) {
  const requestedPort = options.port ?? process.env.DUOBRAIN_DASHBOARD_PORT ?? '4173';
  const port = Number(requestedPort);

  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    console.error('Port must be an integer between 0 and 65535.');
    process.exitCode = 1;
  } else {
    const server = startDashboard({
      port,
      getSnapshot: createSnapshotGetter(options),
      getWikiNote: createWikiNoteGetter(options),
      ...createWikiToolGetters(options),
    });

    server.once('listening', () => {
      const address = server.address();
      const source = options.repository === undefined ? sampleSnapshotUrl.pathname : options.repository;
      console.log(`duobrain ${options.repository === undefined ? 'sample' : 'repository'} dashboard: http://127.0.0.1:${address.port}`);
      console.log(`snapshot source: ${source}`);
    });
    server.once('error', (error) => {
      console.error(`Dashboard failed to start: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
