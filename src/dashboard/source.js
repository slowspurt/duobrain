import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  getEngineStatus,
  getSnapshot as getEngineSnapshot,
  getWikiNote as getEngineWikiNote,
  listWikiNotes as listEngineWikiNotes,
  searchSharedWiki as searchEngineSharedWiki,
  traceSharedWiki as traceEngineSharedWiki,
} from '../engine/index.js';

export const sampleSnapshotUrl = new URL('../../examples/shared/snapshot.json', import.meta.url);
const localizedSampleUrls = { ko: new URL('../../examples/shared/snapshot.ko.json', import.meta.url) };

export function createSnapshotGetter({ repository } = {}) {
  if (repository !== undefined) {
    // The local identity tells the dashboard who "you" are; nothing else from the status is passed on.
    return async () => {
      try {
        const { participant, snapshot } = await getEngineStatus({ repository });
        return { ...snapshot, viewer: participant };
      } catch (error) {
        if (error?.code !== 'MISSING_IDENTITY') throw error;
        return { ...(await getEngineSnapshot({ repository })), viewer: null };
      }
    };
  }
  return async ({ locale } = {}) => JSON.parse(await readFile(localizedSampleUrls[locale] ?? sampleSnapshotUrl, 'utf8'));
}

export function createWikiNoteGetter({ repository } = {}) {
  if (repository === undefined) return undefined;
  return ({ path }) => getEngineWikiNote({ repository, path });
}

export function createWikiToolGetters({ repository } = {}) {
  if (repository === undefined) return {};
  return {
    listWikiNotes: () => listEngineWikiNotes({ repository }),
    searchSharedWiki: ({ query, filters }) => searchEngineSharedWiki({ repository, query, filters }),
    traceSharedWiki: ({ roots }) => traceEngineSharedWiki({ repository, roots }),
  };
}

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../../bin/duobrain.js', import.meta.url));

function newerVersion(latest, current) {
  const left = String(latest).split('.').map(Number);
  const right = String(current).split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) > (right[index] ?? 0);
  }
  return false;
}

/** Reduce an `update` CLI report to what the dashboard shows: no paths, no remote URLs. */
export function summarizeUpdate(report) {
  const vendored = report?.mode === 'vendored';
  const updated = report?.updated === true;
  return {
    mode: vendored ? 'vendored' : 'checkout',
    current: typeof report?.current === 'string' ? report.current : null,
    latest: typeof report?.latest === 'string' ? report.latest : null,
    available: vendored ? newerVersion(report.latest, report.current) : Number(report?.behind) > 0,
    updated,
    changes: vendored ? [] : (Array.isArray(report?.commits) ? report.commits.filter(Boolean).slice(0, 20) : []),
    commitNeeded: updated && (vendored || report?.agents?.commitNeeded === true),
  };
}

/**
 * Check for and apply duobrain updates by running this checkout's own `update` command,
 * so the dashboard follows exactly the same safety checks as the CLI.
 */
export function createUpdateTools({ repository } = {}) {
  const run = async (check) => {
    const args = [cliPath, 'update', ...(check ? ['--check'] : []), ...(repository === undefined ? [] : ['--repository', repository])];
    try {
      const { stdout } = await execFileAsync(process.execPath, args, { encoding: 'utf8', timeout: 180_000 });
      return summarizeUpdate(JSON.parse(stdout));
    } catch (error) {
      let code = 'UPDATE_FAILED';
      try { code = JSON.parse(error.stderr).code ?? code; } catch { /* not a CLI error report */ }
      throw Object.assign(new Error('update failed'), { code });
    }
  };
  return { checkUpdate: () => run(true), applyUpdate: () => run(false) };
}
