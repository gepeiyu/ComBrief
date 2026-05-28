import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function pathCandidates(): string[] {
  return (process.env.PATH ?? '')
    .split(process.platform === 'win32' ? ';' : ':')
    .filter(Boolean)
    .map((dir) => join(dir, 'node.exe'));
}

function programFilesCandidates(): string[] {
  return [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA,
  ]
    .filter((dir): dir is string => Boolean(dir))
    .map((dir) => join(dir, 'nodejs', 'node.exe'));
}

function normalizeCandidate(candidate: string): string {
  return candidate.endsWith('node.exe') || candidate.endsWith('node')
    ? candidate
    : join(candidate, 'node.exe');
}

export function resolveNodeExecutable(): string {
  const candidates = [
    process.execPath.endsWith('node.exe') || process.execPath.endsWith('node')
      ? process.execPath
      : undefined,
    process.env.NODE_EXE,
    process.env.NODE,
    process.env.npm_node_execpath,
    process.env.npm_execpath
      ? join(dirname(process.env.npm_execpath), '..', 'node.exe')
      : undefined,
    ...pathCandidates(),
    ...programFilesCandidates(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeCandidate(candidate);
    if (existsSync(normalized)) return normalized;
  }

  throw new Error('Unable to resolve node executable for Windows hooks');
}

export function writeWindowsBridgeCmd(
  path: string,
  nodePath: string,
  bridgePath: string,
): void {
  writeFileSync(
    path,
    `@echo off\r\n"${nodePath}" "${bridgePath}" %*\r\n`,
  );
}
