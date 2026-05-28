import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalExecPath = process.execPath;
const originalPath = process.env.PATH;
const originalNodeExe = process.env.NODE_EXE;
const originalNode = process.env.NODE;
const originalNpmNodeExecPath = process.env.npm_node_execpath;
const originalNpmExecPath = process.env.npm_execpath;

afterEach(() => {
  Object.defineProperty(process, 'execPath', { value: originalExecPath });
  process.env.PATH = originalPath;
  process.env.NODE_EXE = originalNodeExe;
  process.env.NODE = originalNode;
  process.env.npm_node_execpath = originalNpmNodeExecPath;
  process.env.npm_execpath = originalNpmExecPath;
  vi.resetModules();
});

describe('node-resolve', () => {
  it('resolves process.execPath when it points at node', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'combrief-node-'));
    const nodePath = join(dir, 'node.exe');
    writeFileSync(nodePath, '');
    Object.defineProperty(process, 'execPath', { value: nodePath });

    const { resolveNodeExecutable } = await import(
      '../src/main/installer/node-resolve'
    );

    expect(resolveNodeExecutable()).toBe(nodePath);
    rmSync(dir, { recursive: true, force: true });
  });

  it('ignores non-node execPath and resolves node from PATH', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'combrief-path-node-'));
    const nodePath = join(dir, 'node.exe');
    writeFileSync(nodePath, '');
    Object.defineProperty(process, 'execPath', {
      value: join(dir, 'ComBrief.exe'),
    });
    process.env.PATH = dir;
    delete process.env.NODE_EXE;
    delete process.env.NODE;
    delete process.env.npm_node_execpath;
    delete process.env.npm_execpath;

    const { resolveNodeExecutable } = await import(
      '../src/main/installer/node-resolve'
    );

    expect(resolveNodeExecutable()).toBe(nodePath);
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes bridge.cmd with quoted absolute paths', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'combrief-cmd-'));
    const cmdPath = join(dir, 'bridge.cmd');
    const nodePath = join(dir, 'node.exe');
    const bridgePath = join(dir, 'bridge.mjs');
    const { writeWindowsBridgeCmd } = await import(
      '../src/main/installer/node-resolve'
    );

    writeWindowsBridgeCmd(cmdPath, nodePath, bridgePath);

    expect(readFileSync(cmdPath, 'utf8')).toBe(
      `@echo off\r\n"${nodePath}" "${bridgePath}" %*\r\n`,
    );
    rmSync(dir, { recursive: true, force: true });
  });
});
