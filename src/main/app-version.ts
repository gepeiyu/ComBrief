import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 与 package.json version 同步，供 HTTP / 关于页等使用 */
export function getAppVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
