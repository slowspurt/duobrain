import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const TEXT_LIMIT = 1500;
const TOOL_LIMIT = 200;

/** Claude Code stores one JSONL transcript per session under a directory named after the cwd. */
export function claudeProjectDirectory(cwd, home = os.homedir()) {
  return path.join(home, '.claude', 'projects', path.resolve(cwd).replace(/[^A-Za-z0-9]/g, '-'));
}

/** Return the most recently written transcript for a working directory, or null. */
export async function findLatestClaudeTranscript(cwd, home = os.homedir()) {
  const directory = claudeProjectDirectory(cwd, home);
  let names;
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith('.jsonl'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const withTimes = await Promise.all(names.map(async (name) => {
    const filePath = path.join(directory, name);
    return { filePath, mtimeMs: (await stat(filePath)).mtimeMs };
  }));
  withTimes.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return withTimes[0]?.filePath ?? null;
}

const SECRET_PATTERNS = [
  [/\b(?:sk-ant-|sk-|rk-)[A-Za-z0-9_-]{16,}/g, '[secret]'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, '[secret]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[secret]'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[secret]'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, '[secret]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi, 'Bearer [secret]'],
  [/\b((?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*)["']?[^\s"']{6,}/gi, '$1[secret]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[secret]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
];

/** Mask credentials, email addresses and the home directory before text leaves the machine. */
export function redact(text, home = os.homedir()) {
  let result = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) result = result.replace(pattern, replacement);
  if (home && home !== '/') result = result.split(home).join('~');
  return result;
}

function clip(text, limit) {
  const trimmed = text.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)} …[+${trimmed.length - limit}]` : trimmed;
}

function stripInjectedContext(text) {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<(command-[a-z-]+|local-command-[a-z-]+)>[\s\S]*?<\/\1>/g, '')
    .trim();
}

function describeToolUse({ name, input = {} }) {
  const detail = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url
    ?? input.query ?? input.description ?? JSON.stringify(input);
  const note = input.command && input.description ? ` (${input.description})` : '';
  return `${name}: ${clip(String(detail), TOOL_LIMIT)}${note}`;
}

/**
 * Turn Claude Code transcript JSONL into the conversation an AI summarizer needs:
 * human requests, assistant replies and the tool calls made. Tool results, thinking,
 * injected system context and subagent sidechains are dropped because they are
 * large and already reflected in the diff. Pure: performs no I/O.
 */
export function extractClaudeTranscript(jsonl, { since = null, until = null, home } = {}) {
  const sinceMs = since === null ? -Infinity : Date.parse(since);
  const untilMs = until === null ? Infinity : Date.parse(until);
  const entries = [];
  let sessionId = null;
  let skipped = 0;
  for (const line of jsonl.split('\n')) {
    if (line.trim() === '') continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }
    sessionId ??= event.sessionId ?? null;
    if (!['user', 'assistant'].includes(event.type) || event.isSidechain) continue;
    const atMs = Date.parse(event.timestamp);
    if (!(atMs > sinceMs && atMs <= untilMs)) continue;
    const content = event.message?.content;
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : content ?? [];
    for (const block of blocks) {
      if (block.type === 'text') {
        const text = event.type === 'user' ? stripInjectedContext(block.text ?? '') : (block.text ?? '').trim();
        if (text) entries.push({ at: event.timestamp, kind: event.type, text: redact(clip(text, TEXT_LIMIT), home) });
      } else if (block.type === 'tool_use' && event.type === 'assistant') {
        entries.push({ at: event.timestamp, kind: 'tool', text: redact(describeToolUse(block), home) });
      }
    }
  }
  const text = entries.map(({ kind, text: body }) => `[${kind}] ${body}`).join('\n');
  return {
    sessionId,
    firstAt: entries[0]?.at ?? null,
    lastAt: entries.at(-1)?.at ?? null,
    counts: {
      user: entries.filter(({ kind }) => kind === 'user').length,
      assistant: entries.filter(({ kind }) => kind === 'assistant').length,
      tool: entries.filter(({ kind }) => kind === 'tool').length,
      unparsedLines: skipped,
    },
    text,
  };
}
