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
for (const file of [
  'settings.html',
  'settings.js',
  'about.html',
  'slack-setup-guide.html',
  'slack-setup-guide.js',
]) {
  const src = join(root, 'src', 'renderer', file);
  if (existsSync(src)) {
    cpSync(src, join(rendererOut, file));
  }
}

const guidesOut = join(rendererOut, 'guides');
mkdirSync(guidesOut, { recursive: true });
const guidesSrc = join(root, 'docs', 'guides');
if (existsSync(guidesSrc)) {
  for (const name of ['slack-setup.zh-CN.md', 'slack-setup.en.md', 'slack-setup.ja.md']) {
    const src = join(guidesSrc, name);
    if (existsSync(src)) {
      cpSync(src, join(guidesOut, name));
    }
  }
}
