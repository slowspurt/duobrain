import assert from 'node:assert/strict';
import test from 'node:test';

import { claudeProjectDirectory, extractClaudeTranscript, redact } from '../../src/capture/index.js';

function line(event) {
  return JSON.stringify({ sessionId: 's-1', isSidechain: false, ...event });
}

const transcript = [
  line({ type: 'user', timestamp: '2026-09-24T01:00:00Z', message: { role: 'user', content: 'Old request' } }),
  line({
    type: 'user',
    timestamp: '2026-09-24T02:00:00Z',
    message: {
      role: 'user',
      content: [{ type: 'text', text: '<system-reminder>huge injected context</system-reminder>Make refinement manual' }],
    },
  }),
  line({ type: 'attachment', timestamp: '2026-09-24T02:00:01Z', attachment: { type: 'environment' } }),
  line({
    type: 'assistant',
    timestamp: '2026-09-24T02:00:02Z',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'private reasoning' },
        { type: 'text', text: 'Removing the scheduler.' },
        { type: 'tool_use', name: 'Bash', input: { command: 'npm test', description: 'Run tests' } },
        { type: 'tool_use', name: 'Edit', input: { file_path: '/home/me/repo/src/a.js', old_string: 'x', new_string: 'y' } },
      ],
    },
  }),
  line({
    type: 'user',
    timestamp: '2026-09-24T02:00:03Z',
    message: { role: 'user', content: [{ type: 'tool_result', content: 'ok 89 tests '.repeat(500) }] },
  }),
  line({
    type: 'assistant',
    isSidechain: true,
    timestamp: '2026-09-24T02:00:04Z',
    message: { role: 'assistant', content: [{ type: 'text', text: 'subagent chatter' }] },
  }),
  'not json',
  line({ type: 'user', timestamp: '2026-09-24T03:00:00Z', message: { role: 'user', content: 'Later request' } }),
].join('\n');

test('extracts requests, replies and tool calls inside the window only', () => {
  const result = extractClaudeTranscript(transcript, {
    since: '2026-09-24T01:30:00Z',
    until: '2026-09-24T02:30:00Z',
    home: '/home/me',
  });
  assert.equal(result.sessionId, 's-1');
  assert.deepEqual(result.counts, { user: 1, assistant: 1, tool: 2, unparsedLines: 1 });
  assert.equal(result.text, [
    '[user] Make refinement manual',
    '[assistant] Removing the scheduler.',
    '[tool] Bash: npm test (Run tests)',
    '[tool] Edit: ~/repo/src/a.js',
  ].join('\n'));
  for (const dropped of ['injected context', 'private reasoning', '89 tests', 'subagent', 'Old request', 'Later request']) {
    assert.equal(result.text.includes(dropped), false, dropped);
  }
  assert.equal(result.firstAt, '2026-09-24T02:00:00Z');
});

test('an open window reads the whole transcript', () => {
  const result = extractClaudeTranscript(transcript);
  assert.equal(result.counts.user, 3);
});

test('redacts credentials, emails and the home directory', () => {
  const text = redact([
    'key sk-ant-api03-abcdefghijklmnopqrstuv',
    'gh ghp_abcdefghijklmnopqrstuvwxyz123456',
    'aws AKIAABCDEFGHIJKLMNOP',
    'curl -H "Authorization: Bearer abcdefghijklmnopqrstuvwx"',
    'API_KEY=supersecretvalue',
    'mail someone@example.com',
    'path /Users/me/project',
    'commit 4990428e71771ac7272a2bb6ff8b94af116a6786',
  ].join('\n'), '/Users/me');
  assert.equal(text, [
    'key [secret]',
    'gh [secret]',
    'aws [secret]',
    'curl -H "Authorization: Bearer [secret]"',
    'API_KEY=[secret]',
    'mail [email]',
    'path ~/project',
    'commit 4990428e71771ac7272a2bb6ff8b94af116a6786',
  ].join('\n'));
});

test('maps a working directory to its Claude Code project directory', () => {
  assert.equal(
    claudeProjectDirectory('/Users/me/Desktop/my.app', '/Users/me'),
    '/Users/me/.claude/projects/-Users-me-Desktop-my-app',
  );
});
