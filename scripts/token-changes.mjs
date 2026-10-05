#!/usr/bin/env node
// Compare the --duo-* design tokens of two versions and write the release-note line for them.
//   node scripts/token-changes.mjs v0.1.8   # compare that tag with the working tree
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { parseTokens } from './build-tokens-page.mjs';

export const TOKENS_PATH = 'src/dashboard/public/tokens.css';

function tokenMap(css) {
  return new Map(parseTokens(css ?? '').flatMap((group) => group.tokens).map((token) => [token.name, token.value]));
}

/** Added, removed and value-changed token names between two tokens.css texts (null = no file). */
export function tokenChanges(previousCss, currentCss) {
  const before = tokenMap(previousCss);
  const after = tokenMap(currentCss);
  return {
    added: [...after.keys()].filter((name) => !before.has(name)),
    removed: [...before.keys()].filter((name) => !after.has(name)),
    changed: [...after.keys()].filter((name) => before.has(name) && before.get(name) !== after.get(name)),
  };
}

/** The line every release note carries, e.g. "Design tokens: unchanged". */
export function designTokensLine({ added, removed, changed }, { introduced = false } = {}) {
  if (introduced) return `Design tokens: introduced (${added.length} tokens)`;
  const parts = [
    added.length && `added ${added.join(', ')}`,
    changed.length && `changed ${changed.join(', ')}`,
    removed.length && `removed ${removed.join(', ')}`,
  ].filter(Boolean);
  return `Design tokens: ${parts.length ? parts.join('; ') : 'unchanged'}`;
}

/** tokens.css as it was at a Git ref, or null when that version had none. */
export function tokensAt(ref, cwd) {
  try {
    return execFileSync('git', ['show', `${ref}:${TOKENS_PATH}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ref = process.argv[2];
  if (!ref) {
    console.error('Usage: node scripts/token-changes.mjs <previous-tag>');
    process.exitCode = 1;
  } else {
    const current = await readFile(new URL(`../${TOKENS_PATH}`, import.meta.url), 'utf8');
    const previous = tokensAt(ref);
    console.log(designTokensLine(tokenChanges(previous, current), { introduced: previous === null }));
  }
}
