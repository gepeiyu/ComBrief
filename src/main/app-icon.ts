import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** 打包后或开发态下的应用图标路径，供通知等使用 */
export function resolveAppIconPath(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'build', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(__dirname, '..', '..', 'build', 'icon.png'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined;
}
