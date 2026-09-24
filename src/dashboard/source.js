import { readFile } from 'node:fs/promises';
import {
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
    return () => getEngineSnapshot({ repository });
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
