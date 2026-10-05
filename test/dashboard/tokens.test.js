import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildTokensPage, parseRules, parseTokens } from '../../scripts/build-tokens-page.mjs';
import { designTokensLine, tokenChanges } from '../../scripts/token-changes.mjs';
import { startDashboard } from '../../src/dashboard/index.js';

const publicFile = (name) => readFile(new URL(`../../src/dashboard/public/${name}`, import.meta.url), 'utf8');

test('tokens.css defines grouped, uniquely named --duo-* tokens', async () => {
  const groups = parseTokens(await publicFile('tokens.css'));
  const names = groups.flatMap((group) => group.tokens.map((token) => token.name));
  assert.ok(groups.length >= 8 && names.length >= 80);
  assert.deepEqual(names.filter((name) => !/^--duo-[a-z0-9]+(-[a-z0-9]+)*$/.test(name)), []);
  assert.equal(new Set(names).size, names.length, 'token names are unique');
  assert.ok(groups.every((group) => group.tokens.length > 0), 'every group has tokens');
});

test('the dashboard is built only from tokens that exist', async () => {
  const defined = new Set(parseTokens(await publicFile('tokens.css')).flatMap((group) => group.tokens.map((token) => token.name)));
  for (const file of ['styles.css', 'tokens-page.css']) {
    const used = [...(await publicFile(file)).matchAll(/var\((--duo-[a-z0-9-]+)\)/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(used)].filter((name) => !defined.has(name)), [], `${file} reads undefined tokens`);
  }
  const styles = await publicFile('styles.css');
  const rules = styles.slice(styles.indexOf('* { box-sizing'));
  assert.deepEqual(rules.match(/#[0-9a-f]{3,8}\b/gi) ?? [], [], 'no literal colors outside tokens.css');
  assert.deepEqual(rules.match(/(?<![\w.-])\d*\.?\d+rem/g) ?? [], [], 'font sizes come from --duo-text-*');
  assert.deepEqual(rules.match(/border(?:-[a-z-]+)?-radius:\d+px/g) ?? [], [], 'radii come from --duo-radius-*');
  assert.deepEqual(rules.match(/(?:gap|padding|margin)(?:-[a-z]+)?:[^;}]*\d+px/g) ?? [], [], 'spacing comes from --duo-space-*');
  // Names used before 0.1.8 keep working until 0.2.0.
  for (const alias of ['--bg', '--card', '--ink', '--soft', '--lime', '--p0', '--p1', '--shadow']) assert.match(styles, new RegExp(`${alias}:var\\(--duo-`));
});

test('tokens.html is generated from the current styles', async () => {
  assert.equal(await publicFile('tokens.html'), await buildTokensPage(), 'run `node scripts/build-tokens-page.mjs`');
  const rules = parseRules('.a { color:var(--duo-color-ink); }\n@media (max-width:9px) { .b, .c { gap:var(--duo-space-2); } }');
  assert.deepEqual(rules, [{ selector: '.a', tokens: ['--duo-color-ink'] }, { selector: '.b, .c', tokens: ['--duo-space-2'] }]);
});

test('the dashboard serves tokens.css and the tokens page under its CSP', async (t) => {
  const html = await publicFile('index.html');
  assert.ok(html.indexOf('href="/tokens.css"') > 0 && html.indexOf('href="/tokens.css"') < html.indexOf('href="/styles.css"'), 'tokens load before styles');
  const server = startDashboard({ getSnapshot: () => ({}), port: 0 });
  await once(server, 'listening');
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [path, type] of [['/tokens.css', 'text/css'], ['/tokens', 'text/html'], ['/tokens-page.css', 'text/css'], ['/tokens-page.js', 'text/javascript']]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), new RegExp(`^${type}`));
    assert.match(response.headers.get('content-security-policy'), /style-src 'self'/);
  }
  const page = await (await fetch(`${origin}/tokens`)).text();
  assert.doesNotMatch(page, /<style|style="/, 'no inline styles, so the CSP allows the page');
});

test('describes token changes for the release-note line', () => {
  const before = ':root {\n  /* @group A */\n  --duo-a: 1px;\n  --duo-b: 2px;\n  --duo-c: 3px;\n}';
  const after = ':root {\n  /* @group A */\n  --duo-a: 1px;\n  --duo-b: 4px;\n  --duo-d: 5px;\n}';
  assert.equal(designTokensLine(tokenChanges(before, before)), 'Design tokens: unchanged');
  assert.equal(designTokensLine(tokenChanges(before, after)), 'Design tokens: added --duo-d; changed --duo-b; removed --duo-c');
  assert.equal(designTokensLine(tokenChanges(null, after), { introduced: true }), 'Design tokens: introduced (3 tokens)');
});
