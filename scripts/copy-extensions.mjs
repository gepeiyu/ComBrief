import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'dist', 'extensions');
mkdirSync(out, { recursive: true });

for (const app of ['cursor', 'claude-code']) {
  const src = join(root, 'extensions', app);
  const dest = join(out, app);
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
  }
}

const rendererOut = join(root, 'dist', 'renderer');
mkdirSync(rendererOut, { recursive: true });
for (const file of ['settings.html', 'settings.js', 'about.html']) {
  const src = join(root, 'src', 'renderer', file);
  if (existsSync(src)) {
    cpSync(src, join(rendererOut, file));
  }
}
