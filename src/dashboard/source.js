import { readFile } from 'node:fs/promises';
import {
  getSnapshot as getEngineSnapshot,
  getWikiNote as getEngineWikiNote,
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
