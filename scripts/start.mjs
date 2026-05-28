import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const electronBin =
  process.platform === 'win32'
    ? join(root, 'node_modules', '.bin', 'electron.cmd')
    : join(root, 'node_modules', '.bin', 'electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, ['.'], {
  cwd: root,
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
