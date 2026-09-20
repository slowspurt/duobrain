import { readFile } from 'node:fs/promises';
import {
  getSnapshot as getEngineSnapshot,
  getWikiNote as getEngineWikiNote,
  listWikiNotes as listEngineWikiNotes,
  searchSharedWiki as searchEngineSharedWiki,
  traceSharedWiki as traceEngineSharedWiki,
} from '../engine/index.js';

export const sampleSnapshotUrl = new URL('../../examples/shared/snapshot.json', import.meta.url);

export function createSnapshotGetter({ repository } = {}) {
  if (repository !== undefined) {
    return () => getEngineSnapshot({ repository });
  }
  return async () => JSON.parse(await readFile(sampleSnapshotUrl, 'utf8'));
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
