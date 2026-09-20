import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startDashboard } from './index.js';

const fixture = new URL('../../examples/shared/snapshot.json', import.meta.url);
const requestedPort = process.env.DUOBRAIN_DASHBOARD_PORT ?? '4173';
const port = Number(requestedPort);

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  console.error('DUOBRAIN_DASHBOARD_PORT must be an integer between 0 and 65535.');
  process.exitCode = 1;
} else {
  const server = startDashboard({
    port,
    getSnapshot: async () => JSON.parse(await readFile(fixture, 'utf8')),
  });

  server.once('listening', () => {
    const address = server.address();
    console.log(`duobrain sample dashboard: http://127.0.0.1:${address.port}`);
    console.log(`sample snapshot: ${fileURLToPath(fixture)}`);
  });
  server.once('error', (error) => {
    console.error(`Dashboard failed to start: ${error.message}`);
    process.exitCode = 1;
  });
}
