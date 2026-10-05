#!/usr/bin/env node
// Builds src/dashboard/public/tokens.html from tokens.css and styles.css: every --duo-* token with
// its value and the dashboard elements that use it, then each element rendered with the tokens it
// uses. `--check` fails when the committed page is out of date instead of writing it.
import { readFile, writeFile } from 'node:fs/promises';

const publicDir = new URL('../src/dashboard/public/', import.meta.url);
const read = (name) => readFile(new URL(name, publicDir), 'utf8');

/** Groups and tokens from tokens.css, keeping its order. */
export function parseTokens(css) {
  const groups = [];
  for (const line of css.split('\n')) {
    const group = line.match(/\/\*\s*@group\s+(.+?)\s*\*\//);
    if (group) {
      groups.push({ name: group[1], tokens: [] });
      continue;
    }
    const token = line.match(/^\s*(--duo-[a-z0-9-]+):\s*(.+?);\s*(?:\/\*\s*(.*?)\s*\*\/)?\s*$/);
    if (token) groups.at(-1).tokens.push({ name: token[1], value: token[2], description: token[3] ?? '' });
  }
  return groups;
}

/** Each style rule's selector and the tokens it reads, media queries included. */
export function parseRules(css) {
  const rules = [];
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of source.matchAll(pattern)) {
    const selector = match[1].trim().replace(/^@media[^{]*$/, '').trim();
    if (!selector || selector.startsWith('@') || selector === ':root') continue;
    const tokens = [...new Set([...match[2].matchAll(/var\((--duo-[a-z0-9-]+)\)/g)].map((item) => item[1]))];
    if (tokens.length) rules.push({ selector, tokens });
  }
  return rules;
}

const escape = (value) => String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
const icon = (path) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${path}</svg>`;
const icons = {
  now: icon('<circle cx="7" cy="8" r="3"/><circle cx="14" cy="8" r="3"/><path d="M2 17c.8-2.8 2.6-4 5-4s4.2 1.2 5 4M12 13.2c.6-.2 1.3-.2 2-.2 2.4 0 4.2 1.2 5 4"/>'),
  requests: icon('<path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3A2 2 0 0 1 3 12z"/>'),
  download: icon('<path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 14.5v1A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-1"/>'),
  refresh: '<svg class="refresh-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5V6h-2.5"/></svg>',
};

// Small charts drawn only from the --duo-chart-* tokens (styled in tokens-page.css).
const chartFrame = { width: 300, height: 150, left: 30, top: 10, bottom: 24 };
function axisAndGrid(max, ticks, unit) {
  const { width, height, left, top, bottom } = chartFrame;
  const plot = height - top - bottom;
  const y = (value) => top + plot - (value / max) * plot;
  const lines = ticks.map((value) => `<line class="grid" x1="${left}" x2="${width}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 6}" y="${y(value) + 4}" text-anchor="end">${value}${unit}</text>`).join('');
  return { y, svg: `${lines}<line class="axis" x1="${left}" x2="${width}" y1="${top + plot}" y2="${top + plot}"/>` };
}

/** Lines only: the two people's recorded hours, labelled at the line ends instead of a legend. */
function lineChart() {
  const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
  const series = [['s1', 'A', [3, 4.5, 4, 6, 5.5, 7]], ['s2', 'B', [5, 4, 6, 5, 6.5, 5]]];
  const { y, svg } = axisAndGrid(8, [0, 4, 8], 'h');
  const x = (index) => chartFrame.left + 10 + index * 44;
  const paths = series.map(([cls, name, values]) => {
    const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
    const last = values.length - 1;
    return `<polyline class="line ${cls}" points="${points}"><title>${name}: ${values.join(', ')}h</title></polyline>`
      + `<circle class="point ${cls}" cx="${x(last)}" cy="${y(values[last])}"/><text class="end-label" x="${x(last) + 8}" y="${y(values[last]) + 4}">${name}</text>`;
  }).join('');
  const labels = weeks.map((week, index) => `<text x="${x(index)}" y="${chartFrame.height - 6}" text-anchor="middle">${week}</text>`).join('');
  return `<figure class="chart chart-line"><figcaption>Recorded hours per week</figcaption><svg viewBox="0 0 330 ${chartFrame.height}" role="img" aria-label="Recorded hours per week for A and B">${svg}${paths}${labels}</svg></figure>`;
}

/** One series in charcoal with the one mark that matters lit in lime. */
function highlightBars() {
  const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
  const values = [6, 8.5, 7, 10, 9, 12];
  const { y, svg } = axisAndGrid(12, [0, 6, 12], 'h');
  const width = 30; const base = y(0); const radius = 4;
  const bars = values.map((value, index) => {
    const x = chartFrame.left + 8 + index * 44; const top = y(value); const current = index === values.length - 1;
    const d = `M${x},${base}V${top + radius}Q${x},${top} ${x + radius},${top}H${x + width - radius}Q${x + width},${top} ${x + width},${top + radius}V${base}Z`;
    return `<path class="bar ${current ? 'highlight' : 'single'}" d="${d}"><title>${weeks[index]}: ${value}h</title></path>`
      + (current ? `<text class="value" x="${x + width / 2}" y="${top - 6}" text-anchor="middle">${value}h</text>` : '')
      + `<text x="${x + width / 2}" y="${chartFrame.height - 6}" text-anchor="middle">${weeks[index]}</text>`;
  }).join('');
  return `<figure class="chart chart-bars"><figcaption>Recorded hours together · this week in lime</figcaption><svg viewBox="0 0 330 ${chartFrame.height}" role="img" aria-label="Weekly recorded hours, this week highlighted">${svg}${bars}</svg></figure>`;
}

/** Deterministic pseudo-random numbers so the generated page never changes between builds. */
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** A long range: 90 days of raw values as thin gray lines, each person's 7-day average on top. */
function longRangeChart() {
  const days = 90; const random = seeded(7);
  const raw = [0, 1].map((person) => Array.from({ length: days }, (_, day) => {
    const trend = person === 0 ? 3 + day / 30 : 5 - day / 60;
    const weekend = day % 7 >= 5 ? -1.6 : 0;
    return Math.max(0, Math.round((trend + weekend + (random() - 0.5) * 3) * 10) / 10);
  }));
  const average = raw.map((values) => values.map((_, day) => {
    const window = values.slice(Math.max(0, day - 6), day + 1);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  }));
  const frame = { width: 660, left: 34, right: 630, top: 10, height: 190, bottom: 26 };
  const plot = frame.height - frame.top - frame.bottom;
  const y = (value) => frame.top + plot - (Math.min(value, 9) / 9) * plot;
  const x = (day) => frame.left + 4 + (day / (days - 1)) * (frame.right - frame.left - 4);
  const path = (values) => values.map((value, day) => `${x(day).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const grid = [0, 3, 6, 9].map((value) => `<line class="grid" x1="${frame.left}" x2="${frame.right}" y1="${y(value)}" y2="${y(value)}"/><text x="${frame.left - 6}" y="${y(value) + 4}" text-anchor="end">${value}h</text>`).join('');
  const months = [['Jul', 0], ['Aug', 31], ['Sep', 62]].map(([name, day]) => `<line class="tick" x1="${x(day)}" x2="${x(day)}" y1="${frame.top + plot}" y2="${frame.top + plot + 4}"/><text x="${x(day)}" y="${frame.height - 6}">${name}</text>`).join('');
  const lines = raw.map((values) => `<polyline class="raw" points="${path(values)}"/>`).join('')
    + average.map((values, person) => `<polyline class="avg s${person + 1}" points="${path(values)}"><title>${person ? 'B' : 'A'} · 7-day average</title></polyline>`
      + `<text class="end-label" x="${x(days - 1) + 6}" y="${y(values[days - 1]) + 4}">${person ? 'B' : 'A'}</text>`).join('');
  return `<figure class="chart chart-long"><figcaption>Recorded hours per day · last 90 days, 7-day average</figcaption><svg viewBox="0 0 ${frame.width} ${frame.height}" role="img" aria-label="Daily recorded hours over 90 days with 7-day averages for A and B">${grid}<line class="axis" x1="${frame.left}" x2="${frame.right}" y1="${frame.top + plot}" y2="${frame.top + plot}"/>${months}${lines}</svg></figure>`;
}

/** A year at a glance: one cell per day, darker for more recorded time, gray for none. */
function calendarHeatmap() {
  const random = seeded(11); const size = 5; const gap = 1; const left = 22; const top = 14;
  const cells = [];
  for (let week = 0; week < 53; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const busy = random();
      const level = day >= 5 ? (busy > 0.8 ? 1 : 0) : busy < 0.15 ? 0 : Math.min(5, 1 + Math.floor(busy * 5 * (0.6 + week / 90)));
      cells.push(`<rect class="cell level-${level}" x="${left + week * (size + gap)}" y="${top + day * (size + gap)}" width="${size}" height="${size}"><title>Week ${week + 1}, day ${day + 1}: ${level ? `level ${level}` : 'nothing recorded'}</title></rect>`);
    }
  }
  const months = ['Oct', 'Jan', 'Apr', 'Jul'].map((name, index) => `<text x="${left + index * 13 * (size + gap)}" y="${top - 5}">${name}</text>`).join('');
  const days = [['Mon', 0], ['Wed', 2], ['Fri', 4]].map(([name, day]) => `<text x="${left - 4}" y="${top + day * (size + gap) + 5}" text-anchor="end">${name}</text>`).join('');
  const legend = [0, 1, 2, 3, 4, 5].map((level, index) => `<rect class="cell level-${level}" x="${250 + index * (size + 3)}" y="62" width="${size}" height="${size}"/>`).join('');
  return `<figure class="chart chart-calendar"><figcaption>A year of recorded time · one cell per day</figcaption><svg viewBox="0 0 ${left + 53 * (size + gap)} 72" role="img" aria-label="A year of recorded time, one cell per day">${months}${days}${cells.join('')}<text x="246" y="67" text-anchor="end">Less</text>${legend}<text x="${250 + 6 * (size + 3) + 2}" y="67">More</text></svg></figure>`;
}

/** The chart colors in order. */
function chartPalette() {
  const strip = (cls, items) => `<p class="strip">${items.map(([name, label]) => `<span class="${cls}-${name}" title="--duo-chart-${name === 'other' ? 'other' : `${cls}-${name}`}">${label}</span>`).join('')}</p>`;
  return `<div class="chart-palette">
  <p class="chart-caption">Series, in order</p>${strip('series', [['1', 'A'], ['2', 'B'], ['3', '3'], ['4', '4'], ['5', '5'], ['other', 'Other']])}
  <p class="chart-caption">Sequential</p>${strip('sequential', [['1', ''], ['2', ''], ['3', ''], ['4', ''], ['5', '']])}
  <p class="chart-caption">Diverging</p>${strip('diverging', [['negative', '−'], ['neutral', '0'], ['positive', '+']])}
</div>`;
}

/** Dashboard elements, built from the real classes in styles.css. */
const elements = [
  { id: 'sidebar-tabs', title: 'Sidebar tabs', selectors: ['.sidebar', '.app-tab', '.nav-count', '.sidebar-label'], dark: true,
    html: `<p class="sidebar-label">Right now</p><button class="app-tab active" type="button">${icons.now}<span class="tab-label">Now</span></button><button class="app-tab" type="button">${icons.requests}<span class="tab-label">Requests</span><span class="nav-count">2</span></button>` },
  { id: 'sync-card', title: 'Sharing status card', selectors: ['.sync-card', '.sync-dot', '.sync-copy', '.refresh-icon'], dark: true,
    html: `<button class="sync-card" type="button"><i class="sync-dot synced"></i><span class="sync-copy"><b>Shared with partner · 5m ago</b><small>Refreshed just now</small></span>${icons.refresh}</button>` },
  { id: 'update-button', title: 'Update button', selectors: ['.update-button', '.update-dot'], dark: true,
    html: `<button class="update-button" type="button">${icons.download}<span>Check for updates</span></button><button class="update-button available" type="button">${icons.download}<span>Update to v0.1.8</span><i class="update-dot"></i></button>` },
  { id: 'buttons', title: 'Buttons', selectors: ['.primary-button', '.secondary-button'],
    html: '<button class="secondary-button" type="button">Not now</button> <button class="primary-button" type="button">Update</button>' },
  { id: 'card', title: 'Card', selectors: ['.card', '.card-title'],
    html: '<section class="card tokens-card"><h2 class="card-title">Blockers<small>recorded only</small></h2><p class="empty">No blockers recorded.</p></section>' },
  { id: 'section-title', title: 'Titles and labels', selectors: ['.section-title', '.section-link', '.eyebrow', '.panel-heading'],
    html: '<p class="eyebrow">Where we’re headed</p><h2 class="section-title"><span>Waiting for an answer</span><small>2 open</small><button class="section-link" type="button">All requests →</button></h2>' },
  { id: 'badges', title: 'Status badges', selectors: ['.badge', '.status', '.plan-status'],
    html: '<span class="badge active">Working</span> <span class="badge paused">Paused</span> <span class="badge ended">Finished</span> <span class="status answered">Answered</span> <span class="plan-status agreed">Agreed by both</span> <span class="plan-status conflict">Plan conflict</span>' },
  { id: 'turn', title: 'Turn tags', selectors: ['.turn'],
    html: '<span class="turn you">Your turn</span> <span class="turn them">B’s turn</span>' },
  { id: 'chips', title: 'Chips and kinds', selectors: ['.chip', '.kind'],
    html: '<span class="chip">src/api/books</span> <span class="kind">Question</span>' },
  { id: 'faces', title: 'People', selectors: ['.face'],
    html: '<span class="face p0">A</span> <span class="face p1">B</span> <span class="face lg p0">A</span> <span class="face px">?</span>' },
  { id: 'ask', title: 'Request card', selectors: ['.ask', '.ask-line', '.ask-title', '.ask-meta', '.ask-reply'],
    html: '<button class="card ask mine" type="button"><span class="face p1">B</span><div><p class="ask-line">B answered — does it settle it?</p><p class="ask-title">Which empty-state copy should the book list use?</p><p class="ask-meta">Feedback · Answered · asked 2 days ago</p><p class="ask-reply">Option 2 — it tells people what to do next.</p></div><span class="turn you">Your turn</span></button>' },
  { id: 'lanes', title: 'Two-lane flow', selectors: ['.lane-row', '.lane-pin', '.bubble'],
    html: '<div class="lane-row left"><div class="bubble"><small>Finished · 2h 30m</small><p>Draft the book-list layout</p></div><span class="lane-pin p0"></span></div><div class="lane-row right"><div class="bubble stuck"><small>Stuck</small><p>Need a second opinion on optional fields</p></div><span class="lane-pin p1"></span></div>' },
  { id: 'tabs', title: 'Tabs and segmented controls', selectors: ['.chip-tabs', '.chip-tab', '.segmented'],
    html: '<div class="chip-tabs"><button class="chip-tab active" type="button">Open</button><button class="chip-tab" type="button">Done</button></div> <div class="segmented"><button type="button" aria-checked="true">Automatic</button><button type="button" aria-checked="false">English</button><button type="button" aria-checked="false">한국어</button></div>' },
  { id: 'field', title: 'Fields', selectors: ['.field'],
    html: '<label class="field"><span>Search</span><input type="search" placeholder="Title, body, goal, evidence"></label>' },
  { id: 'notices', title: 'Notices', selectors: ['.notice', '.version-notice', '.error-panel'],
    html: '<aside class="notice"><strong>Sample data</strong><span>This sample shows the product flow.</span></aside><aside class="version-notice"><strong>B updated duobrain to v0.1.8.</strong><span>Pull the project to use the same version.</span></aside><section class="error-panel"><div><strong>Could not load the record.</strong><span>Check that the dashboard server is running.</span></div><button type="button">Try again</button></section>' },
  { id: 'line-chart', title: 'Line chart', selectors: ['.chart-line', '.chart'],
    html: lineChart() },
  { id: 'highlight-bars', title: 'Bars with a highlight', selectors: ['.chart-bars', '.chart'],
    html: highlightBars() },
  { id: 'long-range', title: 'Long range with averages', selectors: ['.chart-long', '.chart'], wide: true,
    html: longRangeChart() },
  { id: 'calendar', title: 'A year at a glance', selectors: ['.chart-calendar', '.chart'], wide: true,
    html: calendarHeatmap() },
  { id: 'chart-colors', title: 'Chart colors', selectors: ['.chart-palette'],
    html: chartPalette() },
  { id: 'blocker', title: 'Blocker row', selectors: ['.blocker-row'],
    html: '<div class="blocker-row"><small>B · Clean up the API response</small>Need a second opinion on optional fields</div>' },
];

const classPattern = (selector) => new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);

export async function buildTokensPage() {
  const groups = parseTokens(await read('tokens.css'));
  const rules = parseRules(await read('styles.css'));
  // Elements may also be drawn by the page's own sample styles (the chart), so match against both.
  const elementRules = [...rules, ...parseRules(await read('tokens-page.css'))];
  const usage = new Map();
  const elementTokens = new Map();
  for (const element of elements) {
    const tokens = new Set();
    for (const rule of elementRules) {
      if (element.selectors.some((selector) => classPattern(selector).test(rule.selector))) rule.tokens.forEach((token) => tokens.add(token));
    }
    elementTokens.set(element.id, [...tokens].sort());
    for (const token of tokens) usage.set(token, [...(usage.get(token) ?? []), element]);
  }
  const anyUse = new Set(rules.flatMap((rule) => rule.tokens));

  const preview = (token, group) => {
    if (group.startsWith('Color')) return `<span class="swatch" data-paint="background" data-token="${token.name}"></span>`;
    if (group === 'Chart') {
      if (/-(width|size|gap)$/.test(token.name)) return `<span class="space-bar" data-paint="width" data-token="${token.name}"></span>`;
      if (/radius/.test(token.name)) return `<span class="radius-box" data-paint="border-radius" data-token="${token.name}"></span>`;
      return `<span class="swatch" data-paint="background" data-token="${token.name}"></span>`;
    }
    if (group === 'Space') return `<span class="space-bar" data-paint="width" data-token="${token.name}"></span>`;
    if (group === 'Radius') return `<span class="radius-box" data-paint="border-radius" data-token="${token.name}"></span>`;
    if (group === 'Elevation') return `<span class="shadow-box" data-paint="box-shadow" data-token="${token.name}"></span>`;
    if (token.name.startsWith('--duo-font-')) return `<span class="type-sample" data-paint="font-family" data-token="${token.name}">Aa 가</span>`;
    if (token.name.startsWith('--duo-text-')) return `<span class="type-sample" data-paint="font-size" data-token="${token.name}">Aa 가</span>`;
    if (token.name.startsWith('--duo-weight-')) return `<span class="type-sample" data-paint="font-weight" data-token="${token.name}">Aa 가</span>`;
    return '<span class="no-preview">—</span>';
  };
  const usedBy = (token) => {
    const names = (usage.get(token.name) ?? []).map((element) => `<a href="#${element.id}">${escape(element.title)}</a>`);
    if (names.length) return names.join(', ');
    return anyUse.has(token.name) ? '<span class="muted">other dashboard parts</span>' : '<span class="muted">reserved for your own pages</span>';
  };
  const tokenTables = groups.map((group) => `
      <section class="token-group" id="${escape(group.name.toLowerCase().replace(/[^a-z]+/g, '-'))}">
        <h3>${escape(group.name)}</h3>
        <table>
          <thead><tr><th>Preview</th><th>Token</th><th>Value</th><th>Used by</th></tr></thead>
          <tbody>${group.tokens.map((token) => `
            <tr>
              <td>${preview(token, group.name)}</td>
              <td><button class="token-name" type="button" data-copy="var(${token.name})" title="Copy var(${token.name})">${token.name}</button>${token.description ? `<small>${escape(token.description)}</small>` : ''}</td>
              <td><code>${escape(token.value)}</code></td>
              <td>${usedBy(token)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </section>`).join('');
  const elementCards = elements.map((element) => `
      <article class="element${element.wide ? ' wide' : ''}" id="${element.id}">
        <div class="element-stage${element.dark ? ' dark' : ''}">${element.dark ? `<div class="sidebar tokens-sidebar">${element.html}</div>` : element.html}</div>
        <div class="element-copy">
          <h3>${escape(element.title)}</h3>
          <p class="selectors">${element.selectors.map((selector) => `<code>${selector}</code>`).join(' ')}</p>
          <p class="element-tokens">${elementTokens.get(element.id).map((token) => `<button class="token-name small" type="button" data-copy="var(${token})">${token}</button>`).join(' ')}</p>
        </div>
      </article>`).join('');
  const count = groups.reduce((total, group) => total + group.tokens.length, 0);

  return `<!doctype html>
<!-- Generated by scripts/build-tokens-page.mjs from tokens.css and styles.css. Do not edit by hand. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>duobrain design tokens</title>
  <link rel="stylesheet" href="tokens.css">
  <link rel="stylesheet" href="styles.css">
  <link rel="stylesheet" href="tokens-page.css">
  <script src="tokens-page.js" defer></script>
</head>
<body class="tokens-page">
  <header class="tokens-header">
    <a class="wordmark" href="./"><span>duo</span><b>brain</b></a>
    <div>
      <h1>Design tokens</h1>
      <p>${count} <code>--duo-*</code> tokens from <code>tokens.css</code>. Load that file to use the same colors, type and spacing; names are kept stable within 0.x.y and every release note says whether they changed.</p>
    </div>
    <nav class="tokens-nav"><a href="#tokens">Tokens</a><a href="#elements">Elements</a></nav>
  </header>
  <main>
    <section id="tokens">
      <h2>Tokens</h2>
      <p class="lead">Click a name to copy <code>var(--duo-…)</code>. “Used by” links to the elements below.</p>${tokenTables}
    </section>
    <section id="elements">
      <h2>Elements</h2>
      <p class="lead">Dashboard elements drawn with the real dashboard styles, each with the tokens it reads.</p>
      <div class="element-list">${elementCards}
      </div>
    </section>
  </main>
</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const page = await buildTokensPage();
  const target = new URL('tokens.html', publicDir);
  if (process.argv.includes('--check')) {
    const current = await readFile(target, 'utf8').catch(() => '');
    if (current !== page) {
      console.error('tokens.html is out of date; run `node scripts/build-tokens-page.mjs`.');
      process.exitCode = 1;
    } else {
      console.log('tokens.html is up to date.');
    }
  } else {
    await writeFile(target, page, 'utf8');
    console.log('Wrote src/dashboard/public/tokens.html');
  }
}
